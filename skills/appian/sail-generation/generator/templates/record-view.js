/**
 * templates/record-view.js
 *
 * Generates a structurally valid SAIL record summary view scaffold:
 *  - Header with record name + Edit button (right-justified)
 *  - Key attributes as a card group (small label, large value)
 *  - One or more detail sections as cards with fields in 2-column rows
 *
 * Passes the validator: valid icons, correct column widths, AUTO present, etc.
 */

const { toLocalVar, toCamelCase } = require("../shared");
const { toSailValue, renderTagColorExpr } = require("./grid");
const { renderPageFrame } = require("../page-frame");
const layoutTree = require("../layout-tree");
const { resolveTheme } = require("../theme");
// Ensure grid/chart/kpis leaves are registered for the "layout" escape hatch.
require("./dashboard");

// =============================================================================
// Query_Prologue naming helpers (Requirement 4.1)
// =============================================================================
// Entity-derived local! variable names used by the Query_Prologue renderer
// (tasks 4.2+). These are pure naming helpers only — no rendering or
// query-prologue logic lives here yet.

/** "Ticket" -> "local!ticketId", "Part Supplier" -> "local!partSupplierId" */
function entityIdVar(entityName) {
  return "local!" + toCamelCase(entityName) + "Id";
}

/** "Ticket" -> "local!ticket", "Part Supplier" -> "local!partSupplier" */
function entityRecordVar(entityName) {
  return "local!" + toCamelCase(entityName);
}

// =============================================================================
// Identifier local! rendering (Requirements 4.1, 4.9)
// =============================================================================
// Renders the identifier local! declaration line(s) for both shapes of
// dataBinding.identifier — a string (single PK) or an array of {field, value}
// pairs (composite PK) — plus the reusable record-constructor builder and the
// identifierExpr helper that task 5.3 uses to fill in a!queryRecordByIdentifier's
// `identifier:` parameter. Pure functions only — not yet wired into
// renderFromDefinition (that happens in task 8.2).
//
// SAIL string literals use single quotes ('...'), never JSON.stringify (which
// produces double quotes) — every field/relationship reference and record type
// below is wrapped in a bare single-quoted string.

/**
 * Render the identifier local! declaration line.
 *  - String identifier (single PK): local!{entity}Id: a!defaultValue(ri!record['{identifier}'], null)
 *  - Array identifier (composite PK): local!{entity}Id: a!defaultValue(ri!record, null) —
 *    a null-guard on ri!record's own presence, since there's no single PK field to
 *    index into (the composite-PK value itself is only used later as the
 *    `identifier:` query parameter, via renderIdentifierExpr/renderRecordConstructor).
 */
function renderIdentifierLocal(dataBinding, entityName, indent) {
  const i = indent;
  const idVar = entityIdVar(entityName);
  const { identifier } = dataBinding;

  if (Array.isArray(identifier)) {
    return `${i}${idVar}: a!defaultValue(ri!record, null)`;
  }
  return `${i}${idVar}: a!defaultValue(ri!record['${identifier}'], null)`;
}

/**
 * Render a record-constructor expression: '{recordType}'( '{field1}': {value1}, ... )
 * Used as the composite-PK form of the `identifier:` parameter passed to
 * a!queryRecordByIdentifier() — never a bare map or a!map(). recordType and each
 * pair's field key are wrapped in bare single quotes manually (not via
 * toSailValue/JSON.stringify, since those produce double-quoted or differently
 * formatted output for strings); each pair's value is rendered via toSailValue.
 */
function renderRecordConstructor(recordType, pairs, indent) {
  const i = indent;
  const body = pairs
    .map((p) => `${i}  '${p.field}': ${toSailValue(p.value)}`)
    .join(",\n");
  return `'${recordType}'(\n${body}\n${i})`;
}

/**
 * Render the expression to pass as the `identifier:` parameter of the eventual
 * a!queryRecordByIdentifier() call (task 5.3 calls this directly instead of
 * re-deriving the branching logic):
 *  - String identifier (single PK) -> the identifier local!'s var name.
 *  - Array identifier (composite PK) -> the record-constructor form.
 */
function renderIdentifierExpr(dataBinding, entityName, indent) {
  const { identifier, recordType } = dataBinding;
  if (Array.isArray(identifier)) {
    return renderRecordConstructor(recordType, identifier, indent);
  }
  return entityIdVar(entityName);
}

