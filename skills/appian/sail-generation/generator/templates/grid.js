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
const { resolveTheme } = require("../theme");
const { sailEsc } = require("../shared");

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
  // exportWhen line — only emitted when explicitly false (exclude from export)
  const hasExportWhen = col.exportWhen === false;

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
      hasExportWhen ? `${i}  sortField: "${key}",` : `${i}  sortField: "${key}"`,
      ...(hasExportWhen ? [`${i}  exportWhen: false()`] : []),
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
      hasExportWhen ? `${i}  sortField: "${key}",` : `${i}  sortField: "${key}"`,
      ...(hasExportWhen ? [`${i}  exportWhen: false()`] : []),
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
    hasExportWhen ? `${i}  sortField: "${key}",` : `${i}  sortField: "${key}"`,
    ...(hasExportWhen ? [`${i}  exportWhen: false()`] : []),
    `${i})`,
  ].join("\n");
}

/** Render all a!gridColumn() definitions, comma-joined, at the given indent */
function renderColumnsFromDefinition(columns, indent, recordActions) {
  const colsSail = columns.map((col) => renderDefinitionColumn(col, indent)).join(",\n");

  // Append a per-row record action column if there are related actions (with identifier)
  const rowActions = (recordActions || []).filter((a) => a.identifier);
  if (rowActions.length === 0) return colsSail;

  const i = indent;
  const actionsStr = rowActions.map((action) => {
    return `${i}      a!recordActionItem(\n${i}        action: '${action.actionRef}',\n${i}        identifier: fv!identifier\n${i}      )`;
  }).join(",\n");

  const actionCol = [
    `${i}a!gridColumn(`,
    `${i}  label: "",`,
    `${i}  value: a!recordActionField(`,
    `${i}    actions: {`,
    actionsStr,
    `${i}    },`,
    `${i}    style: "MENU_ICON"`,
    `${i}  ),`,
    `${i}  width: "ICON_PLUS",`,
    `${i}  exportWhen: false()`,
    `${i})`,
  ].join("\n");

  return colsSail + ",\n" + actionCol;
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
  const theme = resolveTheme(def.theme);
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
        choiceLabels: {${f.choices.map((c) => `"${sailEsc(c)}"`).join(", ")}},
        choiceValues: {${f.choices.map((c) => `"${sailEsc(c)}"`).join(", ")}},
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
  const columnsSail = renderColumnsFromDefinition(columns, "          ", def.recordActions);
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
                    shadeAlternateRows: true(),${def.showExportButton ? `\n                    showExportButton: true(),` : ""}${def.recordActions && def.recordActions.length > 0 ? `\n                    recordActions: {\n${def.recordActions.filter((a) => !a.identifier).map((a) => `                      a!recordActionItem(\n                        action: '${a.actionRef}'\n                      )`).join(",\n")}\n                    },\n                    refreshAfter: "RECORD_ACTION",` : ""}
                    emptyGridMessage: "No ${entityName.toLowerCase()} records found."
                  )
                },
                style: "${theme.cardBg}",
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
    backgroundColor: theme.pageBg,
    headerBackgroundColor: theme.headerBg,
    theme,
    body,
  })}
)`;
}

// =============================================================================
// LIVE GRID RENDERING — records-powered grid with data: recordType!...
// =============================================================================
// When dataSource is present, the grid queries live records at runtime.
// No sample rows needed — columns use fv!row['recordType!...fields...'].

function renderLiveFromDefinition(def) {
  const { title, entityName, columns, dataSource } = def;
  const theme = resolveTheme(def.theme);
  const { resolveFieldRef, renderFiltersBlock } = require("./dashboard");

  // --- Record actions: list-level (header) and per-row ---
  const listActions = (def.recordActions || []).filter((a) => !a.identifier);
  const rowActions = (def.recordActions || []).filter((a) => a.identifier);

  const recordActionsSail = listActions.length > 0
    ? `\n                    recordActions: {\n${listActions.map((a) => `                      a!recordActionItem(\n                        action: '${a.actionRef}'\n                      )`).join(",\n")}\n                    },\n                    refreshAfter: "RECORD_ACTION",`
    : "";

  // --- Header button: use recordActionField for list actions, or generic "New" ---
  let headerRight;
  if (listActions.length > 0) {
    const headerActionItems = listActions.map((a) =>
      `a!recordActionItem(action: '${a.actionRef}')`
    ).join(",\n                      ");
    headerRight = `a!recordActionField(
                    actions: {
                      ${headerActionItems}
                    },
                    style: "TOOLBAR_PRIMARY",
                    display: "LABEL_AND_ICON",
                    openActionsIn: "DIALOG"
                  )`;
  } else {
    headerRight = `a!buttonArrayLayout(
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
  }

  // --- Columns ---
  const columnsSail = columns.map((col) => {
    const fieldRef = resolveFieldRef(col.fieldRef, dataSource);
    const sortFieldLine = `\n            sortField: '${fieldRef}',`;
    const exportWhenLine = col.exportWhen === false ? `\n            exportWhen: false()` : "";

    if (col.type === "primary") {
      return `          a!gridColumn(
            label: "${col.label}",${sortFieldLine}
            value: a!richTextDisplayField(
              labelPosition: "COLLAPSED",
              value: a!richTextItem(
                text: fv!row['${fieldRef}'],
                link: a!recordLink(
                  label: fv!row['${fieldRef}'],
                  recordType: '${dataSource.recordType}',
                  identifier: fv!identifier
                ),
                linkStyle: "STANDALONE",
                style: "STRONG"
              )
            ),
            width: "${col.width}"${exportWhenLine ? "," + exportWhenLine : ""}
          )`;
    }

    if (col.type === "tag") {
      const tagEntries = Object.entries(col.tagColors || {});
      let colorExpr;
      if (tagEntries.length === 0) {
        colorExpr = `"ACCENT"`;
      } else if (tagEntries.length === 1) {
        const [val, color] = tagEntries[0];
        colorExpr = `if(fv!row['${fieldRef}'] = "${val}", "${color}", "ACCENT")`;
      } else {
        // Use nested if() — SAIL if() is strictly 3-arg
        colorExpr = tagEntries.reduceRight((elseExpr, [val, color]) => {
          return `if(fv!row['${fieldRef}'] = "${val}", "${color}", ${elseExpr})`;
        }, `"ACCENT"`);
      }
      return `          a!gridColumn(
            label: "${col.label}",${sortFieldLine}
            value: a!tagField(
              tags: a!tagItem(text: fv!row['${fieldRef}'], backgroundColor: ${colorExpr}),
              size: "SMALL",
              labelPosition: "COLLAPSED"
            ),
            width: "${col.width}"${exportWhenLine ? "," + exportWhenLine : ""}
          )`;
    }

    // text / computed
    let valueExpr = `fv!row['${fieldRef}']`;
    if (col.computed) {
      const { expandComputed } = require("./expr-primitives");
      valueExpr = expandComputed(col.computed, (alias) => resolveFieldRef(alias, dataSource));
    }
    const alignLine = col.align ? `\n            align: "${col.align}",` : "";
    return `          a!gridColumn(
            label: "${col.label}",${sortFieldLine}
            value: ${valueExpr},${alignLine}
            width: "${col.width}"${exportWhenLine ? "," + exportWhenLine : ""}
          )`;
  }).join(",\n");

  // --- Per-row action column ---
  const rowActionColumnSail = rowActions.length > 0
    ? `,\n          a!gridColumn(
            label: "",
            value: a!recordActionField(
              actions: {
${rowActions.map((a) => `                a!recordActionItem(\n                  action: '${a.actionRef}',\n                  identifier: fv!identifier\n                )`).join(",\n")}
              },
              style: "MENU_ICON"
            ),
            width: "ICON_PLUS",
            exportWhen: false()
          )`
    : "";

  // --- Sort ---
  const sortField = def.sort
    ? resolveFieldRef(def.sort.field, dataSource)
    : null;
  const sortLine = sortField
    ? `\n                    initialSorts: a!sortInfo(field: '${sortField}', ascending: ${def.sort.ascending ? "true()" : "false()"}),`
    : "";

  // --- User filters ---
  const userFiltersSail = def.userFilters && def.userFilters.length > 0
    ? `\n                    userFilters: {\n${def.userFilters.map((f) => `                      '${f}'`).join(",\n")}\n                    },`
    : "";

  // --- showExportButton ---
  const exportLine = def.showExportButton ? `\n                    showExportButton: true(),` : "";

  // --- refreshAfter ---
  const refreshLine = (listActions.length > 0 || rowActions.length > 0)
    ? `\n                    refreshAfter: "RECORD_ACTION",`
    : "";

  const body = `              a!cardLayout(
                contents: {
                  a!gridField(
                    labelPosition: "COLLAPSED",
                    data: '${dataSource.recordType}',
                    columns: {
${columnsSail}${rowActionColumnSail}
                    },
                    pageSize: 20,${sortLine}${userFiltersSail}
                    showSearchBox: true(),
                    showRefreshButton: true(),${exportLine}${recordActionsSail.length === 0 && refreshLine ? refreshLine : ""}${recordActionsSail}
                    borderStyle: "LIGHT",
                    shadeAlternateRows: true(),
                    emptyGridMessage: "No ${entityName.toLowerCase()} records found."
                  )
                },
                style: "${theme.cardBg}",
                showBorder: true(),
                shape: "ROUNDED",
                padding: "STANDARD"
              )`;

  return `/*
 * ${title}
 * Live records-powered grid — data sourced from ${dataSource.recordType.split("}")[1] || entityName}.
 * Generated from definition.json — columns reference real record type fields.
 */
a!localVariables(
${renderPageFrame({
    title,
    headerKind: def.headerKind,
    headerSubtitle: def.headerSubtitle,
    headerImage: def.headerImage,
    headerRight,
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
// A skeleton grid definition has only "title" + "entityName" + "skeleton": true
// — no columns/rows yet. Renders the same header chrome as the full grid but
// with an empty-state card instead of a!gridField, so the preview updates
// instantly and the full render just replaces the card contents in place.

function renderSkeleton(def) {
  const { title, entityName } = def;
  const theme = resolveTheme(def.theme);

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
    title,
    headerKind: def.headerKind,
    headerSubtitle: def.headerSubtitle,
    headerImage: def.headerImage,
    headerRight: newButton,
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
      "Grid template requires a definition JSON with \"columns\" and \"rows\" (or \"skeleton\": true). " +
      "Use the definition pipeline: node generator/define.js --write <uuid> '<json>' " +
      "then node generator/scaffold.js --from-definition <uuid>"
    );
  }
  if (opts.definition.skeleton === true) {
    return renderSkeleton(opts.definition);
  }
  if (opts.definition.dataSource) {
    return renderLiveFromDefinition(opts.definition);
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
