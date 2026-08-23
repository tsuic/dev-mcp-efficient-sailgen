# Fork: Deterministic SAIL Generation Pipeline

This fork extends the upstream [appian/dev-mcp-skills](https://github.com/appian/dev-mcp-skills) repository with a **script-driven SAIL generation pipeline** that replaces the flexible-but-inefficient LLM-authored SAIL path with a deterministic, programmatic one.

## Why this fork exists

The upstream skill teaches AI agents how to build Appian applications using domain knowledge (patterns, conventions, gotchas). When it comes to generating SAIL interfaces, the upstream approach has the agent write SAIL expressions directly — the LLM produces every line of the component tree, guided by reference files.

That approach is correct but expensive:

- **Token-intensive.** A dashboard or record view is 100–300 lines of SAIL. The LLM generates every character, consuming output tokens proportionally.
- **Syntactically fragile.** SAIL has strict nesting, parameter naming, and quoting rules. LLMs hallucinate parameter names, forget commas, mis-nest layouts. Each server-side validation failure costs a retry loop.
- **Non-deterministic.** The same prompt produces structurally different SAIL on each run — different indentation, different variable naming, different section ordering — making output quality unpredictable.

This fork introduces a **definition → scaffold** pipeline: the LLM makes design decisions only (which fields, what layout, how many sections), expressed as a typed JSON definition. Deterministic Node.js scripts then render syntactically-correct SAIL from that definition. The LLM never writes SAIL syntax for supported page types.

## What changed from upstream

| Upstream | This fork |
|---|---|
| LLM writes raw SAIL guided by `references/interfaces.md` + `references/sail.md` | LLM fills a JSON schema; JS scripts render SAIL |
| Validation happens server-side (Appian rejects bad SAIL) | Local validator catches errors before deploy |
| One agent handles classify + generate + validate | Orchestrator classifies → specialist sub-agent fills JSON → scripts render |
| Agent-agnostic (works with any harness) | Optimized for Kiro and Claude sub-agent dispatch |

The upstream reference files (`references/`) are preserved unchanged. The pipeline adds new content under `skills/appian/sail-generation/` and Kiro-specific steering under `.kiro/steering/sail-generation.md`.

## Kiro and Claude pipeline optimizations

The upstream skill is designed to be agent-harness-agnostic — it works with Kiro, Claude Code, Cursor, or any IDE that loads markdown context. This fork adds optimizations specific to Kiro's architecture:

### Sub-agent dispatch

Kiro's `invoke_sub_agent` tool allows the orchestrator to delegate the definition-filling step to a specialist agent with its own context window. This keeps the orchestrator's context lean (classify + deploy only) while the specialist loads page-type-specific guidelines.

The agent dispatch table maps each page type (form, wizard, grid, dashboard, record-view, pane, layout, component) to a dedicated agent markdown file that contains focused instructions for filling exactly that page type's JSON schema.

### Steering file integration

`.kiro/steering/sail-generation.md` is auto-included and **supersedes** the standard SKILL.md loading strategy for interface creation tasks. This means:
- No universal reference loading for SAIL generation (the pipeline handles it)
- No `validateExpression` MCP calls (the local validator handles it)
- The orchestrator follows a fixed 5-step protocol instead of the general skill loading strategy

### Context efficiency

- The LLM's output is a compact JSON object (typically 30–80 lines) rather than 100–300 lines of SAIL
- Sub-agents receive only the guidelines relevant to their page type via `contextFiles`
- The orchestrator never reads the generated `.sail` file into context unless Pass 3 editing is needed
- Total tool calls for a generation: 3–4 (dispatch + icon-resolve + deploy)

### Claude Code compatibility

The same pipeline works under Claude Code via the `.claude/skills/appian/SKILL.md` entry point. Claude Code doesn't have sub-agent dispatch, so it runs the specialist instructions inline. The scripts and JSON contract are agent-agnostic — only the dispatch mechanism differs.

## Pipeline flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ User: "Create a team dashboard for the ITSM app"                    │
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─ STEP 1: UUID ──────────────────────────────────────────────────────┐
│ Orchestrator generates gen-{8 hex chars} inline (no shell call)      │
└──────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─ STEP 2: CLASSIFY ──────────────────────────────────────────────────┐
│ Categorize as: wizard | form | grid | dashboard | record-view |      │
│                pane | layout | component | display                    │
│                                                                      │
│ "team dashboard" → DASHBOARD                                         │
└──────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─ STEP 3: DISPATCH TO SPECIALIST ────────────────────────────────────┐
│                                                                      │
│ invoke_sub_agent(                                                     │
│   contextFiles: [                                                    │
│     "agents/dashboard-definition-agent.md",                          │
│     "generator/define.js",                                           │
│     "generator/scaffold.js"                                          │
│   ]                                                                  │
│ )                                                                    │
│                                                                      │
│ Sub-agent:                                                           │
│   1. Reads page-type-specific guidelines + JSON schema               │
│   2. Discovers Appian objects via MCP (record types, fields, UUIDs)  │
│   3. Produces definition JSON:                                       │
│      {                                                               │
│        "type": "dashboard",                                          │
│        "title": "Team Dashboard",                                    │
│        "entityName": "Ticket",                                       │
│        "sections": [                                                 │
│          { "type": "kpis", "items": [...] },                         │
│          { "type": "chart", "chartType": "bar", ... },               │
│          { "type": "grid", "columns": [...], "rows": [...] }         │
│        ]                                                             │
│      }                                                               │
│                                                                      │
│   4. Runs: node generator/define.js --write {uuid} '{json}'          │
│      → Validates schema, catches errors before rendering             │
│      → Writes: $TMPDIR/sail-generation/{uuid}/definition.json        │
│                                                                      │
│   5. Runs: node generator/scaffold.js --from-definition {uuid}       │
│      → Deterministic SAIL rendering via templates/dashboard.js       │
│      → Writes: $TMPDIR/sail-generation/{uuid}/{slug}-scaffold.sail   │
│                                                                      │
│   6. Runs: ./validate.sh $TMPDIR/.../{slug}-scaffold.sail            │
│      → Local structural/arity/schema validation                      │
│      → Pass = done. Fail = fix definition and retry.                 │
│                                                                      │
│ Returns: { outputPath, lines, placeholders }                         │
└──────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─ STEP 4: ICON RESOLUTION ───────────────────────────────────────────┐
│ node generator/resolve-icons.js {uuid} --auto                        │
│ (skipped if sub-agent reports 0 placeholders)                        │
└──────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─ STEP 5: DEPLOY TO APPIAN ──────────────────────────────────────────┐
│ 1. listApplications(query: "ITSM") → app UUID                       │
│ 2. listInterfaces(appUuid, query: "TeamDashboard") → create or update│
│ 3. createInterface(                                                  │
│      name: "ITSM_TeamDashboard",                                     │
│      appUuid: "...",                                                 │
│      expressionFilePath: "$TMPDIR/.../team-dashboard-scaffold.sail"   │
│    )                                                                 │
└──────────────────────────────────────────────────────────────────────┘
```

## Supported page types

| Type | Definition agent | Renderer | Pass 3 agent (if needed) |
|---|---|---|---|
| Form | `form-definition-agent.md` | `templates/form.js` | `form-sail-agent.md` |
| Wizard | `wizard-definition-agent.md` | `templates/wizard.js` | `wizard-sail-agent.md` |
| Grid | `grid-definition-agent.md` | `templates/grid.js` | `sail-coder.md` |
| Dashboard | `dashboard-definition-agent.md` | `templates/dashboard.js` | `sail-coder.md` |
| Record View | `record-view-definition-agent.md` | `templates/record-view.js` | `sail-coder.md` |
| Pane | `pane-definition-agent.md` | `templates/pane.js` | `pane-sail-agent.md` |
| Layout | `custom-ui-planner.md` | `templates/layout.js` | — |
| Component | `component-agent.md` | `templates/component.js` | routes to `sail-coder.md` if outside schema |
| Display | `sail-coder.md` | (hand-written SAIL) | — |

**Pass 3** is a fallback: when the JSON schema can't express something (e.g., custom interactions, complex conditional logic), the sub-agent edits the scaffold output directly. The goal is to minimize Pass 3 usage by expanding the JSON vocabulary over time.

## Architecture decisions

### Why JSON (not YAML, XML, or a DSL)?

- LLMs produce JSON more reliably than any other structured format
- JSON.parse is zero-dependency and sub-millisecond for these payloads
- Strict syntax (explicit braces/quotes) surfaces LLM mistakes at the define step rather than at render time
- The `define.js` validator provides rich error messages keyed to the JSON structure

### Why Node.js (not PHP, Python, or a compiled language)?

- Zero runtime dependencies — the generator uses only Node.js built-ins
- Same toolchain as the TypeScript validator (one `node` binary runs everything)
- String template literals are ergonomic for SAIL's nested structure
- Execution time is ~40ms — irrelevant when the bottleneck is LLM inference (seconds)
- Contributors already work in JS/TS for the validator

### Why deterministic rendering instead of LLM-guided?

- **Syntax correctness by construction.** The templates cannot produce malformed SAIL — no missing commas, no hallucinated parameters, no broken nesting.
- **Predictable output.** Same definition → same SAIL, every time. No structural drift between runs.
- **Cheaper.** The LLM outputs 30–80 lines of JSON instead of 100–300 lines of SAIL. At typical token pricing, this is a 3–5x reduction in output tokens per interface.
- **Faster iteration.** Fixing a rendering bug means editing a JS template once, not re-prompting and hoping the LLM doesn't regress.

## File layout (additions to upstream)

```
skills/appian/sail-generation/          ← Pipeline root
  generator/
    define.js                           ← JSON definition validator + writer (1,900 lines)
    scaffold.js                         ← Dispatches to per-type template renderers
    templates/                          ← 8 SAIL renderers (form, wizard, grid, dashboard, etc.)
    layout-tree.js                      ← Recursive container/leaf composition engine
    resolve-icons.js                    ← Icon placeholder resolution
    shared.js                           ← String conversion helpers
    output-dir.js                       ← Output path management
  validator/
    sail-validator.ts                   ← Entry point
    rules/                             ← 9 validation rules (structural, schema, arity, etc.)
    dist/                              ← Pre-compiled JS (no build step needed at runtime)
  agents/                              ← 14 specialist agent instruction files
  guidelines/
    reference/schemas/                 ← JSON schemas for SAIL components
    logic-guidelines/                  ← Expression patterns, null safety, record links
    ui-guidelines/                     ← Visual patterns (KPIs, cards, messages)
  validate.sh                          ← Shell wrapper with timing integration

.kiro/steering/sail-generation.md       ← Kiro auto-included steering (supersedes SKILL.md for interfaces)
```

## Relationship to upstream

This fork tracks upstream `main` and pulls in reference file updates. The pipeline content (`sail-generation/`, `.kiro/steering/sail-generation.md`) is additive — it doesn't modify upstream files. The intent is to upstream the pipeline once it stabilizes, at which point this fork merges back.