// =============================================================================
// fields: block rendering (Requirements 4.3, 9.2)
// =============================================================================
// Renders the inner, comma-joined contents of the eventual `fields: { ... }`
// parameter of the a!queryRecordByIdentifier() call — task 5.3 wraps this in
// the `fields: { ... }` syntax and decides overall indentation/assembly. Each
// dataBinding.fields entry is either a plain field-reference string, or a
// relationship-qualified object { relationship, field, localName } — for the
// latter, only `.field` (the full relationship-qualified path) is used, NEVER
// `.relationship`, so many-to-one lookups render inside `fields`, not inside
// `relatedRecordData`. Every reference is wrapped in single quotes, never
// JSON.stringify (double quotes).

/**
 * Render the inner contents of the `fields: { ... }` block from
 * dataBinding.fields.
 *  - Plain string entry -> '{entry}'
 *  - Relationship-qualified object entry -> '{entry.field}' (never .relationship)
 * Returns the comma-and-newline-joined field reference lines only (no
 * `fields: {` / `}` wrapper — task 5.3 assembles the full call).
 */
function renderFieldsBlock(fields, indent) {
  const i = indent;
  return fields
    .map((f) => (typeof f === "string" ? `${i}'${f}'` : `${i}'${f.field}'`))
    .join(",\n");
}

// -----------------------------------------------------------------------------
// Related-field qualification (Requirement 4.4/9.3 correction)
// -----------------------------------------------------------------------------
// a!relatedRecordData() has no `fields` parameter (relationship/limit/sort/
// filters only, per Appian docs) — related-record fields must instead be
// requested in the OUTER query's `fields: { ... }` block, qualified from the
// base record type through the relationship, e.g.
//   '{baseRecordType}.relationships.{uuid}ticketComments.fields.{uuid}comment'
// dataBinding.relatedRecordData[].fields entries are given as plain
// related-record-type-qualified references (e.g.
// 'recordType!{uuid}ITSM Ticket Comment.fields.{uuid}comment') — this helper
// re-qualifies each one under the relationship path by swapping everything
// before ".fields." for the relationship reference.

/**
 * Re-qualify a plain related-record-type field reference under a
 * relationship path: '{relationship}.fields.{suffix}', where {suffix} is
 * everything after the FIRST ".fields." in the plain reference.
 */
function qualifyRelatedField(relationship, plainFieldRef) {
  const idx = plainFieldRef.indexOf(".fields.");
  const suffix = idx === -1 ? plainFieldRef : plainFieldRef.slice(idx + ".fields.".length);
  return `${relationship}.fields.${suffix}`;
}

/**
 * Collect every relationship-qualified related field (from
 * dataBinding.relatedRecordData[].fields) that needs to be added to the
 * outer query's fields: block, since a!relatedRecordData() itself cannot
 * select fields.
 */
function collectRelatedQualifiedFields(relatedRecordData) {
  if (!Array.isArray(relatedRecordData)) return [];
  const out = [];
  for (const rrd of relatedRecordData) {
    if (!Array.isArray(rrd.fields)) continue;
    for (const f of rrd.fields) {
      out.push(qualifyRelatedField(rrd.relationship, f));
    }
  }
  return out;
}

// =============================================================================
// relatedRecordData: block rendering (Requirements 4.4, 9.3)
// =============================================================================
// Renders the FULL comma-joined set of a!relatedRecordData(...) calls (each
// one complete, including its own wrapper) from dataBinding.relatedRecordData
// — unlike renderFieldsBlock, which returns only inner contents. Task 5.3
// wraps this whole string in `relatedRecordData: { ... }`. Follows the
// function's real parameter list (relationship, limit, sort, filters) —
// a!relatedRecordData() has NO `fields` parameter; related-record fields are
// requested via the outer query's `fields:` block instead (see
// qualifyRelatedField/collectRelatedQualifiedFields above), never here:
//  - relationship: always single-quoted
//  - limit: bare number, never quoted
//  - sort: rendered as a!sortInfo(...) only when the entry declares a sort
//    configuration; sort.field is passed through verbatim (single-quoted),
//    with no record-type verification at render time (Req 9.3 — that
//    verification is the agent's responsibility, not the renderer's)
// localName, fields, and itemFields on each entry are ignored here — fields
// is folded into the outer query above, localName/itemFields are used by
// later tasks (7.x) for local! bindings and per-item card rendering.

/**
 * Render the full, comma-joined set of a!relatedRecordData(...) calls from
 * dataBinding.relatedRecordData.
 */
function renderRelatedRecordDataBlock(relatedRecordData, indent) {
  const i = indent;
  return relatedRecordData
    .map((rrd) => {
      const lines = [`${i}a!relatedRecordData(`];
      lines.push(`${i}  relationship: '${rrd.relationship}',`);
      lines.push(`${i}  limit: ${rrd.limit}${rrd.sort ? "," : ""}`);
      if (rrd.sort) {
        lines.push(`${i}  sort: a!sortInfo(`);
        lines.push(`${i}    field: '${rrd.sort.field}',`);
        lines.push(`${i}    ascending: ${rrd.sort.ascending}`);
        lines.push(`${i}  )`);
      }
      lines.push(`${i})`);
      return lines.join("\n");
    })
    .join(",\n");
}

