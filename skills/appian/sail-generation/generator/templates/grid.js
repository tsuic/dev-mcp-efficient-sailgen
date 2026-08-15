/**
 * templates/grid.js
 *
 * Generates a structurally valid SAIL grid scaffold with:
 *  - Search + status filter (with TODO-CONVERTER comments)
 *  - gridField with columns derived from the LLM-authored definition
 *  - "New" action button in header
 *  - Sample a!map() data
 *  - Passes validator: no record-only params, AUTO column present, etc.
 */

const { renderPageFrame } = require("../page-frame");

// =============================================================================
// DEFINITION-DRIVEN RENDERING (Pass 2 of the two-pass pipeline)
// =============================================================================
// The LLM authors columns/rows/filters directly in definition.json — no
// guessing here. Exported so dashboard.js can embed the same column/row
// rendering for its own "grid" section without reimplementing it.

/** JS value -> SAIL literal. Strings use "" escaping (SAIL convention), not \" */
function toSailValue(value) {
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true()" : "false()";
  if (value === null || value === undefined) return "null";
  return `"${String(value).replace(/"/g, '""')}"`;
}

/**
 * Build the nested if() chain for a tag's backgroundColor from its tagColors map.
 * @param {string} valueExpr - the SAIL expression to compare (e.g. "fv!row.status" or "local!status")
 */
function renderTagColorExpr(valueExpr, tagColors, indent) {
  const entries = Object.entries(tagColors);
  function build(i) {
    if (i === entries.length - 1) return `"${entries[i][1]}"`;
    const [value, color] = entries[i];
    return `if(\n${indent}  ${valueExpr} = ${toSailValue(value)},\n${indent}  "${color}",\n${indent}  ${build(i + 1)}\n${indent})`;
  }
  return build(0);
}

/** Render a single a!gridColumn() from a definition column object */
function renderDefinitionColumn(col, indent) {
  const i = indent;
  const key = col.name;

  if (col.type === "primary") {
    return [
      `${i}a!gridColumn(`,
      `${i}  label: "${col.label}",`,
      `${i}  value: a!richTextDisplayField(`,
      `${i}    labelPosition: "COLLAPSED",`,
      `${i}    value: a!richTextItem(`,
      `${i}      text: fv!row.${key},`,
      `${i}      style: "STRONG",`,
      `${i}      /* In live grids, replace with: a!recordLink(recordType: '...', identifier: fv!identifier) */`,
      `${i}      link: a!dynamicLink(value: fv!row.${key}, saveInto: {}),`,
      `${i}      linkStyle: "STANDALONE"`,
      `${i}    )`,
      `${i}  ),`,
      `${i}  width: "${col.width}",`,
      `${i}  sortField: "${key}"`,
      `${i})`,
    ].join("\n");
  }

  if (col.type === "tag") {
    return [
      `${i}a!gridColumn(`,
      `${i}  label: "${col.label}",`,
      `${i}  value: a!tagField(`,
      `${i}    tags: a!tagItem(`,
      `${i}      text: fv!row.${key},`,
      `${i}      backgroundColor: ${renderTagColorExpr(`fv!row.${key}`, col.tagColors, i + "      ")}`,
      `${i}    ),`,
      `${i}    size: "SMALL",`,
      `${i}    labelPosition: "COLLAPSED"`,
      `${i}  ),`,
      `${i}  width: "${col.width}",`,
      `${i}  sortField: "${key}"`,
      `${i})`,
    ].join("\n");
  }

  if (col.type === "buttonArray") {
    return [
      `${i}a!gridColumn(`,
      `${i}  label: "${col.label}",`,
      `${i}  value: a!buttonArrayLayout(`,
      `${i}    buttons: {`,
      `${i}      /* TODO-CONVERTER: Convert to a!recordActionField() with identifier */`,
      `${i}      a!buttonWidget(`,
      `${i}        label: "${col.buttonLabel || "View"}",`,
      `${i}        style: "OUTLINE",`,
      `${i}        size: "SMALL",`,
      `${i}        color: "SECONDARY",`,
      `${i}        saveInto: {}`,
      `${i}      )`,
      `${i}    },`,
      `${i}    align: "START"`,
      `${i}  ),`,
      `${i}  width: "${col.width}",`,
      `${i}  align: "${col.align || "CENTER"}"`,
      `${i})`,
    ].join("\n");
  }

  if (col.type === "progressBar") {
    return [
      `${i}a!gridColumn(`,
      `${i}  label: "${col.label}",`,
      `${i}  value: a!progressBarField(`,
      `${i}    labelPosition: "COLLAPSED",`,
      `${i}    percentage: fv!row.${key},`,
      `${i}    color: "ACCENT",`,
      `${i}    showPercentage: true`,
      `${i}  ),`,
      `${i}  width: "${col.width}",`,
      `${i}  sortField: "${key}"`,
      `${i})`,
    ].join("\n");
  }

  if (col.type === "image") {
    return [
      `${i}a!gridColumn(`,
      `${i}  label: "${col.label}",`,
      `${i}  value: a!imageField(`,
      `${i}    labelPosition: "COLLAPSED",`,
      `${i}    images: a!webImage(source: fv!row.${key}),`,
      `${i}    size: "SMALL"`,
      `${i}  ),`,
      `${i}  width: "${col.width}"`,
      `${i})`,
    ].join("\n");
  }

  // Plain text column
  const alignLine = col.align ? `\n${i}  align: "${col.align}",` : "";
  return [
    `${i}a!gridColumn(`,
    `${i}  label: "${col.label}",`,
    `${i}  value: fv!row.${key},${alignLine}`,
    `${i}  width: "${col.width}",`,
    `${i}  sortField: "${key}"`,
    `${i})`,
  ].join("\n");
}

