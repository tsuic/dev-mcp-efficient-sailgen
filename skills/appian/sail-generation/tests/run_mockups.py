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

def build_command(prompt, args):
    cmd = [
        "claude", "-p", prompt,
        "--output-format", "stream-json",
        "--verbose",
        "--permission-mode", args.permission_mode,
    ]
    if args.model:
        cmd += ["--model", args.model]
    return cmd


def heuristic_grade(tool_calls, tool_errors, final_result, returncode):
    """Best-effort signal only. The authoritative grade is the PASS/PARTIAL/FAIL-*
    table in run-mockups.md, which requires reading the actual log — this just
    tells you where to look first."""
    if returncode != 0:
        return "ERROR (nonzero exit — see log)"
    if final_result is None:
        return "ERROR (no result message — see log)"
    if final_result.get("is_error"):
        return "ERROR (agent reported error — see log)"
    creates = [c for c in tool_calls if c["name"] == "mcp__appian__createInterface"]
    if not creates:
        return "NO-DEPLOY (no createInterface call seen — check for fallback/misclassify)"
    if tool_errors:
        return "DEPLOY-ATTEMPTED-WITH-ERRORS (see log)"
    return "DEPLOYED (heuristic pass — confirm against grading table)"


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
            for block in obj.get("message", {}).get("content", []):
                if block.get("type") == "tool_use":
                    tool_calls.append({"name": block.get("name"), "input": block.get("input")})
        elif t == "user":
            for block in obj.get("message", {}).get("content", []):
                if block.get("type") == "tool_result" and block.get("is_error"):
                    tool_errors.append(block.get("content"))
        elif t == "result":
            final_result = obj
    return tool_calls, tool_errors, final_result


def run_one(test, args, repo_root, log_dir):
    cmd = build_command(test["prompt"], args)
    log_path = log_dir / f"{test['id']}.jsonl"
    print(f"[{test['id']}] ({test['type']}) running...", flush=True)

    start = time.time()
    try:
        proc = subprocess.run(
            cmd, cwd=repo_root, capture_output=True, text=True, timeout=args.timeout,
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
    else:
        tool_calls, tool_errors, final_result = extract_signals(stdout)
        status = heuristic_grade(tool_calls, tool_errors, final_result, returncode)

    print(f"[{test['id']}] {status}  ({duration:.0f}s, log: {log_path.relative_to(repo_root)})", flush=True)
    return {
        "id": test["id"],
        "type": test["type"],
        "status": status,
        "duration_s": round(duration, 1),
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
        proc = subprocess.run(cmd, cwd=repo_root, capture_output=True, text=True, timeout=args.timeout)
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
    ap.add_argument("--model", default=None)
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
    print(f"logs: {log_dir}\n")

    results = []
    if not args.cleanup_only:
        if not tests:
            sys.exit("no tests matched --id/--type filters")
        for test in tests:
            results.append(run_one(test, args, repo_root, log_dir))

        print("\n" + "-" * 100)
        print(f"{'id':35s} {'type':12s} {'duration':>9s}  status")
        print("-" * 100)
        for r in results:
            print(f"{r['id']:35s} {r['type']:12s} {r['duration_s']:>8.0f}s  {r['status']}")
        (log_dir / "summary.json").write_text(json.dumps(results, indent=2))

    if args.cleanup or args.cleanup_only:
        print()
        run_cleanup(args, repo_root, log_dir)


if __name__ == "__main__":
    main()
