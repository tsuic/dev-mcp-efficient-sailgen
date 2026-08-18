/**
 * templates/dashboard.js
 *
 * Generates a structurally valid SAIL dashboard scaffold from a flexible
 * sections-based definition. Sections are rendered in order, supporting:
 *   - kpis: card group with 1–6 metric cards
 *   - chart: any supported chart type (column, line, bar, area, pie)
 *   - grid: embedded summary grid (no filter chrome)
 *   - columns: side-by-side layout containing nested chart/kpis sections
 *
 * Passes the validator: valid icons, correct column widths, AUTO present, etc.
 */

const {
  toSailValue,
  renderColumnsFromDefinition,
  renderRowsFromDefinition,
  pickPrimaryColumn,
} = require("./grid");
const { renderPageFrame } = require("../page-frame");
const { THEME_DEFAULTS, resolveTheme } = require("../theme");

// =============================================================================
// Constants
// =============================================================================

const CHART_COMPONENT = {
  column: "a!columnChartField",
  line: "a!lineChartField",
  bar: "a!barChartField",
  area: "a!areaChartField",
  pie: "a!pieChartField",
};

// a!pieChartField has no "categories" param — each slice is its own
// a!chartSeries(label, data: <scalar>, color). A single input series only
// carries one color, so slices rotate through the theme's piePalette.

// =============================================================================
// Live Data Helpers — resolve field aliases to full record type references
// =============================================================================

/**
 * Resolve a field alias (e.g. "statusId") to its full reference from dataSource.fields.
 * Handles dotted paths for relationship fields (e.g. "category.label" → relationships.category + .fields.label).
 *
 * IMPORTANT: a related record's field (e.g. a lookup table's "label" column) has its own
 * UUID on the RELATED record type — it is never derivable from the relationship UUID alone.
 * Callers must supply the fully UUID-qualified reference directly under dataSource.fields
 * (e.g. "categoryLabel": "recordType!{...}.relationships.{...}category.fields.{uuid}label").
 * This function does NOT synthesize that UUID — doing so previously produced a bare
 * ".fields.label" reference (no UUID) that passed local structural validation but was
 * silently unresolvable by Appian at deploy time. See git history for the incident.
 */
function resolveFieldRef(alias, dataSource) {
  if (!dataSource) return alias;
  if (dataSource.fields && dataSource.fields[alias]) return dataSource.fields[alias];
  const dotIdx = alias.indexOf(".");
  if (dotIdx !== -1) {
    const relAlias = alias.slice(0, dotIdx);
    const fieldPart = alias.slice(dotIdx + 1);
    const relRef = dataSource.relationships && dataSource.relationships[relAlias];
    if (relRef) {
      throw new Error(
        `resolveFieldRef: "${alias}" is relationship-qualified but no fully UUID-qualified ` +
        `entry exists at dataSource.fields["${alias}"]. A related record's field UUID cannot ` +
        `be inferred from the relationship UUID — call getRecordType on the RELATED record type ` +
        `("${relRef}") to get "${fieldPart}"'s own uuid, then add ` +
        `dataSource.fields["${alias}"] = "${relRef}.fields.{<field-uuid>}${fieldPart}" ` +
        `to the definition JSON and re-run define.js.`
      );
    }
  }
  return alias;
}

/**
 * Render a filter expression for a!queryFilter.
 */
function renderFilter(filter, dataSource, indent) {
  const i = indent;
  const fieldRef = resolveFieldRef(filter.field, dataSource);
  if (["is null", "not null"].includes(filter.operator)) {
    return `${i}a!queryFilter(field: '${fieldRef}', operator: "${filter.operator}")`;
  }
  const value = renderFilterValue(filter.value);
  return `${i}a!queryFilter(field: '${fieldRef}', operator: "${filter.operator}", value: ${value})`;
}

