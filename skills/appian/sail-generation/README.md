# SAIL Generation Pipeline

Script-driven SAIL UI generation that minimizes LLM token usage. The LLM makes **design decisions only** (field layout, section structure, chart types) via a JSON definition, and Node.js scripts deterministically render structurally-correct SAIL.

## Runtime: Claude Code

The pipeline runs on **Claude Code** (via `claude` CLI or Claude Code IDE). The orchestrator, specialist agents, and test harness are all designed around Claude Code's tool model — sub-agent dispatch, MCP tool invocation, and file I/O.

**Entry point:** `agents/orchestrator.md` — the orchestrator classifies the request, discovers Appian schemas via MCP tools, dispatches a specialist sub-agent, and deploys the result.

### Why Claude Code

- Sub-agent dispatch gives each specialist its own context window (no pollution)
- MCP tools are first-class tool calls (no bash wrapping)
- The `claude -p` CLI enables automated test runs with structured JSON output
- Permission model allows unattended batch execution for test suites

### Other platforms (Kiro, etc.)

The pipeline logic in `agents/orchestrator.md` is platform-agnostic in its *content* — the steps, classification table, anti-patterns, and discovery guidance apply regardless of runtime. Platform-specific mechanics (tool naming, file I/O conventions, sub-agent syntax) are handled by thin adapter layers outside this directory (e.g., `.kiro/steering/sail-generation.md` for Kiro).

If you're developing/editing skill content in this repo, any IDE works — the pipeline itself only activates when *generating SAIL for an Appian instance*.

## Architecture

```
User Request
    │
    ▼
Orchestrator (classify request type)
    │
    ▼
Specialist Agent (write definition JSON)
    │
    ├── node generator/define.js --write {uuid} --file /tmp/def-{uuid}.json   ← validates + saves definition
    │
    ▼
    ├── node generator/scaffold.js --from-definition {uuid} ← renders SAIL from definition
    │
    ▼
    ├── ./validate.sh output/{uuid}/{slug}.sail            ← local SAIL validator
    │
    ▼
    ├── node generator/resolve-icons.js {uuid} --auto      ← replaces icon placeholders
    │
    ▼
Output: {tmpdir}/sail-generation/{uuid}/{slug}.sail
    │
    ▼
createInterface(expressionFilePath: ".../{slug}.sail")     ← deploy to Appian via MCP
```

## Supported Page Types

| Type | Agent | Description |
|---|---|---|
| form | form-definition-agent | Data entry forms (create/edit) |
| wizard | wizard-definition-agent | Multi-step processes |
| grid | grid-definition-agent | Record list pages with filters |
| dashboard | dashboard-definition-agent | KPIs, charts, metrics overview |
| dashboard (live) | live-dashboard-definition-agent | Dashboard backed by real record types |
| record-view | record-view-definition-agent | Record detail display |
| record-view (live) | live-record-view-definition-agent | Record view backed by real record types |
| pane | pane-definition-agent | Master-detail split panels |
| layout | layout-planner-agent | Recursive container/leaf pages |
| component | component-agent | Single bare component |
| display | display-agent | Catch-all (hand-written SAIL) |

## Directory Structure

```
sail-generation/
  agents/            ← Orchestrator + 14 specialist agent instructions
  generator/         ← Node.js scripts (define, scaffold, resolve-icons)
  generator/templates/  ← Template renderers per page type
  validator/         ← TypeScript SAIL validator (source + compiled dist/)
  guidelines/        ← Reference knowledge for agents
    logic-guidelines/   ← Expression patterns, null safety, arrays
    reference/          ← JSON schemas, icon aliases, SAIL API schema
  tests/             ← Test suites (mockups + live data) with Python runners
  validate.sh        ← Shell wrapper for the validator
```

## Running Tests

Tests use `claude -p` to dispatch each prompt through the full pipeline and grade results.

```bash
# Mockup tests (standalone interfaces, no Appian app needed)
cd tests/
./run_mockups.py                          # all tests
./run_mockups.py --id form-01-employee-onboarding
./run_mockups.py --type dashboard

# Live data tests (requires populated Appian instance)
./run_live_data.py                        # all tests
./run_live_data.py --id live-dashboard-01-itsm-team
./run_live_data.py --type record-view
```

See `tests/README.md` for grading criteria and coverage goals.

## Output Location

Generated artifacts are written to the system temp directory:
`{os.tmpdir()}/sail-generation/{uuid}/` (e.g., `/tmp/sail-generation/gen-a3f5c2d1/`)

This keeps the repo tree clean — no generated files committed or polluting the workspace.

## Prerequisites

- Node.js (for generator scripts and compiled validator)
- `claude` CLI for running the pipeline (`npm i -g @anthropic-ai/claude-code`)
- Appian MCP server configured in `.mcp.json` (for deploy step)
- No npm install needed for generator — it has no runtime dependencies
- Validator dist/ is pre-compiled and included

## Relationship to Existing References

The `guidelines/` here supplements (does not replace) the existing content in
`skills/appian/references/`. The existing references cover MCP tool usage patterns,
record types, data modeling, etc. This pipeline's guidelines focus specifically on
SAIL rendering logic — schemas, expression patterns, and icon aliases that the
scaffold templates and specialist agents consume.
