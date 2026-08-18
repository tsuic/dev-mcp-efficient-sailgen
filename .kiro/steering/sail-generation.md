---
inclusion: auto
description: "Script-driven SAIL UI generation pipeline. Classify request → dispatch specialist agent → define JSON → scaffold SAIL → validate → resolve icons. Activates whenever creating Appian interfaces."
---

# SAIL UI Generation — Script-Driven Pipeline

## PURPOSE

Classify the user's SAIL UI request and dispatch to a specialist agent that uses the
definition → scaffold pipeline. The LLM writes JSON design decisions; scripts render SAIL.

**This steering SUPERSEDES the general SKILL.md loading strategy for SAIL generation.**
Do NOT load universal references, run verification checkpoints, or call `validateExpression`
for interface creation — the local validator handles that. Follow ONLY the steps below.
The SKILL.md references (interfaces.md for naming) apply only when deploying the final
result to Appian via MCP tools (Step 5 below).

**PIPELINE ROOT (absolute):** `{workspace}/skills/appian/sail-generation/`
All shell commands (define.js, scaffold.js, validate.sh, resolve-icons.js) use this as `cwd`.

## DISCOVERING APPIAN OBJECTS

**Use MCP tools, not the filesystem.** Appian objects (apps, record types, fields, relationships) live on the server — not in local files. Do NOT use `find`, `grep`, `ls`, or `cat` to look for UUIDs or record type info.

- App UUID → `listApplications(query: "...")`
- Record type UUID + fields → `listRecordTypes(appUuid)` → `getRecordType(uuid)`
- Relationships → `listRecordTypeRelationships(uuid)`
- Existing interfaces → `listInterfaces(appUuid, query: "...")` — name/existence check only

Call these MCP tools directly. One `getRecordType` call gives you all field UUIDs, relationship UUIDs, and type references needed for the definition JSON.

**Minimum viable discovery for a live dashboard/record-view:**
1. `listApplications(query)` — get app UUID (skip if already known)
2. `listRecordTypes(appUuid)` — identify the primary record type
3. `getRecordType(uuid)` — get fields + relationships for the primary record type
4. `getRecordType(uuid)` for each related record type whose fields you need (e.g., lookup tables with a `label` field)
5. `listRecordData(uuid)` — only for lookup/enum tables whose IDs you need in filters (e.g., status values 1/2/3, priority values). Skip for the primary record type.

**Do NOT call:**
- `listFolderContents` — `createInterface` with `appUuid` handles folder placement automatically
- `listInterfaces` — if the prompt says "create", create. If it says "update" or names an existing interface to modify, update. Don't spend a round-trip confirming what the prompt already states.
- `listRecordTypeRelationships` separately — `getRecordType` already includes relationships in its response
- `listRecordData` on the primary record type — live dashboards query data at runtime; you only need field UUIDs from `getRecordType`

**Do NOT call `getInterface` on an existing interface to read its SAIL body "for pattern
reference."** The pipeline generates SAIL programmatically from a JSON definition — the
specialist never needs example SAIL to imitate, and reading a 100-300 line expression body
just to mirror a style is pure overhead (extra tool call + extra context) with no output
benefit. `listInterfaces` is sufficient for the Step 5 create-vs-update check. The one
exception: the user explicitly asks you to match/reuse an existing interface's specific
behavior — then read only that interface, and only after classify/discover, not during it.

## WRITING OUTPUT FILES

SAIL output files are always larger than the safe single-shot size. Write in chunks —
`fs_write` for the first ~50 lines, then `fs_append` for subsequent ~100-line chunks.
Never attempt a full file in one `fs_write`.

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

`$TMPDIR/sail-generation/{uuid}/` is the default output directory.
This path is **outside the workspace** — do NOT use `read_file` or workspace file tools on it.
Pass it directly to MCP `expressionFilePath` parameters (they accept absolute paths).

**When to use workspace staging instead:** If the sub-agent reports that Pass 3 edits are
needed (e.g., avg resolution time requiring `forEach`, custom interactions), use
`--output-dir` to write to a workspace-local path so you can edit the file with `str_replace`
or `read_file` before deploying:

```bash
node generator/define.js --output-dir .kiro/tmp/sail-generation --write {uuid} '{json}'
node generator/scaffold.js --output-dir .kiro/tmp/sail-generation --from-definition {uuid}
```

The output lands at `.kiro/tmp/sail-generation/{uuid}/{slug}-scaffold.sail` — editable with
workspace file tools. Clean up `.kiro/tmp/` after deploying.

