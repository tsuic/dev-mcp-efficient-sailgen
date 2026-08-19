#!/usr/bin/env python3
"""Dispatch live-data.yaml test prompts through `claude -p` sequentially and log the results.

Live data tests differ from mockup tests in that they target real Appian applications
with populated record types. The agent must discover schemas via MCP tools and produce
SAIL referencing real UUIDs.

No external dependencies (no PyYAML) — live-data.yaml has a fixed, simple shape
(a list of `- id: / type: / app: / interface: / prompt: > / covers:` records),
so it's parsed by hand below.

Usage:
    ./run_live_data.py                        # run every test, sequentially
    ./run_live_data.py --id live-dashboard-01-itsm-team
    ./run_live_data.py --type dashboard
    ./run_live_data.py --list                 # show what would run, don't run it
    ./run_live_data.py --cleanup              # run tests, then delete TEST_LIVE_* interfaces
    ./run_live_data.py --cleanup-only         # skip tests, just delete TEST_LIVE_* interfaces

Requires the `claude` CLI on PATH, run from a shell that can reach the Appian
dev instance configured in this repo's .mcp.json.
"""

import argparse
import json
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_TESTS_FILE = SCRIPT_DIR / "live-data.yaml"
DEFAULT_REPO_ROOT = SCRIPT_DIR.parents[3]  # tests -> sail-generation -> appian -> skills -> repo root

CLEANUP_PROMPT = (
    'Call mcp__appian__listInterfaces with query "TEST_LIVE_" to find every standalone '
    "interface whose name starts with TEST_LIVE_. For each interface found, call "
    "mcp__appian__deleteInterface with its uuid to delete it. Do not call any other "
    "tools and do not create anything. When finished, report a list of the interface "
    "names and uuids you deleted."
)


# ---------------------------------------------------------------------------
# live-data.yaml parsing (hand-rolled — same approach as run_mockups.py)
# ---------------------------------------------------------------------------

def fold_block_scalar(lines):
    """Approximate YAML '>' folded-scalar semantics: join consecutive non-blank
    lines with a space; a blank line starts a new paragraph."""
    paragraphs, current = [], []
    for line in lines:
        if line == "":
            if current:
                paragraphs.append(" ".join(current))
                current = []
        else:
            current.append(line)
    if current:
        paragraphs.append(" ".join(current))
    return "\n".join(paragraphs).strip()


def parse_live_data(path: Path):
    lines = path.read_text().split("\n")
    entries = []
    i, n = 0, len(lines)
    entry_start = re.compile(r"^- id:\s*(\S+)\s*$")

    while i < n:
        m = entry_start.match(lines[i])
        if not m:
            i += 1
            continue
        entry = {"id": m.group(1), "type": None, "app": None, "prompt": "", "covers": []}
        i += 1
        while i < n and not entry_start.match(lines[i]):
            line = lines[i]
            if (mt := re.match(r"^\s{2}type:\s*(\S+)\s*$", line)):
                entry["type"] = mt.group(1)
                i += 1
            elif (ma := re.match(r"^\s{2}app:\s*(.+?)\s*$", line)):
                entry["app"] = ma.group(1)
                i += 1
            elif re.match(r"^\s{2}prompt:\s*>\s*$", line):
                i += 1
                block, base_indent = [], None
                while i < n:
                    pl = lines[i]
                    if pl.strip() == "":
                        block.append("")
                        i += 1
                        continue
                    indent = len(pl) - len(pl.lstrip(" "))
                    if base_indent is None:
                        base_indent = indent
                    if indent < base_indent:
                        break
                    block.append(pl.strip())
                    i += 1
                entry["prompt"] = fold_block_scalar(block)
            elif re.match(r"^\s{2}covers:\s*$", line):
                i += 1
                while i < n and re.match(r"^\s{4}-\s+", lines[i]):
                    entry["covers"].append(lines[i].strip()[1:].strip())
                    i += 1
            else:
                i += 1
        if not entry["prompt"]:
            raise ValueError(f"test '{entry['id']}' has no prompt — parser or file is broken")
        if not entry["app"]:
            raise ValueError(f"test '{entry['id']}' has no app — live data tests require an app")
        entries.append(entry)
    return entries


