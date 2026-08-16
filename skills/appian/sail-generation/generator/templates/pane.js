/**
 * templates/pane.js
 *
 * Generates a structurally valid SAIL a!paneLayout scaffold from a
 * definition JSON — 2-3 full-height, independently-scrolling panes
 * (master-detail, app-style consoles, nav + content layouts).
 *
 * Reuses the exact same section renderers as dashboard.js for grid/chart/kpis
 * pane content, since those are validated with the identical schema.
 *
 * Two render modes, auto-selected by render():
 *   - renderSkeleton(def):        every pane's content has skeleton: true —
 *                                  instant placeholder preview (Pass 0).
 *   - renderFromDefinition(def):  full pane content (Pass 1 output).
 *
 * KEY STRUCTURAL GUARANTEES (enforced by this renderer, not the LLM):
 *   ✅ Exactly one pane has width: "AUTO" (validated upstream by define.js)
 *   ✅ a!paneLayout is either top-level or the sole contents of headerContentLayout
 *   ✅ contentsPadding: "NONE" set automatically when wrapping in headerContentLayout
 *   ✅ Panes never contain headerContentLayout/formLayout
 */

const {
  renderKpisSection,
  renderChartSection,
  renderGridSection,
} = require("./dashboard");
const { resolveTheme } = require("../theme");

// ---------------------------------------------------------------------------
// Pane content renderers
// ---------------------------------------------------------------------------

function renderNavContent(content, indent) {
  const i = indent;
  const links = content.items
    .map((item) => `${i}    a!dynamicLink(label: "${item.label}", value: "${item.label}", saveInto: {})`)
    .join(",\n");
  return `${i}a!linkField(
${i}  labelPosition: "COLLAPSED",
${i}  links: {
${links}
${i}  }
${i})`;
}

function renderDetailContent(content, indent) {
  const i = indent;
  const rows = content.fields
    .map(
      (f) =>
        `${i}  a!richTextDisplayField(
${i}    label: "${f.label}",
${i}    value: a!richTextItem(text: "${String(f.value).replace(/"/g, '""')}", color: "#262626")
${i}  )`
    )
    .join(",\n");
  return `${i}a!sectionLayout(
${i}  label: "Details",
${i}  labelColor: "STANDARD",
${i}  contents: {
${rows}
${i}  }
${i})`;
}

function renderPlaceholderContent(indent) {
  const i = indent;
  return `${i}a!richTextDisplayField(
${i}  labelPosition: "COLLAPSED",
${i}  value: a!richTextItem(text: "${(indent && "") || "Select an item to view details"}", color: "SECONDARY")
${i})`;
}

/**
 * Grid pane content uses a fixed local!pane{N}GridData variable name rather
 * than dashboard's local!dashboardGridNData naming.
 */
function renderGridContentForPane(content, paneIndex, indent, theme) {
  // Default the card label to something pane-appropriate rather than
  // dashboard.js's "Recent Activity" default.
  if (!content.label) content.label = "List";
  const rendered = renderGridSection(content, 1, indent, theme);
  return rendered.replace(/local!dashboardGrid1Data/g, `local!pane${paneIndex}GridData`);
}

/**
 * Dispatch a single pane's content to the matching renderer.
 * state.kpiOffset tracks unique KPI variable numbering across all panes.
 */
function renderPaneContent(content, paneIndex, state, indent, theme) {
  switch (content.type) {
    case "nav":
      return renderNavContent(content, indent);
    case "grid":
      return renderGridContentForPane(content, paneIndex, indent, theme);
    case "chart":
      return renderChartSection(content, indent, theme);
    case "kpis": {
      const result = renderKpisSection(content, state.kpiOffset, indent, theme);
      state.kpiOffset += content.items.length;
      return result;
    }
    case "detail":
      return renderDetailContent(content, indent);
    case "placeholder":
      return renderPlaceholderContent(indent);
    default:
      return `${indent}/* Unknown pane content type: ${content.type} */`;
  }
}

// ---------------------------------------------------------------------------
// Variable declarations (KPI values, grid sample data)
// ---------------------------------------------------------------------------

function collectVarDecls(panes) {
  const { toSailValue } = require("./grid");
  const { renderRowsFromDefinition } = require("./grid");
  const decls = [];
  let kpiOffset = 0;

  panes.forEach((pane, pi) => {
    const content = pane.content;
    if (content.type === "kpis") {
      content.items.forEach((kpi) => {
        kpiOffset++;
        decls.push(
          `  local!kpi${kpiOffset}: ${toSailValue(kpi.value)},\n  local!kpi${kpiOffset}Sub: ${toSailValue(kpi.sub)},`
        );
      });
    }
    if (content.type === "grid") {
      const rows = renderRowsFromDefinition(content.columns, content.rows, "    ");
      decls.push(
        `  /* TODO-CONVERTER: Replace local!pane${pi + 1}GridData with record type data source */\n  local!pane${pi + 1}GridData: {\n${rows}\n  },`
      );
    }
  });

  return decls.join("\n\n");
}

// ---------------------------------------------------------------------------
// Full pane rendering
// ---------------------------------------------------------------------------