**Decision rule:** If the sub-agent's summary says "Pass 3 needed" or you know you'll edit
the output, use workspace staging. Otherwise, use the default `$TMPDIR` path for zero-copy
deploy.

### DISPATCH EFFICIENCY RULES

- **Do NOT read agent `.md` files into your own context** — pass them via `contextFiles`.
- **Do NOT read the output `.sail` file** unless Pass 3 editing is needed.
- **Zero intermediate tool calls.** After classifying, dispatch immediately.
- **Sub-agent MUST report the absolute resolved output path** in its summary (not `$TMPDIR` — the actual expanded path like `/var/folders/.../sail-generation/{uuid}/{slug}.sail`). This lets the orchestrator pass it directly to MCP tools without guessing.

Build the brief:

```
TASK TYPE: wizard | form | grid | dashboard | record-view | pane | component | display | layout
UUID: {uuid}
OUTPUT PATH: {tmpdir}/sail-generation/{uuid}/{descriptive-slug}.sail
PIPELINE ROOT: skills/appian/sail-generation

USER REQUEST: "{verbatim}"
INFERRED ENTITIES: {EntityName} (field1, field2, ...)

PIPELINE REMINDER (definition agents):
You MUST use the definition pipeline: write definition JSON → scaffold.js renders SAIL.
NEVER write raw SAIL components by hand.
All commands run from: skills/appian/sail-generation/
  node generator/define.js --write {uuid} '{json}'
  node generator/scaffold.js --from-definition {uuid}
  ./validate.sh {tmpdir}/sail-generation/{uuid}/{slug}-scaffold.sail
```

### Agent dispatch table

| Request type | Agent file (under `skills/appian/sail-generation/agents/`) |
|---|---|
| wizard | `wizard-definition-agent.md` → (Pass 3) `wizard-sail-agent.md` |
| form | `form-definition-agent.md` → (Pass 3) `form-sail-agent.md` |
| grid | `grid-definition-agent.md` → (Pass 3) `display-agent.md` |
| dashboard | `dashboard-definition-agent.md` → (Pass 3) `display-agent.md` |
| dashboard (live) | `live-dashboard-definition-agent.md` → (Pass 3) `display-agent.md` |
| record-view | `record-view-definition-agent.md` → (Pass 3) `display-agent.md` |
| record-view (live) | `live-record-view-definition-agent.md` → (Pass 3) `display-agent.md` |
| pane | `pane-definition-agent.md` → (Pass 3) `pane-sail-agent.md` |
| layout | `layout-planner-agent.md` |
| component | `component-agent.md` |
| display | `display-agent.md` |

**Live variant selection:** Use the `(live)` variant when the dispatch brief contains
Concrete_Identifiers (record type UUIDs, field UUIDs, relationship UUIDs). If the brief
only has entity names and inferred fields without UUIDs, use the standard mockup agent.

### contextFiles for sub-agent dispatch

```
contextFiles: [
  { "path": "skills/appian/sail-generation/agents/{agent-file}.md" },
  { "path": "skills/appian/sail-generation/generator/define.js" },
  { "path": "skills/appian/sail-generation/generator/scaffold.js" }
]
```

---

## STEP 4 — ICON RESOLUTION

**Short-circuit:** If the sub-agent reports 0 placeholders or icon resolution complete, skip.

```bash
node generator/resolve-icons.js {uuid} --auto
```
(Run from `skills/appian/sail-generation/`)

The scripts output to `{tmpdir}/sail-generation/{uuid}/` (system temp directory).

- `"placeholders": 0` → done, deploy immediately
- `"resolved": N` with no errors → done, deploy immediately — do NOT read the file, grep for icons, or re-validate. The script handles replacement atomically.
- Errors → manual override: `node generator/resolve-icons.js {uuid} concept1:alias1 ...`

**Icon resolution is one call, not a multi-step process.** The `--auto` flag reads the file,
infers icons from line context, replaces them in-place, and validates. After a successful
`--auto` run, proceed directly to deploy — no Read, no Edit, no extra validate.sh.

---

## STEP 5 — DEPLOY TO APPIAN

**Always deploy after generation — do NOT stop to ask the user for UUIDs or confirmation.**

1. **Find the app UUID yourself** — call `listApplications` (with `query` if the user named the app) and pick the matching one.
2. **Determine create vs update from the prompt** — if the user says "create", create. If they say "update" or reference an existing interface to modify, update. Do NOT call `listInterfaces` to check — trust the prompt.
3. **Derive the interface name** from the user's request using the app prefix + descriptive name (e.g., `ITSM_TeamDashboard`). Load `skills/appian/references/interfaces.md` if unsure about naming.
4. **Deploy:**

