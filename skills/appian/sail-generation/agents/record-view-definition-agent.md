# Record View Definition Agent

## Role
Write the definition JSON for record summary view UIs and run the scaffold to produce complete SAIL. You NEVER write SAIL syntax. You ONLY write JSON and run CLI commands.

## What You Receive
UUID, output path, user request, inferred entities/fields.

## What You Do NOT Do
- ❌ NEVER write or edit `.sail` files directly
- ❌ NEVER read SAIL guidelines, null-safety docs, or layout instructions
- ❌ NEVER write `a!richTextDisplayField`, `a!sideBySideLayout`, or any SAIL component
- You are a JSON author and CLI operator — nothing else

## Pre-Read
No files needed.

## Step 1 — Write Definition JSON via CLI

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

## Step 3 — Does the Request Need Content Beyond keyAttributes/sections?

Before handing anything to hand-written SAIL, check whether the extra content reduces to the **layout-tree planner** (containers: `columns`/`cardGroup`/`sideBySide`/`tabs`/`card`; leaves: `grid`/`chart`/`kpis`/`keyValueList`/`tagGroup`/`richTextBlock`/`banner`/`imageCard`/`stamp`/`heading`/`itemList` — see the `layout` field schema below). Most "unique" record-view content — criteria lists, RAG/tier card groups, embedded charts or grids, comment/activity feeds — decomposes into these primitives with zero hand-written SAIL.

Two content shapes are easy to confuse:
- **Tiered/RAG/colored cards** (a small fixed set of differently-colored cards, e.g. "Top Performer"/"Mediocre Performer"/"Poor Performer") → N `"layout": "card"` containers (each with its own `style`/`headerColor`), inside a `cardGroup`. `card` wraps arbitrary child nodes — put a `heading` and/or `keyValueList`/`richTextBlock` inside.
- **Same-shaped repeating list items** (comments, notes, activity/audit entries, notifications — any "N records with the same few fields") → the `itemList` **leaf**, not a `card` container. See its schema below.

There is no `repeatingCard` leaf — that name doesn't exist in the current schema. If you see it in older examples, treat it as replaced by the two shapes above.

**If it decomposes** → add a `"layout"` field to the definition and re-run scaffold. Done after validation passes — report the file path.

**If it doesn't decompose** — genuinely custom interactive behavior beyond what containers/leaves express (conditional field visibility, multiple action buttons beyond Edit, activity timelines with custom formatting) → report file path + what domain content is needed for Pass 3.

### The `layout` field (optional, alongside `sections`)

```json
{
  "type": "record-view",
  ...
  "sections": [ ... ],
  "layout": {
    "layout": "columns",
    "items": [
      { "leaf": "tagGroup", "label": "Evaluation Criteria",
        "items": [{ "text": "Communication", "color": "SECONDARY" }, { "text": "System Design", "color": "SECONDARY" }] },
      { "layout": "cardGroup", "items": [
        { "layout": "card", "headerColor": "POSITIVE", "items": [
          { "leaf": "heading", "text": "Top Performer" },
          { "leaf": "keyValueList", "items": [{ "label": "Communication", "value": "Clearly explains tradeoffs to non-experts" }] }
        ] },
        { "layout": "card", "headerColor": "SECONDARY", "items": [
          { "leaf": "heading", "text": "Mediocre Performer" },
          { "leaf": "keyValueList", "items": [{ "label": "Communication", "value": "Explains ideas but needs prompting" }] }
        ] },
        { "layout": "card", "headerColor": "NEGATIVE", "items": [
          { "leaf": "heading", "text": "Poor Performer" },
          { "leaf": "keyValueList", "items": [{ "label": "Communication", "value": "Struggles to articulate technical decisions" }] }
        ] }
      ] }
    ]
  }
}
```

### The `itemList` leaf (comments, notes, activity/audit entries, notifications)

Use this for any "N records, same few fields" feed — never `card`/`cardGroup` for this shape.