function renderFilterValue(value) {
  if (Array.isArray(value)) return `{${value.map(renderFilterValue).join(", ")}}`;
  if (typeof value === "string") {
    // Check if it's a SAIL expression (contains parentheses or starts with known functions)
    if (value.includes("(") || value.startsWith("local!") || value.startsWith("loggedInUser")) return value;
    return `"${value.replace(/"/g, '""')}"`;
  }
  if (typeof value === "boolean") return value ? "true()" : "false()";
  return String(value);
}

/**
 * Render filters block — single filter or logical AND expression.
 */
function renderFiltersBlock(filters, dataSource, indent) {
  if (!filters || filters.length === 0) return "";
  if (filters.length === 1) {
    return renderFilter(filters[0], dataSource, indent);
  }
  const i = indent;
  const filtersSail = filters.map(f => renderFilter(f, dataSource, i + "  ")).join(",\n");
  return `${i}a!queryLogicalExpression(operator: "AND", filters: {\n${filtersSail}\n${i}})`;
}

// =============================================================================
// Section Renderers
// =============================================================================

/**
 * Render a single KPI card from a definition object.
 */
function renderKpiCard(kpi, index, indent, theme) {
  const i = indent;
  const icon = kpi.icon || "circle";
  const color = kpi.color || theme.kpiColors[index % theme.kpiColors.length];
  const varName = `local!kpi${index + 1}`;
  const subVar = `local!kpi${index + 1}Sub`;

  return [
    `${i}a!cardLayout(`,
    `${i}  contents: {`,
    `${i}    a!sideBySideLayout(`,
    `${i}      items: {`,
    `${i}        a!sideBySideItem(`,
    `${i}          item: a!stampField(`,
    `${i}            icon: "${icon}",`,
    `${i}            backgroundColor: "${color}",`,
    `${i}            contentColor: "${theme.stampContent}",`,
    `${i}            size: "TINY",`,
    `${i}            shape: "ROUNDED",`,
    `${i}            labelPosition: "COLLAPSED"`,
    `${i}          ),`,
    `${i}          width: "MINIMIZE"`,
    `${i}        ),`,
    `${i}        a!sideBySideItem(`,
    `${i}          item: a!richTextDisplayField(`,
    `${i}            labelPosition: "COLLAPSED",`,
    `${i}            value: {`,
    `${i}              a!richTextItem(text: "${kpi.label}", color: "${theme.kpiLabelColor}", size: "STANDARD"),`,
    `${i}              char(10),`,
    `${i}              a!richTextItem(`,
    `${i}                text: ${varName},`,
    `${i}                style: "STRONG",`,
    `${i}                size: "LARGE",`,
    `${i}                color: "${theme.kpiValueColor}"`,
    `${i}              ),`,
    `${i}              char(10),`,
    `${i}              a!richTextItem(text: ${subVar}, color: "${theme.kpiSubColor}", size: "SMALL")`,
    `${i}            }`,
    `${i}          ),`,
    `${i}          width: "AUTO"`,
    `${i}        )`,
    `${i}      },`,
    `${i}      alignVertical: "MIDDLE",`,
    `${i}      spacing: "STANDARD"`,
    `${i}    )`,
    `${i}  },`,
    `${i}  style: "${theme.cardBg}",`,
    `${i}  showBorder: true(),`,
    `${i}  padding: "MORE",`,
    `${i}  shape: "ROUNDED"`,
    `${i})`,
  ].join("\n");
}


/**
 * Render a KPIs section: a!cardGroupLayout wrapping 1–6 KPI cards.
 */
function renderKpisSection(section, kpiOffset, indent, theme) {
  const i = indent;
  const cards = section.items
    .map((kpi, idx) => renderKpiCard(kpi, kpiOffset + idx, i + "    ", theme))
    .join(",\n");

  return `${i}/* ── KPIs${section.label ? ": " + section.label : ""} ── */
${i}a!cardGroupLayout(
${i}  cards: {
${cards}
${i}  },
${i}  cardWidth: "NARROW_PLUS",
${i}  spacing: "STANDARD",
${i}  marginBelow: "MORE"
${i})`;
}