# ---------------------------------------------------------------------------
# Running a single test through `claude -p`
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = (
    "You are a SAIL generation agent. For EVERY interface creation request, "
    "you MUST follow the pipeline in skills/appian/sail-generation/agents/orchestrator.md. "
    "The pipeline is: read orchestrator → discover record types via MCP → define JSON (define.js) "
    "→ scaffold SAIL (scaffold.js) → resolve icons → deploy via createInterface. "
    "NEVER write SAIL expressions by hand. NEVER call createInterface without running scaffold.js first."
)


def build_command(prompt, args):
    cmd = [
        "claude", "-p", prompt,
        "--output-format", "stream-json",
        "--verbose",
        "--permission-mode", args.permission_mode,
        "--system-prompt", SYSTEM_PROMPT,
    ]
    if args.model:
        cmd += ["--model", args.model]
    if args.allowed_tools:
        cmd += ["--allowedTools", args.allowed_tools]
    return cmd


def get_env():
    """Build environment with MCP connection fix.

    MCP_CONNECTION_NONBLOCKING=0 restores blocking behavior so the CLI waits
    for MCP servers to connect before sending the first turn. Without this,
    fast models (Haiku) may not see MCP tools on turn 1 and fall back to
    bash scripting.
    """
    import os
    env = os.environ.copy()
    env["MCP_CONNECTION_NONBLOCKING"] = "0"
    return env



def heuristic_grade(tool_calls, tool_errors, final_result, returncode):
    """Best-effort signal based on tool calls and final result text.

    Grading priority:
      1. Hard failures (nonzero exit, missing result, agent error)
      2. Check if MCP discovery tools were called (record type, fields)
      3. Check if a deploy tool was called at all
      4. Check if the final result text indicates successful deployment
      5. Distinguish clean deploys from recovered ones
    """
    if returncode != 0:
        return "ERROR (nonzero exit — see log)"
    if final_result is None:
        return "ERROR (no result message — see log)"
    if final_result.get("is_error"):
        return "ERROR (agent reported error — see log)"

    # Check for MCP discovery calls (live data tests should use these)
    discovery_calls = [c for c in tool_calls
                       if c["name"] in ("mcp__appian__listRecordTypes",
                                        "mcp__appian__getRecordType",
                                        "mcp__appian__listRecordTypeRelationships",
                                        "mcp__appian__listRecordTypeFields",
                                        "mcp__appian__listApplications")]

    # Detect deploy tool calls (create or update)
    deploy_calls = [c for c in tool_calls
                    if c["name"] in ("mcp__appian__createInterface", "mcp__appian__updateInterface")]

    # Check the final result text for deploy success indicators
    result_text = final_result.get("result", "")
    deploy_success_indicators = (
        "_a-0000" in result_text  # Appian interface UUID pattern
        or "deployed" in result_text.lower()
        or "created and validated" in result_text.lower()
        or "successfully created" in result_text.lower()
        or "created successfully" in result_text.lower()
        or ("created" in result_text.lower() and "interface" in result_text.lower())
        or "passed Appian" in result_text
        or "accepted it" in result_text
    )

    # Separate deploy errors from incidental errors
    deploy_error_phrases = ("Cannot create interface", "Expression validation failed",
                            "Expression evaluation error", "API error")
    deploy_errors = [e for e in tool_errors
                     if any(phrase in (e or "") for phrase in deploy_error_phrases)]

    # Build prefix for discovery status
    discovery_prefix = ""
    if not discovery_calls:
        discovery_prefix = "NO-DISCOVERY "

    if not deploy_calls:
        if deploy_success_indicators:
            return f"{discovery_prefix}DEPLOYED (inferred from result text — confirm in log)"
        return f"{discovery_prefix}NO-DEPLOY (no createInterface/updateInterface call seen)"

    # Deploy was attempted
    if deploy_success_indicators:
        if deploy_errors:
            return f"{discovery_prefix}DEPLOYED-WITH-RECOVERY (errors encountered, then succeeded)"
        if tool_errors:
            return f"{discovery_prefix}DEPLOYED (incidental errors unrelated to deploy)"
        return f"{discovery_prefix}DEPLOYED (clean)"

    # Deploy was called but result doesn't confirm success
    if deploy_errors:
        return f"{discovery_prefix}DEPLOY-FAILED (server rejected — see log)"
    return f"{discovery_prefix}DEPLOY-ATTEMPTED (outcome unclear — see log)"


