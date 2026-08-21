#!/usr/bin/env node
/**
 * define.js — LLM-driven UI definition generator (Pass 1 of 2)
 *
 * The LLM produces a JSON definition describing the UI semantically.
 * scaffold.js reads the definition and renders structurally-valid SAIL.
 * The LLM never writes SAIL syntax for forms or wizards.
 *
 * =============================================================================
 * DEFINITION SCHEMA
 * =============================================================================
 *
 * Top-level object:
 * {
 *   "type": "form" | "wizard" | "grid" | "dashboard" | "record-view" | "pane" | "component",
 *   "title": "Human-readable page title",
 *   "entityName": "Singular entity noun (e.g. Employee)",
 *   "headerIcon": "verified icon alias (e.g. passport, user-circle, briefcase)",
 *   "headerSubtitle": "Brief description shown in the header",
 *
 *   // GRID / DASHBOARD / RECORD-VIEW / LAYOUT only — page header STYLE (optional):
 *   "headerKind": "PLAIN_CARD" | "HERO" | "BILLBOARD" | "NONE",
 *     // PLAIN_CARD (default): colored card with the title (+ subtitle / action button).
 *     // HERO: large centered title + subtitle on a taller colored band.
 *     // BILLBOARD: title overlaid on a background image — REQUIRES "headerImage".
 *     // NONE: no header bar at all (body starts at the top).
 *   "headerImage": "image URL — required only when headerKind is BILLBOARD",
 *
 *   // OPTIONAL — color theme overrides (all values are hex #RRGGBB):
 *   "theme": {
 *     "headerBg":      "#2C3E50",  // Header card/hero/billboard background
 *     "pageBg":        "#F5F6F8",  // Page body background
 *     "cardBg":        "#FFFFFF",  // Section/KPI/chart card backgrounds
 *     "titleColor":    "#FFFFFF",  // Title text on dark header
 *     "subtitleColor": "#B0BEC5",  // Subtitle text on dark header
 *     "kpiColors":     ["#2C3E50", "#34495E", "#7F8C8D", "#95A5A6"],  // Stamp bg rotation
 *     "kpiLabelColor": "#6B7280",  // KPI metric label text
 *     "kpiValueColor": "#262626",  // KPI metric value (large number)
 *     "kpiSubColor":   "#7F8C8D",  // KPI sub-text
 *     "chartAccent":   "#2C3E50",  // Default single-series chart color
 *     "piePalette":    ["..."],    // Pie slice color rotation
 *     "stampBg":       "#2C3E50",  // Default stamp backgroundColor
 *     "stampContent":  "#FFFFFF"   // Stamp icon/text contentColor
 *   },
 *   // All keys are optional — omit the entire "theme" object for defaults.
 *   // Use only when the user explicitly requests a non-standard color scheme
 *   // (e.g. "dark mode", "branded colors", "high contrast").
 *
 *   // WIZARD only — array of steps:
 *   "steps": [
 *     {
 *       "label": "Short step label (1-3 words)",
 *       "instructions": "Sentence shown above the step content",
 *       "rows": [ ...row objects... ]
 *     }
 *   ],
 *
 *   // FORM only — array of sections (rendered as cards):
 *   "sections": [
 *     {
 *       "label": "Section heading",
 *       "rows": [ ...row objects... ]
 *     }
 *   ]
 *
 *   // GRID / DASHBOARD / RECORD-VIEW — see GRID/DASHBOARD/RECORD-VIEW SCHEMA below.
 * }
 *
 * ROW OBJECT
 * ----------
 * Groups one or more fields that share a horizontal columnsLayout row.
 * Single-field rows render without any columnsLayout wrapper (full width).
 * Multi-field rows render as a!columnsLayout with weight-mapped widths.
 *
 * {
 *   "fields": [
 *     {
 *       "name": "camelCaseName",     // becomes local!camelCaseName
 *       "label": "Display Label",
 *       "type": <see FIELD TYPES below>,
 *       "width": 1,                  // relative weight 1–10, default 1
 *                                    // ignored for single-field rows
 *       "required": true | false,
 *       "placeholder": "hint text",  // not valid for date/datetime
 *       "instructions": "helper text shown below the field",
 *
 *       // For "dropdown", "radio", "cardchoice" — required:
 *       "choices": [
 *         { "label": "Display text", "value": "storedValue" }
 *       ],
 *
 *       // For "checkbox" — array of choices (multi-select):
 *       "choices": [{ "label": "Option A", "value": "A" }],
 *
 *       // For "cardchoice" only — optional:
 *       "maxSelections": 1,          // 1 = single select, omit for multi
 *       "cardTemplate": "TILE" | "BAR_STACKED" | "BAR_JUSTIFIED"  // default: TILE
 *     }
 *   ]
 * }
 *
 * FIELD TYPES
 * -----------
 * | type        | renders as                  | notes                                              |
 * |-------------|-----------------------------|----------------------------------------------------|
 * | text        | a!textField                 | General single-line text                           |
 * | email       | a!textField                 | inputPurpose: EMAIL                                |
 * | phone       | a!textField                 | inputPurpose: PHONE_NUMBER                         |
 * | number      | a!integerField              | Whole numbers. NOT a!textField+inputPurpose        |
 * | decimal     | a!floatingPointField        | Decimal numbers (prices, measurements)             |
 * | paragraph   | a!paragraphField            | Multi-line text. Always a single-field row.        |
 * | richtext    | a!styledTextEditorField     | Formatted rich text (bold/italic/lists). Single row|
 * | date        | a!dateField                 | Date only (no placeholder)                         |
 * | datetime    | a!dateTimeField             | Date + time (no placeholder)                       |
 * | time        | a!timeField                 | Time only                                          |
 * | dropdown    | a!dropdownField             | Requires choices[]                                 |
 * | radio       | a!radioButtonField          | Requires choices[]. Uses choiceLayout: COMPACT     |
 * | checkbox    | a!checkboxField             | Multi-select. Requires choices[]                   |
 * | cardchoice  | a!cardChoiceField           | Visual card selection. Requires choices[]          |
 * | boolean     | a!booleanCheckboxField      | Single true/false. No choices needed.              |
 * | toggle      | a!toggleField               | iOS-style toggle. Same as boolean, diff look.      |
 * | fileupload  | a!fileUploadField           | File attachment. Always a single-field row.        |
 * | userpicker  | a!pickerFieldUsers          | Appian user selector                               |
 * | grouppicker | a!pickerFieldGroups         | Appian group selector                              |
 * | encrypted   | a!encryptedTextField        | Passwords. Value is Encrypted Text type.           |
 *
 * WHEN TO USE boolean vs toggle:
 *   boolean  → agreement checkboxes, consent, yes/no flags (e.g. "I agree to terms")
 *   toggle   → on/off settings, feature flags (e.g. "Enable notifications")
 *   Both save the same Boolean value — choice is purely visual.
 *
 * WHEN TO USE radio vs cardchoice vs dropdown:
 *   radio       → 2–5 options, no icons needed, compact inline layout
 *   cardchoice  → 2–6 options, visual emphasis helps (e.g. plan selection, priority)
 *   dropdown    → 6+ options, or when screen space is limited
 *
 * WIDTH WEIGHTING
 * ---------------
 * Widths are relative within a row. The renderer maps weight N to the SAIL
 * relative width "NX" (1X–10X). NX values distribute the available space
 * proportionally among all columns in the row — no fixed pixel sizes involved.
 *
 * Example: First Name (3) / M.I. (1) / Last Name (3)  →  "3X" / "1X" / "3X"
 *          City (3) / State (1) / ZIP (2)              →  "3X" / "1X" / "2X"
 *          Email (1) / Phone (1)                       →  "1X" / "1X"  (equal halves)
 *          Street Address (full width)                 →  (no columnsLayout)
 *
 * All fields in a multi-field row should have explicit weights that reflect
 * the desired proportions. Equal fields → all weight 1. A wide field next to
 * a narrow one → e.g. 3 and 1.
 *
 * Fields that must always be single-field rows: paragraph, richtext, fileupload
 *
 * =============================================================================
 * GRID / DASHBOARD / RECORD-VIEW SCHEMA
 * =============================================================================
 *
 * GRID
 * ----
 * {
 *   "type": "grid",
 *   "title": "Vendor Contracts",
 *   "entityName": "Contract",
 *   "columns": [
 *     { "name": "contractName", "label": "Contract Name", "type": "primary", "width": "MEDIUM" },
 *     { "name": "vendor", "label": "Vendor", "type": "text", "width": "MEDIUM" },
 *     { "name": "status", "label": "Status", "type": "tag", "width": "NARROW_PLUS",
 *       "tagColors": { "Active": "POSITIVE", "Expired": "NEGATIVE", "Pending Renewal": "SECONDARY" } },
 *     { "name": "value", "label": "Contract Value", "type": "text", "width": "NARROW_PLUS", "align": "END" }
 *   ],
 *   "rows": [
 *     { "contractName": "Acme Cloud Hosting", "vendor": "Acme Corp", "status": "Active", "value": "$125,000" }
 *   ],
 *   "filters": [ { "label": "Status", "column": "status", "choices": ["Active", "Pending Renewal", "Expired"] } ],
 *   "primaryActionLabel": "New Contract"
 * }
 *
 * Column "type": "primary" | "tag" | "text" | "buttonArray" | "progressBar" | "image"
 *   - Exactly ONE column must be "primary" (rendered as a clickable linked richTextItem).
 *   - "tag" columns require "tagColors" — every distinct value that appears for that
 *     column across all rows MUST be a key in "tagColors".
 *   - "buttonArray" and "image" columns do not read row data (rows may omit that key).
 * Column "width": one of AUTO, ICON, ICON_PLUS, NARROW, NARROW_PLUS, MEDIUM, MEDIUM_PLUS, WIDE
 *   - REQUIRED on every column. Either ALL columns are "AUTO" or NONE are (gridColumn's
 *     AUTO rule is different from columnsLayout's "at least one AUTO" rule — pick one
 *     strategy uniformly).
 * "rows": array of objects. Each row's keys must exactly match column "name"s
 *   (except buttonArray/image columns, which may be omitted). Values are taken
 *   verbatim: JSON string → quoted SAIL text, JSON number → raw SAIL number.
 * "filters" (optional): dropdown filters shown in the custom search/filter bar.
 *   Each "column" must reference an existing column name. "choices" may be
 *   omitted when "column" refers to a "tag" column that has "tagColors" —
 *   the choice list is derived from the tagColors keys automatically (they're
 *   already the exhaustive value set for that column, restating them is
 *   redundant). Any other column type still requires an explicit "choices" array.
 * "primaryActionLabel" (optional): label for the header "New X" button. Defaults
 *   to "New {entityName}".
 *
 * DASHBOARD
 * ---------
 * {
 *   "type": "dashboard",
 *   "title": "Support Operations Overview",
 *   "headerSubtitle": "Real-time view of ticket volume and SLA health",
 *   "sections": [
 *     { "type": "kpis", "items": [
 *       { "label": "Open Tickets", "value": "428", "sub": "+12% vs last week", "icon": "clipboard", "color": "#2C3E50" },
 *       { "label": "Avg Resolution", "value": "2.4h", "sub": "down from 3.1h", "icon": "clock-o", "color": "#34495E" }
 *     ]},
 *     { "type": "chart", "chartType": "column", "label": "Tickets by Week",
 *       "categories": ["Jul 1", "Jul 8", "Jul 15", "Jul 22"],
 *       "series": [{ "label": "Resolved", "data": [120, 145, 132, 168], "color": "#2C3E50" }] },
 *     { "type": "columns", "items": [
 *       { "type": "chart", "chartType": "pie", "label": "By Category", "categories": ["Bug", "Feature", "Support"],
 *         "series": [{ "label": "Count", "data": [45, 30, 25], "color": "#2C3E50" }] },
 *       { "type": "chart", "chartType": "line", "label": "Trend", "categories": ["Mon", "Tue", "Wed", "Thu", "Fri"],
 *         "series": [{ "label": "Volume", "data": [20, 35, 28, 42, 31], "color": "#34495E" }] }
 *     ]},
 *     { "type": "grid", "label": "Recent Tickets",
 *       "columns": [ ...same shape as GRID.columns... ],
 *       "rows": [ ...same shape as GRID.rows... ] }
 *   ]
 * }
 *
 * "sections": ordered array — rendered top-to-bottom. Each section has a "type":
 *
 *   "kpis" — card group with metric cards (typically 3–6)
 *     "items": array of { "label", "value", "sub", "icon"?, "color"? }
 *     "icon" must be a verified alias from rich-text-icon-aliases.md if present.
 *     "color" optional hex, defaults to palette rotation.
 *
 *   "chart" — any chart type wrapped in a card
 *     "chartType": column, line, bar, area, pie — NEVER "scatter"
 *     "label": section heading (rendered as the card's sectionLayout label)
 *     "categories": x-axis labels
 *     "series": array of { "label", "data"[], "color"? }. data length must match categories.
 *
 *   "grid" — embedded summary grid (no filter chrome)
 *     Same "columns"/"rows" shape as the standalone grid schema.
 *     "label": section heading (defaults to "Recent Activity").
 *     "filters" is NOT supported here — rejected by validation.
 *
 *   "columns" — side-by-side layout of 2+ nested sections
 *     "items": array of section objects (kpis, chart, or grid — NOT nested columns)
 *
 * RECORD-VIEW
 * -----------
 * {
 *   "type": "record-view",
 *   "title": "Employee Profile",
 *   "entityName": "Employee",
 *   "recordName": "Alice Johnson",
 *   "keyAttributes": [
 *     { "name": "status", "label": "Status", "type": "text", "value": "Active",
 *       "tag": true, "tagColors": { "Active": "POSITIVE", "On Leave": "SECONDARY", "Terminated": "NEGATIVE" } },
 *     { "name": "department", "label": "Department", "type": "text", "value": "Engineering" },
 *     { "name": "role", "label": "Role", "type": "text", "value": "Senior Manager" },
 *     { "name": "startDate", "label": "Start Date", "type": "text", "value": "2016-03-15" }
 *   ],
 *   "sections": [
 *     { "label": "Contact Information",
 *       "fields": [
 *         { "name": "email", "label": "Email", "type": "text", "value": "alice.johnson@example.com" },
 *         { "name": "phone", "label": "Phone", "type": "text", "value": "(555) 234-5678" },
 *         { "name": "location", "label": "Office", "type": "text", "value": "San Francisco" }
 *       ] },
 *     { "label": "About",
 *       "fields": [
 *         { "name": "bio", "label": "Bio", "type": "paragraph", "value": "10-year platform engineer..." }
 *       ] }
 *   ]
 * }
 *
 * "recordName": hardcoded sample record name displayed in the header (e.g. a person's
 *   name, a project title, an order ID). This is a mockup value.
 * "keyAttributes": 1–6 highlight fields shown as a card group below the header.
 *   Each needs "name", "label", "value". Supports "tag" + "tagColors" for status-style display.
 * "sections": detail cards. Each has "label" and "fields" array.
 *   Short fields (type "text") auto-layout in 2-column rows.
 *   Long fields (type "paragraph"/"richtext") render full-width.
 * Field "type": "text" | "paragraph" | "richtext" only (read-only display).
 * "name" must be unique across all keyAttributes + sections combined.
 * "layout" (optional): a LAYOUT-TREE node (see LAYOUT / LAYOUT-TREE SCHEMA below) rendered
 *   after "sections" — the escape hatch for content that doesn't fit the fixed
 *   keyAttributes/sections field shape (criteria lists, RAG-tier card groups, etc.).
 *   At least one of "sections" or "layout" is required.
 *
 * LAYOUT / LAYOUT-TREE SCHEMA
 * ----------------------------
 * A general-purpose recursive layout/component planner. Use the top-level "layout" type
 * for a standalone fragment (no page framing — same isolation contract as "component"),
 * or the "layout" field inside a record-view for content nested alongside field sections.
 * {
 *   "type": "layout",
 *   "title": "Performer Tiers",
 *   "root": { ...one layout-tree node... }
 * }
 *
 * PAGE FRAMING (optional): a top-level "layout" may add a page header by setting the
 * same "headerKind" (+ "headerImage" / "headerSubtitle") used by grid/dashboard/
 * record-view. When present, the layout-tree body is wrapped in the shared
 * a!headerContentLayout page frame instead of rendering as a bare fragment. This is the
 * path for "header + free-form content" pages — e.g. a marketing home page = a BILLBOARD
 * header (headerKind + headerImage) over a "columns"/"cardGroup" of "imageCard" leaves:
 * {
 *   "type": "layout",
 *   "title": "Grand Vista Hotel",
 *   "headerKind": "BILLBOARD",
 *   "headerImage": "https://.../hero.jpg",
 *   "headerSubtitle": "Beachfront luxury in the heart of the city",
 *   "root": { "layout": "columns", "items": [ { "leaf": "imageCard", ... }, ... ] }
 * }
 *
 * A layout-tree NODE is either a CONTAINER or a LEAF (never both):
 *
 *   CONTAINER — holds other nodes, contributes no unique content itself:
 *   { "layout": "columns" | "cardGroup" | "sideBySide" | "tabs" | "card", "items": [ ...nodes... ] }
 *     - "columns": N side-by-side columns (a!columnsLayout). Min 1 item (a single-item columns
 *       layout is valid — don't wrap a lone child in "columns" just to have a container; use the
 *       child's own layout/leaf as the root directly instead). Each item may set
 *       "width" (default "AUTO"): one of AUTO, EXTRA_NARROW, NARROW, NARROW_PLUS, MEDIUM,
 *       MEDIUM_PLUS, WIDE, WIDE_PLUS, EXTRA_WIDE, or a relative "1X"-"10X". If any item uses a
 *       fixed width, at least one item must stay "AUTO" (a!columnsLayout's structural rule).
 *     - "cardGroup": N repeating cards, uniform width, wraps (a!cardGroupLayout). Min 1 item.
 *       Optional container-level "cardWidth" (applies to the whole group, not per card): one of
 *       EXTRA_NARROW, NARROW, NARROW_PLUS, MEDIUM, MEDIUM_PLUS, WIDE, WIDE_PLUS. Default "NARROW_PLUS".
 *     - "sideBySide": flex-0 pairs/groups (a!sideBySideLayout) — icon+text, label+value. Min 2 items.
 *       Each item may set "width" (default "AUTO"): one of AUTO, MINIMIZE, or a relative "1X"-"10X"
 *       ONLY — sideBySideItem does NOT support NARROW/MEDIUM/WIDE (that's a!columnLayout's
 *       vocabulary; using it on a sideBySideItem is a runtime error). Use "MINIMIZE" for a small
 *       fixed-content item (an icon, a stamp) sitting next to an "AUTO" item that takes the rest
 *       of the space — the standard icon+text / label+value shape.
 *     - "tabs": N mutually-exclusive views (a!tabLayout). Min 2 items, each item needs "tabLabel".
 *     - "card": wraps one or more arbitrary child nodes in a single card. Min 1 item.
 *       Optional "style"/"headerColor": a card-style keyword (STANDARD/ACCENT/SUCCESS/INFO/
 *       WARN/ERROR/CHARCOAL_SCHEME/NAVY_SCHEME/PLUM_SCHEME), an alias (POSITIVE→SUCCESS,
 *       NEGATIVE→ERROR, SECONDARY→STANDARD), or a hex color. Default "STANDARD".
 *       NOTE: "card" may NOT appear as a descendant inside a "sideBySide" container.
 *     Containers do not nest arbitrarily deep in practice, but the schema allows it —
 *     any item may itself be a container.
 *
 *   LEAF — terminates a branch, renders actual content:
 *   { "leaf": "grid" | "chart" | "kpis" | "keyValueList" | "tagGroup" | "richTextBlock" | "banner" | "imageCard" | "stamp" | "heading" | "itemList", ...leafProps }
 *     - "grid" / "chart" / "kpis": EXACT same shape/validation as a dashboard section of
 *       that type (see DASHBOARD schema above) — no page framing, no filter chrome.
 *     - "itemList": { "label"?, "avatarType"?, "trailingType"?, "cardWidth"?, "items": [...] }
 *       — N repeating cards of the SAME shape: avatar + title + body text + trailing
 *       text/tag. This is the leaf for "a list of comments/notes/messages/notifications/
 *       activity entries" — anything that reduces to "N records, each with the same few
 *       fields," rendered via a!forEach() over sample local!  data (no hand-written SAIL
 *       per item). Cards are always white/light with dark text (card_lists.md's "message
 *       list card" pattern) — there is no per-item color parameter, since a colored card
 *       with hardcoded white title text is what causes light-mode contrast bugs. For
 *       tiered/RAG/colored cards where a vivid background IS the intent, use N "card"
 *       containers (each with its own "style"/"headerColor") inside a "cardGroup" instead.
 *       "avatarType" (default "text"): "text" (initials in a!stampField) or
 *       "icon" (an icon in a!stampField). "trailingType" (default "text"): "text" (plain
 *       trailing label, e.g. a timestamp), "tag" (a colored a!tagField, e.g. a status), or
 *       "none". "cardWidth" (default "WIDE_PLUS"): same a!cardGroupLayout width enum used
 *       elsewhere. Each item in "items":
 *         "title" (required) — bold header line, e.g. a commenter's name.
 *         "text" (required) — body line, e.g. the comment content.
 *         "avatarText" (required if avatarType is "text") — 1-3 char initials.
 *         "avatarIcon" (required if avatarType is "icon") — write best-guess alias (e.g. "user-circle").
 *         "avatarColor" (optional) — hex color; cycles through a default palette if omitted.
 *         "trailing" (required if trailingType is "text") — e.g. "2 hours ago".
 *         "tag" / "tagColor" (required if trailingType is "tag") — tagColor accepts
 *           ACCENT/POSITIVE/NEGATIVE/SECONDARY or hex.
 *     - "keyValueList": { "label"?, "items": [{ "label", "value" }] } — label/value pairs,
 *       no card chrome (lighter than record-view "sections").
 *     - "tagGroup": { "label"?, "items": [{ "text", "color"? }] } — a row of short chips.
 *       "color": ACCENT | POSITIVE | NEGATIVE | SECONDARY or hex.
 *     - "richTextBlock": { "text", "size"?, "style"?, "align"?, "color"? } — a styled text
 *       block, no card. "size": SMALL | STANDARD | MEDIUM | MEDIUM_PLUS | LARGE | EXTRA_LARGE.
 *       "style": "STRONG" | "EMPHASIS". "align": LEFT | CENTER | RIGHT.
 *       "color": hex color or keyword. Use for prices, marketing copy, descriptions.
 *     - "imageCard": { "image", "heading", "text"?, "link"?, "imageHeight"? } — a content
 *       card led by a photo, with a heading, optional body text, and an optional trailing
 *       link. The marketing / product-tile / room-card shape. "image" is a URL; the photo
 *       renders as a fixed-height a!billboardLayout so every card in a group lines up
 *       regardless of source aspect ratio. "imageHeight" (default "SHORT_PLUS"): one of
 *       EXTRA_SHORT, SHORT, SHORT_PLUS, MEDIUM, MEDIUM_PLUS, TALL, TALL_PLUS, EXTRA_TALL.
 *       "link": { "text" } renders a standalone call-to-action link (e.g. "Book now").
 *       Put several of these in a "columns" or "cardGroup" container for a card row/grid.
 *     - "stamp": { "icon"?, "text"?, "color"? } — a single stamp element (colored icon
 *       circle). At least one of "icon" or "text" is required. "icon" defaults to "circle" if omitted
 *       (final icon-resolution pass replaces it). "color" is a hex color; defaults to
 *       "#2C3E50". Use inside a "sideBySide" with width "MINIMIZE" for the common
 *       icon-beside-title pattern.
 *     - "heading": { "text", "size"? } — a standalone title/heading row. "text" is required.
 *       "size" (default "MEDIUM"): one of SMALL, MEDIUM, LARGE, EXTRA_LARGE. Distinct from
 *       "richTextBlock" (which is a paragraph, not a heading).
 *     - "banner": { "severity", "text", "heading"?, "link"?, "buttons"?, "dismissible"?,
 *       "dismissLabel"?, "persistent"? } — an info/success/warn/error/closed message card
 *       (guidelines/ui-guidelines/patterns/messages.md). Fully mechanical: icon, icon color,
 *       and card background are 100% determined by "severity" — nothing to author there.
 *       "severity": INFO | SUCCESS | WARN | ERROR | CLOSED.
 *       "text": the message body.
 *       "link" (optional): { "text" } — renders a trailing standalone link (e.g. "Learn more").
 *       "buttons" (optional): [{ "label", "style"? }] — 1-2 action buttons, SMALL size.
 *         1 button defaults to SOLID; with 2, the first is LINK and the second SOLID
 *         (messages.md's "primary + secondary" convention). "link" and "buttons" are
 *         mutually exclusive — a banner has at most one trailing affordance.
 *       "dismissible" (optional): true adds a close icon instead of link/buttons.
 *         "dismissLabel" (optional): item name for the accessibilityText, e.g.
 *         "Dismiss the maintenance notice" — defaults to "Dismiss this message".
 *       "persistent" (optional): true renders the bordered icon-chip + heading/body variant
 *         for messages that are always part of the UI (not a one-off toast-style banner).
 *         In persistent mode, "heading" becomes the H3 title and "text" the body — link/
 *         buttons/dismissible are ignored (the persistent pattern has no actions slot).
 *     - "button": { "label", "style"?, "color"?, "align"?, "size"? } — a standalone CTA
 *       button. "style": SOLID (default) | OUTLINE | LINK. "color": ACCENT (default) |
 *       NEGATIVE | SECONDARY. "align": START (default) | CENTER | END.
 *       "size": STANDARD (default) | SMALL. For multi-button groups, use "buttons" array
 *       of { "label", "style"?, "color"? } instead of top-level "label".
 *
 * SKELETON MODE for layout-tree nodes: any container or leaf node may set "skeleton": true.
 *   Skeleton containers need only "items" (each with "skeleton": true); skeleton leaves need
 *   only "leaf" (+ "title"/"label" where the leaf has one, for a readable placeholder).
 *
 * The planner's job, recursively: decide whether a chunk of the request is a container
 * (how many children, what layout) or a leaf (which leaf type), then recurse into each
 * child with the same question. Only drop to hand-written SAIL for a chunk that is neither
 * a known container shape nor a known leaf shape.
 *
 * COMPONENT
 * ---------
 * A single fragment — kpis, chart, or grid — with NO page framing (no header,
 * no search/filter chrome, no "New X" button). Use this when the user asks for
 * exactly one bare component ("just a grid", "a KPI card", "a chart"), not a
 * full page. "section" uses the EXACT same shape as one dashboard section of
 * the matching type (see DASHBOARD schema above) — same validation applies.
 * {
 *   "type": "component",
 *   "title": "Open Orders",
 *   "componentType": "grid",
 *   "section": {
 *     "type": "grid",
 *     "columns": [ ...same shape as GRID.columns... ],
 *     "rows": [ ...same shape as GRID.rows... ]
 *     // NOTE: "filters" is not supported here — bare components render
 *     // without search/filter chrome. Use the full grid pipeline for that.
 *   }
 * }
 * Also valid: "componentType": "chart" with "section": { "type": "chart", ... }
 *         and "componentType": "kpis"  with "section": { "type": "kpis", ... }
 *
 * PANE
 * ----
 * a!paneLayout with 2-3 full-height, independently-scrolling panes
 * (master-detail, app-style consoles, nav + content layouts).
 * {
 *   "type": "pane",
 *   "title": "Ticket Console",
 *   "headerSubtitle": "Browse and resolve support tickets",   // optional — omit for no header bar
 *   "panes": [
 *     { "width": "NARROW", "backgroundColor": "#2C3E50",
 *       "content": { "type": "nav", "items": [
 *         { "label": "All Tickets" }, { "label": "My Tickets" }, { "label": "Escalated" }
 *       ] } },
 *     { "width": "AUTO",
 *       "content": { "type": "grid",
 *         "columns": [ ...same shape as GRID.columns... ],
 *         "rows": [ ...same shape as GRID.rows... ] } },
 *     { "width": "MEDIUM", "backgroundColor": "#F5F6F8",
 *       "content": { "type": "detail", "fields": [
 *         { "label": "Subject", "value": "Login page returns 500" },
 *         { "label": "Priority", "value": "High" }
 *       ] } }
 *   ]
 * }
 *
 * "panes": 2-3 entries. Exactly ONE pane must have "width": "AUTO".
 *   "width": one of [EXTRA_NARROW, NARROW, NARROW_PLUS, MEDIUM, MEDIUM_PLUS, WIDE, WIDE_PLUS, AUTO]
 *   "backgroundColor": optional hex color for the pane.
 *   "content.type": "nav" | "grid" | "chart" | "kpis" | "detail" | "placeholder"
 *     - "nav": simple link list — "items": [{ "label" }]
 *     - "grid" / "chart" / "kpis": EXACT same shape/validation as a dashboard section
 *       of that type (see DASHBOARD schema above) — no page framing, no filter chrome.
 *     - "detail": key/value display — "fields": [{ "label", "value" }]
 *     - "placeholder": intentionally empty (e.g. "Select an item to view details")
 * If "headerSubtitle" is present (or a "title" that implies a header bar is wanted),
 * the pane layout is wrapped in a!headerContentLayout per the pane-layout guidelines.
 *
 * =============================================================================
 * SKELETON MODE (Pass 0 — fast placeholder render before full authoring)
 * =============================================================================
 * dashboard: every section has "skeleton": true (needs only "type" + "label";
 *   "columns" sections still need ≥2 items, each with "skeleton": true).
 * pane: every pane's "content" has "skeleton": true (needs only "type"); panes
 *   still need "width" (and exactly one AUTO) since that's structural, not content.
 * grid / record-view: top-level "skeleton": true flag (needs only "title" +
 *   "entityName", plus "recordName" for record-view — no columns/rows/sections yet).
 * wizard / form: omit "rows" from steps/sections — labels only.
 *
 * =============================================================================
 * USAGE
 * =============================================================================
 *   node generator/define.js --write    <uuid> --file <path>   (preferred)
 *   node generator/define.js --write    <uuid> '<json>'        (inline; fragile)
 *   node generator/define.js --validate <uuid>
 *   node generator/define.js --schema
 *
 * Prefer --file: write the definition JSON to a file (e.g. with the Write tool),
 * then pass its path. Passing JSON inline as a shell argument breaks on any
 * quote, $, backtick, backslash, or newline in the content.
 * =============================================================================
 */