// =============================================================================
// Null-guarded record local! wrapper (Requirements 4.2, 9.1, 9.2)
// =============================================================================
// Composes the record local! declaration:
//   local!{entity}: if(
//     a!isNotNullOrEmpty(local!{entity}Id),
//     a!queryRecordByIdentifier(
//       recordType: '{recordType}',
//       identifier: {identifierExpr},
//       fields: { ... }[,
//       relatedRecordData: { ... }]
//     ),
//     null
//   )
// Reuses renderIdentifierExpr/renderFieldsBlock/renderRelatedRecordDataBlock
// (tasks 4.2/5.1/5.2) — this function only assembles them into the exact
// shape from design.md's renderQueryPrologue pseudocode. Never emits
// `a!queryRecordType(` anywhere. The `relatedRecordData:` parameter is
// omitted entirely (not `{}`/`null`) when dataBinding.relatedRecordData is
// absent or empty, matching a!relatedRecordData's optional-parameter style
// already used by renderRelatedRecordDataBlock.

/**
 * Render the record local! declaration:
 * local!{entity}: if(a!isNotNullOrEmpty(local!{entity}Id),
 *   a!queryRecordByIdentifier(recordType: '...', identifier: ..., fields: {...}[, relatedRecordData: {...}]),
 *   null)
 */
function renderRecordLocal(dataBinding, entityName, indent) {
  const i = indent;
  const idVar = entityIdVar(entityName);
  const recordVar = entityRecordVar(entityName);
  const { recordType, relatedRecordData } = dataBinding;

  const identifierExpr = renderIdentifierExpr(dataBinding, entityName, i + "    ");
  const relatedQualifiedFields = collectRelatedQualifiedFields(relatedRecordData);
  const fieldsSail = [renderFieldsBlock(dataBinding.fields, i + "      "), renderFieldsBlock(relatedQualifiedFields, i + "      ")]
    .filter(Boolean)
    .join(",\n");
  const hasRelated = Array.isArray(relatedRecordData) && relatedRecordData.length > 0;

  const relatedRecordDataParam = hasRelated
    ? `,\n${i}    relatedRecordData: {\n${renderRelatedRecordDataBlock(relatedRecordData, i + "      ")}\n${i}    }`
    : "";

  return `${i}${recordVar}: if(
${i}  a!isNotNullOrEmpty(${idVar}),
${i}  a!queryRecordByIdentifier(
${i}    recordType: '${recordType}',
${i}    identifier: ${identifierExpr},
${i}    fields: {
${fieldsSail}
${i}    }${relatedRecordDataParam}
${i}  ),
${i}  null
${i})`;
}

// =============================================================================
// Per-relationship-field and per-relatedRecordData collection local! bindings
// (Requirements 4.5, 4.10)
// =============================================================================
// Renders the standalone local! declarations that give relationship-qualified
// fields and related-record-data collections short, ergonomic names for use
// elsewhere in the generated SAIL — mirroring
// local!statusLabel/local!priorityLabel/local!categoryLabel/local!comments in
// example-record-view-with-live-data.sail. Plain (non-relationship) fields are
// intentionally skipped: they stay inline as `{recordVar}['{field}']` at their
// point of use (Req 4.10) rather than getting a separate local!.

/**
 * Render one local! binding per relationship-qualified dataBinding.fields
 * entry, followed by one local! binding per dataBinding.relatedRecordData
 * entry:
 *  - local!{f.localName}: a!defaultValue({recordVar}['{f.field}'], "-")
 *  - local!{rrd.localName}: a!defaultValue({recordVar}['{rrd.relationship}'], {})
 * Returns an empty string when there are no relationship-qualified fields and
 * no relatedRecordData entries.
 */
function renderBindingLocals(dataBinding, entityName, indent) {
  const i = indent;
  const recordVar = entityRecordVar(entityName);
  const { fields, relatedRecordData } = dataBinding;

  const lines = [];

  for (const f of fields) {
    if (typeof f !== "string") {
      lines.push(`${i}local!${f.localName}: a!defaultValue(${recordVar}['${f.field}'], "-")`);
    }
  }

  if (Array.isArray(relatedRecordData)) {
    for (const rrd of relatedRecordData) {
      lines.push(`${i}local!${rrd.localName}: a!defaultValue(${recordVar}['${rrd.relationship}'], {})`);
    }
  }

  return lines.join("\n");
}