function renderPane(pane, paneIndex, state, indent, theme) {
  const i = indent;
  const bg = pane.backgroundColor ? `\n${i}  backgroundColor: "${pane.backgroundColor}",` : "";
  const contentSail = renderPaneContent(pane.content, paneIndex + 1, state, i + "    ", theme);
  return `${i}a!pane(
${i}  width: "${pane.width}",${bg}
${i}  contents: {
${contentSail}
${i}  },
${i}  padding: "STANDARD"
${i})`;
}

function renderHeaderBlock(title, headerSubtitle, indent, theme) {
  const i = indent;
  return `${i}a!cardLayout(
${i}  contents: {
${i}    a!sideBySideLayout(
${i}      items: {
${i}        a!sideBySideItem(
${i}          item: {
${i}            a!richTextDisplayField(
${i}              labelPosition: "COLLAPSED",
${i}              value: a!richTextItem(text: "${title}", size: "LARGE", style: "STRONG", color: "${theme.titleColor}")
${i}            ),
${i}            a!richTextDisplayField(
${i}              labelPosition: "COLLAPSED",
${i}              value: a!richTextItem(text: "${headerSubtitle || ""}", color: "${theme.subtitleColor}", size: "STANDARD")
${i}            )
${i}          },
${i}          width: "AUTO"
${i}        )
${i}      },
${i}      alignVertical: "MIDDLE",
${i}      spacing: "STANDARD"
${i}    )
${i}  },
${i}  style: "${theme.headerBg}",
${i}  showBorder: false(),
${i}  padding: "MORE",
${i}  marginBelow: "NONE"
${i})`;
}

function renderFromDefinition(def) {
  const { title, headerSubtitle, panes } = def;
  const theme = resolveTheme(def.theme);

  const varDecls = collectVarDecls(panes);
  const state = { kpiOffset: 0 };

  let body;
  if (headerSubtitle) {
    const panesSail = panes.map((pane, pi) => renderPane(pane, pi, state, "        ", theme)).join(",\n\n");
    body = `a!headerContentLayout(
    header: {
${renderHeaderBlock(title, headerSubtitle, "      ", theme)}
    },
    contents: a!paneLayout(
      panes: {
${panesSail}
      }
    ),
    contentsPadding: "NONE"
  )`;
  } else {
    const panesSail = panes.map((pane, pi) => renderPane(pane, pi, state, "      ", theme)).join(",\n\n");
    body = `a!paneLayout(
    panes: {
${panesSail}
    }
  )`;
  }

  return `/*
 * ${title}
 * Generated from definition.json — full-height pane layout.
 *
 * TODO-CONVERTER comments mark spots that need transformation
 * when converting from mockup to production SAIL.
 */
a!localVariables(
${varDecls ? varDecls + "\n\n" : ""}  ${body}
)`;
}

// ---------------------------------------------------------------------------
// Skeleton rendering — instant placeholder preview (Pass 0)
// ---------------------------------------------------------------------------

const SKELETON_LABELS = {
  nav: "Navigation",
  grid: "List",
  chart: "Chart",
  kpis: "Metrics",
  detail: "Details",
  placeholder: "Select an item to view details",
};

function renderSkeletonPaneContent(content, indent) {
  const i = indent;
  const label = content.label || SKELETON_LABELS[content.type] || content.type;
  if (content.type === "placeholder") {
    return `${i}a!richTextDisplayField(
${i}  labelPosition: "COLLAPSED",
${i}  value: a!richTextItem(text: "${label}", color: "SECONDARY")
${i})`;
  }
  return `${i}a!sectionLayout(
${i}  label: "${label}",
${i}  labelColor: "STANDARD",
${i}  contents: {}
${i})`;
}

function renderSkeletonPane(pane, indent) {
  const i = indent;
  const bg = pane.backgroundColor ? `\n${i}  backgroundColor: "${pane.backgroundColor}",` : "";
  const contentSail = renderSkeletonPaneContent(pane.content, i + "    ");
  return `${i}a!pane(
${i}  width: "${pane.width}",${bg}
${i}  contents: {
${contentSail}
${i}  },
${i}  padding: "STANDARD"
${i})`;
}

function renderSkeleton(def) {
  const { title, headerSubtitle, panes } = def;
  const theme = resolveTheme(def.theme);

  let body;
  if (headerSubtitle) {
    const panesSail = panes.map((pane) => renderSkeletonPane(pane, "        ")).join(",\n\n");
    body = `a!headerContentLayout(
    header: {
${renderHeaderBlock(title, headerSubtitle, "      ", theme)}
    },
    contents: a!paneLayout(
      panes: {
${panesSail}
      }
    ),
    contentsPadding: "NONE"
  )`;
  } else {
    const panesSail = panes.map((pane) => renderSkeletonPane(pane, "      ")).join(",\n\n");
    body = `a!paneLayout(
    panes: {
${panesSail}
    }
  )`;
  }

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
      "Pane template requires a definition JSON with a \"panes\" array. " +
      "Use the definition pipeline: node generator/define.js --write <uuid> '<json>' " +
      "then node generator/scaffold.js --from-definition <uuid>"
    );
  }
  const isSkeleton = opts.definition.panes.every((p) => p.content && p.content.skeleton === true);
  if (isSkeleton) {
    return renderSkeleton(opts.definition);
  }
  return renderFromDefinition(opts.definition);
}

module.exports = { render, renderFromDefinition, renderSkeleton };
