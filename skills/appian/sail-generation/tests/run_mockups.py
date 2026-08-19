#!/usr/bin/env python3
"""Dispatch mockups.yaml test prompts through `claude -p` sequentially and log the results.

No external dependencies (no PyYAML) — mockups.yaml has a fixed, simple shape
(a list of `- id: / type: / prompt: > / covers:` records), so it's parsed by hand
below instead of pulling in a YAML library.

Usage:
    ./run_mockups.py                        # run every test, sequentially
    ./run_mockups.py --id grid-01-order-management --id form-02-incident-report
    ./run_mockups.py --type dashboard
    ./run_mockups.py --list                 # show what would run, don't run it
    ./run_mockups.py --cleanup              # run tests, then delete TEST_* interfaces
    ./run_mockups.py --cleanup-only         # skip tests, just delete TEST_* interfaces

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
DEFAULT_TESTS_FILE = SCRIPT_DIR / "mockups.yaml"
DEFAULT_REPO_ROOT = SCRIPT_DIR.parents[3]  # tests -> sail-generation -> appian -> skills -> repo root

CLEANUP_PROMPT = (
    'Call mcp__appian__listInterfaces with query "TEST_" to find every standalone '
    "interface whose name starts with TEST_. For each interface found, call "
    "mcp__appian__deleteInterface with its uuid to delete it. Do not call any other "
    "tools and do not create anything. When finished, report a list of the interface "
    "names and uuids you deleted."
)


# ---------------------------------------------------------------------------
# mockups.yaml parsing (hand-rolled — see module docstring for why)
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


def parse_mockups(path: Path):
    lines = path.read_text().split("\n")
    entries = []
    i, n = 0, len(lines)
    entry_start = re.compile(r"^- id:\s*(\S+)\s*$")

    while i < n:
        m = entry_start.match(lines[i])
        if not m:
            i += 1
            continue
        entry = {"id": m.group(1), "type": None, "prompt": "", "covers": []}
        i += 1
        while i < n and not entry_start.match(lines[i]):
            line = lines[i]
            if (mt := re.match(r"^\s{2}type:\s*(\S+)\s*$", line)):
                entry["type"] = mt.group(1)
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
        entries.append(entry)
    return entries


# ---------------------------------------------------------------------------
# Running a single test through `claude -p`
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = (
    "You are a SAIL generation agent. For EVERY interface creation request, "
    "you MUST follow the pipeline in skills/appian/sail-generation/agents/orchestrator.md. "
    "The pipeline is: read orchestrator → define JSON (define.js) → scaffold SAIL (scaffold.js) "
    "→ resolve icons → deploy via createInterface. "
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

    The authoritative grade is the PASS/PARTIAL/FAIL-* table in run-mockups.md,
    which requires reading the actual log — this just tells you where to look first.

    Grading priority:
      1. Hard failures (nonzero exit, missing result, agent error)
      2. Check if a deploy tool was called at all
      3. Check if the final result text indicates successful deployment
      4. Distinguish clean deploys from recovered ones
    """
    if returncode != 0:
        return "ERROR (nonzero exit — see log)"
    if final_result is None:
        return "ERROR (no result message — see log)"
    if final_result.get("is_error"):
        return "ERROR (agent reported error — see log)"

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

    if not deploy_calls:
        if deploy_success_indicators:
            # Edge case: result claims success but no deploy call was logged
            # (could be a stream parsing gap)
            return "DEPLOYED (inferred from result text — confirm in log)"
        return "NO-DEPLOY (no createInterface/updateInterface call seen)"

    # Deploy was attempted
    if deploy_success_indicators:
        if deploy_errors:
            return "DEPLOYED-WITH-RECOVERY (errors encountered, then succeeded)"
        if tool_errors:
            # Non-deploy errors (file not found, etc.) but deploy succeeded
            return "DEPLOYED (incidental errors unrelated to deploy)"
        return "DEPLOYED (clean)"

    # Deploy was called but result doesn't confirm success
    if deploy_errors:
        return "DEPLOY-FAILED (server rejected — see log)"
    return "DEPLOY-ATTEMPTED (outcome unclear — see log)"


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

    Phases (for mockup tests):
      - define: composing + validating the definition JSON
        (includes LLM thinking time, agent file reads, and define.js execution)
      - generate: scaffold.js and resolve-icons.js calls
      - deploy: createInterface / updateInterface MCP call

    Measurement boundaries:
      - define starts at: Agent dispatch or first Read of a definition-agent file
        (whichever marks the beginning of definition work)
      - define ends at: scaffold.js start
      - generate ends at: deploy start
      - deploy: remainder

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

    phases = {"define": None, "generate": None, "deploy": None}

    # Find the start of definition work — when the agent begins working on the JSON.
    # This is either:
    #   1. An Agent dispatch call (sub-agent architecture)
    #   2. First Read of a *definition-agent* file (direct architecture)
    #   3. First Read of the orchestrator file (fallback — earliest planning work)
    # We take the earliest signal that definition work has started.
    define_work_start = None
    for tc in tool_calls:
        name = tc["name"]
        inp = tc.get("input") or {}
        ts = parse_ts(tc.get("timestamp"))
        if not ts:
            continue

        if name == "Agent":
            # Sub-agent dispatch — definition work begins here
            if define_work_start is None:
                define_work_start = ts
            break  # Agent call is the clearest signal
        elif name == "Read":
            fp = (inp.get("file_path") or "").lower()
            if "definition-agent" in fp or "definition_agent" in fp:
                if define_work_start is None:
                    define_work_start = ts
                break

    # Fallback: if no agent dispatch or definition-agent read found,
    # use the first define.js / definition Write call (old behavior)
    if define_work_start is None:
        for tc in tool_calls:
            name = tc["name"]
            inp = tc.get("input") or {}
            is_define = False
            if name == "Write":
                fp = (inp.get("file_path") or "").lower()
                if ".json" in fp and ("def" in fp or "definition" in fp):
                    is_define = True
            elif name == "Bash":
                cmd = inp.get("command") or ""
                if "define.js" in cmd:
                    is_define = True
                elif ".json" in cmd and ("def" in cmd.lower() or "definition" in cmd.lower()):
                    is_define = True
            if is_define:
                define_work_start = parse_ts(tc["timestamp"])
                break

    # Find generate phase start — scaffold.js
    gen_start = None
    for tc in tool_calls:
        if tc["name"] == "Bash":
            cmd = (tc.get("input") or {}).get("command") or ""
            if "scaffold.js" in cmd:
                ts = parse_ts(tc["timestamp"])
                if ts and gen_start is None:
                    gen_start = ts

    # Find deploy phase — createInterface / updateInterface
    deploy_start = None
    for tc in tool_calls:
        if tc["name"] in ("mcp__appian__createInterface", "mcp__appian__updateInterface"):
            ts = parse_ts(tc["timestamp"])
            if ts and deploy_start is None:
                deploy_start = ts

    # Compute durations using boundary-based measurement:
    # - define = define_work_start → gen_start
    # - generate = gen_start → deploy_start
    # - deploy = deploy_start → end (filled by caller)

    if define_work_start and gen_start:
        phases["define"] = round((gen_start - define_work_start).total_seconds(), 1)
    elif define_work_start and deploy_start and not gen_start:
        phases["define"] = round((deploy_start - define_work_start).total_seconds(), 1)

    if gen_start and deploy_start:
        phases["generate"] = round((deploy_start - gen_start).total_seconds(), 1)

    # deploy duration filled by caller
    first_phase_ts = define_work_start or gen_start or deploy_start
    last_phase_ts = deploy_start or gen_start or define_work_start
    return phases, first_phase_ts, last_phase_ts


