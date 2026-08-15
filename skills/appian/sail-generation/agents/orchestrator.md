# SAIL Orchestrator Agent

## Role
Entry-point for SAIL UI generation. Classify the request, then dispatch to the correct specialist. Do NOT write SAIL code yourself.

**This orchestrator SUPERSEDES the general SKILL.md loading strategy for SAIL generation.**
Do NOT load universal references, run verification checkpoints, or call `validateExpression`
for interface creation — the local validator handles that. Follow ONLY the steps below.
The SKILL.md references (interfaces.md for naming) apply only when deploying the final
result to Appian via MCP tools (Step 5 below).

**PIPELINE ROOT (absolute):** `{workspace}/skills/appian/sail-generation/`
All shell commands (define.js, scaffold.js, validate.sh, resolve-icons.js) use this as `cwd`.

**This file's own path:** `{PIPELINE ROOT}/agents/orchestrator.md`. Every other agent file
in this directory follows the same pattern: `{PIPELINE ROOT}/agents/{name}.md`. Resolve
directly from this — never guess a path, and never shell out to `find`/`grep`/`ls` to
locate an agent file the dispatch table already named.

## DISCOVERING APPIAN OBJECTS

**Use MCP tools, not the filesystem.** Appian objects (apps, record types, fields, relationships) live on the server — not in local files. Do NOT use `find`, `grep`, `ls`, or `cat` to look for UUIDs or record type info.

- App UUID → `listApplications(query: "...")`
- Record type UUID + fields → `listRecordTypes(appUuid)` → `getRecordType(uuid)`
- Relationships → `listRecordTypeRelationships(uuid)`
- Existing interfaces → `listInterfaces(appUuid, query: "...")`

Call these MCP tools directly. One `getRecordType` call gives you all field UUIDs, relationship UUIDs, and type references needed for the definition JSON.