/** Render all a!gridColumn() definitions, comma-joined, at the given indent */
function renderColumnsFromDefinition(columns, indent) {
  return columns.map((col) => renderDefinitionColumn(col, indent)).join(",\n");
}

/** Render all a!map() sample rows, comma-joined, at the given indent */
function renderRowsFromDefinition(columns, rows, indent) {
  const dataColumns = columns.filter((c) => c.type !== "buttonArray" && c.type !== "image");
  return rows
    .map((row) => {
      const pairs = dataColumns.map((c) => `${c.name}: ${toSailValue(row[c.name])}`);
      return `${indent}a!map(${pairs.join(", ")})`;
    })
    .join(",\n");
}

/** The column driving initial sort + search (the one marked "primary") */
function pickPrimaryColumn(columns) {
  return columns.find((c) => c.type === "primary") || columns[0];
}

/**
 * Resolves a filter's choice list: explicit "choices" wins if present,
 * otherwise derives it from the referenced "tag" column's tagColors keys
 * (already validated as non-empty by define.js for that fallback path).
 */
function resolveFilterChoices(filter, columns) {
  if (Array.isArray(filter.choices) && filter.choices.length > 0) return filter.choices;
  const col = columns.find((c) => c.name === filter.column);
  return Object.keys(col.tagColors);
}