/**
 * Render a chart section wrapped in a card.
 * Supports both static series and record-powered charts via recordSource.
 */
function renderChartSection(section, indent, dataSource, theme) {
  const i = indent;
  const component = CHART_COMPONENT[section.chartType];

  // Record-powered chart
  if (section.recordSource && dataSource) {
    return renderRecordChartSection(section, dataSource, indent, theme);
  }

  // Static chart
  let bodySail;
  if (section.chartType === "pie") {
    const data = section.series[0];
    const sliceSail = section.categories
      .map((cat, idx) => {
        const color = data.color && section.categories.length === 1 ? data.color : theme.piePalette[idx % theme.piePalette.length];
        return `${i}            a!chartSeries(label: ${toSailValue(cat)}, data: ${data.data[idx]}, color: "${color}")`;
      })
      .join(",\n");

    bodySail = `${i}        ${component}(
${i}          labelPosition: "COLLAPSED",
${i}          series: {
${sliceSail}
${i}          },
${i}          style: "PIE",
${i}          seriesLabelStyle: "ON_CHART",
${i}          height: "MEDIUM"
${i}        )`;
  } else {
    const categoriesSail = `{${section.categories.map((c) => toSailValue(c)).join(", ")}}`;
    const seriesSail = section.series
      .map(
        (s) =>
          `${i}      a!chartSeries(label: ${toSailValue(s.label)}, data: {${s.data.join(", ")}}, color: "${s.color || theme.chartAccent}")`
      )
      .join(",\n");

    bodySail = `${i}        ${component}(
${i}          labelPosition: "COLLAPSED",
${i}          categories: ${categoriesSail},
${i}          series: {
${seriesSail}
${i}          },
${i}          height: "MEDIUM",
${i}          showLegend: ${section.series.length > 1 ? "true()" : "false()"}
${i}        )`;
  }

  return `${i}/* ── Chart: ${section.label || section.title || "Trend"} ── */
${i}a!cardLayout(
${i}  contents: {
${i}    a!sectionLayout(
${i}      label: "${section.label || section.title || "Trend"}",
${i}      labelColor: "STANDARD",
${i}      contents: {
${bodySail}
${i}      }
${i}    )
${i}  },
${i}  style: "${theme.cardBg}",
${i}  showBorder: true(),
${i}  shape: "ROUNDED",
${i}  padding: "STANDARD",
${i}  marginBelow: "STANDARD"
${i})`;
}

/**
 * Render a record-powered chart using a!pieChartConfig / pre-queried data.
 */
function renderRecordChartSection(section, dataSource, indent, theme) {
  const i = indent;
  const component = CHART_COMPONENT[section.chartType];
  const rs = section.recordSource;
  const groupingFieldRef = resolveFieldRef(rs.groupingField, dataSource);
  const measureFieldRef = resolveFieldRef(rs.measureField, dataSource);
  const measureFn = rs.measureFunction || "COUNT";

  // Filters belong on a!recordData() wrapping the record type reference,
  // NOT inside a!*ChartConfig() which only accepts primaryGrouping/measures/sort/dataLimit/link.
  const dataExpr = rs.filters
    ? `a!recordData(\n${i}            recordType: '${dataSource.recordType}',\n${i}            filters: ${renderFiltersBlock(rs.filters, dataSource, i + "            ")}\n${i}          )`
    : `'${dataSource.recordType}'`;

  let bodySail;
  if (section.chartType === "pie") {
    bodySail = `${i}        ${component}(
${i}          labelPosition: "COLLAPSED",
${i}          data: ${dataExpr},
${i}          config: a!pieChartConfig(
${i}            primaryGrouping: a!grouping(field: '${groupingFieldRef}', alias: "groupLabel"),
${i}            measures: a!measure(field: '${measureFieldRef}', function: "${measureFn}", alias: "measureValue"),
${i}            dataLimit: 100
${i}          ),
${i}          style: "PIE",
${i}          seriesLabelStyle: "ON_CHART",
${i}          height: "MEDIUM"
${i}        )`;
  } else {
    bodySail = `${i}        ${component}(
${i}          labelPosition: "COLLAPSED",
${i}          data: ${dataExpr},
${i}          config: a!${section.chartType}ChartConfig(
${i}            primaryGrouping: a!grouping(field: '${groupingFieldRef}', alias: "groupLabel"),
${i}            measures: a!measure(field: '${measureFieldRef}', function: "${measureFn}", alias: "measureValue"),
${i}            dataLimit: 100
${i}          ),
${i}          height: "MEDIUM"
${i}        )`;
  }

  return `${i}/* ── Chart: ${section.label || "Breakdown"} ── */
${i}a!cardLayout(
${i}  contents: {
${i}    a!sectionLayout(
${i}      label: "${section.label || "Breakdown"}",
${i}      labelColor: "STANDARD",
${i}      contents: {
${bodySail}
${i}      }
${i}    )
${i}  },
${i}  style: "${theme.cardBg}",
${i}  showBorder: true(),
${i}  shape: "ROUNDED",
${i}  padding: "STANDARD",
${i}  marginBelow: "STANDARD"
${i})`;
}