// =============================================================================
// Item_Fields_Mapping per-item value + card rendering (Requirements 3.8, 4.7, 9.5)
// =============================================================================
// Mechanically renders a single itemFields sub-value (title/text/avatarText/
// trailing) and, from a full itemFields object, the same
// a!cardLayout(a!sideBySideLayout(...)) shape that generator/layout-tree.js's
// "itemList" leaf render() already produces for its avatarText/title/text/
// trailing items (text avatarType / text trailingType variant) — the only
// difference being that values come from renderItemFieldValue
// (fv!item['<fieldRef>'] or a literal) instead of fv!item.avatarText/
// fv!item.title/etc. Never invents a new card shape.

/**
 * Render a single itemFields sub-value:
 *  - Well-formed Literal ({ literal: "..." }) -> toSailValue(v.literal)
 *  - Field_Ref string -> fv!item['<v>']
 */
function renderItemFieldValue(v) {
  if (v !== null && typeof v === "object" && typeof v.literal === "string") {
    return toSailValue(v.literal);
  }
  return `fv!item['${v}']`;
}

/**
 * Render one itemFields entry as a card, reusing the itemList leaf's
 * a!cardLayout(a!sideBySideLayout(...)) shape (text avatarType / text
 * trailingType variant) verbatim:
 *  - avatarItem: omitted entirely when itemFields.avatarText is absent;
 *    otherwise a!stampField with a fixed default backgroundColor "#3B82F6"
 *    (Item_Fields_Mapping has no avatarColor concept — no per-item rotation)
 *  - bodyItem: always present — two-line title/text a!richTextDisplayField
 *  - trailingItem: omitted entirely when itemFields.trailing is absent
 */
function renderItemFieldsCard(itemFields, indent) {
  const i = indent;
  const titleVal = renderItemFieldValue(itemFields.title);
  const textVal = renderItemFieldValue(itemFields.text);

  const avatarItem = itemFields.avatarText
    ? `${i}      a!sideBySideItem(
${i}        item: a!stampField(
${i}          text: ${renderItemFieldValue(itemFields.avatarText)},
${i}          backgroundColor: "#3B82F6",
${i}          contentColor: "#FFFFFF",
${i}          size: "TINY",
${i}          shape: "SEMI_ROUNDED",
${i}          labelPosition: "COLLAPSED"
${i}        ),
${i}        width: "MINIMIZE"
${i}      ),\n`
    : "";

  const bodyItem = `${i}      a!sideBySideItem(
${i}        item: a!richTextDisplayField(
${i}          labelPosition: "COLLAPSED",
${i}          value: {
${i}            a!richTextItem(text: ${titleVal}, style: "STRONG", size: "MEDIUM", color: "#262626"),
${i}            char(10),
${i}            a!richTextItem(text: ${textVal}, color: "#6B7280", size: "STANDARD")
${i}          }
${i}        ),
${i}        width: "AUTO"
${i}      )`;

  const trailingItem = itemFields.trailing
    ? `,\n${i}      a!sideBySideItem(
${i}        item: a!richTextDisplayField(
${i}          labelPosition: "COLLAPSED",
${i}          align: "RIGHT",
${i}          value: a!richTextItem(text: ${renderItemFieldValue(itemFields.trailing)}, color: "#9CA3AF", size: "SMALL")
${i}        ),
${i}        width: "MINIMIZE"
${i}      )`
    : "";

  return `${i}a!cardLayout(
${i}  contents: {
${i}    a!sideBySideLayout(
${i}      items: {
${avatarItem}${bodyItem}${trailingItem}
${i}      },
${i}      alignVertical: "TOP",
${i}      spacing: "STANDARD"
${i}    )
${i}  },
${i}  style: "#FFFFFF",
${i}  showBorder: true(),
${i}  padding: "STANDARD",
${i}  shape: "ROUNDED"
${i})`;
}

// =============================================================================
// Related-collection forEach + empty-state rendering (Requirements 4.6, 4.7, 4.8)
// =============================================================================
// Renders the if(isNotNullOrEmpty(...), forEach(...), <empty-state>) wrapper
// for a single relatedRecordData entry, branching on whether the entry
// declares itemFields (Item_Fields_Mapping):
//  - itemFields present -> the forEach's expression: is the mechanical card
//    from renderItemFieldsCard (Req 4.7) — no TODO-DATA-MODEL text anywhere.
//  - itemFields absent -> the forEach's expression: is the unchanged
//    TODO-DATA-MODEL fallback (Req 4.8), unchanged from before itemFields
//    existed.

/**
 * Render the if(isNotNullOrEmpty(local!{localName}), a!forEach(...), <empty-state>)
 * block for one relatedRecordData entry.
 */