const fs = require("fs");
const path = require("path");
// DISABLED: timing logging commented out — can be re-enabled later.
// const { tryRecordEvent } = require("./timing");
const { tryRecordEvent } = require("./timing"); // no-op stub

const WORKSPACE_ROOT = path.join(__dirname, "..");

// ---------------------------------------------------------------------------
// Width mapping: relative weight → SAIL relative width ("NX")
// ---------------------------------------------------------------------------
// SAIL columnsLayout supports relative widths 1X–10X alongside fixed enums.
// Using NX values distributes the available space proportionally — exactly
// what you want for field rows inside a form or wizard card.
// Example: First(3) / MI(1) / Last(3) → "3X" / "1X" / "3X" (3:1:3 ratio)

function weightToSailWidth(weight) {
  const w = Math.max(1, Math.min(Math.round(weight || 1), 10));
  return `${w}X`;
}

// ---------------------------------------------------------------------------
// Icon alias validation — loaded once from the same reference file the
// agent is instructed to consult before using any a!richTextIcon() alias.
// ---------------------------------------------------------------------------
let ICON_ALIASES = null;
function loadIconAliases() {
  if (ICON_ALIASES) return ICON_ALIASES;
  try {
    const raw = fs.readFileSync(
      path.join(WORKSPACE_ROOT, "guidelines/ui-guidelines/reference/rich-text-icon-aliases.md"),
      "utf-8"
    );
    ICON_ALIASES = new Set(
      raw
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("#"))
    );
  } catch {
    ICON_ALIASES = new Set(); // fail open: skip icon validation if the file can't be read
  }
  return ICON_ALIASES;
}