**Related record fields:** If the request displays a field from a related record type (e.g.,
a lookup table's `label` for status/priority/category), call `getRecordType` on that related
record type too. A relationship UUID is not the same as the target field UUID — you need both.
When in doubt, call `getRecordType` on every record type mentioned in the request.

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

`/output/{uuid}/` is the default output directory for the pipeline scripts.

**When to use workspace staging instead:** If the specialist reports that Pass 3 edits are
needed (e.g., avg resolution time requiring `forEach`, custom interactions), use
`--output-dir` to write to a workspace-local path so you can edit the file before deploying:

```bash
node generator/define.js --output-dir /tmp/sail-staging --write {uuid} '{json}'
node generator/scaffold.js --output-dir /tmp/sail-staging --from-definition {uuid}
```

**Decision rule:** If the specialist's summary says "Pass 3 needed" or you know you'll edit
the output, use workspace staging. Otherwise, use the default output path for zero-copy
deploy.

### DISPATCH RULES

- **Do NOT read the output `.sail` file** unless Pass 3 editing is needed.
- **Zero intermediate tool calls.** After classifying + discovering UUIDs, dispatch immediately.
- **Specialist MUST report the absolute resolved output path** in its summary.
- **Decide live vs. mockup variant BEFORE dispatching** — the Concrete Identifiers check
  alone tells you which one. Never read both variants "to compare."

Build the brief:

```
TASK TYPE: wizard | form | grid | dashboard | record-view | pane | component | display | layout
UUID: {uuid}
OUTPUT PATH: /output/{uuid}/{descriptive-slug}.sail
PIPELINE ROOT: skills/appian/sail-generation

USER REQUEST: "{verbatim}"
INFERRED ENTITIES: {EntityName} (field1, field2, ...)
CONCRETE IDENTIFIERS: (paste record type UUIDs, field UUIDs, relationship UUIDs from MCP discovery)

PIPELINE REMINDER (definition agents):
You MUST use the definition pipeline: write definition JSON → scaffold.js renders SAIL.
NEVER write raw SAIL components by hand.
All commands run from: skills/appian/sail-generation/
  node generator/define.js --write {uuid} '{json}'
  node generator/scaffold.js --from-definition {uuid}
  ./validate.sh /output/{uuid}/{slug}-scaffold.sail
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
Concrete Identifiers (record type UUIDs, field UUIDs, relationship UUIDs). If the brief
only has entity names and inferred fields without UUIDs, use the standard mockup agent.

---

## STEP 4 — ICON RESOLUTION

**Short-circuit:** If the specialist reports 0 placeholders or icon resolution complete, skip.

```bash
node generator/resolve-icons.js {uuid} --auto
```
(Run from `skills/appian/sail-generation/`)

- `"placeholders": 0` → done
- `"resolved": N` with no errors → done
- Errors → manual override: `node generator/resolve-icons.js {uuid} concept1:alias1 ...`

---

## STEP 5 — DEPLOY TO APPIAN

**Always deploy after generation — do NOT stop to ask the user for UUIDs or confirmation.**

1. **Find the app UUID yourself** — call `listApplications` (with `query` if the user named the app) and pick the matching one.
2. **Determine create vs update** — call `listInterfaces(appUuid)` with a query matching the interface name. If it exists, update; otherwise, create.
3. **Derive the interface name** from the user's request using the app prefix + descriptive name (e.g., `ITSM_TeamDashboard`). Load `references/interfaces.md` if unsure about naming.
4. **Deploy:**

```
createInterface(
  name: "PREFIX_InterfaceName",
  appUuid: "...",
  expressionFilePath: "/path/to/{uuid}/{slug}.sail",
  inputs: [...]
)
```

**Do NOT ask the user** for app UUID, interface name, or create-vs-update — resolve these yourself using list/get tools.

---

## IDEAL TOOL-CALL SEQUENCE

0. `ToolSearch` once for the full expected toolset (discovery + conditional lookups + deploy) — not fetched reactively as each is needed
1. MCP discovery (`listApplications`, `getRecordType` for each entity)
2. Dispatch specialist (UUID generated inline, brief includes concrete identifiers)
3. `node generator/resolve-icons.js {uuid} --auto` (only if placeholders > 0)
4. `createInterface`/`updateInterface` — deploy to Appian

That's 5–6 tool calls total in the parent.

## ANTI-PATTERNS

- **Asking the user for app UUID, interface name, or create/update choice** — look these up yourself via `listApplications` and `listInterfaces`
- **Searching the filesystem for Appian object info** (`find`, `grep`, `ls` for UUIDs, record types, field names) — use MCP tools instead; Appian objects are on the server, not in local files
- **Loading SKILL.md reference files** (appian-workflow-patterns.md, query-record-type-patterns.md, etc.) — the pipeline handles everything; don't load references for interface tasks
- **Calling `getInterface` on the deploy target for any reason before deploying** — whether to find a pattern to mirror, confirm it's currently blank, or check existing content. `createInterface`/`updateInterface` fully replaces the expression regardless of prior state, and `listInterfaces` already gives you the UUID needed to deploy. There is no legitimate reason to read the target interface's body first — if you catch yourself justifying it, that's the anti-pattern.
- **Reading both the mockup and live variant** of a specialist file "to compare" — decide from Concrete Identifiers alone
- **Listing the `agents/` directory (`ls`) to confirm a specialist file exists** — the dispatch table in Step 3 is authoritative; use the filename it gives you directly
- **Fetching MCP tool schemas via `ToolSearch` one at a time as each is needed** — before starting discovery, batch a single `ToolSearch` call covering the full expected toolset for the task: discovery tools, any conditional lookups (e.g. `listRecordData` to verify lookup-table values), and the deploy tool (`createInterface`/`updateInterface`)
- **Copying .sail files** to a different path before deploy (unnecessary — pass the original)
- **Reading .sail output into context** to "verify" after validation already passed (unless Pass 3 editing is needed)
- **Guessing the pipeline cwd** — always use `{workspace}/skills/appian/sail-generation/`
- **Hand-writing `a!recordLink(record: ...)`** — the correct params are `recordType` and `identifier`. See `guidelines/logic-guidelines/record-link-patterns.md`
- **Using `sed` for multi-line replacements** — macOS `sed` doesn't handle `\n` in patterns. Use proper file-edit tools for any edit spanning more than one line.
- **Assuming one replacement fixes all occurrences** — if the same pattern appears at multiple locations (e.g., a grid column in two different grids), each occurrence needs its own targeted replacement with enough unique surrounding context to disambiguate.

---

## POST-DEPLOY PATCHING (when Appian rejects what the validator passed)

The local validator may have gaps — Appian's server-side validation is the source of truth.
When `createInterface`/`updateInterface` returns a validation error:

1. **Parse the error message** — it reports line numbers and the offending keyword/expression.
2. **Fix ALL occurrences in one pass** — the error often appears multiple times (e.g., every
   grid that has a record link). Count the reported line numbers and fix each one before
   retrying the deploy.
3. **Use targeted replacements with unique context** — include 2-3 lines above/below the target to
   ensure each replacement is unambiguous. Don't rely on the broken pattern alone as the
   match key if it's repeated.
4. **Do NOT use `sed` for multi-line patterns** on macOS — it will silently fail.
5. **Retry deploy only after fixing ALL reported errors** — don't retry after fixing just one
   if the error message reported multiple lines.
