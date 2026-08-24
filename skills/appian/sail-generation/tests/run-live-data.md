# Running Live Data Tests

## Overview

Live data tests validate the SAIL generation pipeline against **real Appian record types**
with populated data. Unlike mockup tests (which use hardcoded sample data), these exercise
the full pipeline including MCP-based schema discovery, UUID resolution, and SAIL that
queries actual records.

## Prerequisites

1. **Appian instance** — The target instance must have the referenced applications deployed
   with record types, fields, relationships, and sample data populated.
2. **MCP connectivity** — The `claude` CLI must be able to reach the Appian instance via
   the MCP server configured in this repo's `.mcp.json`.
3. **`claude` CLI** — Installed and on PATH (`npm i -g @anthropic-ai/claude-code`).
4. **Model** — Use `--model sonnet` or `--model opus`. Haiku does not reliably invoke MCP
   tools as native tool calls (it falls back to bash scripting even when tools are visible).

## Execution Model

Each test case in `live-data.yaml` is an independent prompt that:
1. Targets a specific Appian application by name
2. Creates/updates a dynamically-named interface (`TEST_LIVE_{BaseName}_{run_tag}`)
3. Requires the agent to discover record type schemas via MCP tools
4. Produces SAIL that references real UUIDs and queries live data

## How to Run

### Single Test

```bash
./run_live_data.py --id live-dashboard-01-itsm-team
```

### All Tests

```bash
./run_live_data.py
```

### Filter by Type or App

```bash
./run_live_data.py --type dashboard
./run_live_data.py --app "IT Service Management"
```

### List Available Tests

```bash
./run_live_data.py --list
```

### Cleanup

```bash
./run_live_data.py --cleanup          # run tests, then delete TEST_LIVE_* interfaces
./run_live_data.py --cleanup-only     # skip tests, just delete TEST_LIVE_* interfaces
```

## Interface Naming

Live data tests use the same approach as mockup tests — a literal `TEST_LIVE_` prefixed
name in the prompt, with a unique suffix appended at runtime via regex:

```
TEST_LIVE_ITSM_Team_Dashboard → TEST_LIVE_ITSM_Team_Dashboard_4317
```

The script matches `TEST_LIVE_\w+` in the prompt and appends `_{run_tag}` (a 4-character
suffix derived from the log directory timestamp).

## Grading

| Outcome | Grade |
|---------|-------|
| Pipeline completes, discovers schemas, Appian deploys cleanly | DEPLOYED (clean) |
| Pipeline deploys after recovering from initial errors | DEPLOYED-WITH-RECOVERY |
| Pipeline deploys but never called discovery tools | NO-DISCOVERY DEPLOYED |
| No deploy tool was called | NO-DEPLOY |
| Deploy was attempted but Appian rejected it | DEPLOY-FAILED |
| Process timed out | TIMEOUT |
| Agent exited with error or no result | ERROR |

### Live Data Specific Signals

- **NO-DISCOVERY** prefix means the agent never called `listRecordTypes`, `getRecordType`,
  or similar MCP discovery tools. This suggests it fell back to mockup data instead of
  querying the real schema — a test failure even if the deploy succeeded.
- **DEPLOYED (clean)** with discovery is the ideal outcome: the agent discovered the
  schema, built a definition referencing real UUIDs, and deployed successfully.

## Differences from Mockup Tests

| Aspect | Mockups | Live Data |
|--------|---------|-----------|
| Data source | Hardcoded sample rows | Real Appian records |
| UUIDs | None (standalone) | Real record type/field UUIDs |
| App association | None (`TEST_` prefix) | Real app (`TEST_LIVE_` prefix) |
| Agent variant | Standard definition agents | Live definition agents |
| Schema discovery | Not needed | Required (MCP tools) |
| Instance dependency | None | Requires populated instance |

## Adding New Test Cases

1. Identify an application with populated record types on the target instance.
2. Add an entry to `live-data.yaml` following the existing format.
3. Use `{interface_name}` as a placeholder in the prompt where the interface name goes.
4. Document what record types/fields the test expects in `covers`.
5. Run with `--list` to verify parsing, then run the test.

## Coverage Matrix

| Feature | Test IDs |
|---------|----------|
| Live dashboard | live-dashboard-01 |
| Live record-view | live-record-view-01, live-layout-01 |
| Live form | live-form-01 |
| Live wizard | live-wizard-01 |
| Live grid (records-powered) | live-grid-01 |
| MCP schema discovery | all |
| KPI with record queries | live-dashboard-01 |
| Filtered aggregations | live-dashboard-01 |
| Date arithmetic in queries | live-dashboard-01 |
| loggedInUser() context | live-dashboard-01 |
| a!gridField with records | live-dashboard-01, live-grid-01 |
| Chart from record data | live-dashboard-01 |
| showExportButton (built-in export) | live-grid-01 |
| exportWhen (per-column export control) | live-grid-01 |
| recordActions on grid (list action) | live-grid-01 |
| recordActions on grid (per-row related) | live-grid-01 |
| refreshAfter RECORD_ACTION | live-grid-01 |
| a!recordActionField leaf | live-layout-01 |
| button with startProcess action | live-layout-01 |
| linkField with startProcessLink | live-layout-01 |
| processModel constant references | live-layout-01 |
| processParameters with identifier | live-layout-01 |
| bannerMessage on startProcessLink | live-layout-01 |