def extract_signals(stdout_text):
    tool_calls, tool_errors, final_result = [], [], None
    for line in stdout_text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        t = obj.get("type")
        if t == "assistant":
            ts = obj.get("timestamp")
            for block in obj.get("message", {}).get("content", []):
                if block.get("type") == "tool_use":
                    tool_calls.append({"name": block.get("name"), "input": block.get("input"), "timestamp": ts})
        elif t == "user":
            for block in obj.get("message", {}).get("content", []):
                if block.get("type") == "tool_result" and block.get("is_error"):
                    tool_errors.append(block.get("content"))
        elif t == "result":
            final_result = obj
    return tool_calls, tool_errors, final_result


def extract_phase_timings(tool_calls):
    """Extract per-phase timing from tool call timestamps.

    Phases (for live-data tests):
      - discovery: first MCP discovery call → last MCP discovery call
      - define: end of discovery → start of scaffold.js
        (includes LLM thinking time composing the JSON + define.js validation)
      - generate: scaffold.js start → deploy start (includes resolve-icons)
      - deploy: createInterface / updateInterface call → end

    The key insight: "define" includes LLM generation time (the gap between the
    last discovery call and scaffold), not just the define.js execution. Previously
    we measured start-to-start which attributed LLM thinking time to discovery.

    Returns a dict with phase durations in seconds, or None for phases not detected.
    """
    from datetime import datetime

    def parse_ts(ts):
        if not ts:
            return None
        try:
            return datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except (ValueError, TypeError):
            return None

    phases = {"discovery": None, "define": None, "generate": None, "deploy": None}

    discovery_tools = {"mcp__appian__listRecordTypes", "mcp__appian__getRecordType",
                       "mcp__appian__listRecordTypeRelationships", "mcp__appian__listRecordTypeFields",
                       "mcp__appian__listRecordData", "mcp__appian__listApplications"}

    # Find discovery phase (first call → last call)
    disc_start = None
    disc_end = None
    for tc in tool_calls:
        if tc["name"] in discovery_tools:
            ts = parse_ts(tc["timestamp"])
            if ts:
                if disc_start is None:
                    disc_start = ts
                disc_end = ts

    # Find generate phase start — scaffold.js (or combined scaffold+validate bash)
    gen_start = None
    for tc in tool_calls:
        if tc["name"] == "Bash":
            cmd = (tc.get("input") or {}).get("command") or ""
            if "scaffold.js" in cmd:
                ts = parse_ts(tc["timestamp"])
                if ts and gen_start is None:
                    gen_start = ts

    # Find generate phase end — last of scaffold.js / resolve-icons.js calls
    gen_end = None
    for tc in tool_calls:
        if tc["name"] == "Bash":
            cmd = (tc.get("input") or {}).get("command") or ""
            if "scaffold.js" in cmd or "resolve-icons.js" in cmd:
                ts = parse_ts(tc["timestamp"])
                if ts:
                    gen_end = ts

    # Find deploy phase — createInterface / updateInterface
    deploy_start = None
    for tc in tool_calls:
        if tc["name"] in ("mcp__appian__createInterface", "mcp__appian__updateInterface"):
            ts = parse_ts(tc["timestamp"])
            if ts and deploy_start is None:
                deploy_start = ts

    # Compute durations using boundary-based measurement:
    # - discovery = disc_start → disc_end
    # - define = disc_end → gen_start (LLM composing JSON + define.js validation)
    # - generate = gen_start → deploy_start (scaffold + resolve-icons)
    # - deploy = deploy_start → end (filled by caller from total duration)

    if disc_start and disc_end:
        phases["discovery"] = round((disc_end - disc_start).total_seconds(), 1)

    # "define" = gap between last discovery call and scaffold start.
    # This captures: LLM thinking, Write calls, define.js --write, retries.
    define_anchor = disc_end if disc_end else disc_start
    if define_anchor and gen_start:
        phases["define"] = round((gen_start - define_anchor).total_seconds(), 1)
    elif define_anchor and deploy_start and not gen_start:
        # No scaffold detected (unusual) — define runs to deploy
        phases["define"] = round((deploy_start - define_anchor).total_seconds(), 1)

    if gen_start and deploy_start:
        phases["generate"] = round((deploy_start - gen_start).total_seconds(), 1)

    # deploy duration filled by caller (needs total run time)
    # phases["deploy"] = None

    first_phase_ts = disc_start or gen_start or deploy_start
    last_phase_ts = deploy_start or gen_end or gen_start or disc_end
    return phases, first_phase_ts, last_phase_ts


