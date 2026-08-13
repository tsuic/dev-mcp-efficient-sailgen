/**
 * templates/component.js
 *
 * Generates a single, isolated SAIL component fragment — kpis, chart, or
 * grid — with NO page framing (no a!headerContentLayout, no header bar,
 * no search/filter chrome, no "New X" button).
 *
 * Reuses the exact same section renderers as dashboard.js, since a bare
 * component is structurally identical to one dashboard section — it's
 * just rendered without the outer header/gutter-column wrapper.
 *
 * Passes the validator: valid icons, correct column widths, AUTO present, etc.
 */

const {
  renderKpisSection,
  renderChartSection,
  renderGridSection,
  renderSkeletonSection,
  collectKpiDecls,
} = require("./dashboard");
const { renderRowsFromDefinition } = require("./grid");

/**
 * Render the local!-variable declarations a section needs (KPI values,
 * grid sample data) at the top of a!localVariables(...).
 */
function renderVarDecls(section) {
  const decls = [];

  if (section.type === "kpis") {
    const kpiDecls = collectKpiDecls([section]);
    if (kpiDecls) decls.push("  /* KPI values — TODO-CONVERTER: Derive from record queries */\n" + kpiDecls);
  }

  if (section.type === "grid") {
    const rows = renderRowsFromDefinition(section.columns, section.rows, "    ");
    decls.push(
      `  /* TODO-CONVERTER: Replace local!componentGridData with record type data source */\n  local!componentGridData: {\n${rows}\n  },`
    );
  }

  return decls.join("\n\n");
}

/**
 * Render the component body itself — dispatches to the matching dashboard
 * section renderer at top-level indent (no outer wrapper).
 */
function renderComponentBody(section) {
  const indent = "  ";
  switch (section.type) {
    case "kpis":
      // kpiOffset is always 0 — a bare component only ever declares its own KPIs
      return renderKpisSection(section, 0, indent);
    case "chart":
      return renderChartSection(section, indent);
    case "grid":
      // gridIndex is unused in the rendered SAIL itself (only affects the
      // local! variable name), so 1 is fine for a single standalone grid.
      return renderGridSectionForComponent(section, indent);
    default:
      throw new Error(`Unsupported component type: ${section.type}`);
  }
}

/**
 * Grid components use a fixed local!componentGridData variable name (set by
 * renderVarDecls above) rather than the dashboard's local!dashboardGridNData
 * naming, since there's only ever one grid in a component definition.
 */
function renderGridSectionForComponent(section, indent) {
  const rendered = renderGridSection(section, 1, indent);
  return rendered.replace(/local!dashboardGrid1Data/g, "local!componentGridData");
}

function renderFromDefinition(def) {
  const { title, section } = def;
  // Grid/chart sections default their card label to "Recent Activity"/"Trend"
  // when unset — for a standalone component, the definition's own title is a
  // better default label than a dashboard-ism.
  if (section.type === "grid" && !section.label) section.label = title;
  if (section.type === "chart" && !section.label) section.label = section.title || title;

  const varDecls = renderVarDecls(section);
  const body = renderComponentBody(section);

  return `/*
 * ${title}
 * Generated from definition.json — isolated component, no page framing.
 *
 * TODO-CONVERTER comments mark spots that need transformation
 * when converting from mockup to production SAIL.
 */
a!localVariables(
${varDecls ? varDecls + "\n\n" : ""}${body}
)`;
}

// =============================================================================
// SKELETON RENDERING — instant placeholder preview (Pass 0)
// =============================================================================
// A skeleton component definition has "section": { "type": ..., "skeleton": true }
// — no columns/rows/items/series yet. Reuses dashboard.js's section-level
// skeleton renderer directly (no outer header/gutter wrapper — a component
// never has page framing, skeleton or otherwise).

function renderSkeleton(def) {
  const { title, section } = def;
  const label = section.label || title;
  const body = renderSkeletonSection({ ...section, label }, "  ");

  return `/*
 * ${title}
 * SKELETON — placeholder structure for instant preview.
 * Will be replaced by the full definition scaffold.
 */
a!localVariables(
${body}
)`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function render(opts) {
  if (!opts.definition) {
    throw new Error(
      "Component template requires a definition JSON with \"componentType\" and \"section\". " +
      "Use the definition pipeline: node generator/define.js --write <uuid> '<json>' " +
      "then node generator/scaffold.js --from-definition <uuid>"
    );
  }
  if (opts.definition.section && opts.definition.section.skeleton === true) {
    return renderSkeleton(opts.definition);
  }
  return renderFromDefinition(opts.definition);
}

module.exports = { render, renderFromDefinition, renderSkeleton };
