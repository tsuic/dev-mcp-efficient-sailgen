#!/bin/bash
# Convenience wrapper: validate a .sail file and record timing if a uuid is detected.
#
# Usage:
#   ./validate.sh path/to/file.sail [--json]
#
# Timing: if the file path contains /output/{uuid}/, timing is automatically
# recorded to /output/{uuid}/timing.json with the validation phase name
# incremented per run (validation:1, validation:2, ...).

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SAIL_FILE="$1"

# Resolve to absolute path
if [[ "$SAIL_FILE" != /* ]]; then
  SAIL_FILE="$(pwd)/$SAIL_FILE"
fi

# Extract UUID from file path (matches /output/{uuid}/ anywhere in path)
UUID=""
if [[ "$SAIL_FILE" =~ /output/([^/]+)/ ]]; then
  UUID="${BASH_REMATCH[1]}"
fi

# Determine next validation index
VALIDATION_INDEX=1
if [[ -n "$UUID" ]]; then
  TIMING_FILE="$(node -e "console.log(require('$SCRIPT_DIR/generator/output-dir').outputDir('$UUID'))" 2>/dev/null)/timing.json"
  if [[ -f "$TIMING_FILE" ]]; then
    EXISTING=$(node -e "
      try {
        const e = JSON.parse(require('fs').readFileSync('$TIMING_FILE','utf-8'));
        console.log(e.filter(function(x){ return /^validation:/.test(x.phase) && x.event === 'start'; }).length);
      } catch(err) { console.log(0); }
    " 2>/dev/null)
    # Strip any whitespace/newlines from node output
    EXISTING=$(echo "$EXISTING" | tr -d '[:space:]')
    if [[ "$EXISTING" =~ ^[0-9]+$ ]]; then
      VALIDATION_INDEX=$((EXISTING + 1))
    fi
  fi
fi

PHASE="validation:${VALIDATION_INDEX}"

# Record start
if [[ -n "$UUID" ]]; then
  node "$SCRIPT_DIR/generator/timing.js" "$UUID" record "$PHASE" "start" > /dev/null 2>&1 || true
fi

# Run validator and capture output + exit code
# Pass absolute SAIL_FILE + any extra args (e.g. --json), skipping the original $1
EXTRA_ARGS=("${@:2}")
VALIDATOR_OUTPUT=$(node "$SCRIPT_DIR/validator/dist/sail-validator.js" "$SAIL_FILE" "${EXTRA_ARGS[@]}" 2>&1)
VALIDATOR_EXIT=$?

echo "$VALIDATOR_OUTPUT"

# Extract error/warning counts for the timing note
NOTE=""
ERRORS=$(echo "$VALIDATOR_OUTPUT" | grep -oE '[0-9]+ error\(s\)' | grep -oE '^[0-9]+' | head -1)
WARNINGS=$(echo "$VALIDATOR_OUTPUT" | grep -oE '[0-9]+ warning\(s\)' | grep -oE '^[0-9]+' | head -1)
ERRORS="${ERRORS:-0}"
WARNINGS="${WARNINGS:-0}"
if [[ "$VALIDATOR_EXIT" -eq 0 ]]; then
  NOTE="${ERRORS} errors, ${WARNINGS} warnings (PASS)"
else
  NOTE="${ERRORS} errors, ${WARNINGS} warnings (FAIL)"
fi

# Record end
if [[ -n "$UUID" ]]; then
  if [[ -n "$NOTE" ]]; then
    node "$SCRIPT_DIR/generator/timing.js" "$UUID" record "$PHASE" "end" --note "$NOTE" > /dev/null 2>&1 || true
  else
    node "$SCRIPT_DIR/generator/timing.js" "$UUID" record "$PHASE" "end" > /dev/null 2>&1 || true
  fi
fi

exit $VALIDATOR_EXIT