/**
 * Render a grid section wrapped in a card (no filter chrome).
 * Static mode — uses local variable for data.
 */
function renderGridSection(grid, gridIndex, indent, theme) {
  const i = indent;
  const primaryCol = pickPrimaryColumn(grid.columns);
  const columnsSail = renderColumnsFromDefinition(grid.columns, i + "      ");

  return `${i}/* ── Grid: ${grid.label || "Recent Activity"} ── */
${i}a!cardLayout(
${i}  contents: {
${i}    a!sectionLayout(
${i}      label: "${grid.label || "Recent Activity"}",
${i}      labelColor: "STANDARD",
${i}      contents: {
${i}        a!gridField(
${i}          /* TODO-CONVERTER: Replace local!dashboardGrid${gridIndex}Data with record type data source */
${i}          data: local!dashboardGrid${gridIndex}Data,
${i}          columns: {
${columnsSail}
${i}          },
${i}          pageSize: 10,
${i}          pagingControls: "ROW_COUNT",
${i}          initialSorts: {
${i}            a!sortInfo(field: "${primaryCol.name}", ascending: false())
${i}          },
${i}          spacing: "STANDARD",
${i}          borderStyle: "LIGHT",
${i}          shadeAlternateRows: true(),
${i}          emptyGridMessage: "No data available."
${i}        )
${i}      }
${i}    )
${i}  },
${i}  style: "${theme.cardBg}",
${i}  showBorder: true(),
${i}  shape: "ROUNDED",
${i}  padding: "STANDARD",
${i}  marginBelow: "STANDARD"
${i})`;
}

/**
 * Render a record-powered grid section — uses a!recordData with filters.
 */
