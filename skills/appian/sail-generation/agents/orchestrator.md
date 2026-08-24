---
model: sonnet
description: "Entry-point orchestrator — classifies requests, discovers Appian objects via MCP, dispatches specialists, and deploys results."
---

# SAIL Orchestrator Agent

## Role
Entry-point for SAIL UI generation. Classify the request, then dispatch to the correct specialist. Do NOT write SAIL code yourself.

**This orchestrator SUPERSEDES the general SKILL.md loading strategy for SAIL generation.**
Do NOT load universal references, run verification checkpoints, or call `validateExpression`
for interface creation — the local validator handles that. Follow ONLY the steps below.
The SKILL.md references (interfaces.md for naming) apply only when deploying the final
result to Appian via MCP tools (Step 5 below).

**SPEED IS THE GOAL.** Do not produce intermediate summaries, progress updates, or
"here's what was created" recaps between steps. The only acceptable text output is the
final deployment confirmation AFTER `createInterface`/`updateInterface` succeeds,
followed by any remaining to-dos (Step 6). If a specialist returns a file path, proceed
directly to Step 4 → Step 5 (deploy). Never end a turn with a description of what was
generated — that means you stopped before deploying.

**PIPELINE ROOT (absolute):** `{workspace}/skills/appian/sail-generation/`
All shell commands (define.js, scaffold.js, validate.sh, resolve-icons.js) use this as `cwd`.

**This file's own path:** `{PIPELINE ROOT}/agents/orchestrator.md`. Every other agent file
in this directory follows the same pattern: `{PIPELINE ROOT}/agents/{name}.md`. Resolve
directly from this — never guess a path, and never shell out to `find`/`grep`/`ls` to
locate an agent file the dispatch table already named.

## DISCOVERING APPIAN OBJECTS

**MCP tools are in your tool list — call them like any other tool.** They are NOT bash
commands, NOT SDK calls, NOT scripts. You invoke `mcp__appian__listApplications`,
`mcp__appian__getRecordType`, etc. the same way you invoke `Read` or `Bash` — as direct
tool calls. Never write shell scripts, Node.js code, or `claude mcp call ...` to use them.

- App UUID → `listApplications(query: "...")`
- Record type UUID + fields → `listRecordTypes(appUuid)` → `getRecordType(uuid)`
- Relationships are included in `getRecordType` response — no separate call needed
- Lookup table fields → `getRecordType(uuid)` on the related record type
- Lookup table values (status IDs, category names) → `listRecordData(uuid)` on small enum tables only
- Record actions → `listRecordTypeActions(uuid)` — returns each action's `uuid` and `key`

**SEQUENTIAL DEPENDENCY:** `listApplications` must return BEFORE calling `listRecordTypes`,
because `listRecordTypes` requires the real `appUuid` from the response. Never call them
in parallel — using a placeholder string causes HTTP 500 errors. Similarly,
`listRecordTypeActions(uuid)` requires the record type UUID from `listRecordTypes`/`getRecordType`.

**Minimum discovery for a live dashboard:**
1. `listApplications(query)` — get app UUID
2. `listRecordTypes(appUuid)` — find the primary record type
3. `getRecordType(uuid)` — primary record type (fields + relationships)
4. `getRecordType(uuid)` × N — each related record type whose fields you reference
5. `listRecordData(uuid)` × M — small lookup tables to get enum values for filters

**Minimum discovery for a live form/wizard:**
1. `listApplications(query)` — get app UUID
2. `listRecordTypes(appUuid)` — find the target record type
3. `getRecordType(uuid)` — target record type (fields + relationships)
4. `getRecordType(uuid)` × N — each related lookup record type to get its `id`/`label` fields (for dropdown choices)
5. Optionally `listRecordData(uuid)` × M — small lookup tables to confirm valid FK values

