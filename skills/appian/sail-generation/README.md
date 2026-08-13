# SAIL Generation Pipeline

Script-driven SAIL UI generation that minimizes LLM token usage. The LLM makes **design decisions only** (field layout, section structure, chart types) via a JSON definition, and Node.js scripts deterministically render structurally-correct SAIL.

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
    ├── node generator/define.js --write {uuid} '{json}'   ← validates + saves definition
    │
    ▼
    ├── node generator/scaffold.js --from-definition {uuid} ← renders SAIL from definition
    │
    ▼
    ├── ./validate.sh output/{uuid}/{slug}.sail            ← local SAIL validator
    │
    ▼
    ├── node generator/resolve-icons.js {uuid} --auto      ← replaces "circle" placeholders
    │
    ▼
Output: {tmpdir}/sail-generation/{uuid}/{slug}.sail
    │
    ▼
createInterface(expressionFilePath: ".../{slug}.sail")     ← deploy to Appian via MCP tool
```

## Supported Page Types

| Type | Agent | Description |
|---|---|---|
| form | form-definition-agent | Data entry forms (create/edit) |
| wizard | wizard-definition-agent | Multi-step processes |
| grid | grid-definition-agent | Record list pages with filters |
| dashboard | dashboard-definition-agent | KPIs, charts, metrics overview |
| record-view | record-view-definition-agent | Record detail display |
| pane | pane-definition-agent | Master-detail split panels |
| layout | layout-planner-agent | Recursive container/leaf pages |
| component | component-agent | Single bare component |
| display | display-agent | Catch-all (hand-written SAIL) |

## Directory Structure

```
sail-generation/
  generator/         ← Node.js scripts (define, scaffold, resolve-icons)
  generator/templates/  ← Template renderers per page type
  validator/         ← TypeScript SAIL validator (source + compiled dist/)
  agents/            ← Specialist agent instructions (14 files)
  guidelines/        ← Reference knowledge for agents
    logic-guidelines/   ← Expression patterns, null safety, arrays
    reference/          ← JSON schemas, icon aliases, SAIL API schema
  validate.sh        ← Shell wrapper for the validator
```

## Output Location

Generated artifacts are written to the system temp directory:
`{os.tmpdir()}/sail-generation/{uuid}/` (e.g., `/tmp/sail-generation/gen-a3f5c2d1/`)

This keeps the repo tree clean — no generated files committed or polluting the workspace.

## Usage

This pipeline is invoked via sub-agent dispatch. The orchestrator steering file
classifies the user's SAIL generation request and dispatches to the correct
specialist agent, which drives the define → scaffold → validate → icon-resolve
pipeline entirely through CLI commands.

The final `.sail` file is suitable for direct use with the Appian MCP
`createInterface` or `updateInterface` tools via `expressionFilePath`.

## Prerequisites

- Node.js (for generator scripts and compiled validator)
- No npm install needed — generator has no runtime dependencies (fast-check is dev-only for tests)
- Validator dist/ is pre-compiled and included

## Relationship to Existing References

The `guidelines/` here supplements (does not replace) the existing content in
`skills/appian/references/`. The existing references cover MCP tool usage patterns,
record types, data modeling, etc. This pipeline's guidelines focus specifically on
SAIL rendering logic — schemas, expression patterns, and icon aliases that the
scaffold templates and specialist agents consume.