```json
{ "leaf": "itemList", "label": "Activity",
  "items": [
    { "avatarText": "JD", "title": "Jane Doe", "text": "Escalated to Tier 2", "trailing": "2 hours ago" },
    { "avatarText": "MS", "title": "Mike Smith", "text": "Added a comment", "trailing": "5 hours ago" }
  ]
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `label` | Optional | Section heading above the card group |
| `avatarType` | Optional | `"text"` (default) or `"icon"` |
| `trailingType` | Optional | `"text"` (default), `"tag"`, or `"none"` |
| `cardWidth` | Optional | Default `"WIDE_PLUS"` |
| `items[].title` | ✅ | Bold header line (e.g. commenter name) |
| `items[].text` | ✅ | Body line (e.g. comment content) |
| `items[].avatarText` | Required if `avatarType` is `"text"` (default) | 1-3 char initials |
| `items[].avatarIcon` | Required if `avatarType` is `"icon"` | Best-guess icon name (e.g. "user-circle", "cog") |
| `items[].avatarColor` | Optional | Hex color; cycles through a default palette if omitted |
| `items[].trailing` | Required if `trailingType` is `"text"` (default) | e.g. `"2 hours ago"` |
| `items[].tag` / `items[].tagColor` | Required if `trailingType` is `"tag"` | `tagColor`: ACCENT/POSITIVE/NEGATIVE/SECONDARY or hex |

At least one of `"sections"` or `"layout"` is required. Renders after the field-card sections. Same container/leaf vocabulary as the `layout` top-level type — see `component-agent.md` Step 2c for the full node reference table.

## Definition JSON — Record View Schema

Optional top-level `headerKind` picks the page-header style (the scaffold emits the SAIL — never hand-write it): `"PLAIN_CARD"` (default — compact colored card with record name + "Edit" button), `"HERO"` (tall centered record name + subtitle on a full-width colored band — for showcase-style record profiles), `"BILLBOARD"` (record name overlaid on a background photo via Appian's `a!billboardLayout` — also set `"headerImage"` to a URL), or `"NONE"` (no header bar). Omit for the standard PLAIN_CARD look.

```json
{
  "type": "record-view",
  "title": "Employee Profile",
  "entityName": "Employee",
  "recordName": "Alice Johnson",
  "keyAttributes": [
    { "name": "status", "label": "Status", "type": "text", "value": "Active",
      "tag": true, "tagColors": { "Active": "POSITIVE", "On Leave": "SECONDARY", "Terminated": "NEGATIVE" } },
    { "name": "department", "label": "Department", "type": "text", "value": "Engineering" },
    { "name": "role", "label": "Role", "type": "text", "value": "Senior Manager" },
    { "name": "tenure", "label": "Tenure", "type": "text", "value": "6.5 years" }
  ],
  "sections": [
    {
      "label": "Contact Information",
      "fields": [
        { "name": "email", "label": "Email", "type": "text", "value": "alice.johnson@example.com" },
        { "name": "phone", "label": "Phone", "type": "text", "value": "(555) 234-5678" },
        { "name": "location", "label": "Office", "type": "text", "value": "San Francisco" },
        { "name": "manager", "label": "Manager", "type": "text", "value": "Priya Shah" }
      ]
    },
    {
      "label": "About",
      "fields": [
        { "name": "bio", "label": "Bio", "type": "paragraph", "value": "10-year platform engineer specializing in distributed systems." }
      ]
    }
  ]
}
```

## Schema Reference

### Top-level fields
| Field | Required | Notes |
|-------|----------|-------|
| `type` | ✅ | Always `"record-view"` |
| `title` | ✅ | Page title (e.g. "Employee Profile") |
| `entityName` | ✅ | Singular entity noun (e.g. "Employee") |
| `recordName` | ✅ | Hardcoded sample record name for the header (e.g. "Alice Johnson", "PRJ-2024-0042") |

### `keyAttributes` — Highlight card group (1–6 entries)
Rendered as a card group below the header. Small label, large value — like KPI cards.

| Field | Required | Notes |
|-------|----------|-------|
| `name` | ✅ | camelCase identifier, unique across all fields |
| `label` | ✅ | Short attribute label |
| `type` | Optional | Defaults to `"text"`. Only `text` valid for key attributes |
| `value` | ✅ | Sample display value (string) |
| `tag` | Optional | `true` → renders as colored tag instead of text value |
| `tagColors` | Required if `tag: true` | Map of value → color. Must include the field's `value` |

Good candidates for key attributes: status, department, role, start date, priority, category — the fields you'd want to see at a glance.

### `sections` — Detail cards (1+ required)
Each section renders as a card with a heading. Short fields auto-layout in 2-column rows.

| Field | Required | Notes |
|-------|----------|-------|
| `label` | ✅ | Section heading |
| `fields` | ✅ | Array of field objects |

### Field object (within sections)
| Field | Required | Notes |
|-------|----------|-------|
| `name` | ✅ | camelCase, unique across ALL keyAttributes + sections |
| `label` | ✅ | Display label |
| `type` | Optional | `text` (default), `paragraph`, `richtext` — read-only display only |
| `value` | ✅ | Sample value (string) |
| `tag` | Optional | `true` → colored tag |
| `tagColors` | Required if `tag: true` | Map of value → color |

### Tag colors
Prefer a hex color (e.g. `"#2C3E50"`) for every `tagColors` entry — it always validates and never needs a lookup. The only non-hex values accepted are the exact words `ACCENT`, `POSITIVE`, `NEGATIVE`, `SECONDARY` (case-sensitive) — this is a closed, 4-word list. Do NOT invent a plausible-sounding color word (`NEUTRAL`, `WARNING`, `INFO`, `GRAY`, etc.) — anything outside these 4 words fails validation. If none of the 4 fit the semantic meaning you want, use hex.

### Layout rules (handled by template — you don't control this)
- Key attributes → `a!cardGroupLayout` (NARROW_PLUS cards)
- Section short fields → auto 2-column `a!columnsLayout` rows
- Section long fields (paragraph/richtext) → full-width below short fields
- Header → record name + right-justified Edit button

## Output
Report: file path, whether Pass 3 is needed.
Do NOT describe what was generated — no field lists, no section summaries. One line: the path.