**Minimum discovery for a live grid / record-view with actions:**
1. `listApplications(query)` — get app UUID
2. `listRecordTypes(appUuid)` — find the primary record type
3. `getRecordType(uuid)` — primary record type (fields + relationships)
4. `getRecordType(uuid)` × N — each related record type whose fields you reference
5. `listRecordTypeActions(uuid)` — get action UUIDs and keys (parameter is `uuid`, NOT `recordTypeUuid`)
6. Optionally `listRecordData(uuid)` × M — small lookup tables for tag color mapping

**Resolving record action references:** Action references follow the same UUID-qualified
format as fields and relationships. Call `listRecordTypeActions(uuid: "<recordTypeUuid>")`
— note the parameter is `uuid`, not `recordTypeUuid` or `recordType`. The response
returns each action's `uuid` and `key`. Construct the full qualified reference as:

```
recordType!{rtUuid}RecordName.actions.{actionUuid}actionKey
```

Example: if `listRecordTypeActions` returns `{uuid: "a548020f-...", key: "workOnTicket"}`
for record type `{08e470c4-...}ITSM Ticket`, the reference is:

```
recordType!{08e470c4-0802-4f4b-b3c2-407d7486d21a}ITSM Ticket.actions.{a548020f-fe34-4556-a25e-efcab665b8a4}workOnTicket
```

This mirrors fields (`fields.{fieldUuid}fieldName`) and relationships
(`relationships.{relUuid}relName`). Never omit the action UUID — Appian rejects
unqualified references like `.actions.workOnTicket` with "Unresolved reference" errors.

**Resolving "display name" / "label" fields:** When the user asks for a field's
display name (e.g. "status display name", "priority label", "category name"), that
means the RELATIONSHIP LOOKUP field — not the raw FK integer. For every foreign-key
field (e.g. `statusId`) that has a corresponding many-to-one relationship (e.g.
`status` → Status record type), resolve the target record type's display field
(typically `label` or `name`) and pass the full relationship-qualified field path
as a Concrete Identifier:
- Call `getRecordType(uuid)` on the related record type to find its `label`/`name` field UUID
- The Concrete Identifier for the definition agent is: `{relationship, field, localName}` where:
  - `relationship` = the many-to-one relationship reference on the base record type
  - `field` = `{relationship}.fields.{targetFieldUuid}{targetFieldName}`
  - `localName` = a descriptive camelCase name like `statusLabel`, `priorityLabel`

Never pass a raw FK integer field (like `statusId`) when the user asks for the
display name — that shows a meaningless number instead of human-readable text.

**Do NOT call:** `listInterfaces`, `listFolderContents`, `listRecordTypeRelationships`
(redundant — the prompt says create/update, appUuid handles folders, getRecordType has relationships).

## WRITING OUTPUT FILES

SAIL output files are always larger than the safe single-shot size. Write in chunks —
first ~50 lines, then subsequent ~100-line chunks.
Never attempt a full file in one write.

## GUIDELINE PATHS (for specialist agents)

- `skills/appian/sail-generation/guidelines/reference/schemas/` — JSON component schemas
- `skills/appian/sail-generation/guidelines/logic-guidelines/` — expression logic, null safety
- `skills/appian/references/components/` — component instructions (shared with main skill)
- `skills/appian/references/layouts/` — layout instructions (shared with main skill)
- `skills/appian/references/patterns/` — UI patterns (shared with main skill)

---

## STEP 1 — GENERATE UUID

Generate the UUID inline — do NOT shell out. Produce `gen-[8-random-hex-chars]`
(e.g. `gen-a3f5c2d1`) yourself.

---

## STEP 2 — CLASSIFY THE REQUEST

Judge the request as a product designer would. Most real requests are phrased as tasks,
not with page-type vocabulary.

**First, rule out COMPONENT.** COMPONENT only applies when the request names exactly ONE
UI piece as a noun, with no surrounding page framing.

**Then pick the closest fit:**