function renderFromDefinition(def) {
  const { title, entityName, columns, rows } = def;
  const primaryCol = pickPrimaryColumn(columns);
  const filters = (def.filters || []).map((f) => ({ ...f, choices: resolveFilterChoices(f, columns) }));

  const filterVarName = (col) => `local!filter${col[0].toUpperCase()}${col.slice(1)}`;

  const filterVarDecls = filters.map((f) => `  ${filterVarName(f.column)},\n`).join("");

  const filterBlocks = filters.map(
    (f) => `      /* TODO-CONVERTER: Convert to userFilters if available on record type */
      a!dropdownField(
        label: "${f.label}",
        labelPosition: "ABOVE",
        placeholder: "All",
        choiceLabels: {${f.choices.map((c) => `"${c}"`).join(", ")}},
        choiceValues: {${f.choices.map((c) => `"${c}"`).join(", ")}},
        value: ${filterVarName(f.column)},
        saveInto: ${filterVarName(f.column)}
      )`
  );

  const filterItems = filterBlocks
    .map(
      (block) =>
        `                      a!sideBySideItem(\n                        item: {\n${block}\n                        },\n                        width: "MINIMIZE"\n                      ),`
    )
    .join("\n");

  const clearSaves = [
    "a!save(local!searchText, null)",
    ...filters.map((f) => `a!save(${filterVarName(f.column)}, null)`),
  ].join(",\n                              ");

  const searchExpr = `search(lower(local!searchText), lower(fv!item.${primaryCol.name})) > 0`;
  const filterConditions = filters
    .map(
      (f) =>
        `,\n            or(\n              a!isNullOrEmpty(${filterVarName(f.column)}),\n              fv!item.${f.column} = ${filterVarName(f.column)}\n            )`
    )
    .join("");

  const filterExpr = `index(
      local!data,
      wherecontains(
        true(),
        a!forEach(
          items: local!data,
          expression: and(
            or(
              a!isNullOrEmpty(local!searchText),
              ${searchExpr}
            )${filterConditions}
          )
        )
      ),
      {}
    )`;

  const rowsSail = renderRowsFromDefinition(columns, rows, "    ");
  const columnsSail = renderColumnsFromDefinition(columns, "          ");
  const newButtonLabel = def.primaryActionLabel || `New ${entityName}`;

  const newButton = `a!buttonArrayLayout(
                  buttons: {
                    /* TODO-CONVERTER: Convert to recordActions or a!recordActionField() */
                    a!buttonWidget(
                      label: "${newButtonLabel}",
                      icon: "plus",
                      style: "SOLID",
                      color: "ACCENT",
                      saveInto: {}
                    )
                  },
                  marginBelow: "NONE"
                )`;

  const body = `              a!cardLayout(
                contents: {
                  /* ── Search and Filters ── */
                  /* =========================================================================
                   * TODO: When converting to record data, REMOVE the search/filter section
                   *   and use: showSearchBox: true, userFilters: { ... }
                   * ========================================================================= */
                  a!sideBySideLayout(
                    items: {
                      a!sideBySideItem(
                        item: a!textField(
                          label: "Search",
                          labelPosition: "ABOVE",
                          placeholder: "Search by ${primaryCol.label.toLowerCase()}...",
                          value: local!searchText,
                          saveInto: local!searchText
                        ),
                        width: "AUTO"
                      ),
${filterItems}
                      a!sideBySideItem(
                        item: a!buttonArrayLayout(
                          buttons: a!buttonWidget(
                            label: "Clear",
                            style: "GHOST",
                            saveInto: {
                              ${clearSaves}
                            }
                          ),
                          marginBelow: "NONE"
                        ),
                        width: "MINIMIZE"
                      )
                    },
                    alignVertical: "BOTTOM",
                    spacing: "STANDARD"
                  ),

                  /* ── Data Grid ── */
                  a!gridField(
                    /* TODO-CONVERTER: Replace local!data with record type data source */
                    data: ${filterExpr},
                    columns: {
${columnsSail}
                    },
                    pageSize: 15,
                    pagingControls: "ROW_COUNT",
                    initialSorts: {
                      a!sortInfo(field: "${primaryCol.name}", ascending: true())
                    },
                    spacing: "STANDARD",
                    borderStyle: "LIGHT",
                    shadeAlternateRows: true(),
                    emptyGridMessage: "No ${entityName.toLowerCase()} records found."
                  )
                },
                style: "#FFFFFF",
                showBorder: true(),
                shape: "ROUNDED",
                padding: "STANDARD"
              )`;

  return `/*
 * ${title}
 * Generated from definition.json — LLM-authored columns/rows, renderer-guaranteed structure.
 *
 * TODO-CONVERTER comments mark spots that need transformation
 * when converting from mockup to production SAIL.
 */
a!localVariables(
  local!searchText,
${filterVarDecls}  /* TODO-CONVERTER: Transform to record type data source */
  local!data: {
${rowsSail}
  },

${renderPageFrame({
    title,
    headerKind: def.headerKind,
    headerSubtitle: def.headerSubtitle,
    headerImage: def.headerImage,
    headerRight: newButton,
    body,
  })}
)`;
}

// =============================================================================
// SKELETON RENDERING — instant placeholder preview (Pass 0)
// =============================================================================
// A skeleton grid definition has only "title" + "entityName" + "skeleton": true
// — no columns/rows yet. Renders the same header chrome as the full grid but
// with an empty-state card instead of a!gridField, so the preview updates
// instantly and the full render just replaces the card contents in place.

function renderSkeleton(def) {
  const { title, entityName } = def;

  const newButton = `a!buttonArrayLayout(
                  buttons: {
                    a!buttonWidget(
                      label: "New ${entityName}",
                      icon: "plus",
                      style: "SOLID",
                      color: "ACCENT",
                      saveInto: {}
                    )
                  },
                  marginBelow: "NONE"
                )`;

  const body = `              a!cardLayout(
                contents: {
                  a!sectionLayout(
                    label: "${entityName} List",
                    labelColor: "STANDARD",
                    contents: {}
                  )
                },
                style: "#FFFFFF",
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
    title,
    headerKind: def.headerKind,
    headerSubtitle: def.headerSubtitle,
    headerImage: def.headerImage,
    headerRight: newButton,
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
      "Grid template requires a definition JSON with \"columns\" and \"rows\" (or \"skeleton\": true). " +
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
  renderColumnsFromDefinition,
  renderRowsFromDefinition,
  pickPrimaryColumn,
  toSailValue,
  renderTagColorExpr,
};