function renderRelatedCollectionBlock(rrd, indent) {
  const i = indent;
  const v = `local!${rrd.localName}`;
  const itemExpr = rrd.itemFields
    ? renderItemFieldsCard(rrd.itemFields, `${i}    `)
    : `/* TODO-DATA-MODEL: render one ${rrd.relationship} record — no per-item field mapping declared */ fv!item`;

  return `${i}if(
${i}  a!isNotNullOrEmpty(${v}),
${i}  a!forEach(
${i}    items: ${v},
${i}    expression: ${itemExpr}
${i}  ),
${i}  a!richTextDisplayField(
${i}    labelPosition: "COLLAPSED",
${i}    value: a!richTextItem(text: "No ${rrd.localName} yet.", color: "SECONDARY")
${i}  )
${i})`;
}

// =============================================================================
// TODO_Comment fallback rendering (Requirement 6.4)
// =============================================================================
// Renders one `/* TODO-DATA-MODEL: {text} */` comment line per
// dataBinding.todos entry, per design.md's renderQueryPrologue pseudocode
// ("--- 5. TODO_Comment fallback (Req 6.4) ---"). These comments are meant
// to sit at the end of the local! declarations block — this function is
// standalone and does not wire itself into renderQueryPrologue (task 8.1
// appends its output last).

/**
 * Render one `/* TODO-DATA-MODEL: {text} *\/` comment line per
 * dataBinding.todos entry, newline-joined and indent-prefixed. Returns an
 * empty string when dataBinding.todos is absent or empty.
 */
function renderTodoComments(dataBinding, indent) {
  const i = indent;
  const todos = dataBinding.todos;
  if (!Array.isArray(todos) || todos.length === 0) {
    return "";
  }
  return todos.map((text) => `${i}/* TODO-DATA-MODEL: ${text} */`).join("\n");
}

// =============================================================================
// Query_Prologue composition (Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.9,
// 4.10, 6.4)
// =============================================================================
// Composes tasks 4/5/7's individual renderers into the FULL Query_Prologue
// local! declarations block, ready to be prepended to varDecls in
// renderFromDefinition (task 8.2 — not wired in here). Ordering matches
// example-record-view-with-live-data.sail: identifier -> record ->
// relationship bindings -> collection bindings -> TODO comments.
//
// Comma-joining decision: renderIdentifierLocal's output, renderRecordLocal's
// output, and EACH individual line of renderBindingLocals' output are all
// sibling local! declarations inside the eventual a!localVariables(...) call,
// so they need a trailing comma between them. renderBindingLocals (task 7.1)
// currently joins its own lines with a bare "\n" (no commas) — rather than
// changing that function's own contract, this composer splits its output on
// "\n" and re-joins every declaration (identifier, record, and each binding
// line) with ",\n". Since this function's own output is always followed by
// more content once wired into renderFromDefinition (either the existing
// keyAttributes/sections field-var decls, or the page body itself, per
// varDecls = [queryPrologueSail, fieldVarDecls, layoutVarDecls].filter(Boolean).join("\n")
// in design.md), the LAST local! declaration here also gets a trailing comma
// — mirroring how fieldVarDecls already terminates every one of its lines
// with a trailing comma today. TODO comments (renderTodoComments) are NOT
// local! declarations — they are placed after that trailing comma, with no
// comma of their own, since comments don't participate in the
// a!localVariables(...) argument-list comma structure.

/**
 * Compose the full Query_Prologue local! declarations block from a
 * dataBinding: identifier local! -> record local! -> per-relationship-field
 * and per-relatedRecordData-collection local! bindings -> TODO-DATA-MODEL
 * comments. Returns a string ending in a trailing comma after the last
 * local! declaration (ready to be prepended directly to varDecls), followed
 * by any TODO comments on their own line(s) with no comma.
 */
function renderQueryPrologue(dataBinding, entityName, indent) {
  const i = indent;
  const declLines = [renderIdentifierLocal(dataBinding, entityName, i), renderRecordLocal(dataBinding, entityName, i)];

  const bindingLocals = renderBindingLocals(dataBinding, entityName, i);
  if (bindingLocals) {
    declLines.push(...bindingLocals.split("\n"));
  }

  let result = declLines.join(",\n") + ",";

  const todoComments = renderTodoComments(dataBinding, i);
  if (todoComments) {
    result += "\n" + todoComments;
  }

  return result;
}

// =============================================================================
// fieldRef resolution — lets keyAttributes/sections fields display data the
// dataBinding Query_Prologue already queried, instead of only ever rendering
// a hardcoded mock literal. Mirrors the itemFields mechanism's "reference
// something already declared, resolve it mechanically" approach: the
// definition agent supplies a string that matches something it already put
// in dataBinding.fields/relatedRecordData, and this resolver — not the
// agent — decides how to turn that into a SAIL expression.
// =============================================================================