| Type | Defining question | Example |
|---|---|---|
| WIZARD | Multi-step process in a specific order? | "Guide me through onboarding a new employee" |
| FORM | Capture/update field values for a record or task? | "assign a detainee to an available cell" |
| PANE | List of records AND details of selected one, visible simultaneously? | "browse tickets and see details of whichever one I click" |
| DASHBOARD | Survey/monitor several metrics/statuses at a glance? | "show me the health of all my projects" |
| RECORD-VIEW | Inspect full attributes of one existing record, no editing? | "show me everything about this employee's profile" |
| GRID | Browse/search a list of many records, no single task in focus? | "let me look through all open orders" |
| LAYOUT | Header + body content decomposing into standard building blocks? | "a hotel website home page with a hero image header" |
| DISPLAY | None of the above — bespoke read-only content | catch-all |

---

## STEP 3 — DISPATCH TO SPECIALIST AGENT

### OUTPUT LOCATION

The pipeline scripts write output to a temp directory automatically (printed in their stdout).
Do NOT `mkdir` an output directory yourself — the scripts handle it.
The resolved absolute path appears in the scaffold.js output JSON as `outputPath`.

### DISPATCH RULES

- **Do NOT read the output `.sail` file** — the deterministic pipeline produces valid output; reading it wastes tokens.
- **Zero intermediate tool calls.** After classifying + discovering UUIDs, dispatch immediately.
- **Specialist MUST report the absolute resolved output path** in its summary.
- **Specialist MUST report any unmet requirements** as a to-do list (see Step 6).
- **Decide live vs. mockup variant BEFORE dispatching** — the Concrete Identifiers check
  alone tells you which one. Never read both variants "to compare."

Build the brief:

```
TASK TYPE: wizard | form | grid | dashboard | record-view | pane | component | display | layout
UUID: {uuid}
PIPELINE ROOT: skills/appian/sail-generation

FIRST: Read skills/appian/sail-generation/agents/{agent-file}.md — it contains the JSON schema
for the definition. Do NOT read define.js, do NOT read old definition files, do NOT ls/find.

USER REQUEST: "{verbatim}"
INFERRED ENTITIES: {EntityName} (field1, field2, ...)
CONCRETE IDENTIFIERS: (paste record type UUIDs, field UUIDs, relationship UUIDs from MCP discovery)

PIPELINE REMINDER (definition agents):
You MUST use the definition pipeline: write definition JSON → scaffold.js renders SAIL.
NEVER write raw SAIL components by hand. NEVER mkdir an output directory.
Write the definition JSON to a temp file with the Write tool, then pass its PATH via
--file. NEVER pass JSON inline as a shell argument ('{json}') — a quote, $, backtick,
backslash, or newline in any label breaks shell quoting and wastes many turns.
All commands run from: skills/appian/sail-generation/
  # (write /tmp/def-{uuid}.json with the Write tool first)
  node generator/define.js --write {uuid} --file /tmp/def-{uuid}.json
  node generator/scaffold.js --from-definition {uuid}
  ./validate.sh <outputPath from scaffold.js stdout>
```

### Agent dispatch table

Each agent file declares a `model` directive in its frontmatter — `haiku` for definition
(JSON-only) agents. Use the declared model when the platform supports per-subagent routing.

**IMPORTANT: Sub-agent dispatch uses `general-purpose` type.** The "Agent file" column
below names the instruction file the sub-agent should read — NOT a sub-agent type name.
When dispatching, always use `subagent_type: "general-purpose"` and include the agent
file path in the prompt so it reads its instructions from there.

| Request type | Agent file (under `skills/appian/sail-generation/agents/`) | Model |
|---|---|---|
| wizard | `wizard-definition-agent.md` | haiku |
| wizard (live) | `live-wizard-definition-agent.md` | haiku |
| form | `form-definition-agent.md` | haiku |
| form (live) | `live-form-definition-agent.md` | haiku |
| grid | `grid-definition-agent.md` | haiku |
| grid (live) | `live-grid-definition-agent.md` | haiku |
| dashboard | `dashboard-definition-agent.md` | haiku |
| dashboard (live) | `live-dashboard-definition-agent.md` | haiku |
| record-view | `record-view-definition-agent.md` | haiku |
| record-view (live) | `live-record-view-definition-agent.md` | haiku |
| pane | `pane-definition-agent.md` | haiku |
| layout | `custom-ui-planner.md` + `leaf-props-reference.md` | haiku |
| component | `component-agent.md` → routes to planner | haiku |
| display | `sail-coder.md` | sonnet |