function validateIcon(icon, context, errors) {
  // Icons are validated/resolved by resolve-icons.js after scaffolding.
  // define.js accepts any string — the agent writes its intent (e.g. "revenue",
  // "open-tickets", "deployment") and resolve-icons maps it to a valid alias.
  return;
}

// ---------------------------------------------------------------------------
// Grid / dashboard / record-view schema constants
// ---------------------------------------------------------------------------
const GRID_COLUMN_TYPES = ["primary", "tag", "text", "buttonArray", "progressBar", "image"];
const GRID_WIDTHS = ["AUTO", "ICON", "ICON_PLUS", "NARROW", "NARROW_PLUS", "MEDIUM", "MEDIUM_PLUS", "WIDE"];
const GRID_ALIGNS = ["START", "CENTER", "END"];
const TAG_COLORS = ["ACCENT", "POSITIVE", "NEGATIVE", "SECONDARY"];
const CHART_TYPES = ["column", "line", "bar", "area", "pie"];
const RECORD_VIEW_FIELD_TYPES = ["text", "paragraph", "richtext"];

// Pane schema constants — a!pane's width enum is a superset of gridColumn
// widths (adds EXTRA_NARROW/NARROW_PLUS/MEDIUM_PLUS/WIDE_PLUS, no ICON values).
const PANE_WIDTHS = ["EXTRA_NARROW", "NARROW", "NARROW_PLUS", "MEDIUM", "MEDIUM_PLUS", "WIDE", "WIDE_PLUS", "AUTO"];
const PANE_CONTENT_TYPES = ["nav", "grid", "chart", "kpis", "detail", "placeholder", "layout"];

function isValidTagColor(color) {
  return TAG_COLORS.includes(color) || /^#[0-9A-Fa-f]{6}$/.test(color);
}

/**
 * Validates a { columns, rows } pair shared by top-level "grid" definitions
 * and a dashboard's embedded "grid" section.
 */
function validateGridColumnsAndRows(columns, rows, context, errors) {
  if (!Array.isArray(columns) || columns.length === 0) {
    errors.push(`${context}: "columns" must be a non-empty array`);
    return;
  }

  const seenNames = new Set();
  let primaryCount = 0;
  const definedWidths = [];
  const columnByName = new Map();

  columns.forEach((col, ci) => {
    const cc = `${context} columns[${ci}]`;
    if (!col.name || !/^[a-zA-Z][a-zA-Z0-9]*$/.test(col.name)) {
      errors.push(`${cc}: "name" must be a camelCase identifier, got: ${JSON.stringify(col.name)}`);
    } else {
      if (seenNames.has(col.name)) errors.push(`${cc}: duplicate column name "${col.name}"`);
      seenNames.add(col.name);
      columnByName.set(col.name, col);
    }
    if (!col.label) errors.push(`${cc}: "label" is required`);
    if (!GRID_COLUMN_TYPES.includes(col.type)) {
      errors.push(`${cc}: "type" must be one of [${GRID_COLUMN_TYPES.join(", ")}], got: ${JSON.stringify(col.type)}`);
    }
    if (col.type === "primary") primaryCount++;
    if (!col.width || !GRID_WIDTHS.includes(col.width)) {
      errors.push(`${cc}: "width" is required and must be one of [${GRID_WIDTHS.join(", ")}], got: ${JSON.stringify(col.width)}`);
    } else {
      definedWidths.push(col.width);
    }
    if (col.align && !GRID_ALIGNS.includes(col.align)) {
      errors.push(`${cc}: "align" must be one of [${GRID_ALIGNS.join(", ")}], got: ${JSON.stringify(col.align)}`);
    }
    if (col.type === "tag") {
      if (!col.tagColors || typeof col.tagColors !== "object" || Object.keys(col.tagColors).length === 0) {
        errors.push(`${cc}: type "tag" requires a non-empty "tagColors" object`);
      } else {
        Object.entries(col.tagColors).forEach(([value, color]) => {
          if (!isValidTagColor(color)) {
            errors.push(`${cc}: tagColors["${value}"] must be one of [${TAG_COLORS.join(", ")}] or a hex color, got: ${JSON.stringify(color)}`);
          }
        });
      }
    }
  });

  if (primaryCount !== 1) {
    errors.push(`${context}: exactly one column must have "type": "primary", found ${primaryCount}`);
  }
  if (definedWidths.length > 0) {
    const allAuto = definedWidths.every((w) => w === "AUTO");
    const noneAuto = definedWidths.every((w) => w !== "AUTO");
    if (!allAuto && !noneAuto) {
      errors.push(`${context}: gridColumn widths must be ALL "AUTO" or ALL fixed — found a mix`);
    }
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    errors.push(`${context}: "rows" must be a non-empty array`);
    return;
  }
  const requiredKeys = columns.filter((c) => c.type !== "buttonArray" && c.type !== "image").map((c) => c.name);
  rows.forEach((row, ri) => {
    if (typeof row !== "object" || row === null) {
      errors.push(`${context} rows[${ri}]: must be an object`);
      return;
    }
    requiredKeys.forEach((key) => {
      if (!(key in row)) errors.push(`${context} rows[${ri}]: missing value for column "${key}"`);
    });
    Object.keys(row).forEach((key) => {
      if (!columnByName.has(key)) errors.push(`${context} rows[${ri}]: "${key}" does not match any column name`);
    });
  });

  // Tag columns: every distinct row value must be covered by tagColors
  columns.forEach((col) => {
    if (col.type !== "tag" || !col.tagColors) return;
    const distinctValues = new Set(rows.map((r) => r[col.name]).filter((v) => v !== undefined));
    distinctValues.forEach((value) => {
      if (!(value in col.tagColors)) {
        errors.push(`${context}: column "${col.name}" has row value "${value}" with no matching entry in "tagColors"`);
      }
    });
  });
}

function validateGridDefinition(def, errors) {
  // Skeleton grids only need title/entityName (already validated at top level) —
  // no columns/rows required yet. Mirrors the dashboard section skeleton bypass.
  if (def.skeleton === true) return;
  validateGridColumnsAndRows(def.columns, def.rows, "grid", errors);
  if (def.filters) {
    if (!Array.isArray(def.filters)) {
      errors.push('"filters" must be an array');
    } else {
      const columnByName = new Map((def.columns || []).map((c) => [c.name, c]));
      def.filters.forEach((f, fi) => {
        const fc = `filters[${fi}]`;
        if (!f.label) errors.push(`${fc}: "label" is required`);
        const col = f.column ? columnByName.get(f.column) : undefined;
        if (!f.column || !col) {
          errors.push(`${fc}: "column" must reference an existing column name, got: ${JSON.stringify(f.column)}`);
          return;
        }
        // "choices" is optional when the filtered column is a "tag" column
        // with tagColors — the choice list is just the tagColors keys,
        // restating it is pure duplication. grid.js derives it at render
        // time. Any other column type still requires explicit choices.
        const canDerive = col.type === "tag" && col.tagColors && Object.keys(col.tagColors).length > 0;
        if (!Array.isArray(f.choices) || f.choices.length === 0) {
          if (!canDerive) {
            errors.push(`${fc}: "choices" must be a non-empty array (or reference a "tag" column with "tagColors" to derive it automatically)`);
          }
        }
      });
    }
  }
}

/**
 * Shared by dashboard "kpis" sections, "component" kpis, and pane "kpis" content.
 */
// ---------------------------------------------------------------------------
// Dashboard dataSource — optional record-type query binding for live data
// ---------------------------------------------------------------------------
const AGGREGATION_FUNCTIONS = ["COUNT", "SUM", "AVG", "MIN", "MAX"];
const FILTER_OPERATORS = ["=", "<>", ">", ">=", "<", "<=", "in", "not in", "is null", "not null"];

function validateDashboardFilter(filter, context, errors) {
  if (!filter.field || typeof filter.field !== "string") {
    errors.push(`${context}: "field" is required and must be a field alias from dataSource.fields`);
  }
  if (!filter.operator || !FILTER_OPERATORS.includes(filter.operator)) {
    errors.push(`${context}: "operator" must be one of [${FILTER_OPERATORS.join(", ")}], got: ${JSON.stringify(filter.operator)}`);
  }
  // value is optional for "is null" / "not null"
  if (!["is null", "not null"].includes(filter.operator) && filter.value === undefined) {
    errors.push(`${context}: "value" is required for operator "${filter.operator}"`);
  }
}