/**
 * True when fieldRef matches a relationship-qualified dataBinding.fields
 * entry's localName, or a relatedRecordData entry's localName — i.e.
 * something that already has its own local!{localName} binding from
 * renderBindingLocals, so resolution is just "local!" + fieldRef.
 */
function isLocalNameRef(fieldRef, dataBinding) {
  if (!dataBinding) return false;
  const fields = dataBinding.fields || [];
  for (const f of fields) {
    if (f && typeof f === "object" && f.localName === fieldRef) return true;
  }
  const relatedRecordData = dataBinding.relatedRecordData || [];
  for (const rrd of relatedRecordData) {
    if (rrd && rrd.localName === fieldRef) return true;
  }
  return false;
}

/**
 * Resolve a keyAttributes/sections field to the SAIL expression that should
 * stand in for its value:
 *  - No "fieldRef" (the existing mock path) -> the mock local! var name,
 *    unchanged (local!{toCamelCase(field.name)}).
 *  - "fieldRef" matching a relationship-qualified/related-collection
 *    localName -> "local!{fieldRef}" (already bound by renderBindingLocals).
 *  - "fieldRef" matching a plain field already listed in dataBinding.fields
 *    -> inline a!defaultValue({entity record local!}['{fieldRef}'], "-"),
 *    mirroring how plain fields are accessed everywhere else in the
 *    Query_Prologue (Req 4.10 — plain fields never get their own local!).
 */
function resolveFieldValueExpr(field, entityName, dataBinding) {
  if (!field.fieldRef) return toLocalVar(field.name);
  if (isLocalNameRef(field.fieldRef, dataBinding)) return `local!${field.fieldRef}`;
  return `a!defaultValue(${entityRecordVar(entityName)}['${field.fieldRef}'], "-")`;
}

// =============================================================================
// Key Attribute Cards (card group — label small, value large)
// =============================================================================

function renderKeyAttrCard(attr, indent, entityName, dataBinding) {
  const i = indent;
  const varName = resolveFieldValueExpr(attr, entityName, dataBinding);

  if (attr.tag) {
    return `${i}a!cardLayout(
${i}  contents: {
${i}    a!richTextDisplayField(
${i}      labelPosition: "COLLAPSED",
${i}      value: a!richTextItem(text: "${attr.label}", color: "#6B7280", size: "SMALL")
${i}    ),
${i}    a!tagField(
${i}      tags: a!tagItem(
${i}        text: ${varName},
${i}        backgroundColor: ${renderTagColorExpr(varName, attr.tagColors, i + "        ")}
${i}      ),
${i}      size: "STANDARD",
${i}      labelPosition: "COLLAPSED"
${i}    )
${i}  },
${i}  style: "#FFFFFF",
${i}  showBorder: true(),
${i}  padding: "STANDARD",
${i}  shape: "ROUNDED"
${i})`;
  }

  return `${i}a!cardLayout(
${i}  contents: {
${i}    a!richTextDisplayField(
${i}      labelPosition: "COLLAPSED",
${i}      value: {
${i}        a!richTextItem(text: "${attr.label}", color: "#6B7280", size: "SMALL"),
${i}        char(10),
${i}        a!richTextItem(
${i}          text: ${varName},
${i}          style: "STRONG",
${i}          size: "MEDIUM_PLUS",
${i}          color: "#262626"
${i}        )
${i}      }
${i}    )
${i}  },
${i}  style: "#FFFFFF",
${i}  showBorder: true(),
${i}  padding: "STANDARD",
${i}  shape: "ROUNDED"
${i})`;
}


// =============================================================================
// Section Field Rows (auto 2-column layout)
// =============================================================================

/**
 * Render a single field as a labeled display.
 * Uses the component's built-in label for justified label/value alignment.
 */
function renderFieldDisplay(field, indent, entityName, dataBinding) {
  const i = indent;
  const varName = resolveFieldValueExpr(field, entityName, dataBinding);

  if (field.tag) {
    return `${i}a!tagField(
${i}  label: "${field.label}",
${i}  tags: a!tagItem(
${i}    text: ${varName},
${i}    backgroundColor: ${renderTagColorExpr(varName, field.tagColors, i + "    ")}
${i}  ),
${i}  size: "SMALL"
${i})`;
  }

  return `${i}a!richTextDisplayField(
${i}  label: "${field.label}",
${i}  value: a!richTextItem(text: ${varName}, color: "#262626", size: "STANDARD")
${i})`;
}

/**
 * Render a paragraph/richtext field as a full-width section.
 */