function renderRecordGridSection(grid, dataSource, indent, theme) {
  const i = indent;

  // Build filters expression
  const filtersExpr = grid.recordSource.filters
    ? `\n${i}          filters: ${renderFiltersBlock(grid.recordSource.filters, dataSource, i + "          ")}`
    : "";

  // Build sort expression
  const sortField = grid.recordSource.sort
    ? resolveFieldRef(grid.recordSource.sort.field, dataSource)
    : null;
  const sortExpr = sortField
    ? `\n${i}        initialSorts: a!sortInfo(field: '${sortField}', ascending: ${grid.recordSource.sort.ascending ? "true()" : "false()"}),`
    : "";

  // Build columns SAIL for record-powered grid
  const columnsSail = grid.columns.map(col => {
    const fieldRef = resolveFieldRef(col.fieldRef, dataSource);
    const sortFieldRef = `'${fieldRef}'`;

    if (col.type === "primary") {
      return `${i}          a!gridColumn(
${i}            label: "${col.label}",
${i}            sortField: ${sortFieldRef},
${i}            value: a!richTextDisplayField(
${i}              labelPosition: "COLLAPSED",
${i}              value: a!richTextItem(
${i}                text: fv!row['${fieldRef}'],
${i}                link: a!recordLink(
${i}                  label: fv!row['${fieldRef}'],
${i}                  recordType: '${dataSource.recordType}',
${i}                  identifier: fv!identifier
${i}                ),
${i}                linkStyle: "STANDALONE",
${i}                style: "STRONG"
${i}              )
${i}            ),
${i}            width: "${col.width}"
${i}          )`;
    } else if (col.type === "tag") {
      const tagEntries = Object.entries(col.tagColors || {});
      let colorExpr;
      if (tagEntries.length <= 4) {
        // Use nested if() for small tag sets
        const ifs = tagEntries.map(([val, color]) =>
          `fv!row['${fieldRef}'] = "${val}", "${color}"`
        ).join(", ");
        colorExpr = `if(${ifs}, "${tagEntries[0]?.[1] || "ACCENT"}")`;
      } else {
        colorExpr = `"ACCENT"`;
      }
      return `${i}          a!gridColumn(
${i}            label: "${col.label}",
${i}            sortField: ${sortFieldRef},
${i}            value: a!tagField(
${i}              tags: a!tagItem(text: fv!row['${fieldRef}'], backgroundColor: ${colorExpr}),
${i}              size: "SMALL",
${i}              labelPosition: "COLLAPSED"
${i}            ),
${i}            width: "${col.width}"
${i}          )`;
    } else {
      // text, computed, etc.
      let valueExpr = `fv!row['${fieldRef}']`;
      if (col.computed) {
        // Allow computed expressions (e.g. days open calculation)
        valueExpr = col.computed;
      }
      return `${i}          a!gridColumn(
${i}            label: "${col.label}",
${i}            sortField: ${sortFieldRef},
${i}            value: ${valueExpr},
${i}            width: "${col.width}"
${i}          )`;
    }
  }).join(",\n");

  return `${i}/* ── Grid: ${grid.label || "Records"} ── */
${i}a!cardLayout(
${i}  contents: {
${i}    a!sectionLayout(
${i}      label: "${grid.label || "Records"}",
${i}      labelColor: "STANDARD",
${i}      contents: {
${i}        a!gridField(
${i}          labelPosition: "COLLAPSED",
${i}          data: a!recordData(
${i}            recordType: '${dataSource.recordType}',${filtersExpr}
${i}          ),
${i}          columns: {
${columnsSail}
${i}          },
${i}          pageSize: 10,${sortExpr}
${i}          borderStyle: "LIGHT",
${i}          shadeAlternateRows: true(),
${i}          emptyGridMessage: "No data available."
${i}        )
${i}      }
${i}    )
${i}  },
${i}  style: "${theme.cardBg}",
${i}  showBorder: true(),
${i}  shape: "ROUNDED",
${i}  padding: "STANDARD",
${i}  marginBelow: "STANDARD"
${i})`;
}


/**
 * Render a columns section — side-by-side layout of nested sections.
 * Each item in section.items is rendered as a column containing a single section.
 */
function renderColumnsSection(section, state, indent) {
  const i = indent;
  const colWidth = section.items.length === 2 ? '"AUTO"' : '"AUTO"';

  const columnContents = section.items.map((item) => {
    const innerSail = renderSection(item, state, i + "      ");
    return `${i}    a!columnLayout(
${i}      width: ${colWidth},
${i}      contents: {
${innerSail}
${i}      }
${i}    )`;
  });

  return `${i}/* ── Side-by-Side ── */
${i}a!columnsLayout(
${i}  columns: {
${columnContents.join(",\n")}
${i}  },
${i}  spacing: "STANDARD",
${i}  marginBelow: "STANDARD"
${i})`;
}

/**
 * Render any section by dispatching on its type.
 * Tracks state (kpiOffset, gridIndex, dataSource, theme) for unique variable names.
 */