function validateDashboardFilters(filters, context, errors) {
  if (!Array.isArray(filters)) {
    errors.push(`${context}: "filters" must be an array`);
    return;
  }
  filters.forEach((f, fi) => validateDashboardFilter(f, `${context}[${fi}]`, errors));
}

// Every ".fields." segment in a record-field reference string must be immediately
// followed by a "{uuid}" brace — Appian requires the field's own UUID prefix
// (e.g. ".fields.{0c17d4da-...}label"), never a bare field name (".fields.label").
// A bare-name reference looks plausible but is silently unresolvable at runtime —
// the local structural validator can't catch it (no live schema), so this must be
// caught here, at definition-write time, before scaffold.js ever renders it.
const BARE_FIELDS_SEGMENT = /\.fields\.(?!\{)/;
// Same requirement for ".relationships." segments.
const BARE_RELATIONSHIPS_SEGMENT = /\.relationships\.(?!\{)/;
// Reject obviously fabricated placeholder UUIDs (all-zeros or sequential zeros).
// These indicate the agent invented a UUID instead of using the real one from discovery.
const PLACEHOLDER_UUID = /\{0{8}-0{4}-0{4}-0{4}-0{12}\}|\{0{8}-0{4}-0{4}-0{4}-0{11}[0-9a-f]\}/;

function validateFieldRefShape(ref, context, errors) {
  if (typeof ref !== "string") return; // caught elsewhere as a type error
  if (BARE_FIELDS_SEGMENT.test(ref)) {
    errors.push(
      `${context}: "${ref}" has a ".fields." segment without a "{uuid}" prefix on the field name. ` +
      `Related-record field references must include the field's OWN uuid from the RELATED record ` +
      `type's getRecordType call (e.g. ".fields.{0c17d4da-...}label"), not just the field name. ` +
      `Call getRecordType on the related record type to get this uuid — do not guess or omit it.`
    );
  }
  if (BARE_RELATIONSHIPS_SEGMENT.test(ref)) {
    errors.push(
      `${context}: "${ref}" has a ".relationships." segment without a "{uuid}" prefix on the ` +
      `relationship name. Use the relationshipUuid from the base record type's relationships list.`
    );
  }
  if (PLACEHOLDER_UUID.test(ref)) {
    errors.push(
      `${context}: "${ref}" contains a placeholder/fabricated UUID (all zeros or sequential ` +
      `zeros like {00000000-0000-0000-0000-000000000001}). This means the real UUID was not ` +
      `supplied in the dispatch brief. Use the actual UUID from getRecordType — do not invent one.`
    );
  }
}

function validateDashboardDataSource(ds, errors) {
  const context = "dataSource";
  if (!ds.recordType || typeof ds.recordType !== "string") {
    errors.push(`${context}: "recordType" is required (full record type reference string)`);
  }
  if (!ds.fields || typeof ds.fields !== "object" || Array.isArray(ds.fields)) {
    errors.push(`${context}: "fields" is required and must be an object mapping alias → field reference`);
  } else {
    Object.entries(ds.fields).forEach(([alias, ref]) => {
      validateFieldRefShape(ref, `${context}.fields.${alias}`, errors);
    });
  }
  // relationships: optional object mapping alias → relationship path prefix
  if (ds.relationships !== undefined) {
    if (typeof ds.relationships !== "object" || Array.isArray(ds.relationships)) {
      errors.push(`${context}: "relationships" must be an object mapping alias → relationship reference`);
    } else {
      Object.entries(ds.relationships).forEach(([alias, ref]) => {
        validateFieldRefShape(ref, `${context}.relationships.${alias}`, errors);
      });
    }
  }
}

function validateKpisItems(items, context, errors, hasDataSource) {
  if (!Array.isArray(items) || items.length === 0) {
    errors.push(`${context}: "items" must be a non-empty array of KPI entries`);
    return;
  }
  items.forEach((kpi, ki) => {
    const kc = `${context}.items[${ki}]`;
    if (!kpi.label) errors.push(`${kc}: "label" is required`);
    if (!kpi.sub) errors.push(`${kc}: "sub" is required`);

    // When dataSource is present, KPIs can use a "query" object instead of a static "value"
    if (kpi.query) {
      const qc = `${kc}.query`;
      if (!kpi.query.function || !AGGREGATION_FUNCTIONS.includes(kpi.query.function)) {
        errors.push(`${qc}: "function" must be one of [${AGGREGATION_FUNCTIONS.join(", ")}], got: ${JSON.stringify(kpi.query.function)}`);
      }
      if (!kpi.query.field || typeof kpi.query.field !== "string") {
        errors.push(`${qc}: "field" is required (alias from dataSource.fields)`);
      }
      if (kpi.query.filters) {
        validateDashboardFilters(kpi.query.filters, `${qc}.filters`, errors);
      }
      if (!hasDataSource) {
        errors.push(`${qc}: "query" on KPI requires top-level "dataSource" to be defined`);
      }
    } else {
      // Static value mode
      if (kpi.value === undefined || kpi.value === null || kpi.value === "") {
        errors.push(`${kc}: "value" is required (or use "query" with a dataSource)`);
      }
    }
    validateIcon(kpi.icon, `${kc}.icon`, errors);
  });
}

/**
 * Shared by dashboard "chart" sections, "component" chart, and pane "chart" content.
 */
function validateChartFields(section, context, errors, hasDataSource) {
  if (!CHART_TYPES.includes(section.chartType)) {
    errors.push(`${context}: "chartType" must be one of [${CHART_TYPES.join(", ")}] (scatter cannot use static mockup data), got: ${JSON.stringify(section.chartType)}`);
  }

  // Record-powered chart: uses recordSource with grouping + measure
  if (section.recordSource) {
    const rc = `${context}.recordSource`;
    if (!hasDataSource) {
      errors.push(`${rc}: "recordSource" requires top-level "dataSource" to be defined`);
    }
    if (!section.recordSource.groupingField || typeof section.recordSource.groupingField !== "string") {
      errors.push(`${rc}: "groupingField" is required (alias from dataSource.fields or relationships.field)`);
    }
    if (!section.recordSource.measureField || typeof section.recordSource.measureField !== "string") {
      errors.push(`${rc}: "measureField" is required (alias from dataSource.fields)`);
    }
    if (section.recordSource.measureFunction && !AGGREGATION_FUNCTIONS.includes(section.recordSource.measureFunction)) {
      errors.push(`${rc}: "measureFunction" must be one of [${AGGREGATION_FUNCTIONS.join(", ")}], got: ${JSON.stringify(section.recordSource.measureFunction)}`);
    }
    if (section.recordSource.filters) {
      validateDashboardFilters(section.recordSource.filters, `${rc}.filters`, errors);
    }
    // When using recordSource, categories/series are not needed
    return;
  }

  // Static chart: requires categories + series
  if (!Array.isArray(section.categories) || section.categories.length === 0) {
    errors.push(`${context}: "categories" must be a non-empty array`);
  }
  if (!Array.isArray(section.series) || section.series.length === 0) {
    errors.push(`${context}: "series" must be a non-empty array`);
  } else {
    section.series.forEach((s, si) => {
      const sc = `${context}.series[${si}]`;
      if (!s.label) errors.push(`${sc}: "label" is required`);
      if (!Array.isArray(s.data)) {
        errors.push(`${sc}: "data" must be an array`);
      } else if (Array.isArray(section.categories) && s.data.length !== section.categories.length) {
        errors.push(`${sc}: "data" length (${s.data.length}) must match "categories" length (${section.categories.length})`);
      }
    });
  }
}

function validateDashboardSection(section, context, errors, hasDataSource) {
  const SECTION_TYPES = ["kpis", "chart", "grid", "columns"];
  if (!section.type || !SECTION_TYPES.includes(section.type)) {
    errors.push(`${context}: "type" must be one of [${SECTION_TYPES.join(", ")}], got: ${JSON.stringify(section.type)}`);
    return;
  }

  // Skeleton sections only need type + label — no data validation
  if (section.skeleton === true) {
    if (!section.label) {
      errors.push(`${context}: skeleton sections require a "label"`);
    }
    if (section.type === "columns") {
      if (!Array.isArray(section.items) || section.items.length < 2) {
        errors.push(`${context}: skeleton "columns" must still have at least 2 items (with skeleton: true on each)`);
      } else {
        section.items.forEach((item, ii) => {
          const nested = `${context}.items[${ii}]`;
          if (item.type === "columns") {
            errors.push(`${nested}: nested "columns" inside "columns" is not supported`);
          } else {
            validateDashboardSection(item, nested, errors, hasDataSource);
          }
        });
      }
    }
    return;
  }

  switch (section.type) {
    case "kpis":
      validateKpisItems(section.items, context, errors, hasDataSource);
      break;

    case "chart":
      validateChartFields(section, context, errors, hasDataSource);
      break;

    case "grid":
      // Record-powered grid: uses recordSource instead of static rows
      if (section.recordSource) {
        const rc = `${context}.recordSource`;
        if (!hasDataSource) {
          errors.push(`${rc}: "recordSource" requires top-level "dataSource" to be defined`);
        }
        if (section.recordSource.filters) {
          validateDashboardFilters(section.recordSource.filters, `${rc}.filters`, errors);
        }
        if (section.recordSource.sort) {
          if (!section.recordSource.sort.field || typeof section.recordSource.sort.field !== "string") {
            errors.push(`${rc}.sort: "field" is required`);
          }
          if (typeof section.recordSource.sort.ascending !== "boolean") {
            errors.push(`${rc}.sort: "ascending" is required and must be a boolean`);
          }
        }
        // Columns are still required (define what to show), but rows are not
        if (!Array.isArray(section.columns) || section.columns.length === 0) {
          errors.push(`${context}: "columns" must be a non-empty array even with recordSource`);
        } else {
          // Validate column structure without rows
          const seenNames = new Set();
          let primaryCount = 0;
          section.columns.forEach((col, ci) => {
            const cc = `${context} columns[${ci}]`;
            if (!col.name || !/^[a-zA-Z][a-zA-Z0-9]*$/.test(col.name)) {
              errors.push(`${cc}: "name" must be a camelCase identifier, got: ${JSON.stringify(col.name)}`);
            } else {
              if (seenNames.has(col.name)) errors.push(`${cc}: duplicate column name "${col.name}"`);
              seenNames.add(col.name);
            }
            if (!col.label) errors.push(`${cc}: "label" is required`);
            if (!GRID_COLUMN_TYPES.includes(col.type)) {
              errors.push(`${cc}: "type" must be one of [${GRID_COLUMN_TYPES.join(", ")}], got: ${JSON.stringify(col.type)}`);
            }
            if (col.type === "primary") primaryCount++;
            if (!col.width || !GRID_WIDTHS.includes(col.width)) {
              errors.push(`${cc}: "width" is required and must be one of [${GRID_WIDTHS.join(", ")}], got: ${JSON.stringify(col.width)}`);
            }
            // fieldRef: required for record-powered grids — maps column to a dataSource field alias
            if (!col.fieldRef || typeof col.fieldRef !== "string") {
              errors.push(`${cc}: "fieldRef" is required for record-powered grids (alias from dataSource.fields or relationship path)`);
            }
            if (col.type === "tag" && (!col.tagColors || typeof col.tagColors !== "object" || Object.keys(col.tagColors).length === 0)) {
              errors.push(`${cc}: type "tag" requires a non-empty "tagColors" object`);
            }
          });
          if (primaryCount !== 1) {
            errors.push(`${context}: exactly one column must have "type": "primary", found ${primaryCount}`);
          }
        }
      } else {
        // Static grid — existing validation
        validateGridColumnsAndRows(section.columns, section.rows, context, errors);
      }
      if (section.filters && !section.recordSource) {
        errors.push(`${context}: "filters" is not supported in dashboard grids — they render without search/filter chrome.`);
      }
      break;

    case "columns":
      if (!Array.isArray(section.items) || section.items.length < 2) {
        errors.push(`${context}: "items" must be an array with at least 2 sections for side-by-side layout`);
      } else {
        section.items.forEach((item, ii) => {
          const nested = `${context}.items[${ii}]`;
          if (item.type === "columns") {
            errors.push(`${nested}: nested "columns" inside "columns" is not supported`);
          } else {
            validateDashboardSection(item, nested, errors, hasDataSource);
          }
        });
      }
      break;
  }
}

function validateDashboardDefinition(def, errors) {
  if (!Array.isArray(def.sections) || def.sections.length === 0) {
    errors.push('"sections" must be a non-empty array for a dashboard');
  } else {
    const hasDataSource = !!def.dataSource;
    if (def.dataSource) {
      validateDashboardDataSource(def.dataSource, errors);
    }
    def.sections.forEach((section, si) => {
      validateDashboardSection(section, `sections[${si}]`, errors, hasDataSource);
    });
  }
}

// ---------------------------------------------------------------------------
// Pane definition — a!paneLayout with 2-3 full-height panes.
// "content" inside each pane is one of: nav (link list), grid, chart, kpis,
// detail (key/value display), or placeholder (empty — skeleton mode).
// grid/chart/kpis reuse the exact same validators as dashboard sections.
// ---------------------------------------------------------------------------
function validatePaneContent(content, context, errors) {
  if (content.skeleton === true) {
    if (!content.type || !PANE_CONTENT_TYPES.includes(content.type)) {
      errors.push(`${context}: "type" must be one of [${PANE_CONTENT_TYPES.join(", ")}], got: ${JSON.stringify(content.type)}`);
    }
    return;
  }
  if (!content.type || !PANE_CONTENT_TYPES.includes(content.type)) {
    errors.push(`${context}: "type" must be one of [${PANE_CONTENT_TYPES.join(", ")}], got: ${JSON.stringify(content.type)}`);
    return;
  }
  switch (content.type) {
    case "nav":
      if (!Array.isArray(content.items) || content.items.length === 0) {
        errors.push(`${context}: "nav" content requires a non-empty "items" array`);
      } else {
        content.items.forEach((item, ii) => {
          if (!item.label) errors.push(`${context}.items[${ii}]: "label" is required`);
        });
      }
      break;
    case "grid":
      validateGridColumnsAndRows(content.columns, content.rows, context, errors);
      if (content.filters) {
        errors.push(`${context}: "filters" is not supported in pane grids — they render without search/filter chrome.`);
      }
      break;
    case "chart":
      validateChartFields(content, context, errors);
      break;
    case "kpis":
      validateKpisItems(content.items, context, errors);
      break;
    case "detail":
      if (!Array.isArray(content.fields) || content.fields.length === 0) {
        errors.push(`${context}: "detail" content requires a non-empty "fields" array`);
      } else {
        content.fields.forEach((field, fi) => {
          const fc = `${context}.fields[${fi}]`;
          if (!field.label) errors.push(`${fc}: "label" is required`);
          if (field.value === undefined || field.value === null || field.value === "") {
            errors.push(`${fc}: "value" is required`);
          }
        });
      }
      break;
    case "placeholder":
      // No data required — an intentionally empty pane (e.g. "select an item to view details")
      break;
    case "layout":
      // Layout-tree content — validates using the same recursive layout-tree validator.
      // The content object IS the layout-tree root node (container or leaf).
      if (!content.root || typeof content.root !== "object") {
        errors.push(`${context}: "layout" content requires a "root" object (a layout-tree node)`);
      } else {
        const { validateNode } = require("./layout-tree");
        validateNode(content.root, `${context}.root`, errors);
      }
      break;
  }
}

function validatePaneDefinition(def, errors) {
  if (!Array.isArray(def.panes) || def.panes.length < 2 || def.panes.length > 3) {
    errors.push('"panes" must be an array with 2-3 entries');
    return;
  }
  let autoCount = 0;
  def.panes.forEach((pane, pi) => {
    const pc = `panes[${pi}]`;
    if (!pane.width || !PANE_WIDTHS.includes(pane.width)) {
      errors.push(`${pc}: "width" is required and must be one of [${PANE_WIDTHS.join(", ")}], got: ${JSON.stringify(pane.width)}`);
    } else if (pane.width === "AUTO") {
      autoCount++;
    }
    if (pane.backgroundColor && !/^#[0-9A-Fa-f]{6}$/.test(pane.backgroundColor)) {
      errors.push(`${pc}: "backgroundColor" must be a hex color, got: ${JSON.stringify(pane.backgroundColor)}`);
    }
    if (!pane.content || typeof pane.content !== "object") {
      errors.push(`${pc}: "content" object is required`);
    } else {
      validatePaneContent(pane.content, `${pc}.content`, errors);
    }
  });
  if (autoCount !== 1) {
    errors.push(`"panes": exactly one pane must have "width": "AUTO" for fluid layout, found ${autoCount}`);
  }
}

// ---------------------------------------------------------------------------
// Component definition — a single kpis/chart/grid fragment, no page framing.
// Reuses the exact same section validation as a dashboard section, since a
// "component" is structurally just one dashboard section rendered without
// the outer a!headerContentLayout/header/gutter-columns wrapper.
// ---------------------------------------------------------------------------
const COMPONENT_TYPES = ["kpis", "chart", "grid"];

function validateComponentDefinition(def, errors) {
  if (!def.componentType || !COMPONENT_TYPES.includes(def.componentType)) {
    errors.push(`"componentType" must be one of [${COMPONENT_TYPES.join(", ")}], got: ${JSON.stringify(def.componentType)}`);
    return;
  }
  if (!def.section || typeof def.section !== "object") {
    errors.push('"section" object is required for a component definition');
    return;
  }
  if (def.section.type !== def.componentType) {
    errors.push(`"section.type" (${JSON.stringify(def.section.type)}) must match "componentType" (${JSON.stringify(def.componentType)})`);
    return;
  }
  // validateDashboardSection already rejects "filters" on grid sections
  // ("they render without search/filter chrome") — same rule applies here.
  validateDashboardSection(def.section, "section", errors);
}

/**
 * Lazily delegates to layout-tree.js's recursive validator. Lazy require
 * avoids a load-order cycle: layout-tree.js requires ./define at call time
 * (not at module load), so define.js is fully initialized by the time this
 * runs regardless of which module was required first.
 *
 * The "grid"/"chart"/"kpis" leaves only get registered into layout-tree.js's
 * LEAF_TYPES as a side effect of loading templates/dashboard.js — scaffold.js
 * gets this for free (it eagerly requires every template up front), but
 * define.js's --write validation path never loaded dashboard.js on its own,
 * so those 3 leaf types would validate as "unknown" here even though they
 * are documented, valid leaf types that scaffold.js renders correctly.
 * Registering core leaves before every validateNode call closes that gap —
 * idempotent (registerCoreLeaves is safe to call repeatedly), so no harm if
 * something else already triggered registration first.
 */
function validateLayoutTreeNode(node, context, errors) {
  const layoutTree = require("./layout-tree");
  layoutTree.registerCoreLeaves(require("./templates/dashboard"));
  layoutTree.validateNode(node, context, errors);
}

// ---------------------------------------------------------------------------
// localName auto-derivation — a dataBinding.fields[]/relatedRecordData[]
// entry's `localName` drives the generated `local!{localName}` binding name.
// The convention is entirely mechanical (relationshipName + Capitalized
// FieldName for a many-to-one lookup, or just the relationship's own name for
// a related collection) — deriving it here removes a decision the agent
// otherwise has to make and validate manually for every relationship-
// qualified entry. Only fills in when `localName` is omitted entirely;
// an explicit (even if invalid) value is left alone for validation below to
// catch. Mutates `db` in place so the derived name is also what gets written
// to definition.json, not just what validation sees.
// ---------------------------------------------------------------------------
function extractTrailingName(ref) {
  if (typeof ref !== "string" || !ref) return null;
  const lastDot = ref.lastIndexOf(".");
  const lastSegment = lastDot === -1 ? ref : ref.slice(lastDot + 1);
  const name = lastSegment.replace(/^\{[^}]*\}/, "");
  return name || null;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function deriveDataBindingLocalNames(db) {
  if (Array.isArray(db.fields)) {
    db.fields.forEach((f) => {
      if (f && typeof f === "object" && !f.localName) {
        const relName = extractTrailingName(f.relationship);
        const fieldName = extractTrailingName(f.field);
        if (relName && fieldName) {
          f.localName = `${relName}${capitalize(fieldName)}`;
        }
      }
    });
  }
  if (Array.isArray(db.relatedRecordData)) {
    db.relatedRecordData.forEach((rrd) => {
      if (rrd && typeof rrd === "object" && !rrd.localName) {
        const relName = extractTrailingName(rrd.relationship);
        if (relName) rrd.localName = relName;
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Data-binding block — validates the "dataBinding" field on a record-view
// Definition_JSON (see design.md "Components and Interfaces" §1). Wired into
// validateRecordViewDefinition below.
// ---------------------------------------------------------------------------
function validateDataBindingBlock(db, errors) {
  deriveDataBindingLocalNames(db);
  const context = "dataBinding";
  if (!db.recordType || typeof db.recordType !== "string") {
    errors.push(`${context}: "recordType" is required and must be a non-empty string (Concrete_Identifier record type reference)`);
  }

  // identifier: string (single PK) or non-empty array of {field, value} pairs (composite PK)
  if (Array.isArray(db.identifier)) {
    if (db.identifier.length === 0) {
      errors.push(`${context}.identifier: composite-PK array must have at least one field/value pair`);
    } else {
      db.identifier.forEach((pair, pi) => {
        const pc = `${context}.identifier[${pi}]`;
        if (!pair.field || typeof pair.field !== "string") {
          errors.push(`${pc}: "field" is required and must be a non-empty string`);
        }
        if (pair.value === undefined || pair.value === null || pair.value === "") {
          errors.push(`${pc}: "value" is required`);
        }
      });
    }
  } else if (!db.identifier || typeof db.identifier !== "string") {
    errors.push(`${context}.identifier: required — a non-empty string (single PK) or an array of {field, value} pairs (composite PK)`);
  }

  // fields: non-empty array; each entry a string or a relationship-qualified object
  const seenLocalNames = new Set();
  if (!Array.isArray(db.fields) || db.fields.length === 0) {
    errors.push(`${context}.fields: required — a non-empty array (omitting it would return only the primary key)`);
  } else {
    db.fields.forEach((f, fi) => {
      const fc = `${context}.fields[${fi}]`;
      if (typeof f === "string") {
        if (!f) errors.push(`${fc}: field reference must be a non-empty string`);
      } else if (f && typeof f === "object") {
        if (!f.relationship || typeof f.relationship !== "string") {
          errors.push(`${fc}: "relationship" is required and must be a non-empty string for a relationship-qualified field`);
        }
        if (!f.field || typeof f.field !== "string") {
          errors.push(`${fc}: "field" is required and must be a non-empty string`);
        } else if (f.relationship && !f.field.startsWith(f.relationship)) {
          errors.push(`${fc}: "field" must be qualified under "relationship" (expected it to start with ${JSON.stringify(f.relationship)})`);
        }
        if (!f.localName || !/^[a-zA-Z][a-zA-Z0-9]*$/.test(f.localName)) {
          errors.push(`${fc}: "localName" is required and must be a camelCase identifier`);
        } else if (seenLocalNames.has(f.localName)) {
          errors.push(`${fc}: duplicate "localName" "${f.localName}"`);
        } else {
          seenLocalNames.add(f.localName);
        }
      } else {
        errors.push(`${fc}: field reference must be a string or a relationship-qualified object, got: ${JSON.stringify(f)}`);
      }
    });
  }

  // relatedRecordData: optional array; each entry needs relationship, localName, limit 1-250, fields, optional sort
  if (db.relatedRecordData !== undefined) {
    if (!Array.isArray(db.relatedRecordData)) {
      errors.push(`${context}.relatedRecordData: must be an array`);
    } else {
      db.relatedRecordData.forEach((rrd, ri) => {
        const rc = `${context}.relatedRecordData[${ri}]`;
        if (!rrd.relationship || typeof rrd.relationship !== "string") {
          errors.push(`${rc}: "relationship" is required and must be a non-empty string`);
        }
        if (!rrd.localName || !/^[a-zA-Z][a-zA-Z0-9]*$/.test(rrd.localName)) {
          errors.push(`${rc}: "localName" is required and must be a camelCase identifier`);
        } else if (seenLocalNames.has(rrd.localName)) {
          errors.push(`${rc}: duplicate "localName" "${rrd.localName}"`);
        } else {
          seenLocalNames.add(rrd.localName);
        }
        if (
          rrd.limit === undefined || typeof rrd.limit !== "number" ||
          !Number.isInteger(rrd.limit) || rrd.limit < 1 || rrd.limit > 250
        ) {
          errors.push(`${rc}: "limit" is required and must be an integer between 1 and 250, got: ${JSON.stringify(rrd.limit)}`);
        }
        if (!Array.isArray(rrd.fields) || rrd.fields.length === 0) {
          errors.push(`${rc}.fields: required — a non-empty array of related-record field references`);
        } else {
          rrd.fields.forEach((f, fi) => {
            if (!f || typeof f !== "string") {
              errors.push(`${rc}.fields[${fi}]: field reference must be a non-empty string`);
            } else {
              // Must be a PLAIN field reference directly on the related record type —
              // exactly one ".fields." segment, and no ".relationships." before it.
              // qualifyRelatedField() in templates/record-view.js swaps everything
              // before the FIRST ".fields." for the relationship reference; an entry
              // with zero/multiple ".fields." occurrences, OR one that's itself
              // relationship-qualified (e.g. "...Comment.relationships.{uuid}author
              // .fields.{uuid}name"), would silently re-qualify into a malformed or
              // semantically wrong field path (silently dropping the nested
              // relationship traversal) instead of failing validation.
              const occurrences = f.split(".fields.").length - 1;
              const idx = f.indexOf(".fields.");
              const prefix = idx === -1 ? f : f.slice(0, idx);
              if (occurrences !== 1) {
                errors.push(`${rc}.fields[${fi}]: must be a plain field reference on the related record type with exactly one ".fields." segment (found ${occurrences}) — not a relationship-qualified path`);
              } else if (prefix.includes(".relationships.")) {
                errors.push(`${rc}.fields[${fi}]: must be a plain field directly on the related record type, not relationship-qualified through it — nested relationship lookups are not supported inside relatedRecordData.fields`);
              }
            }
          });
        }
        if (rrd.sort !== undefined) {
          if (!rrd.sort.field || typeof rrd.sort.field !== "string") {
            errors.push(`${rc}.sort: "field" is required and must be a non-empty string, qualified against the related record type`);
          }
          if (typeof rrd.sort.ascending !== "boolean") {
            errors.push(`${rc}.sort: "ascending" is required and must be a boolean`);
          }
        }
        if (rrd.itemFields !== undefined) {
          validateItemFieldsMapping(rrd.itemFields, `${rc}.itemFields`, errors);
        }
      });
    }
  }

  // todos: optional array of non-empty strings
  if (db.todos !== undefined) {
    if (!Array.isArray(db.todos)) {
      errors.push(`${context}.todos: must be an array of strings`);
    } else {
      db.todos.forEach((t, ti) => {
        if (!t || typeof t !== "string") {
          errors.push(`${context}.todos[${ti}]: must be a non-empty string`);
        }
      });
    }
  }
}

// A Field_Ref is a non-empty string. A Literal is { literal: <non-empty string> }.
// title/text accept only Field_Ref; avatarText/trailing accept either shape.
function isFieldRef(v) {
  return typeof v === "string" && v.length > 0;
}
function isLiteral(v) {
  return v && typeof v === "object" && typeof v.literal === "string" && v.literal.length > 0;
}

// ---------------------------------------------------------------------------
// Collects every string a keyAttributes/sections field's "fieldRef" is
// allowed to resolve to, from an already-validated (or validating) Data_
// Binding_Block:
//  - every dataBinding.fields[] entry: the plain string itself (for a plain
//    field), or the entry's localName (for a relationship-qualified object)
//  - every dataBinding.relatedRecordData[] entry's localName (the collection
//    itself — e.g. binding a keyAttribute to a comment count text summary
//    computed from the collection is out of scope here; this only covers
//    binding directly to the raw collection value, which is rarely useful
//    for keyAttributes/sections but kept for consistency with fields[])
// Does not attempt to validate dataBinding's own shape — callers should run
// validateDataBindingBlock separately; this just enumerates whatever
// resolvable strings are present, defensively skipping malformed entries.
// ---------------------------------------------------------------------------
function collectDataBindingFieldRefs(dataBinding) {
  const refs = new Set();
  if (Array.isArray(dataBinding.fields)) {
    for (const f of dataBinding.fields) {
      if (typeof f === "string" && f) {
        refs.add(f);
      } else if (f && typeof f === "object" && typeof f.localName === "string" && f.localName) {
        refs.add(f.localName);
      }
    }
  }
  if (Array.isArray(dataBinding.relatedRecordData)) {
    for (const rrd of dataBinding.relatedRecordData) {
      if (rrd && typeof rrd.localName === "string" && rrd.localName) {
        refs.add(rrd.localName);
      }
    }
  }
  return refs;
}

// ---------------------------------------------------------------------------
// Item_Fields_Mapping validator — validates the "itemFields" field on a
// relatedRecordData entry within a Data_Binding_Block (see design.md
// "Components and Interfaces" §1, Req 3.8, 3.9, 3.10). Called only when
// itemFields is present — its absence is always valid and is not this
// function's concern.
// ---------------------------------------------------------------------------
function validateItemFieldsMapping(itemFields, context, errors) {
  if (!itemFields || typeof itemFields !== "object") {
    errors.push(`${context}: must be an object with "title" and "text" field references`);
    return;
  }

  // title/text: required, Field_Ref only (Req 3.10)
  if (!isFieldRef(itemFields.title)) {
    errors.push(`${context}.title: is required and must be a non-empty field-reference string (Item_Fields_Mapping "title" cannot be a literal)`);
  }
  if (!isFieldRef(itemFields.text)) {
    errors.push(`${context}.text: is required and must be a non-empty field-reference string (Item_Fields_Mapping "text" cannot be a literal)`);
  }

  // avatarText/trailing: optional, Field_Ref OR Literal
  ["avatarText", "trailing"].forEach((key) => {
    const v = itemFields[key];
    if (v === undefined) return;
    if (!isFieldRef(v) && !isLiteral(v)) {
      errors.push(`${context}.${key}: must be a non-empty field-reference string, or a literal object { "literal": "<text>" }, got: ${JSON.stringify(v)}`);
    }
  });
}

// ---------------------------------------------------------------------------
// Form/Wizard dataBinding — validates the "dataBinding" field on form/wizard
// definitions for live-data forms that bind to ri!record[...] instead of local!.
// ---------------------------------------------------------------------------
function validateFormWizardDataBinding(db, errors) {
  const context = "dataBinding";
  if (!db.recordType || typeof db.recordType !== "string") {
    errors.push(`${context}: "recordType" is required and must be a non-empty string (full record type reference)`);
  } else {
    validateFieldRefShape(db.recordType, `${context}.recordType`, errors);
  }
  if (!db.ruleInputName || typeof db.ruleInputName !== "string") {
    errors.push(`${context}: "ruleInputName" is required (convention: "record")`);
  }

  // fields: non-empty array of field reference strings
  if (!Array.isArray(db.fields) || db.fields.length === 0) {
    errors.push(`${context}.fields: required — a non-empty array of field reference strings`);
  } else {
    db.fields.forEach((f, fi) => {
      const fc = `${context}.fields[${fi}]`;
      if (!f || typeof f !== "string") {
        errors.push(`${fc}: must be a non-empty field reference string`);
      } else {
        validateFieldRefShape(f, fc, errors);
      }
    });
  }

  // lookups: optional array — each defines a dropdown query source
  const seenLocalNames = new Set();
  if (db.lookups !== undefined) {
    if (!Array.isArray(db.lookups)) {
      errors.push(`${context}.lookups: must be an array`);
    } else {
      db.lookups.forEach((lk, li) => {
        const lc = `${context}.lookups[${li}]`;
        if (!lk.fieldRef || typeof lk.fieldRef !== "string") {
          errors.push(`${lc}: "fieldRef" is required (FK field reference on the base record type)`);
        } else {
          validateFieldRefShape(lk.fieldRef, `${lc}.fieldRef`, errors);
          // fieldRef should also be in db.fields
          if (Array.isArray(db.fields) && !db.fields.includes(lk.fieldRef)) {
            errors.push(`${lc}: "fieldRef" ("${lk.fieldRef}") must also appear in dataBinding.fields`);
          }
        }
        if (!lk.lookupRecordType || typeof lk.lookupRecordType !== "string") {
          errors.push(`${lc}: "lookupRecordType" is required (the related record type to query)`);
        } else {
          validateFieldRefShape(lk.lookupRecordType, `${lc}.lookupRecordType`, errors);
        }
        if (!lk.labelField || typeof lk.labelField !== "string") {
          errors.push(`${lc}: "labelField" is required (display field on the lookup record type)`);
        } else {
          validateFieldRefShape(lk.labelField, `${lc}.labelField`, errors);
        }
        if (!lk.valueField || typeof lk.valueField !== "string") {
          errors.push(`${lc}: "valueField" is required (PK/value field on the lookup record type)`);
        } else {
          validateFieldRefShape(lk.valueField, `${lc}.valueField`, errors);
        }
        if (!lk.localName || !/^[a-zA-Z][a-zA-Z0-9]*$/.test(lk.localName)) {
          errors.push(`${lc}: "localName" is required and must be a camelCase identifier`);
        } else if (seenLocalNames.has(lk.localName)) {
          errors.push(`${lc}: duplicate "localName" "${lk.localName}"`);
        } else {
          seenLocalNames.add(lk.localName);
        }
      });
    }
  }

  // relatedFields: optional array — each defines a relationship-path binding
  if (db.relatedFields !== undefined) {
    if (!Array.isArray(db.relatedFields)) {
      errors.push(`${context}.relatedFields: must be an array`);
    } else {
      db.relatedFields.forEach((rf, ri) => {
        const rc = `${context}.relatedFields[${ri}]`;
        if (!rf.relationship || typeof rf.relationship !== "string") {
          errors.push(`${rc}: "relationship" is required (relationship reference on the base record type)`);
        } else {
          validateFieldRefShape(rf.relationship, `${rc}.relationship`, errors);
        }
        if (!rf.field || typeof rf.field !== "string") {
          errors.push(`${rc}: "field" is required (full relationship-qualified field path)`);
        } else {
          validateFieldRefShape(rf.field, `${rc}.field`, errors);
        }
        if (!rf.localName || !/^[a-zA-Z][a-zA-Z0-9]*$/.test(rf.localName)) {
          errors.push(`${rc}: "localName" is required and must be a camelCase identifier`);
        } else if (seenLocalNames.has(rf.localName)) {
          errors.push(`${rc}: duplicate "localName" "${rf.localName}"`);
        } else {
          seenLocalNames.add(rf.localName);
        }
      });
    }
  }

  // todos: optional array of strings
  if (db.todos !== undefined) {
    if (!Array.isArray(db.todos)) {
      errors.push(`${context}.todos: must be an array of strings`);
    } else {
      db.todos.forEach((t, ti) => {
        if (!t || typeof t !== "string") {
          errors.push(`${context}.todos[${ti}]: must be a non-empty string`);
        }
      });
    }
  }
}

/**
 * Collects the set of valid fieldRef values for form/wizard fields:
 * - Every string in dataBinding.fields
 * - Every relatedFields[].field
 */
function collectFormDataBindingFieldRefs(db) {
  const refs = new Set();
  if (Array.isArray(db.fields)) {
    db.fields.forEach((f) => { if (typeof f === "string" && f) refs.add(f); });
  }
  if (Array.isArray(db.relatedFields)) {
    db.relatedFields.forEach((rf) => { if (rf && typeof rf.field === "string" && rf.field) refs.add(rf.field); });
  }
  return refs;
}

/**
 * Collects valid lookupRef values (localName from each lookup entry).
 */
function collectFormLookupRefs(db) {
  const refs = new Set();
  if (Array.isArray(db.lookups)) {
    db.lookups.forEach((lk) => { if (lk && typeof lk.localName === "string" && lk.localName) refs.add(lk.localName); });
  }
  return refs;
}

function validateRecordViewDefinition(def, errors) {
  // Skeleton record-views only need title/entityName/recordName — no
  // keyAttributes/sections content required yet.
  if (!def.recordName || typeof def.recordName !== "string") {
    errors.push('"recordName" is required (hardcoded sample record name for the header)');
  }
  if (def.skeleton === true) return;

  const hasDataBinding = def.dataBinding && typeof def.dataBinding === "object";
  if (hasDataBinding) {
    validateDataBindingBlock(def.dataBinding, errors);
  }

  // titleFieldRef: optional field that makes the page header title dynamic
  // (resolved from a queried field instead of the static recordName).
  // Must resolve to something in dataBinding.fields or relatedRecordData.
  if (def.titleFieldRef !== undefined) {
    if (!hasDataBinding) {
      errors.push('"titleFieldRef" requires "dataBinding" to be present — there is nothing queried to bind the title to');
    } else if (typeof def.titleFieldRef !== "string" || !def.titleFieldRef) {
      errors.push('"titleFieldRef" must be a non-empty string');
    }
    // Cross-check against valid refs happens below after collectDataBindingFieldRefs
  }

  // Every string a keyAttributes/sections field's "fieldRef" is allowed to
  // resolve to: a relationship-qualified/related-collection localName (e.g.
  // "statusLabel", "comments"), or a plain field-reference string already
  // listed verbatim in dataBinding.fields. This lets keyAttributes/sections
  // display data the Query_Prologue already queried — with no SAIL authored
  // by the definition agent — instead of forcing every live-data record view
  // to hand off to Pass 3 just to show its own queried fields.
  const validFieldRefs = hasDataBinding ? collectDataBindingFieldRefs(def.dataBinding) : null;

  // Cross-check titleFieldRef against valid refs
  if (def.titleFieldRef && hasDataBinding && validFieldRefs && !validFieldRefs.has(def.titleFieldRef)) {
    errors.push(`"titleFieldRef": "${def.titleFieldRef}" does not match any dataBinding.fields[].localName, dataBinding.relatedRecordData[].localName, or plain field reference already listed in dataBinding.fields`);
  }

  // "name" only drives a real local!{name} var decl for entries WITHOUT a
  // fieldRef (see renderFromDefinition's allFields.filter((f) => !f.fieldRef)
  // in templates/record-view.js) — a fieldRef entry never gets its own local!,
  // it resolves inline to local!{fieldRef} or a!defaultValue(...) instead.
  // Uniqueness therefore only needs to be enforced among no-fieldRef entries;
  // two fieldRef entries (or a fieldRef entry and a mock entry) sharing a
  // "name" cannot collide in the rendered output. This is the intentional-dup
  // case: showing the same queried field (e.g. createdAt) twice under two
  // different labels/sections requires two fieldRef entries with the same
  // "name" (there's no other field to give the second occurrence).
  const seenNames = new Set();

  function validateField(field, context) {
    if (!field.name || !/^[a-zA-Z][a-zA-Z0-9]*$/.test(field.name)) {
      errors.push(`${context}: "name" must be a camelCase identifier, got: ${JSON.stringify(field.name)}`);
    } else if (field.fieldRef === undefined) {
      if (seenNames.has(field.name)) errors.push(`${context}: duplicate field name "${field.name}" (two entries without "fieldRef" would collide on the same local! var — give one a different "name", or add "fieldRef" if it should bind to a queried field instead)`);
      seenNames.add(field.name);
    }
    if (!field.label) errors.push(`${context}: "label" is required`);
    const fieldType = field.type || "text";
    if (!RECORD_VIEW_FIELD_TYPES.includes(fieldType)) {
      errors.push(`${context}: "type" must be one of [${RECORD_VIEW_FIELD_TYPES.join(", ")}] (read-only view), got: ${JSON.stringify(field.type)}`);
    }

    const hasFieldRef = field.fieldRef !== undefined;
    const hasValue = field.value !== undefined && field.value !== null && field.value !== "";

    if (!hasFieldRef && !hasValue) {
      errors.push(`${context}: either "value" (hardcoded mock value) or "fieldRef" (binds to a dataBinding-queried field) is required`);
    } else if (hasFieldRef && hasValue) {
      errors.push(`${context}: "value" and "fieldRef" are mutually exclusive — use "value" for a hardcoded mock, or "fieldRef" to bind to a queried field, not both`);
    } else if (hasFieldRef) {
      if (typeof field.fieldRef !== "string" || !field.fieldRef) {
        errors.push(`${context}.fieldRef: must be a non-empty string`);
      } else if (!hasDataBinding) {
        errors.push(`${context}.fieldRef: requires "dataBinding" to be present on this definition — there is nothing queried to bind to`);
      } else if (!validFieldRefs.has(field.fieldRef)) {
        errors.push(`${context}.fieldRef: "${field.fieldRef}" does not match any dataBinding.fields[].localName, dataBinding.relatedRecordData[].localName, or plain field reference already listed in dataBinding.fields`);
      }
    }

    if (field.tag) {
      if (!field.tagColors || typeof field.tagColors !== "object" || Object.keys(field.tagColors).length === 0) {
        errors.push(`${context}: "tag": true requires a non-empty "tagColors" object`);
      } else {
        // A fieldRef-bound tag's value isn't known at authoring time (it comes
        // from the live query), so there is no fixed "value" to cross-check
        // against tagColors — only validate the color entries themselves.
        if (hasValue && !(field.value in field.tagColors)) {
          errors.push(`${context}: "value" (${JSON.stringify(field.value)}) has no matching entry in "tagColors"`);
        }
        Object.entries(field.tagColors).forEach(([value, color]) => {
          if (!isValidTagColor(color)) {
            errors.push(`${context}: tagColors["${value}"] must be one of [${TAG_COLORS.join(", ")}] or a hex color, got: ${JSON.stringify(color)}`);
          }
        });
      }
    }
  }

  // Key attributes — validated only when present; a dataBinding-only
  // record-view (no mock display content) is now a valid definition on its own.
  const hasKeyAttributes = Array.isArray(def.keyAttributes) && def.keyAttributes.length > 0;
  if (def.keyAttributes !== undefined) {
    if (!Array.isArray(def.keyAttributes) || def.keyAttributes.length === 0 || def.keyAttributes.length > 6) {
      errors.push('"keyAttributes" must be an array with 1-6 entries');
    } else {
      def.keyAttributes.forEach((attr, ai) => {
        validateField(attr, `keyAttributes[${ai}]`);
      });
    }
  }

  // Sections — either the built-in field-card sections, or (new) a "layout"
  // escape hatch: an arbitrary layout-tree node for content that doesn't fit
  // the fixed keyAttributes/sections field shape (criteria lists, RAG-tier
  // card groups, etc.). At least one of dataBinding/keyAttributes/sections/
  // layout is required overall.
  const hasSections = Array.isArray(def.sections) && def.sections.length > 0;
  const hasLayout = def.layout && typeof def.layout === "object";

  if (!hasSections && !hasLayout && !hasKeyAttributes && !hasDataBinding) {
    errors.push('at least one of "dataBinding", "keyAttributes", "sections", or "layout" is required for a record-view');
  }

  if (hasSections) {
    def.sections.forEach((section, si) => {
      const sc = `sections[${si}] ("${section.label || "?"}")`;
      if (!section.label) errors.push(`${sc}: "label" is required`);
      if (!Array.isArray(section.fields) || section.fields.length === 0) {
        errors.push(`${sc}: "fields" must be a non-empty array`);
      } else {
        section.fields.forEach((field, fi) => validateField(field, `${sc}.fields[${fi}]`));
      }
    });
  }

  if (hasLayout) {
    validateLayoutTreeNode(def.layout, "layout", errors);
    if (def.layoutLabel !== undefined && typeof def.layoutLabel !== "string") {
      errors.push('"layoutLabel" must be a string when present');
    }
    // Cross-check every itemList leaf's "collectionRef" against
    // dataBinding.relatedRecordData[].localName — layout-tree.js's own
    // validateNode has no dataBinding context to do this itself (same
    // reason fieldRef cross-checking happens here rather than per-field).
    validateLayoutTreeCollectionRefs(def.layout, "layout", def.dataBinding, errors);
    // Cross-check: recordActionField leaves require a record-backed definition.
    const isRecordBacked = !!def.dataBinding || !!def.dataSource;
    validateLayoutTreeRecordActions(def.layout, "layout", isRecordBacked, errors);
  } else if (def.layoutLabel !== undefined) {
    errors.push('"layoutLabel" requires "layout" to be present');
  }
}

/**
 * Recursively walk a layout-tree node looking for "itemList" leaves that set
 * "collectionRef", and verify each one resolves to a
 * dataBinding.relatedRecordData[].localName. A collectionRef that doesn't
 * resolve would otherwise pass layout-tree.js's own (dataBinding-agnostic)
 * validation and only fail — or silently render a TODO — at render time.
 */
function validateLayoutTreeCollectionRefs(node, context, dataBinding, errors) {
  if (!node || typeof node !== "object") return;
  if (node.layout) {
    (node.items || []).forEach((item, ii) => validateLayoutTreeCollectionRefs(item, `${context}.items[${ii}]`, dataBinding, errors));
    return;
  }
  if (node.leaf === "itemList" && node.collectionRef !== undefined) {
    const relatedRecordData = (dataBinding && dataBinding.relatedRecordData) || [];
    const found = relatedRecordData.some((rrd) => rrd && rrd.localName === node.collectionRef);
    if (!dataBinding) {
      errors.push(`${context}.collectionRef: requires "dataBinding" to be present on this definition — there is nothing queried to bind to`);
    } else if (!found) {
      errors.push(`${context}.collectionRef: "${node.collectionRef}" does not match any dataBinding.relatedRecordData[].localName`);
    }
  }
}

/**
 * Cross-check: "recordActionField" leaves require a record-backed definition.
 * a!recordActionField renders real recordType!{uuid}.actions.key references —
 * it cannot appear in mockup definitions that have no dataBinding/dataSource.
 * Recurses through layout-tree nodes to find offending leaves.
 */
function validateLayoutTreeRecordActions(node, context, isRecordBacked, errors) {
  if (!node || typeof node !== "object") return;
  if (node.layout) {
    (node.items || []).forEach((item, ii) => validateLayoutTreeRecordActions(item, `${context}.items[${ii}]`, isRecordBacked, errors));
    return;
  }
  if (node.leaf === "recordActionField") {
    if (!isRecordBacked) {
      errors.push(`${context}: "recordActionField" requires a record-backed definition (dataBinding or dataSource must be present) — a!recordActionField references real record type actions and cannot work in mockup/non-live definitions`);
    }
  }
}

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------
const VALID_TYPES = [
  "text", "email", "phone", "number", "decimal",
  "paragraph", "richtext",
  "date", "datetime", "time",
  "dropdown", "multipleDropdown", "radio", "checkbox", "cardchoice",
  "boolean", "toggle",
  "fileupload", "userpicker", "grouppicker",
  "encrypted",
];

// Types that must always be single-field rows (can't share a row)
const SOLO_TYPES = new Set(["richtext"]);

const TOP_LEVEL_TYPES = ["form", "wizard", "grid", "dashboard", "record-view", "component", "pane", "layout"];

/**
 * "layout" — a standalone layout-tree node with no page framing. The general
 * form of "component" (which is scoped to exactly one grid/chart/kpis
 * section): here "root" can be any container/leaf node, arbitrarily nested
 * (columns of cardGroups of "card" containers, tabs containing grids, etc.).
 * Use this when a request decomposes into a shape ("3 cards side by side",
 * "a card group of tiered cards") that isn't a single bare leaf.
 */
function validateLayoutDefinition(def, errors) {
  if (!def.root || typeof def.root !== "object") {
    errors.push('"root" (a layout-tree node) is required for a layout definition');
    return;
  }
  validateLayoutTreeNode(def.root, "root", errors);
  // Layout-type definitions are never record-backed — reject recordActionField leaves.
  validateLayoutTreeRecordActions(def.root, "root", false, errors);
}

/**
 * Cross-check fieldRef and lookupRef on a form/wizard field against the dataBinding.
 * Called per-field during form/wizard validation when dataBinding is present.
 */
function validateFieldRefAndLookupRef(field, context, hasDataBinding, validFieldRefs, validLookupRefs, errors) {
  if (field.fieldRef !== undefined) {
    if (typeof field.fieldRef !== "string" || !field.fieldRef) {
      errors.push(`${context}.fieldRef: must be a non-empty string`);
    } else if (!hasDataBinding) {
      errors.push(`${context}.fieldRef: requires "dataBinding" to be present on this definition`);
    } else if (!validFieldRefs.has(field.fieldRef)) {
      errors.push(`${context}.fieldRef: "${field.fieldRef}" does not match any entry in dataBinding.fields or dataBinding.relatedFields[].field`);
    }
  }
  if (field.lookupRef !== undefined) {
    if (typeof field.lookupRef !== "string" || !field.lookupRef) {
      errors.push(`${context}.lookupRef: must be a non-empty string`);
    } else if (!hasDataBinding) {
      errors.push(`${context}.lookupRef: requires "dataBinding" to be present on this definition`);
    } else if (!validLookupRefs.has(field.lookupRef)) {
      errors.push(`${context}.lookupRef: "${field.lookupRef}" does not match any dataBinding.lookups[].localName`);
    }
    // lookupRef is only valid on dropdown (or radio) type fields
    if (field.type && !["dropdown", "radio"].includes(field.type)) {
      errors.push(`${context}.lookupRef: only valid on "dropdown" or "radio" type fields, got type "${field.type}"`);
    }
  }
  // When lookupRef is present, choices are not required
  if (field.lookupRef && ["dropdown", "radio", "cardchoice", "checkbox"].includes(field.type)) {
    // Override the existing validation error for missing choices — it's fine
    // This is handled implicitly because validateRows checks choices before us,
    // so we need to relax that. Actually we handle this by modifying validateRows below.
  }
}

function validateDefinition(def) {
  const errors = [];

  if (!def.type || !TOP_LEVEL_TYPES.includes(def.type)) {
    errors.push(`"type" must be one of [${TOP_LEVEL_TYPES.join(", ")}], got: ${JSON.stringify(def.type)}`);
  }
  if (!def.title || typeof def.title !== "string") {
    errors.push('"title" is required and must be a string');
  }
  // "dashboard", "component", "pane", and "layout" don't need a singular entity noun — every other type does.
  const NO_ENTITY_NAME_TYPES = ["dashboard", "component", "pane", "layout"];
  if (!NO_ENTITY_NAME_TYPES.includes(def.type) && (!def.entityName || typeof def.entityName !== "string")) {
    errors.push('"entityName" is required and must be a string');
  }

  function validateRows(rows, context) {
    if (!Array.isArray(rows)) {
      errors.push(`${context}: "rows" must be an array`);
      return;
    }
    rows.forEach((row, ri) => {
      if (!Array.isArray(row.fields) || row.fields.length === 0) {
        errors.push(`${context} row[${ri}]: "fields" must be a non-empty array`);
        return;
      }
      // Check solo-type fields aren't sharing a row
      if (row.fields.length > 1) {
        row.fields.forEach((field, fi) => {
          if (SOLO_TYPES.has(field.type)) {
            errors.push(`${context} row[${ri}].fields[${fi}]: type "${field.type}" must be the only field in its row`);
          }
        });
      }
      row.fields.forEach((field, fi) => {
        const fc = `${context} row[${ri}].fields[${fi}]`;
        if (!field.name || !/^[a-zA-Z][a-zA-Z0-9]*$/.test(field.name)) {
          errors.push(`${fc}: "name" must be a camelCase identifier, got: ${JSON.stringify(field.name)}`);
        }
        if (!field.label) errors.push(`${fc}: "label" is required`);
        if (!VALID_TYPES.includes(field.type)) {
          errors.push(`${fc}: "type" must be one of [${VALID_TYPES.join(", ")}], got: ${JSON.stringify(field.type)}`);
        }
        if (["dropdown", "radio", "cardchoice", "checkbox"].includes(field.type)) {
          // When lookupRef is present, choices come from the query — not required in JSON
          if (!field.lookupRef) {
            if (!Array.isArray(field.choices) || field.choices.length === 0) {
              errors.push(`${fc}: type "${field.type}" requires non-empty "choices" array (or "lookupRef" for live data forms)`);
            } else {
              field.choices.forEach((c, ci) => {
                if (!c.label || c.value === undefined || c.value === null || c.value === "") {
                  errors.push(`${fc} choices[${ci}]: each choice needs non-empty "label" and "value"`);
                }
              });
            }
          }
        }
        if (typeof field.width !== "undefined" && (typeof field.width !== "number" || field.width < 1 || field.width > 10)) {
          errors.push(`${fc}: "width" must be a number 1-10, got: ${JSON.stringify(field.width)}`);
        }
      });
    });
  }

  if (def.type === "wizard") {
    // Validate dataBinding if present (live wizard)
    const hasFormDataBinding = def.dataBinding && typeof def.dataBinding === "object";
    if (hasFormDataBinding) {
      validateFormWizardDataBinding(def.dataBinding, errors);
    }
    const wizardFieldRefs = hasFormDataBinding ? collectFormDataBindingFieldRefs(def.dataBinding) : null;
    const wizardLookupRefs = hasFormDataBinding ? collectFormLookupRefs(def.dataBinding) : null;

    if (!Array.isArray(def.steps) || def.steps.length < 2) {
      errors.push('"steps" must be an array with at least 2 steps for a wizard');
    } else {
      def.steps.forEach((step, si) => {
        const sc = `steps[${si}] ("${step.label || "?"}")`;
        if (!step.label) errors.push(`${sc}: "label" is required`);
        validateRows(step.rows || [], sc);
        // Cross-check fieldRef/lookupRef on each field when dataBinding present
        if (hasFormDataBinding && Array.isArray(step.rows)) {
          step.rows.forEach((row, ri) => {
            (row.fields || []).forEach((field, fi) => {
              const fc = `${sc} row[${ri}].fields[${fi}]`;
              validateFieldRefAndLookupRef(field, fc, hasFormDataBinding, wizardFieldRefs, wizardLookupRefs, errors);
            });
          });
        }
      });
    }
  }

  if (def.type === "form") {
    // Validate dataBinding if present (live form)
    const hasFormDataBinding = def.dataBinding && typeof def.dataBinding === "object";
    if (hasFormDataBinding) {
      validateFormWizardDataBinding(def.dataBinding, errors);
    }
    const formFieldRefs = hasFormDataBinding ? collectFormDataBindingFieldRefs(def.dataBinding) : null;
    const formLookupRefs = hasFormDataBinding ? collectFormLookupRefs(def.dataBinding) : null;

    if (!Array.isArray(def.sections) || def.sections.length === 0) {
      errors.push('"sections" must be a non-empty array for a form');
    } else {
      def.sections.forEach((section, si) => {
        const sc = `sections[${si}] ("${section.label || "?"}")`;
        if (!section.label) errors.push(`${sc}: "label" is required`);
        validateRows(section.rows || [], sc);
        // Cross-check fieldRef/lookupRef on each field when dataBinding present
        if (hasFormDataBinding && Array.isArray(section.rows)) {
          section.rows.forEach((row, ri) => {
            (row.fields || []).forEach((field, fi) => {
              const fc = `${sc} row[${ri}].fields[${fi}]`;
              validateFieldRefAndLookupRef(field, fc, hasFormDataBinding, formFieldRefs, formLookupRefs, errors);
            });
          });
        }
      });
    }
  }

  if (def.type === "grid") {
    validateGridDefinition(def, errors);
  }

  if (def.type === "dashboard") {
    validateDashboardDefinition(def, errors);
  }

  if (def.type === "record-view") {
    validateRecordViewDefinition(def, errors);
  }

  if (def.type === "component") {
    validateComponentDefinition(def, errors);
  }

  if (def.type === "pane") {
    validatePaneDefinition(def, errors);
  }

  if (def.type === "layout") {
    validateLayoutDefinition(def, errors);
  }

  validateIcon(def.headerIcon, "headerIcon", errors);
  validateHeaderKind(def, errors);

  // Optional theme overrides — all values must be valid hex colors
  if (def.theme != null) {
    if (typeof def.theme !== "object" || Array.isArray(def.theme)) {
      errors.push('"theme" must be an object (or omitted)');
    } else {
      const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
      const VALID_THEME_KEYS = [
        "headerBg", "pageBg", "cardBg",
        "titleColor", "subtitleColor",
        "kpiLabelColor", "kpiValueColor", "kpiSubColor",
        "chartAccent", "stampBg", "stampContent",
      ];
      const VALID_THEME_ARRAY_KEYS = ["kpiColors", "piePalette"];
      for (const [key, value] of Object.entries(def.theme)) {
        if (VALID_THEME_ARRAY_KEYS.includes(key)) {
          if (!Array.isArray(value) || value.length === 0) {
            errors.push(`theme.${key}: must be a non-empty array of hex colors`);
          } else {
            value.forEach((v, idx) => {
              if (!HEX_RE.test(v)) {
                errors.push(`theme.${key}[${idx}]: must be a hex color (#RRGGBB), got: ${JSON.stringify(v)}`);
              }
            });
          }
        } else if (VALID_THEME_KEYS.includes(key)) {
          if (!HEX_RE.test(value)) {
            errors.push(`theme.${key}: must be a hex color (#RRGGBB), got: ${JSON.stringify(value)}`);
          }
        } else {
          errors.push(`theme.${key}: unknown theme key. Valid keys: ${[...VALID_THEME_KEYS, ...VALID_THEME_ARRAY_KEYS].join(", ")}`);
        }
      }
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// headerKind — the page-frame header-style intent (grid/dashboard/record-view/layout).
// The generator's page-frame renderer emits the SAIL; the LLM just picks a
// style. BILLBOARD requires a headerImage; the others ignore it. On a "layout"
// it opts the fragment into the shared page frame (see templates/layout.js).
// ---------------------------------------------------------------------------
const HEADER_KIND_TYPES = ["grid", "dashboard", "record-view", "layout"];
const HEADER_KINDS = ["PLAIN_CARD", "HERO", "BILLBOARD", "NONE"];

function validateHeaderKind(def, errors) {
  if (def.headerKind === undefined) return;
  if (!HEADER_KIND_TYPES.includes(def.type)) {
    errors.push(`"headerKind" only applies to [${HEADER_KIND_TYPES.join(", ")}] pages, not "${def.type}"`);
    return;
  }
  if (!HEADER_KINDS.includes(def.headerKind)) {
    errors.push(`"headerKind" must be one of [${HEADER_KINDS.join(", ")}], got: ${JSON.stringify(def.headerKind)}`);
    return;
  }
  if (def.headerKind === "BILLBOARD" && (!def.headerImage || typeof def.headerImage !== "string")) {
    errors.push('"headerKind": "BILLBOARD" requires a "headerImage" (image URL string) for the a!billboardLayout background.');
  }
}

// ---------------------------------------------------------------------------
// Skeleton detection — a definition with step/section labels but no rows yet
// ---------------------------------------------------------------------------
function hasAnyFields(def) {
  const groups = def.sections || def.steps || [];
  return groups.some((g) => Array.isArray(g.rows) && g.rows.some((r) => Array.isArray(r.fields) && r.fields.length > 0));
}

/**
 * Dashboard skeleton detection — sections have type+label but no data content.
 * A skeleton dashboard section has "skeleton": true or lacks required data fields.
 */
function isDashboardSkeleton(def) {
  if (def.type !== "dashboard" || !Array.isArray(def.sections)) return false;
  return def.sections.every((s) => s.skeleton === true);
}

/**
 * Pane skeleton detection — every pane's content has "skeleton": true.
 */
function isPaneSkeleton(def) {
  if (def.type !== "pane" || !Array.isArray(def.panes)) return false;
  return def.panes.every((p) => p.content && p.content.skeleton === true);
}

/** Grid/record-view skeleton detection — top-level "skeleton": true flag. */
function isFlagSkeleton(def) {
  return (def.type === "grid" || def.type === "record-view") && def.skeleton === true;
}

/** Component skeleton detection — the single section has "skeleton": true. */
function isComponentSkeleton(def) {
  return def.type === "component" && def.section && def.section.skeleton === true;
}

/** Layout skeleton detection — the root node has "skeleton": true. */
function isLayoutSkeleton(def) {
  return def.type === "layout" && def.root && def.root.skeleton === true;
}

/**
 * Record-view "layout" escape hatch skeleton detection — a record-view whose
 * top-level layout node (if present) is a skeleton. Non-layout record-views
 * fall through to isFlagSkeleton.
 */
function isRecordViewLayoutSkeleton(def) {
  return def.type === "record-view" && def.layout && def.layout.skeleton === true && !def.sections;
}

// ---------------------------------------------------------------------------
// File paths
// ---------------------------------------------------------------------------
function definitionPath(uuid) {
  const { outputDir } = require("./output-dir");
  return path.join(outputDir(uuid), "definition.json");
}

// ---------------------------------------------------------------------------
// Exports — deliberately placed BEFORE the CLI dispatch block below. Some
// validators (validateLayoutTreeNode) lazily `require("./define")` from
// layout-tree.js at validation time. If this module is invoked as a CLI
// script (require.main === module) and a lazy require happens synchronously
// during that same run (e.g. --write triggers validateDefinition immediately),
// the require cache entry must already have its exports populated — otherwise
// the lazy require sees an empty {} and every export looks like "undefined".
// ---------------------------------------------------------------------------
module.exports = {
  validateDefinition,
  weightToSailWidth,
  definitionPath,
  isDashboardSkeleton,
  isPaneSkeleton,
  isFlagSkeleton,
  isComponentSkeleton,
  isLayoutSkeleton,
  isRecordViewLayoutSkeleton,
  SOLO_TYPES,
  isValidTagColor,
  GRID_COLUMN_TYPES,
  GRID_WIDTHS,
  GRID_ALIGNS,
  TAG_COLORS,
  CHART_TYPES,
  RECORD_VIEW_FIELD_TYPES,
  COMPONENT_TYPES,
  PANE_WIDTHS,
  PANE_CONTENT_TYPES,
  // Shared leaf-level validators — reused by layout-tree.js so grid/chart/kpis
  // leaves inside an arbitrary layout tree are validated identically to their
  // dashboard-section counterparts (single source of truth for the rules).
  validateGridColumnsAndRows,
  validateKpisItems,
  validateChartFields,
  validateIcon,
  validateLayoutTreeNode,
  validateDataBindingBlock,
  validateItemFieldsMapping,
  validateFormWizardDataBinding,
  collectFormDataBindingFieldRefs,
  collectFormLookupRefs,
};

// ---------------------------------------------------------------------------
// CLI dispatch
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

// Parse --output-dir if provided (can appear anywhere before the command)
let filteredArgs = [...args];
const outputDirIdx = filteredArgs.indexOf("--output-dir");
if (outputDirIdx !== -1 && filteredArgs[outputDirIdx + 1]) {
  const { setOutputRoot } = require("./output-dir");
  setOutputRoot(filteredArgs[outputDirIdx + 1]);
  filteredArgs.splice(outputDirIdx, 2);
}

const command = filteredArgs[0];

if (command === "--write") {
  const uuid = filteredArgs[1];
  // JSON source: prefer --file <path> (robust — no shell escaping). Fall back to
  // an inline '<json>' 3rd positional arg for backward compatibility.
  const fileIdx = filteredArgs.indexOf("--file");
  let jsonStr;
  if (fileIdx !== -1) {
    const filePath = filteredArgs[fileIdx + 1];
    if (!filePath) {
      console.error("Usage: node generator/define.js [--output-dir <path>] --write <uuid> --file <path>");
      process.exit(1);
    }
    try {
      jsonStr = fs.readFileSync(filePath, "utf-8");
    } catch (e) {
      console.error(`Cannot read definition file '${filePath}': ${e.message}`);
      process.exit(1);
    }
  } else {
    jsonStr = filteredArgs[2];
  }
  if (!uuid || !jsonStr) {
    console.error("Usage: node generator/define.js [--output-dir <path>] --write <uuid> (--file <path> | '<json>')");
    process.exit(1);
  }
  let def;
  try {
    def = JSON.parse(jsonStr);
  } catch (e) {
    console.error(`JSON parse error: ${e.message}`);
    process.exit(1);
  }
  const errs = validateDefinition(def);
  if (errs.length > 0) {
    console.error("❌ Definition validation failed:");
    errs.forEach(e => console.error(`   • ${e}`));
    process.exit(1);
  }
  const { outputDir } = require("./output-dir");
  const outDir = outputDir(uuid);
  const fp = definitionPath(uuid);
  fs.writeFileSync(fp, JSON.stringify(def, null, 2), "utf-8");
  // Point-in-time checkpoint: this authoring pass is done. "skeleton" (labels only,
  // no rows) vs "full" (rows/fields present) lets the timing report show how much
  // of Pass 1 was the cheap skeleton call vs the full field-level authoring call.
  const stage = ((def.type === "form" || def.type === "wizard") && !hasAnyFields(def))
    || isDashboardSkeleton(def)
    || isPaneSkeleton(def)
    || isFlagSkeleton(def)
    || isComponentSkeleton(def)
    || isLayoutSkeleton(def)
    || isRecordViewLayoutSkeleton(def)
    ? "skeleton" : "full";
  tryRecordEvent(uuid, `definition:${stage}`, "written", def.type);
  console.log(JSON.stringify({ ok: true, uuid, path: fp, type: def.type, title: def.title }));

} else if (command === "--validate") {
  const uuid = filteredArgs[1];
  if (!uuid) { console.error("Usage: node generator/define.js --validate <uuid>"); process.exit(1); }
  const fp = definitionPath(uuid);
  if (!fs.existsSync(fp)) { console.error(`No definition found at ${fp}`); process.exit(1); }
  let def;
  try { def = JSON.parse(fs.readFileSync(fp, "utf-8")); } catch (e) { console.error(`JSON parse error: ${e.message}`); process.exit(1); }
  const errs = validateDefinition(def);
  if (errs.length > 0) {
    console.error("❌ Definition validation failed:");
    errs.forEach(e => console.error(`   • ${e}`));
    process.exit(1);
  }
  console.log(`✅ Definition valid — ${def.type}: "${def.title}"`);

} else if (command === "--schema") {
  const doc = fs.readFileSync(__filename, "utf-8");
  const start = doc.indexOf("* DEFINITION SCHEMA");
  const end = doc.indexOf("* USAGE\n");
  console.log(doc.slice(start, end).replace(/^ \* ?/gm, "").trim());

} else if (require.main === module) {
  console.log(`
define.js — UI Definition writer (Pass 1 of 2-pass generation)

Commands:
  node generator/define.js --write <uuid> --file <path>  Write + validate a definition JSON (preferred)
  node generator/define.js --write <uuid> '<json>'       Same, but inline JSON (fragile — avoid)
  node generator/define.js --validate <uuid>             Validate existing definition.json
  node generator/define.js --schema                      Print the definition JSON schema

Prefer --file: write the JSON to a file, then pass its path. Inline JSON breaks
on any quote, $, backtick, backslash, or newline in the content.

The LLM writes definition.json, scaffold.js reads it.
See file header for full schema documentation.
`);
}