function renderLongField(field, indent, entityName, dataBinding) {
  const i = indent;
  const varName = resolveFieldValueExpr(field, entityName, dataBinding);
  return `${i}a!sectionLayout(
${i}  label: "${field.label}",
${i}  labelColor: "STANDARD",
${i}  contents: {
${i}    a!richTextDisplayField(
${i}      labelPosition: "COLLAPSED",
${i}      value: a!richTextItem(text: ${varName}, color: "#262626", size: "STANDARD")
${i}    )
${i}  }
${i})`;
}

/**
 * Lay out short fields in 2-column rows automatically.
 * Fields are paired left-to-right; odd last field gets full width.
 */
function renderFieldsAs2Col(fields, indent, entityName, dataBinding) {
  const i = indent;
  const rows = [];

  for (let idx = 0; idx < fields.length; idx += 2) {
    const left = fields[idx];
    const right = fields[idx + 1];

    if (right) {
      rows.push(`${i}a!columnsLayout(
${i}  columns: {
${i}    a!columnLayout(
${i}      width: "AUTO",
${i}      contents: {
${renderFieldDisplay(left, i + "        ", entityName, dataBinding)}
${i}      }
${i}    ),
${i}    a!columnLayout(
${i}      width: "AUTO",
${i}      contents: {
${renderFieldDisplay(right, i + "        ", entityName, dataBinding)}
${i}      }
${i}    )
${i}  },
${i}  spacing: "STANDARD",
${i}  marginBelow: "STANDARD"
${i})`);
    } else {
      // Odd last field — full width, no columnsLayout wrapper
      rows.push(`${renderFieldDisplay(left, i, entityName, dataBinding)}`);
    }
  }

  return rows.join(",\n");
}


// =============================================================================
// Section Card Renderer
// =============================================================================

function renderSectionCard(section, indent, entityName, dataBinding) {
  const i = indent;
  const shortFields = section.fields.filter((f) => (f.type || "text") === "text");
  const longFields = section.fields.filter((f) => f.type === "paragraph" || f.type === "richtext");

  const fieldRows = renderFieldsAs2Col(shortFields, i + "        ", entityName, dataBinding);
  const longSections = longFields
    .map((f) => renderLongField(f, i + "      ", entityName, dataBinding))
    .join(",\n");

  const sectionContents = [fieldRows, longSections].filter(Boolean).join(",\n");

  return `${i}a!cardLayout(
${i}  contents: {
${i}    a!sectionLayout(
${i}      label: "${section.label}",
${i}      labelColor: "STANDARD",
${i}      contents: {
${sectionContents}
${i}      }
${i}    )
${i}  },
${i}  style: "#FFFFFF",
${i}  showBorder: true(),
${i}  shape: "ROUNDED",
${i}  padding: "STANDARD",
${i}  marginBelow: "STANDARD"
${i})`;
}

// =============================================================================
// Main Renderer (definition-driven)
// =============================================================================