function renderSection(section, state, indent) {
  switch (section.type) {
    case "kpis": {
      const result = renderKpisSection(section, state.kpiOffset, indent, state.theme);
      state.kpiOffset += section.items.length;
      return result;
    }
    case "chart":
      return renderChartSection(section, indent, state.dataSource, state.theme);
    case "grid": {
      state.gridIndex++;
      if (section.recordSource && state.dataSource) {
        return renderRecordGridSection(section, state.dataSource, indent, state.theme);
      }
      return renderGridSection(section, state.gridIndex, indent, state.theme);
    }
    case "columns":
      return renderColumnsSection(section, state, indent);
    default:
      return `${indent}/* Unknown section type: ${section.type} */`;
  }
}

// =============================================================================
// Variable Declarations
// =============================================================================

/**
 * Collect all KPI variable declarations from the sections tree.
 * For query-based KPIs (with dataSource), emits a!queryRecordType aggregation.
 * For static KPIs, emits the literal value.
 */
function collectKpiDecls(sections, dataSource) {
  const decls = [];
  let offset = 0;

  function walk(sectionList) {
    for (const section of sectionList) {
      if (section.type === "kpis") {
        for (const kpi of section.items) {
          offset++;
          if (kpi.query && dataSource) {
            // Query-powered KPI: emit a!queryRecordType with a!aggregationFields
            const fieldRef = resolveFieldRef(kpi.query.field, dataSource);
            const filtersExpr = kpi.query.filters
              ? `,\n    filters: ${renderFiltersBlock(kpi.query.filters, dataSource, "    ")}`
              : "";
            decls.push(
              `  local!kpi${offset}: a!queryRecordType(\n` +
              `    recordType: '${dataSource.recordType}',\n` +
              `    fields: a!aggregationFields(\n` +
              `      measures: a!measure(field: '${fieldRef}', function: "${kpi.query.function}", alias: "result")\n` +
              `    )${filtersExpr},\n` +
              `    pagingInfo: a!pagingInfo(startIndex: 1, batchSize: 1)\n` +
              `  ).data[1].result,\n` +
              `  local!kpi${offset}Sub: ${toSailValue(kpi.sub)},`
            );
          } else {
            decls.push(
              `  local!kpi${offset}: ${toSailValue(kpi.value)},\n  local!kpi${offset}Sub: ${toSailValue(kpi.sub)},`
            );
          }
        }
      } else if (section.type === "columns" && section.items) {
        walk(section.items);
      }
    }
  }

  walk(sections);
  return decls.join("\n");
}

/**
 * Collect all grid data declarations from the sections tree.
 * Skips record-powered grids (they use a!recordData directly).
 */
function collectGridDecls(sections) {
  const decls = [];
  let gridIndex = 0;

  function walk(sectionList) {
    for (const section of sectionList) {
      if (section.type === "grid") {
        gridIndex++;
        if (!section.recordSource) {
          const rows = renderRowsFromDefinition(section.columns, section.rows, "    ");
          decls.push(
            `  /* TODO-CONVERTER: Replace with record type data source */\n  local!dashboardGrid${gridIndex}Data: {\n${rows}\n  },`
          );
        }
      } else if (section.type === "columns" && section.items) {
        walk(section.items);
      }
    }
  }

  walk(sections);
  return decls.join("\n\n");
}

// =============================================================================
// Skeleton Renderer — produces header + placeholder cards for instant preview
// =============================================================================

const SKELETON_ICONS = {
  kpis: "circle",
  chart: "circle",
  grid: "circle",
  columns: "circle",
};

function renderSkeletonSection(section, indent) {
  const i = indent;
  const label = section.label || section.type;

  if (section.type === "columns" && Array.isArray(section.items)) {
    const cols = section.items.map((item) => {
      const innerSail = renderSkeletonSection(item, i + "      ");
      return `${i}    a!columnLayout(
${i}      width: "AUTO",
${i}      contents: {
${innerSail}
${i}      }
${i}    )`;
    });
    return `${i}a!columnsLayout(
${i}  columns: {
${cols.join(",\n")}
${i}  },
${i}  spacing: "STANDARD",
${i}  marginBelow: "STANDARD"
${i})`;
  }

  return `${i}a!cardLayout(
${i}  contents: {
${i}    a!sectionLayout(
${i}      label: "${label}",
${i}      labelColor: "STANDARD",
${i}      contents: {}
${i}    )
${i}  },
${i}  style: "#FFFFFF",
${i}  showBorder: true(),
${i}  shape: "ROUNDED",
${i}  padding: "STANDARD",
${i}  marginBelow: "STANDARD"
${i})`;
}