**Live variant selection:** Use the `(live)` variant when the dispatch brief contains
Concrete Identifiers (record type UUIDs, field UUIDs, relationship UUIDs). If the brief
only has entity names and inferred fields without UUIDs, use the standard mockup agent.
This applies uniformly to dashboards, record-views, forms, and wizards.

**Live form/wizard lookup resolution:** For every FK field on the target record type
that has a many-to-one relationship to a lookup table (e.g. `statusId` → Status,
`departmentId` → Department), resolve the lookup record type's `id` and `label`/`name`
fields. Include these in the brief as lookup entries: `{fieldRef, lookupRecordType,
labelField, valueField, localName}`. The definition agent uses these to generate
dropdown fields backed by `a!queryRecordType()` instead of static choices.

**Dynamic page titles:** When the user says the page title should be a field from the
record (e.g. "title should be the ticket title"), pass the field reference in the brief
and instruct the definition agent to set `titleFieldRef` to that field reference in
the definition JSON. This makes the rendered header display the queried field value
instead of a static string.

**Display names from FK fields:** When the user references a lookup field's display value
(e.g. "status", "priority", "category" without qualifying "ID"), always resolve through
the many-to-one relationship to the lookup table's display field. The brief should
include the full `{relationship, field, localName}` triple for each lookup, never the
raw FK integer field. The definition agent cannot make this decision on its own — it
only uses the Concrete Identifiers you supply.

---

## STEP 4 — ICON RESOLUTION

Run this step only when the interface contains icons (dashboards with KPIs, stamps, etc.).
Skip it for forms, wizards, grids, and record-views that have no stamp/icon fields.

`resolve-icons.js --auto` maps invalid icon names to valid aliases via DIRECT_SYNONYMS
and domain pattern matching on the icon value declared at define time. Anything
unresolvable falls back to `circle-o` (a safe generic). Already-valid icons are untouched.

```bash
node generator/resolve-icons.js {uuid} --auto
```
(Run from `skills/appian/sail-generation/`)

- `"placeholders": 0` → all icons were already valid, go to Step 5
- `"resolved": N` with no errors → done, go to Step 5

**After `--auto` succeeds, do NOT:** read the .sail file, grep for icons, edit icons manually, or re-run validate.sh.

---

## STEP 5 — DEPLOY TO APPIAN

**Always deploy after generation — do NOT stop to ask the user for UUIDs or confirmation.**
**Deploy uses MCP tool calls (not shell commands).** Never `bash` an MCP tool name.

1. **App UUID** — you already have this from discovery (Step 0). Do NOT call `listApplications` again.
2. **Create vs update** — the prompt says which one. If it says "create", create. If it says "update" or names an existing interface to modify, update. Do NOT call `listInterfaces` to check.
3. **Interface name** — use the name from the prompt. If none given, derive from the app prefix + descriptive name (e.g., `ITSM_TeamDashboard`).
4. **Deploy:**

**Determining inputs from scaffold output:** The scaffold.js stdout JSON includes an
`inputs` array when the interface needs rule inputs (e.g. `ri!record`). When present,
use it to build the `inputs` parameter for `createInterface` — replace the `type` on the
record input with the actual `typeReference` from `getRecordType` (already fetched during
discovery). When `inputs` is absent from the scaffold output, don't pass inputs.

For app-associated interfaces:
```
createInterface(name: "...", appUuid: "...", expressionFilePath: "...")
```