function renderFromDefinition(def) {
  const { title, entityName, recordName, keyAttributes = [], sections, layout, layoutLabel, dataBinding } = def;
  const theme = resolveTheme(def.theme);
  const sectionList = sections || [];

  // Collect all fields for local variable declarations. fieldRef-based
  // fields (bound to a dataBinding-queried value) never get their own mock
  // local! — resolveFieldValueExpr() resolves them inline instead (either to
  // an existing local!{localName} from the Query_Prologue, or directly to
  // a!defaultValue({entity record local!}['{fieldRef}'], "-")).
  const allFields = [
    ...keyAttributes,
    ...sectionList.flatMap((s) => s.fields),
  ].filter((f) => !f.fieldRef);
  const fieldVarDecls = allFields
    .map((f) => `  ${toLocalVar(f.name)}: ${toSailValue(f.value)},`)
    .join("\n");

  // Layout-tree escape hatch (criteria lists, RAG-tier card groups, or any
  // other content that doesn't fit the fixed keyAttributes/sections shape)
  // contributes its own var decls (KPI values, grid sample data, etc.).
  const layoutVarDecls = layout ? layoutTree.collectVarDecls(layout, { dataBinding, theme }) : "";

  // Query_Prologue (Requirements 3.7, 4.8): rendered only when dataBinding is
  // present, and prepended so its local! declarations are declared before any
  // keyAttributes/sections/layout content that might reference them.
  const queryPrologueSail = dataBinding ? renderQueryPrologue(dataBinding, entityName, "  ") : "";

  const varDecls = [queryPrologueSail, fieldVarDecls, layoutVarDecls].filter(Boolean).join("\n");

  // Key attribute cards
  const keyAttrCards = keyAttributes
    .map((attr) => renderKeyAttrCard(attr, "          ", entityName, dataBinding))
    .join(",\n");

  // Section cards
  const sectionCards = sectionList
    .map((section) => renderSectionCard(section, "              ", entityName, dataBinding))
    .join(",\n\n");

  // Layout-tree fragment, rendered after the field-based sections. Unlike
  // "sections" (which always carries its own a!sectionLayout heading per
  // entry), the layout escape hatch has no heading of its own by default —
  // wrap it in one via the optional "layoutLabel" so it doesn't render as an
  // unlabeled block sitting next to headed sections like "Ticket Details" /
  // "Resolution". Containers that already carry their own top-level "label"
  // (e.g. itemList, cardGroup via a parent node) still work fine unwrapped;
  // "layoutLabel" is for giving the whole escape-hatch fragment a heading
  // when the request calls for one (e.g. "Activity / Comments").
  const layoutBody = layout ? layoutTree.renderNode(layout, layoutLabel ? "                " : "              ", { dataBinding, theme }) : "";
  const layoutSail = layout && layoutLabel
    ? `              a!sectionLayout(\n                label: "${layoutLabel}",\n                labelColor: "STANDARD",\n                contents: {\n${layoutBody}\n                }\n              )`
    : layoutBody;

  const editButton = `a!buttonArrayLayout(
                  buttons: {
                    /* TODO-CONVERTER: Transform to record action or process model link */
                    a!buttonWidget(
                      label: "Edit",
                      icon: "pencil",
                      style: "OUTLINE",
                      color: "SECONDARY",
                      saveInto: {}
                    )
                  },
                  marginBelow: "NONE"
                )`;

  const body = `              /* ── Key Attributes ── */
              a!cardGroupLayout(
                cards: {
${keyAttrCards}
                },
                cardWidth: "NARROW_PLUS",
                spacing: "STANDARD",
                marginBelow: "MORE"
              ),

${[sectionCards, layoutSail].filter(Boolean).join(",\n\n")}`;

  return `/*
 * ${title}
 * Generated from definition.json — record summary view.
 *
 * TODO-CONVERTER comments mark spots that need transformation
 * when converting from mockup to production SAIL.
 */
a!localVariables(
  /* TODO-CONVERTER: Replace with ri! or record type field references */
${varDecls}

${renderPageFrame({
    title: recordName,
    headerKind: def.headerKind,
    headerImage: def.headerImage,
    headerRight: editButton,
    backgroundColor: theme.pageBg,
    headerBackgroundColor: theme.headerBg,
    theme,
    body,
  })}
)`;
}

// =============================================================================
// SKELETON RENDERING — instant placeholder preview (Pass 0)
// =============================================================================
// A skeleton record-view definition has only "title" + "entityName" +
// "recordName" + "skeleton": true — no keyAttributes/sections content yet.

function renderSkeleton(def) {
  const { title, recordName } = def;
  const theme = resolveTheme(def.theme);

  const editButton = `a!buttonArrayLayout(
                  buttons: {
                    a!buttonWidget(
                      label: "Edit",
                      icon: "pencil",
                      style: "OUTLINE",
                      color: "SECONDARY",
                      saveInto: {}
                    )
                  },
                  marginBelow: "NONE"
                )`;

  const body = `              a!cardLayout(
                contents: {
                  a!sectionLayout(
                    label: "${title}",
                    labelColor: "STANDARD",
                    contents: {}
                  )
                },
                style: "${theme.cardBg}",
                showBorder: true(),
                shape: "ROUNDED",
                padding: "STANDARD"
              )`;

  return `/*
 * ${title}
 * SKELETON — placeholder structure for instant preview.
 * Will be replaced by the full definition scaffold.
 */
a!localVariables(
${renderPageFrame({
    title: recordName,
    headerKind: def.headerKind,
    headerImage: def.headerImage,
    headerRight: editButton,
    backgroundColor: theme.pageBg,
    headerBackgroundColor: theme.headerBg,
    theme,
    body,
  })}
)`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function render(opts) {
  if (!opts.definition) {
    throw new Error(
      "Record-view template requires a definition JSON. " +
      "Use the definition pipeline: node generator/define.js --write <uuid> '<json>' " +
      "then node generator/scaffold.js --from-definition <uuid>"
    );
  }
  if (opts.definition.skeleton === true) {
    return renderSkeleton(opts.definition);
  }
  return renderFromDefinition(opts.definition);
}

module.exports = {
  render,
  renderFromDefinition,
  renderSkeleton,
  entityIdVar,
  entityRecordVar,
  renderIdentifierLocal,
  renderRecordConstructor,
  renderIdentifierExpr,
  renderFieldsBlock,
  renderRelatedRecordDataBlock,
  renderRecordLocal,
  renderBindingLocals,
  renderItemFieldValue,
  renderItemFieldsCard,
  renderRelatedCollectionBlock,
  renderTodoComments,
  renderQueryPrologue,
};