```
createInterface(
  name: "PREFIX_InterfaceName",
  appUuid: "...",
  expressionFilePath: "/tmp/sail-generation/{uuid}/{slug}.sail",
  inputs: [...]
)
```

**Do NOT ask the user** for app UUID, interface name, or create-vs-update — resolve these yourself using list/get tools.

---

## IDEAL TOOL-CALL SEQUENCE

### Mockup (standalone, no app)
1. `invoke_sub_agent` — dispatch specialist (UUID generated inline)
2. `execute_bash` — `node generator/resolve-icons.js {uuid} --auto` (only if placeholders > 0)
3. `createInterface` — deploy using `$TMPDIR` path directly

That's 2–3 tool calls total.

### Live data (app-backed, real record types)
1. `listApplications(query)` — get app UUID
2. `listRecordTypes(appUuid)` — find target record type(s)
3. `getRecordType(uuid)` × N — get fields/relationships (N = 1 primary + related lookups)
4. `listRecordData(uuid)` × M — read lookup/enum tables to get filter values (status IDs, category names)
5. `invoke_sub_agent` — dispatch live specialist with discovered UUIDs + enum values in brief
6. `execute_bash` — `node generator/resolve-icons.js {uuid} --auto` (only if placeholders > 0)
7. `createInterface` or `updateInterface` — deploy

That's 5–9 tool calls total (depending on number of related record types and lookup tables).
The orchestrator does discovery (steps 1-4), the sub-agent does definition + scaffold (step 5).

## ANTI-PATTERNS

- **Asking the user for app UUID, interface name, or create/update choice** — look these up yourself via `listApplications` and `listInterfaces`
- **Searching the filesystem for Appian object info** (`find`, `grep`, `ls` for UUIDs, record types, field names) — use MCP tools instead; Appian objects are on the server, not in local files
- **Loading SKILL.md reference files** (appian-workflow-patterns.md, query-record-type-patterns.md, etc.) — the pipeline handles everything; don't load references for interface tasks
- **Calling `listRecordData` on the primary record type** — live dashboards query at runtime; you only need `listRecordData` on small lookup/enum tables to discover filter values (status IDs, category names)
- **Calling `listInterfaces`** — the prompt states whether to create or update; don't burn a round-trip confirming
- **Calling `listFolderContents`** — `createInterface` with `appUuid` auto-places into the correct folder
- **Calling `listRecordTypeRelationships` separately** — `getRecordType` already returns relationships
- **Re-reading/editing the .sail file after `resolve-icons.js --auto`** — the script modifies the file in-place atomically; do not grep, read, or edit icons afterward
- **Re-running `validate.sh` after icon resolution** — `resolve-icons.js` only replaces icon name strings ("circle" → "ticket") which cannot break validation
- **Copying .sail files** to a different `/tmp` path before deploy (unnecessary — pass the original)
- **Reading .sail output into context** to "verify" after validation already passed (unless Pass 3 editing is needed)
- **Using workspace file tools** (`read_file`, `read_code`) on `$TMPDIR` paths (they'll fail — use `execute_bash cat` or switch to `--output-dir` workspace staging)
- **Guessing the pipeline cwd** — always use `{workspace}/skills/appian/sail-generation/`
- **Hand-writing `a!recordLink(record: ...)`** — the correct params are `recordType` and `identifier`. See `guidelines/logic-guidelines/record-link-patterns.md`
- **Using `sed` for multi-line replacements** — macOS `sed` doesn't handle `\n` in patterns. Use `str_replace` for any edit spanning more than one line.
- **Assuming one `str_replace` fixes all occurrences** — `str_replace` matches exactly ONE location. If the same pattern appears at multiple indent levels (e.g., a grid column in two different grids), each occurrence needs its own `str_replace` with enough unique surrounding context to disambiguate.

---

## POST-DEPLOY PATCHING (when Appian rejects what the validator passed)

The local validator may have gaps — Appian's server-side validation is the source of truth.
When `createInterface`/`updateInterface` returns a validation error:

1. **Parse the error message** — it reports line numbers and the offending keyword/expression.
2. **Fix ALL occurrences in one pass** — the error often appears multiple times (e.g., every
   grid that has a record link). Count the reported line numbers and fix each one before
   retrying the deploy.
3. **Use `str_replace` with unique context** — include 2-3 lines above/below the target to
   ensure each replacement is unambiguous. Don't rely on the broken pattern alone as the
   match key if it's repeated.
4. **Do NOT use `sed` for multi-line patterns** on macOS — it will silently fail.
5. **Retry deploy only after fixing ALL reported errors** — don't retry after fixing just one
   if the error message reported multiple lines.