function renderSkeleton(def) {
  const { title, headerSubtitle, sections } = def;
  const theme = resolveTheme(def.theme);

  const renderedSections = sections
    .map((section) => renderSkeletonSection(section, "              "))
    .join(",\n\n");

  return `/*
 * ${title}
 * SKELETON — placeholder structure for instant preview.
 * Will be replaced by the full definition scaffold.
 */
a!localVariables(
${renderPageFrame({
    title,
    headerKind: def.headerKind,
    headerSubtitle,
    headerImage: def.headerImage,
    backgroundColor: theme.pageBg,
    headerBackgroundColor: theme.headerBg,
    theme,
    body: renderedSections,
  })}
)`;
}

// =============================================================================
// Main Renderer
// =============================================================================

function renderFromDefinition(def) {
  const { title, headerSubtitle, sections, dataSource } = def;
  const theme = resolveTheme(def.theme);

  const kpiVarDecls = collectKpiDecls(sections, dataSource);
  const gridDataDecls = collectGridDecls(sections);

  const state = { kpiOffset: 0, gridIndex: 0, dataSource: dataSource || null, theme };
  const renderedSections = sections
    .map((section) => renderSection(section, state, "              "))
    .join(",\n\n");

  const varBlock = [
    kpiVarDecls ? `  /* KPI values${dataSource ? "" : " — TODO-CONVERTER: Derive from record queries"} */\n${kpiVarDecls}` : "",
    gridDataDecls ? `\n${gridDataDecls}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return `/*
 * ${title}
 * Generated from definition.json — sections-based flexible dashboard.
${dataSource ? " * Record-powered: queries execute live against the specified record type.\n" : " *\n * TODO-CONVERTER comments mark spots that need transformation\n * when converting from mockup to production SAIL.\n"}*/
a!localVariables(
${varBlock}

${renderPageFrame({
    title,
    headerKind: def.headerKind,
    headerSubtitle,
    headerImage: def.headerImage,
    backgroundColor: theme.pageBg,
    headerBackgroundColor: theme.headerBg,
    theme,
    body: renderedSections,
  })}
)`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function render(opts) {
  if (!opts.definition) {
    throw new Error(
      "Dashboard template requires a definition JSON with a \"sections\" array. " +
      "Use the definition pipeline: node generator/define.js --write <uuid> '<json>' " +
      "then node generator/scaffold.js --from-definition <uuid>"
    );
  }
  // Skeleton definitions have skeleton: true on all sections
  const isSkeleton = opts.definition.sections.every((s) => s.skeleton === true);
  if (isSkeleton) {
    return renderSkeleton(opts.definition);
  }
  return renderFromDefinition(opts.definition);
}

module.exports = {
  render,
  renderFromDefinition,
  renderSkeleton,
  // Exported for templates/component.js — a bare component is structurally
  // one dashboard section rendered without the outer header/gutter chrome.
  KPI_DEFAULT_COLORS: THEME_DEFAULTS.kpiColors,
  CHART_COMPONENT,
  renderKpiCard,
  renderKpisSection,
  renderChartSection,
  renderGridSection,
  renderSkeletonSection,
  collectKpiDecls,
};

// Register grid/chart/kpis as layout-tree leaves, reusing these exact
// renderers — dashboard.js remains the single implementation; layout-tree.js
// (and anything that consumes it: record-view's "layout" escape hatch, etc.)
// just references it through the registry instead of reimplementing it.
require("../layout-tree").registerCoreLeaves(module.exports);