def run_one(test, args, repo_root, log_dir, run_tag):
    # Replace TEST_ names in the prompt with tagged versions to avoid collisions
    # e.g. "TEST_EmployeeOnboarding" → "TEST_EmployeeOnboarding_2331"
    prompt_with_tag = re.sub(
        r'\bTEST_(\w+)',
        rf'TEST_\1_{run_tag}',
        test["prompt"],
    )
    cmd = build_command(prompt_with_tag, args)
    log_path = log_dir / f"{test['id']}.jsonl"
    print(f"[{test['id']}] ({test['type']}) running...", flush=True)

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
        phase_timings = {"define": None, "generate": None, "deploy": None}
    else:
        tool_calls, tool_errors, final_result = extract_signals(stdout)
        status = heuristic_grade(tool_calls, tool_errors, final_result, returncode)
        phase_timings, phase_first_ts, phase_last_ts = extract_phase_timings(tool_calls)
        # Fill in the last phase duration as remainder of total time
        if phase_last_ts and phase_first_ts:
            accounted = sum(v for v in phase_timings.values() if v is not None)
            # Last phase = total - time before first phase - accounted phases
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
            if first_tool_ts and phase_last_ts:
                pipeline_duration = duration - (phase_first_ts - first_tool_ts).total_seconds()
                last_phase = [k for k, v in phase_timings.items() if v is None]
                if last_phase and pipeline_duration > accounted:
                    phase_timings[last_phase[0]] = round(pipeline_duration - accounted, 1)

    timing_parts = []
    for phase in ("define", "generate", "deploy"):
        v = phase_timings.get(phase)
        timing_parts.append(f"{phase}={v:.0f}s" if v is not None else f"{phase}=?")
    timing_str = " | ".join(timing_parts)

    print(f"[{test['id']}] {status}  ({duration:.0f}s total, {timing_str}, log: {log_path.relative_to(repo_root)})", flush=True)
    return {
        "id": test["id"],
        "type": test["type"],
        "status": status,
        "duration_s": round(duration, 1),
        "phase_define_s": phase_timings.get("define"),
        "phase_generate_s": phase_timings.get("generate"),
        "phase_deploy_s": phase_timings.get("deploy"),
        "log": str(log_path.relative_to(repo_root)),
    }


# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------

