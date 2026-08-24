---
model: haiku
description: "Leaf prop schemas for layout-tree population. Loaded during Pass 2 — only the sections matching leaves in the skeleton tree are needed."
---

# Leaf Props Reference

Prop schemas for every layout-tree leaf type. Load this file during **Pass 2** (leaf
population) — you only need the sections for leaf types that appear in your skeleton tree.

## Table of Contents

1. [kpis](#kpis) — Metric card group
2. [chart](#chart) — Column/line/bar/area/pie chart
3. [grid](#grid) — Summary data grid (no filter chrome)
4. [keyValueList](#keyvaluelist) — Label/value pairs
5. [tagGroup](#taggroup) — Row of chips/tags
6. [richTextBlock](#richtextblock) — Styled text paragraph
7. [button](#button) — CTA button or button group
8. [stamp](#stamp) — Colored icon circle
9. [heading](#heading) — Standalone title row
10. [imageCard](#imagecard) — Photo-led content card
11. [banner](#banner) — Info/success/warn/error message card
12. [itemList](#itemlist) — Repeating same-shape cards (feeds, comments)
13. [milestone](#milestone) — Progress step indicator
14. [gauge](#gauge) — Circular progress percentage
15. [horizontalLine](#horizontalline) — Visual divider
16. [recordActionField](#recordactionfield) — Record action buttons (live only)
17. [linkField](#linkfield) — Clickable link(s)

---

## kpis

Metric card group — typically 3–6 items.

```json
{
  "leaf": "kpis",
  "items": [
    { "label": "Open Tickets", "value": "428", "sub": "+12% vs last week", "icon": "clipboard", "color": "#2C3E50" }
  ]
}
```

| Prop | Required | Type | Notes |
|------|----------|------|-------|
| `items` | Yes | array | 1–6 KPI objects |
| `items[].label` | Yes | string | Short metric name |
| `items[].value` | Yes | string | Display value (e.g. "428", "$12.5K", "94%") |
| `items[].sub` | Yes | string | Subtitle/trend text |
| `items[].icon` | No | string | Descriptive keyword — resolved by the icon pass |
| `items[].color` | No | hex | Stamp background color; defaults to palette rotation |

---

## chart

Any chart type wrapped in a card.

```json
{
  "leaf": "chart",
  "chartType": "column",
  "label": "Weekly Revenue",
  "categories": ["Mon", "Tue", "Wed", "Thu", "Fri"],
  "series": [{ "label": "Revenue", "data": [120, 145, 132, 168, 155], "color": "#2C3E50" }]
}
```

| Prop | Required | Type | Notes |
|------|----------|------|-------|
| `chartType` | Yes | enum | `column`, `line`, `bar`, `area`, `pie` — never `scatter` |
| `label` | Yes | string | Section heading |
| `categories` | Yes | string[] | X-axis labels |
| `series` | Yes | array | Each: `{ label, data[], color? }`. `data` length must match `categories` |
| `series[].color` | No | hex | Series color; defaults to theme accent |

---

## grid

Embedded summary grid — same shape as standalone grid columns/rows but no filter chrome.

```json
{
  "leaf": "grid",
  "label": "Recent Orders",
  "columns": [
    { "name": "orderId", "label": "Order", "type": "primary", "width": "NARROW_PLUS" },
    { "name": "status", "label": "Status", "type": "tag", "width": "NARROW_PLUS",
      "tagColors": { "Active": "POSITIVE", "Pending": "SECONDARY" } }
  ],
  "rows": [
    { "orderId": "ORD-100", "status": "Active" }
  ]
}
```

| Prop | Required | Type | Notes |
|------|----------|------|-------|
| `label` | No | string | Section heading (default "Recent Activity") |
| `columns` | Yes | array | Column definitions |
| `columns[].name` | Yes | string | Data key |
| `columns[].label` | Yes | string | Header text |
| `columns[].type` | Yes | enum | `primary` (exactly one), `tag`, `text`, `buttonArray`, `progressBar`, `image` |
| `columns[].width` | Yes | enum | `AUTO`, `ICON`, `ICON_PLUS`, `NARROW`, `NARROW_PLUS`, `MEDIUM`, `MEDIUM_PLUS`, `WIDE` — all AUTO or none AUTO |
| `columns[].tagColors` | tag only | object | Map every distinct value → `POSITIVE`/`NEGATIVE`/`SECONDARY`/`ACCENT` or hex |
| `rows` | Yes | array | Row objects; keys must match column `name`s |
| `filters` | — | — | NOT supported in layout-tree grids |

---

## keyValueList

Lightweight label/value pairs, no card chrome.

```json
{
  "leaf": "keyValueList",
  "label": "Details",
  "items": [
    { "label": "Email", "value": "alice@example.com" },
    { "label": "Phone", "value": "(555) 123-4567" }
  ]
}
```

| Prop | Required | Type | Notes |
|------|----------|------|-------|
| `label` | No | string | Section heading (default "Details") |
| `items` | Yes | array | Non-empty array of `{ label, value }` |
| `items[].label` | Yes | string | Field label |
| `items[].value` | Yes | string | Field value |

---

## tagGroup

Row of short chips/tags.

```json
{
  "leaf": "tagGroup",
  "label": "Skills",
  "items": [
    { "text": "Python", "color": "ACCENT" },
    { "text": "SQL", "color": "#2C3E50" }
  ]
}
```

| Prop | Required | Type | Notes |
|------|----------|------|-------|
| `label` | No | string | Optional heading above the tags |
| `items` | Yes | array | Non-empty array |
| `items[].text` | Yes | string | Tag text |
| `items[].color` | No | enum/hex | `ACCENT`, `POSITIVE`, `NEGATIVE`, `SECONDARY`, or hex |

---

## richTextBlock

Styled text block — use for prices, descriptions, marketing copy. Distinct from `heading`.

```json
{
  "leaf": "richTextBlock",
  "text": "$49/mo",
  "size": "EXTRA_LARGE",
  "style": "STRONG",
  "align": "CENTER",
  "color": "#FFFFFF"
}
```

| Prop | Required | Type | Notes |
|------|----------|------|-------|
| `text` | Yes | string | Content text |
| `size` | No | enum | `SMALL`, `STANDARD`, `MEDIUM`, `MEDIUM_PLUS`, `LARGE`, `EXTRA_LARGE` |
| `style` | No | enum | `STRONG` or `EMPHASIS` |
| `align` | No | enum | `LEFT`, `CENTER`, `RIGHT` |
| `color` | No | hex/keyword | Text color (default `#262626`) |

---

## button

Standalone CTA button or multi-button group.

**Single button:**
```json
{ "leaf": "button", "label": "Get Started", "style": "SOLID", "color": "ACCENT", "align": "CENTER" }
```

**Multi-button group:**
```json
{
  "leaf": "button",
  "align": "CENTER",
  "buttons": [
    { "label": "Primary", "style": "SOLID", "color": "ACCENT" },
    { "label": "Secondary", "style": "OUTLINE" }
  ]
}
```

| Prop | Required | Type | Notes |
|------|----------|------|-------|
| `label` | Yes* | string | Button text (*or provide `buttons` array instead) |
| `style` | No | enum | `SOLID` (default), `OUTLINE`, `LINK` |
| `color` | No | enum | `ACCENT` (default), `NEGATIVE`, `SECONDARY` |
| `size` | No | enum | `STANDARD` (default), `SMALL` |
| `align` | No | enum | `START` (default), `CENTER`, `END` |
| `buttons` | No | array | For multi-button: array of `{ label, style?, color?, size?, action? }` |
| `action` | No | object | Process launch: `{ type, processModel, processParameters? }` |

**action.type values:** `startProcess` (unattended background), `startProcessLink` (attended, shows forms).

---

## stamp

Single colored icon circle — use with `width: "MINIMIZE"` inside `sideBySide`.

```json
{ "leaf": "stamp", "icon": "user-circle", "color": "#3B82F6" }
```

| Prop | Required | Type | Notes |
|------|----------|------|-------|
| `icon` | No* | string | Descriptive keyword (*at least one of `icon` or `text` required) |
| `text` | No* | string | Text content (*at least one of `icon` or `text` required) |
| `color` | No | hex | Background color (default `#2C3E50`) |

---

## heading

Standalone title/heading row — distinct from `richTextBlock` (which is body text).

```json
{ "leaf": "heading", "text": "Getting Started", "size": "LARGE" }
```

| Prop | Required | Type | Notes |
|------|----------|------|-------|
| `text` | Yes | string | Heading text |
| `size` | No | enum | `SMALL`, `MEDIUM` (default), `LARGE`, `EXTRA_LARGE` |

---

## imageCard

Photo-led content card — product tiles, room cards, team members.

```json
{
  "leaf": "imageCard",
  "image": "https://images.unsplash.com/photo-abc",
  "heading": "Deluxe Suite",
  "text": "Ocean view with private balcony",
  "link": { "text": "Book Now" },
  "imageHeight": "SHORT_PLUS"
}
```

| Prop | Required | Type | Notes |
|------|----------|------|-------|
| `image` | Yes | string | Image URL |
| `heading` | Yes | string | Card title |
| `text` | No | string | Body text below heading |
| `link` | No | object | `{ text }` — trailing CTA link |
| `imageHeight` | No | enum | `EXTRA_SHORT`, `SHORT`, `SHORT_PLUS` (default), `MEDIUM`, `MEDIUM_PLUS`, `TALL`, `TALL_PLUS`, `EXTRA_TALL` |

---

## banner

Info/success/warn/error/closed message card.

**Simple:**
```json
{ "leaf": "banner", "severity": "INFO", "text": "System maintenance scheduled for tonight." }
```

**With actions:**
```json
{
  "leaf": "banner", "severity": "WARN", "text": "Your trial expires in 3 days.",
  "buttons": [{ "label": "Dismiss" }, { "label": "Upgrade Now" }]
}
```

**Persistent (always-visible, no actions):**
```json
{
  "leaf": "banner", "severity": "SUCCESS", "text": "All systems operational.",
  "heading": "System Status", "persistent": true
}
```

| Prop | Required | Type | Notes |
|------|----------|------|-------|
| `severity` | Yes | enum | `INFO`, `SUCCESS`, `WARN`, `ERROR`, `CLOSED` |
| `text` | Yes | string | Message body |
| `heading` | No | string | Title (used with `persistent: true`) |
| `link` | No | object | `{ text }` — trailing link. Mutually exclusive with `buttons`. |
| `buttons` | No | array | 1–2 action buttons `[{ label, style? }]`. Mutually exclusive with `link`. |
| `dismissible` | No | boolean | Adds close icon (replaces link/buttons) |
| `dismissLabel` | No | string | Accessibility text for dismiss action |
| `persistent` | No | boolean | Bordered icon-chip + heading/body variant (ignores link/buttons/dismissible) |

---

## itemList

Repeating same-shape cards — comments, messages, notifications, activity feeds.
Cards are always white/light with dark text (no per-item color).

```json
{
  "leaf": "itemList",
  "avatarType": "text",
  "trailingType": "tag",
  "cardWidth": "WIDE_PLUS",
  "items": [
    {
      "title": "Alice Chen",
      "text": "Looks good, approved!",
      "avatarText": "AC",
      "avatarColor": "#3B82F6",
      "tag": "Approved",
      "tagColor": "POSITIVE"
    }
  ]
}
```

| Prop | Required | Type | Notes |
|------|----------|------|-------|
| `label` | No | string | Section heading |
| `avatarType` | No | enum | `text` (initials, default) or `icon` |
| `trailingType` | No | enum | `text` (timestamp, default), `tag`, or `none` |
| `cardWidth` | No | enum | Card group width enum (default `WIDE_PLUS`) |
| `items` | Yes | array | Non-empty item objects |
| `items[].title` | Yes | string | Bold header line (e.g. commenter name) |
| `items[].text` | Yes | string | Body content |
| `items[].avatarText` | cond. | string | 1–3 char initials (required when avatarType=`text`) |
| `items[].avatarIcon` | cond. | string | Icon keyword (required when avatarType=`icon`) |
| `items[].avatarColor` | No | hex | Avatar background; cycles through palette if omitted |
| `items[].trailing` | cond. | string | Trailing text (required when trailingType=`text`) |
| `items[].tag` | cond. | string | Tag label (required when trailingType=`tag`) |
| `items[].tagColor` | cond. | enum/hex | `ACCENT`/`POSITIVE`/`NEGATIVE`/`SECONDARY` or hex (required when trailingType=`tag`) |

For colored/tiered cards (e.g. RAG status), use N `card` containers with `style`/`headerColor` inside a `cardGroup` instead of `itemList`.

---

## milestone

Progress step indicator — wizards, process trackers, timelines.

```json
{
  "leaf": "milestone",
  "steps": ["Submitted", "In Review", "Approved", "Deployed"],
  "active": 2,
  "stepStyle": "CHEVRON"
}
```

| Prop | Required | Type | Notes |
|------|----------|------|-------|
| `steps` | Yes | string[] | At least 2 step labels |
| `active` | No | integer | 1-based index of active step (default 1) |
| `label` | No | string | Optional field label above the milestone |
| `orientation` | No | enum | `HORIZONTAL` (default), `VERTICAL` |
| `stepStyle` | No | enum | `LINE` (default), `CHEVRON`, `DOT` |

---

## gauge

Circular progress indicator — completion percentages, utilization.

```json
{
  "leaf": "gauge",
  "percentage": 72,
  "primaryText": "72%",
  "secondaryText": "of quota",
  "color": "POSITIVE",
  "size": "MEDIUM"
}
```

| Prop | Required | Type | Notes |
|------|----------|------|-------|
| `percentage` | Yes | number | 0–100 |
| `primaryText` | No | string | Center text (defaults to `"{percentage}%"`) |
| `secondaryText` | No | string | Below center text |
| `label` | No | string | Field label above gauge |
| `color` | No | enum/hex | `ACCENT` (default), `POSITIVE`, `NEGATIVE`, `WARN`, or hex |
| `size` | No | enum | `SMALL`, `MEDIUM` (default), `LARGE` |

---

## horizontalLine

Visual divider between content blocks.

```json
{ "leaf": "horizontalLine", "color": "SECONDARY", "weight": "THIN", "style": "SOLID" }
```

| Prop | Required | Type | Notes |
|------|----------|------|-------|
| `color` | No | enum/hex | `SECONDARY` (default), `STANDARD`, `ACCENT`, or hex |
| `weight` | No | enum | `THIN` (default), `MEDIUM`, `THICK` |
| `style` | No | enum | `SOLID` (default), `DOT`, `DASH` |

All props are optional — a bare `{ "leaf": "horizontalLine" }` is valid.

---

## recordActionField

Record action buttons — **only valid in record-backed (live) definitions**.

```json
{
  "leaf": "recordActionField",
  "style": "TOOLBAR",
  "display": "LABEL_AND_ICON",
  "openActionsIn": "DIALOG",
  "actions": [
    { "actionRef": "recordType!{rtUuid}Case.actions.{actionUuid}editCase", "identifier": "rv!identifier" }
  ]
}
```

| Prop | Required | Type | Notes |
|------|----------|------|-------|
| `actions` | Yes | array | Non-empty array of action items |
| `actions[].actionRef` | Yes | string | UUID-qualified record action reference: `recordType!{rtUuid}Name.actions.{actionUuid}key` |
| `actions[].identifier` | No | string | Record identifier expression (required for related actions) |
| `style` | No | enum | `TOOLBAR` (default), `LINKS`, `CARDS`, `SIDEBAR`, `CALL_TO_ACTION`, `MENU`, `MENU_ICON`, `TOOLBAR_PRIMARY`, `SIDEBAR_PRIMARY` |
| `display` | No | enum | `LABEL` , `ICON`, `LABEL_AND_ICON` (default) |
| `openActionsIn` | No | enum | `DIALOG` (default), `NEW_TAB`, `SAME_TAB` |

---

## linkField

One or more clickable links.

```json
{
  "leaf": "linkField",
  "label": "Resources",
  "links": [
    { "text": "Documentation", "linkType": "safe" },
    { "text": "Start Onboarding", "linkType": "startProcess", "processModel": "cons!ONBOARD_PM" }
  ]
}
```

| Prop | Required | Type | Notes |
|------|----------|------|-------|
| `label` | No | string | Field label |
| `links` | Yes | array | Non-empty array of link objects |
| `links[].text` | Yes | string | Display text |
| `links[].linkType` | No | enum | `safe` (default, external URL), `startProcess` (attended PM), `record` (navigate to record) |
| `links[].processModel` | cond. | string | Required for `startProcess` — constant reference |
| `links[].processParameters` | No | object | Parameter name → SAIL expression map |
| `links[].recordType` | cond. | string | Required for `record` — record type reference |
| `links[].identifier` | cond. | string | Required for `record` — record identifier expression |
