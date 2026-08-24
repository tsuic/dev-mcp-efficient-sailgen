---
inclusion: fileMatch
fileMatchPattern: "*.html"
description: "Converts an HTML mockup to a SAIL interface via the deterministic html-to-json parser + scaffold pipeline. Activates when an .html file is read into context."
---

# HTML → SAIL Conversion Pipeline

## WHEN THIS ACTIVATES

This steering activates when an `.html` file enters context. If the user's intent is to
convert that HTML into an Appian SAIL interface, follow this pipeline. If the user is
doing something else with the HTML file (editing it, discussing it, etc.), ignore this
steering.

**Trigger signals** (confirm at least one before proceeding):
- User says "convert this to SAIL", "make this an Appian interface", "deploy this as SAIL"
- User provides HTML alongside a request to create an interface
- User asks to "convert this mockup" or "turn this into Appian"

If unclear, ask: "Do you want me to convert this HTML into a SAIL interface?"

## PIPELINE

**PIPELINE ROOT (absolute):** `{workspace}/skills/appian/sail-generation/`

### Step 1 — Parse HTML to definition JSON

```bash
node generator/html-to-json.mjs <path-to-html-file>
```

This outputs a JSON definition to stdout. Capture it. The parser:
- Classifies the page type (dashboard, form, wizard, pane, layout)
- Extracts theme colors, data values, layout structure
- Emits JSON compatible with `define.js`

### Step 2 — Validate and save definition

Generate a UUID inline (`gen-[8-hex-chars]`), then:

```bash
node generator/define.js --write {uuid} '{json}'
```

**If validation passes** → proceed to Step 3.

**If validation fails** → read the error, fix the JSON (common issues: missing `sub`
on KPI items, pane width "AUTO" count, icon names). Re-run. If it still fails after
one fix attempt, fall back to the normal SAIL generation pipeline
(sail-generation.md) — pass the parsed JSON as context to the specialist agent
so it has a head start rather than authoring from scratch.

### Step 3 — Scaffold SAIL

```bash
node generator/scaffold.js --from-definition {uuid}
```

Output: `{tmpdir}/sail-generation/{uuid}/{slug}-scaffold.sail`

### Step 4 — Validate SAIL

```bash
./validate.sh {tmpdir}/sail-generation/{uuid}/{slug}-scaffold.sail
```

Must PASS. If it fails, report as a generator bug.

### Step 5 — Icon resolution

```bash
node generator/resolve-icons.js {uuid} --auto
```

Skip if the sub-agent reports 0 placeholders.

### Step 6 — Deploy to Appian

Follow the same deploy logic as sail-generation.md Step 5:
1. Find the app UUID via `listApplications`
2. Determine create vs update via `listInterfaces`
3. Derive interface name from the HTML `<title>` + app prefix
4. Call `createInterface` or `updateInterface` with `expressionFilePath`

### Step 7 — Assess coverage

After deploying, briefly note what the parser captured vs. what may need manual
refinement. Common gaps:
- Conditional logic (showWhen) — not expressible from static HTML
- forEach patterns with per-item inline charts
- Interactive elements (tag selectors, search bars)
- Custom formatting functions (dollar(), todate())

If significant gaps exist, list them as remaining to-dos in the post-deploy summary.

## RELATIONSHIP TO sail-generation.md

This pipeline **replaces Steps 2–3** of the normal sail-generation.md flow (classify +
dispatch specialist agent). Steps 1, 4–5 (UUID, icon resolution, deploy) are identical.
The parser does the classification and JSON authoring deterministically — no LLM
specialist agent is needed for the structural scaffold.

The normal sail-generation.md steering still handles:
- Natural language → SAIL (user describes a UI in words)
- Live record-backed interfaces (UUIDs from MCP tools)

## ANTI-PATTERNS

- **Running the parser on NL requests** — if the user describes a UI in words (no HTML
  file), use sail-generation.md instead. This steering only applies to HTML input.
- **Manually writing definition JSON** when the parser already produced it — trust the
  parser output; only fix it if define.js reports validation errors.
- **Skipping the validate step** — always run validate.sh before deploying.
- **Loading specialist agent .md files** — the parser replaces the specialist; don't
  load form-definition-agent.md or dashboard-definition-agent.md for HTML conversion.