def run_one(test, args, repo_root, log_dir, run_tag):
    # Replace TEST_LIVE_ names in the prompt with tagged versions to avoid collisions
    # e.g. "TEST_LIVE_ITSM_Team_Dashboard" → "TEST_LIVE_ITSM_Team_Dashboard_4317"
    prompt_with_tag = re.sub(
        r'\bTEST_LIVE_(\w+)',
        rf'TEST_LIVE_\1_{run_tag}',
        test["prompt"],
    )

    cmd = build_command(prompt_with_tag, args)
    log_path = log_dir / f"{test['id']}.jsonl"
    # Extract the tagged interface name for display
    interface_match = re.search(r'TEST_LIVE_\w+', prompt_with_tag)
    interface_name = interface_match.group(0) if interface_match else "?"
    print(f"[{test['id']}] ({test['type']}) app=\"{test['app']}\" interface={interface_name}", flush=True)
    print(f"  running...", flush=True)

    start = time.time()
    try:
        proc = subprocess.run(
            cmd, cwd=repo_root, capture_output=True, text=True, timeout=args.timeout,
            env=get_env(),
        )
        stdout, returncode, timed_out = proc.stdout, proc.returncode, False
        stderr = proc.stderr
    except subprocess.TimeoutExpired as e:
        stdout = e.stdout or ""
        stderr = e.stderr or ""
        returncode, timed_out = None, True
    duration = time.time() - start

    log_path.write_text(stdout + (("\n--- stderr ---\n" + stderr) if stderr else ""))

    if timed_out:
        status = f"TIMEOUT (> {args.timeout}s — see log)"
        phase_timings = {"discovery": None, "define": None, "generate": None, "deploy": None}
    else:
        tool_calls, tool_errors, final_result = extract_signals(stdout)
        status = heuristic_grade(tool_calls, tool_errors, final_result, returncode)
        phase_timings, phase_first_ts, phase_last_ts = extract_phase_timings(tool_calls)
        # Fill in the deploy phase as remainder of total duration minus other phases.
        # deploy_start → end isn't directly measurable from tool calls alone (we don't
        # know when the response came back), so we use: total - (startup + other phases).
        if phase_first_ts and phase_timings.get("deploy") is None:
            from datetime import datetime
            first_tool_ts = None
            for tc in tool_calls:
                ts_str = tc.get("timestamp")
                if ts_str:
                    try:
                        first_tool_ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
                    except (ValueError, TypeError):
                        pass
                    break
            if first_tool_ts:
                # Time before the first pipeline-relevant tool call (startup/skill loading)
                startup = (phase_first_ts - first_tool_ts).total_seconds()
                accounted = sum(v for v in phase_timings.values() if v is not None)
                deploy_est = duration - startup - accounted
                if deploy_est > 0:
                    phase_timings["deploy"] = round(deploy_est, 1)

    timing_parts = []
    for phase in ("discovery", "define", "generate", "deploy"):
        v = phase_timings.get(phase)
        timing_parts.append(f"{phase}={v:.0f}s" if v is not None else f"{phase}=?")
    timing_str = " | ".join(timing_parts)

    print(f"  [{test['id']}] {status}  ({duration:.0f}s total, {timing_str}, log: {log_path.relative_to(repo_root)})", flush=True)
    return {
        "id": test["id"],
        "type": test["type"],
        "app": test["app"],
        "interface": interface_name,
        "status": status,
        "duration_s": round(duration, 1),
        "phase_discovery_s": phase_timings.get("discovery"),
        "phase_define_s": phase_timings.get("define"),
        "phase_generate_s": phase_timings.get("generate"),
        "phase_deploy_s": phase_timings.get("deploy"),
        "log": str(log_path.relative_to(repo_root)),
    }


# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------

def run_cleanup(args, repo_root, log_dir):
    print("[cleanup] deleting TEST_LIVE_* interfaces...", flush=True)
    cmd = build_command(CLEANUP_PROMPT, args)
    log_path = log_dir / "_cleanup.jsonl"
    try:
        proc = subprocess.run(cmd, cwd=repo_root, capture_output=True, text=True, timeout=args.timeout,
                             env=get_env())
        stdout, stderr, returncode = proc.stdout, proc.stderr, proc.returncode
    except subprocess.TimeoutExpired as e:
        stdout, stderr, returncode = e.stdout or "", e.stderr or "", None
    log_path.write_text(stdout + (("\n--- stderr ---\n" + stderr) if stderr else ""))

    _, _, final_result = extract_signals(stdout)
    summary = final_result.get("result") if final_result else None
    print(f"[cleanup] exit={returncode}  log: {log_path.relative_to(repo_root)}")
    if summary:
        print(f"[cleanup] {summary}")


# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--tests-file", type=Path, default=DEFAULT_TESTS_FILE)
    ap.add_argument("--repo-root", type=Path, default=DEFAULT_REPO_ROOT)
    ap.add_argument("--id", action="append", default=[], help="run only this test id (repeatable)")
    ap.add_argument("--type", action="append", default=[], help="run only tests of this type (repeatable)")
    ap.add_argument("--app", action="append", default=[], help="run only tests targeting this app (repeatable)")
    ap.add_argument("--permission-mode", default="bypassPermissions",
                     choices=["default", "acceptEdits", "bypassPermissions", "plan"],
                     help="passed to `claude -p --permission-mode` (default: bypassPermissions)")
    ap.add_argument("--model", default="haiku",
                     help="Model to use (default: sonnet). Haiku does not reliably invoke MCP "
                          "tools as native tool calls — use sonnet or opus for live data tests.")
    ap.add_argument("--allowed-tools", default=(
                         "Bash,Read,Write,Edit,Skill,Agent,Task,ToolSearch,"
                         "mcp__appian__listApplications,"
                         "mcp__appian__listRecordTypes,"
                         "mcp__appian__getRecordType,"
                         "mcp__appian__listRecordData,"
                         "mcp__appian__createInterface,"
                         "mcp__appian__updateInterface"),
                     help="Comma-separated tool allowlist passed to `claude -p --allowedTools`. "
                          "Restricts the tool list to only what's needed, reducing confusion and "
                          "token overhead. Pass '' to disable.")
    ap.add_argument("--timeout", type=int, default=900, help="per-test timeout in seconds (default: 900)")
    ap.add_argument("--log-dir", type=Path, default=None)
    ap.add_argument("--list", action="store_true", help="print matching tests and exit, run nothing")
    ap.add_argument("--cleanup", action="store_true", default=False,
                     help="after running, delete all TEST_LIVE_* interfaces (default: off)")
    ap.add_argument("--cleanup-only", action="store_true", default=False,
                     help="skip running tests, only delete TEST_LIVE_* interfaces (default: off)")
    args = ap.parse_args()

    tests = parse_live_data(args.tests_file)
    if args.id:
        tests = [t for t in tests if t["id"] in args.id]
    if args.type:
        tests = [t for t in tests if t["type"] in args.type]
    if args.app:
        tests = [t for t in tests if t["app"] in args.app]

    if args.list:
        for t in tests:
            print(f"{t['id']:45s} {t['type']:12s} {t['app']}")
        print(f"\n{len(tests)} test(s) match.")
        return

    if not shutil.which("claude"):
        sys.exit("error: `claude` CLI not found on PATH. Install it (npm i -g @anthropic-ai/claude-code) "
                 "and make sure it's callable as `claude`.")

    repo_root = args.repo_root.resolve()
    if not (repo_root / ".mcp.json").exists():
        sys.exit(f"error: {repo_root} has no .mcp.json — pass --repo-root to point at the dev-mcp-skills checkout.")

    log_dir = args.log_dir or (SCRIPT_DIR / "logs" / f"live-{time.strftime('%Y%m%d-%H%M%S')}")
    log_dir.mkdir(parents=True, exist_ok=True)
    # Short unique tag derived from the log directory timestamp — avoids
    # "Name is insufficiently unique" collisions with leftover interfaces
    # from previous runs.
    run_tag = log_dir.name[-4:]  # last 4 chars of timestamp, e.g. "1842"
    print(f"logs: {log_dir}  (run_tag: {run_tag})\n")

    # Clean stale UUID directories from previous runs to avoid file collisions
    import tempfile
    sail_tmp = Path(tempfile.gettempdir()) / "sail-generation"
    if sail_tmp.exists():
        import shutil as _shutil
        _shutil.rmtree(sail_tmp, ignore_errors=True)
        print(f"[cleanup] removed stale {sail_tmp}\n")

    results = []
    if not args.cleanup_only:
        if not tests:
            sys.exit("no tests matched --id/--type/--app filters")
        for test in tests:
            results.append(run_one(test, args, repo_root, log_dir, run_tag))

        print("\n" + "-" * 150)
        print(f"{'id':45s} {'type':12s} {'total':>6s} {'discov':>7s} {'define':>7s} {'generate':>9s} {'deploy':>7s}  status")
        print("-" * 150)
        for r in results:
            disc_s = f"{r['phase_discovery_s']:.0f}s" if r.get('phase_discovery_s') is not None else "?"
            def_s = f"{r['phase_define_s']:.0f}s" if r.get('phase_define_s') is not None else "?"
            gen_s = f"{r['phase_generate_s']:.0f}s" if r.get('phase_generate_s') is not None else "?"
            dep_s = f"{r['phase_deploy_s']:.0f}s" if r.get('phase_deploy_s') is not None else "?"
            print(f"{r['id']:45s} {r['type']:12s} {r['duration_s']:>5.0f}s {disc_s:>7s} {def_s:>7s} {gen_s:>9s} {dep_s:>7s}  {r['status']}")

        # Summary stats
        deployed = sum(1 for r in results if "DEPLOYED" in r["status"] and "NO-DEPLOY" not in r["status"])
        recovered = sum(1 for r in results if "RECOVERY" in r["status"])
        failed = sum(1 for r in results if r["status"].startswith(("ERROR", "DEPLOY-FAILED", "TIMEOUT")))
        no_deploy = sum(1 for r in results if "NO-DEPLOY" in r["status"])
        no_discovery = sum(1 for r in results if "NO-DISCOVERY" in r["status"])
        unclear = len(results) - deployed - failed - no_deploy
        total_time = sum(r["duration_s"] for r in results)
        avg_discovery = [r["phase_discovery_s"] for r in results if r.get("phase_discovery_s") is not None]
        avg_define = [r["phase_define_s"] for r in results if r.get("phase_define_s") is not None]
        avg_generate = [r["phase_generate_s"] for r in results if r.get("phase_generate_s") is not None]
        avg_deploy = [r["phase_deploy_s"] for r in results if r.get("phase_deploy_s") is not None]
        print("-" * 150)
        print(f"{'TOTAL':45s} {len(results):<12d} {total_time:>5.0f}s  "
              f"deployed={deployed} (clean={deployed - recovered}, recovered={recovered}) "
              f"failed={failed} no-deploy={no_deploy} no-discovery={no_discovery}"
              + (f" unclear={unclear}" if unclear else ""))
        if avg_discovery or avg_define or avg_generate or avg_deploy:
            parts = []
            if avg_discovery:
                parts.append(f"discovery={sum(avg_discovery)/len(avg_discovery):.1f}s")
            if avg_define:
                parts.append(f"define={sum(avg_define)/len(avg_define):.1f}s")
            if avg_generate:
                parts.append(f"generate={sum(avg_generate)/len(avg_generate):.1f}s")
            if avg_deploy:
                parts.append(f"deploy={sum(avg_deploy)/len(avg_deploy):.1f}s")
            print(f"{'AVG PHASES':45s} {' | '.join(parts)}")

        (log_dir / "summary.json").write_text(json.dumps(results, indent=2))

    if args.cleanup or args.cleanup_only:
        print()
        run_cleanup(args, repo_root, log_dir)


if __name__ == "__main__":
    main()