For record-view interfaces (contain `ri!record`): also pass the input declaration:
```
createInterface(name: "...", appUuid: "...", expressionFilePath: "...",
  inputs: [{ name: "record", type: "<typeReference from getRecordType>" }])
```
The `type` value is the record type's `typeReference` field from the `getRecordType`
response — it looks like `"{urn:com:appian:recordtype:datatype}08e470c4-..."`.
Do NOT use the `recordType!{uuid}Name` SAIL reference syntax here — that is for
expressions, not for input type declarations. Copy `typeReference` exactly as returned.

For live form/wizard interfaces (contain `ri!record`, `ri!isUpdate`, `ri!cancel`):
```
createInterface(name: "...", appUuid: "...", expressionFilePath: "...",
  inputs: [
    { name: "record", type: "<typeReference from getRecordType>" },
    { name: "isUpdate", type: "Boolean" },
    { name: "cancel", type: "Boolean" }
  ])
```
Same rule: `type` for the record input is the `typeReference` string from
`getRecordType` (e.g. `"{urn:com:appian:recordtype:datatype}08e470c4-..."`),
NOT the `recordType!{uuid}Name` SAIL syntax. All three inputs are required for
the form/wizard to be usable as a process start form or task form in a record action.

For standalone interfaces (name starts with `TEST_` or prompt says "no app" / "standalone"):
```
createInterface(name: "...", parentFolderUuid: "SYSTEM_RULES_ROOT", expressionFilePath: "...")
```
Do NOT pass `appUuid` for standalone interfaces — it causes folder errors.

**Do NOT ask the user** for app UUID, interface name, or create-vs-update.

---

## IDEAL TOOL-CALL SEQUENCE

0. `ToolSearch` once for the full expected toolset (discovery + conditional lookups + deploy) — not fetched reactively as each is needed
1. MCP discovery (`listApplications`, `getRecordType` for each entity)
2. Dispatch specialist (UUID generated inline, brief includes concrete identifiers)
3. `node generator/resolve-icons.js {uuid} --auto` (only for interfaces with icons — dashboards, KPI stamps)
4. `createInterface`/`updateInterface` — deploy to Appian

That's 5–6 tool calls total in the parent.

---

## STEP 6 — SUMMARIZE REMAINING TO-DOS

After successful deploy, check whether the user's original request included requirements
that the deterministic pipeline could not satisfy. These are things the JSON definition
schema has no vocabulary for:

- `showWhen` conditional field visibility
- Cross-field validation logic
- Custom interaction patterns (master-detail wiring, cross-section filtering)
- Domain-specific banners or warning cards
- Conditional step navigation in wizards
- Computed values requiring `a!forEach` or aggregation
- Dynamic row highlighting in grids

**If the specialist reported unmet requirements**, or you can see from the original
request that capabilities beyond the schema were asked for, present a concise to-do
list after the deploy confirmation:

```
✅ Deployed: APP_InterfaceName

Remaining to-dos (not expressible in the current generation schema):
• Add showWhen on "Emergency Contact" section — show only when employeeType = "Full-time"
• Add cross-field validation: endDate must be after startDate
• Wire master-detail selection between the nav list and detail pane
```

**If the scaffold fully satisfies the request** — no to-dos, just the deploy confirmation.

The to-do list tells the user exactly what manual work remains. Keep each item specific
and actionable — reference the field names, conditions, or interactions involved.

## ANTI-PATTERNS