def run_cleanup(args, repo_root, log_dir):
    print("[cleanup] deleting TEST_* interfaces...", flush=True)
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
    ap.add_argument("--permission-mode", default="bypassPermissions",
                     choices=["default", "acceptEdits", "bypassPermissions", "plan"],
                     help="passed to `claude -p --permission-mode` (default: bypassPermissions, "
                          "required for unattended runs — this repo's dev Appian instance is the target)")
    ap.add_argument("--model", default="haiku",
                     help="Model to use (default: haiku).")
    ap.add_argument("--allowed-tools", default=(
                         "Bash,Read,Write,Edit,Skill,Agent,Task,ToolSearch,"
                         "mcp__appian__listApplications,"
                         "mcp__appian__createInterface,"
                         "mcp__appian__updateInterface"),
                     help="Comma-separated tool allowlist passed to `claude -p --allowedTools`. "
                          "Mockups need filesystem tools + app lookup + create/update interface. "
                          "Pass '' to disable.")
    ap.add_argument("--timeout", type=int, default=900, help="per-test timeout in seconds (default: 900)")
    ap.add_argument("--log-dir", type=Path, default=None)
    ap.add_argument("--list", action="store_true", help="print matching tests and exit, run nothing")
    ap.add_argument("--cleanup", action="store_true", default=False,
                     help="after running, delete all TEST_* interfaces (default: off)")
    ap.add_argument("--cleanup-only", action="store_true", default=False,
                     help="skip running tests, only delete TEST_* interfaces (default: off)")
    args = ap.parse_args()

    tests = parse_mockups(args.tests_file)
    if args.id:
        tests = [t for t in tests if t["id"] in args.id]
    if args.type:
        tests = [t for t in tests if t["type"] in args.type]

    if args.list:
        for t in tests:
            print(f"{t['id']:35s} {t['type']}")
        print(f"\n{len(tests)} test(s) match.")
        return

    if not shutil.which("claude"):
        sys.exit("error: `claude` CLI not found on PATH. Install it (npm i -g @anthropic-ai/claude-code) "
                 "and make sure it's callable as `claude`.")

    repo_root = args.repo_root.resolve()
    if not (repo_root / ".mcp.json").exists():
        sys.exit(f"error: {repo_root} has no .mcp.json — pass --repo-root to point at the dev-mcp-skills checkout.")

    log_dir = args.log_dir or (SCRIPT_DIR / "logs" / time.strftime("%Y%m%d-%H%M%S"))
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
            sys.exit("no tests matched --id/--type filters")
        for test in tests:
            results.append(run_one(test, args, repo_root, log_dir, run_tag))

        print("\n" + "-" * 130)
        print(f"{'id':35s} {'type':12s} {'total':>6s} {'define':>7s} {'generate':>9s} {'deploy':>7s}  status")
        print("-" * 130)
        for r in results:
            def_s = f"{r['phase_define_s']:.0f}s" if r.get('phase_define_s') is not None else "?"
            gen_s = f"{r['phase_generate_s']:.0f}s" if r.get('phase_generate_s') is not None else "?"
            dep_s = f"{r['phase_deploy_s']:.0f}s" if r.get('phase_deploy_s') is not None else "?"
            print(f"{r['id']:35s} {r['type']:12s} {r['duration_s']:>5.0f}s {def_s:>7s} {gen_s:>9s} {dep_s:>7s}  {r['status']}")

        # Summary stats
        deployed = sum(1 for r in results if r["status"].startswith("DEPLOYED"))
        recovered = sum(1 for r in results if "RECOVERY" in r["status"])
        failed = sum(1 for r in results if r["status"].startswith(("ERROR", "DEPLOY-FAILED", "TIMEOUT")))
        no_deploy = sum(1 for r in results if r["status"].startswith("NO-DEPLOY"))
        unclear = len(results) - deployed - failed - no_deploy
        total_time = sum(r["duration_s"] for r in results)
        avg_define = [r["phase_define_s"] for r in results if r.get("phase_define_s") is not None]
        avg_generate = [r["phase_generate_s"] for r in results if r.get("phase_generate_s") is not None]
        avg_deploy = [r["phase_deploy_s"] for r in results if r.get("phase_deploy_s") is not None]
        print("-" * 130)
        print(f"{'TOTAL':35s} {len(results):<12d} {total_time:>5.0f}s  "
              f"deployed={deployed} (clean={deployed - recovered}, recovered={recovered}) "
              f"failed={failed} no-deploy={no_deploy}"
              + (f" unclear={unclear}" if unclear else ""))
        if avg_define or avg_generate or avg_deploy:
            parts = []
            if avg_define:
                parts.append(f"define={sum(avg_define)/len(avg_define):.1f}s")
            if avg_generate:
                parts.append(f"generate={sum(avg_generate)/len(avg_generate):.1f}s")
            if avg_deploy:
                parts.append(f"deploy={sum(avg_deploy)/len(avg_deploy):.1f}s")
            print(f"{'AVG PHASES':35s} {' | '.join(parts)}")

        (log_dir / "summary.json").write_text(json.dumps(results, indent=2))

    if args.cleanup or args.cleanup_only:
        print()
        run_cleanup(args, repo_root, log_dir)


if __name__ == "__main__":
    main()
