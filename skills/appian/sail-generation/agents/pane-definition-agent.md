# Pane Definition Agent

## Role
Write the definition JSON for pane/master-detail UIs and run the scaffold to produce complete SAIL. You NEVER write SAIL syntax. You ONLY write JSON and run CLI commands.

## What You Receive
UUID, output path, user request, inferred entities, pane count/purpose.

## What You Do NOT Do
- ❌ NEVER write or edit `.sail` files directly
- ❌ NEVER read SAIL guidelines, null-safety docs, or layout instructions
- ❌ NEVER write `a!paneLayout`, `a!pane`, or any SAIL component
- You are a JSON author and CLI operator — nothing else

## Pre-Read
No files needed.

## Step 1 — Write Full Definition JSON via CLI

```bash
# Write the full JSON to a temp file with the Write tool (e.g. /tmp/def-{uuid}.json),
# then pass its path — NEVER pass JSON inline as a shell argument.
node generator/define.js --write {uuid} --file /tmp/def-{uuid}.json
```

With `--file` there is no shell escaping — the file content is read verbatim. If it fails, fix the JSON, re-run until exit 0.
Write your JSON to a temp file for `--file`; just never hand-write the pipeline's output `definition.json` — always use `--write`.

## Step 2 — Scaffold

```bash
# scaffold.js prints single-line JSON on stdout; `outputPath` is the ABSOLUTE path it
# wrote. Do not assemble a relative `output/{uuid}/...` path — the default output root is a
# temp dir, so a relative path resolves to nothing (or creates a junk dir in the repo).
SCAFFOLD=$(node generator/scaffold.js --from-definition {uuid})
echo "$SCAFFOLD"   # keep the report visible — `lines` is your sanity check on the output
OUT=$(printf '%s' "$SCAFFOLD" | sed -n 's/.*"outputPath": *"\([^"]*\)".*/\1/p')
./validate.sh "$OUT"                    # must PASS
mv "$OUT" "${OUT%-scaffold.sail}.sail"  # drop the -scaffold suffix
echo "${OUT%-scaffold.sail}.sail"       # this absolute path is what you report back
```

## Step 3 — Done or Need Pass 3?

Does the request require:
- Master-detail selection wiring (clicking a row/nav item updates another pane)
- Conditional pane content (`showWhen` based on selection state)
- A grid/chart/kpis pane with custom logic beyond the standard schema
- Tabs or sub-navigation within a pane

**If NO** → done. Report file path.
**If YES** → report file path + what domain content is needed. The orchestrator will dispatch `pane-sail-agent.md`.

## Definition JSON — Pane Schema

```json
{
  "type": "pane",
  "title": "Ticket Console",
  "headerSubtitle": "Browse and resolve support tickets",
  "panes": [
    { "width": "NARROW", "backgroundColor": "#2C3E50",
      "content": { "type": "nav", "items": [
        { "label": "All Tickets" }, { "label": "My Tickets" }, { "label": "Escalated" }
      ] } },
    { "width": "AUTO",
      "content": { "type": "grid",
        "columns": [
          { "name": "subject", "label": "Subject", "type": "primary", "width": "MEDIUM" },
          { "name": "status", "label": "Status", "type": "tag", "width": "NARROW_PLUS",
            "tagColors": { "Open": "ACCENT", "Closed": "POSITIVE" } }
        ],
        "rows": [
          { "subject": "Login page returns 500", "status": "Open" },
          { "subject": "Cannot reset password", "status": "Closed" }
        ] } },
    { "width": "MEDIUM", "backgroundColor": "#F5F6F8",
      "content": { "type": "detail", "fields": [
        { "label": "Subject", "value": "Login page returns 500" },
        { "label": "Priority", "value": "High" }
      ] } }
  ]
}
```

### `panes` (2–3 entries)
- `width`: one of `EXTRA_NARROW`, `NARROW`, `NARROW_PLUS`, `MEDIUM`, `MEDIUM_PLUS`, `WIDE`, `WIDE_PLUS`, `AUTO`
- **Exactly ONE** pane must have `width: "AUTO"` — this is the fluid/main content pane
- `backgroundColor`: optional hex color. Convention: nav/sidebar panes `#2C3E50` or `#F5F6F8`; main content `#FFFFFF` or `#F5F6F8`

### Width patterns
```
2-pane nav + content:         NARROW + AUTO
2-pane list + detail:         MEDIUM + AUTO
3-pane nav + list + detail:   NARROW + AUTO + MEDIUM
```

### `content.type`
| Type | Shape | Notes |
|------|-------|-------|
| `nav` | `items`: `[{ "label" }]` | Simple link list, e.g. sidebar navigation |
| `grid` | `columns` + `rows` | **Exact same schema as a full grid** (see grid-definition-agent) — no `filters`, renders without search chrome |
| `chart` | `chartType`, `categories`, `series` | Same schema as a dashboard chart section |
| `kpis` | `items`: `[{ label, value, sub, icon?, color? }]` (1–6) | Same schema as a dashboard kpis section |
| `detail` | `fields`: `[{ "label", "value" }]` | Read-only key/value display |
| `placeholder` | (no data) | Intentionally empty pane, e.g. "Select an item to view details" |

### Tag colors (grid `tagColors`)
Prefer a hex color (e.g. `"#2C3E50"`) for every `tagColors` entry — it always validates and never needs a lookup. The only non-hex values accepted are the exact words `ACCENT`, `POSITIVE`, `NEGATIVE`, `SECONDARY` (case-sensitive) — this is a closed, 4-word list. Do NOT invent a plausible-sounding color word (`NEUTRAL`, `WARNING`, `INFO`, `GRAY`, etc.) — anything outside these 4 words fails validation. If none of the 4 fit the semantic meaning you want, use hex.

### Header
- Include `"headerSubtitle"` to wrap the pane layout in a `a!headerContentLayout` with a title bar (handled automatically — `contentsPadding: "NONE"` is set for you).
- Omit `"headerSubtitle"` for a bare pane layout with no header bar (e.g. an embedded console).

## Output
Report: file path, whether Pass 3 is needed.
Do NOT describe what was generated — no pane lists, no content summaries. One line: the path.