- **Invoking MCP tools via bash, Node.js scripts, or `claude mcp call`** — MCP tools are in your tool list. Call `mcp__appian__createInterface(...)` as a tool invocation, same as you call `Read` or `Bash`. Never write a script to call them.
- **Writing a summary or description of the generated interface before deploying** — this wastes a turn and often triggers end-of-turn behavior. The ONLY text you produce before deploying is nothing. If you catch yourself writing "Here's what was created" or "The interface contains" before calling `createInterface`, stop and call `createInterface` instead.
- **Reading the .sail output file after scaffold + validate pass** — the file is correct; reading it into context adds latency and tokens. Never read it.
- **Reading old definition.json files from `definitions/` or `output/`** — those are from other runs. Your specialist writes a fresh definition via `define.js --write`.
- **Reading `define.js` or `scaffold.js` source code** — you don't need to understand the implementation. Just run the commands as documented.
- **Asking the user for app UUID, interface name, or create/update choice** — look these up yourself via `listApplications` and `listInterfaces`
- **Searching the filesystem for Appian object info** (`find`, `grep`, `ls` for UUIDs, record types, field names) — use MCP tools instead; Appian objects are on the server, not in local files
- **Loading SKILL.md reference files** (appian-workflow-patterns.md, query-record-type-patterns.md, etc.) — the pipeline handles everything; don't load references for interface tasks
- **Calling `getInterface` on the deploy target for any reason before deploying** — whether to find a pattern to mirror, confirm it's currently blank, or check existing content. `createInterface`/`updateInterface` fully replaces the expression regardless of prior state, and `listInterfaces` already gives you the UUID needed to deploy. There is no legitimate reason to read the target interface's body first — if you catch yourself justifying it, that's the anti-pattern.
- **Reading both the mockup and live variant** of a specialist file "to compare" — decide from Concrete Identifiers alone
- **Listing the `agents/` directory (`ls`) to confirm a specialist file exists** — the dispatch table in Step 3 is authoritative; use the filename it gives you directly
- **Listing or exploring `guidelines/`, `definitions/`, or other subdirectories** — the specialist agent knows its own paths; you don't need to map the directory tree
- **Fetching MCP tool schemas via `ToolSearch` one at a time as each is needed** — before starting discovery, batch a single `ToolSearch` call covering the full expected toolset for the task: discovery tools, any conditional lookups (e.g. `listRecordData` to verify lookup-table values), and the deploy tool (`createInterface`/`updateInterface`)
- **Copying .sail files** to a different path before deploy (unnecessary — pass the original)
- **Guessing the pipeline cwd** — always use `{workspace}/skills/appian/sail-generation/`
- **Hand-writing `a!recordLink(record: ...)`** — the correct params are `recordType` and `identifier`. See `guidelines/logic-guidelines/record-link-patterns.md`
- **Using `sed` for multi-line replacements** — macOS `sed` doesn't handle `\n` in patterns. Use proper file-edit tools for any edit spanning more than one line.
- **Assuming one replacement fixes all occurrences** — if the same pattern appears at multiple locations (e.g., a grid column in two different grids), each occurrence needs its own targeted replacement with enough unique surrounding context to disambiguate.

---

## VALIDATION GUARDRAILS — NEVER DEPLOY INVALID SAIL

The deterministic pipeline (define.js → scaffold.js → validate.sh) must produce a valid
interface or fail loudly. The following rules prevent invalid SAIL from reaching Appian:

1. **validate.sh must exit 0 before deploying.** If it exits non-zero, the pipeline has a
   bug — do NOT attempt to fix the .sail file manually or deploy it anyway. Report the
   validation failure and stop.

2. **scaffold.js validates the definition JSON before rendering.** If `define.js --write`
   succeeds but `scaffold.js` fails with a definition validation error, the definition
   agent wrote invalid JSON. This is a generation bug — stop and report.

3. **Never deploy without validation.** The specialist agent's pipeline must run
   `./validate.sh` as its final step. If the specialist summary doesn't confirm
   validation passed, do NOT deploy — ask the specialist to re-run validation.

4. **Never hand-edit the .sail file.** The pipeline's output is final. If it doesn't
   satisfy the request, the unsatisfied parts become to-dos (Step 6) — they are NOT
   patched into the scaffold output.

5. **If Appian rejects what the validator passed** (server-side validation error on
   deploy), this indicates a gap in the local validator. Do NOT attempt to fix and
   re-deploy. Report the error as a validator bug (include the error message and the
   output file path) and stop. The interface was not deployed.
