/**
 * templates/layout.js
 *
 * Generates a single, isolated SAIL fragment from an arbitrary layout-tree
 * node — the general form of templates/component.js. Where "component" is
 * scoped to exactly one grid/chart/kpis leaf, "layout" accepts any
 * container/leaf node, arbitrarily nested (a columnsLayout of cardGroups of
 * repeatingCards, a tabLayout containing grids, etc.) — see layout-tree.js
 * for the container/leaf vocabulary.
 *
 * PAGE FRAMING (optional): by default a layout fragment has NO framing — no
 * a!headerContentLayout, no header bar, no "New X" button (same isolation
 * contract as component.js). BUT when the definition carries a "headerKind"
 * (PLAIN_CARD / HERO / BILLBOARD / NONE), the rendered layout-tree body is
 * wrapped in the shared page frame — the same a!headerContentLayout +
 * gutter-column shell grid/dashboard/record-view use. This is what turns a
 * "billboard header + cards in columns" page (e.g. a marketing home page)
 * into a scaffold-pipeline output instead of hand-written SAIL: header via
 * headerKind, body via the layout-tree.
 */

const layoutTree = require("../layout-tree");
const { renderPageFrame, BODY_INDENT } = require("../page-frame");
// Ensure grid/chart/kpis leaves are registered (dashboard.js registers them
// as a side effect of being required).
require("./dashboard");

// A layout is "framed" when it opts into a page header via headerKind.
// Without it, the historical bare-fragment behavior is preserved exactly.
function isFramed(def) {
  return def.headerKind !== undefined;
}

function renderFromDefinition(def) {
  const { title, root } = def;
  const state = {};
  const varDecls = layoutTree.collectVarDecls(root, state);
  const framed = isFramed(def);
  // Framed bodies render at the page frame's center-column indent (14 spaces),
  // matching grid/dashboard/record-view; bare fragments stay at 2 spaces.
  const body = layoutTree.renderNode(root, framed ? BODY_INDENT : "  ", {});

  const inner = framed
    ? renderPageFrame({
        title,
        headerKind: def.headerKind,
        headerSubtitle: def.headerSubtitle,
        headerImage: def.headerImage,
        body,
      })
    : body;

  const framingNote = framed
    ? "page-framed layout-tree (a!headerContentLayout + layout-tree body)."
    : "isolated layout-tree fragment, no page framing.";

  return `/*
 * ${title}
 * Generated from definition.json — ${framingNote}
 *
 * TODO-CONVERTER comments mark spots that need transformation
 * when converting from mockup to production SAIL.
 */
a!localVariables(
${varDecls ? varDecls + "\n\n" : ""}${inner}
)`;
}

function renderSkeleton(def) {
  const { title, root } = def;
  const framed = isFramed(def);
  const body = layoutTree.renderSkeletonNode(root, framed ? BODY_INDENT : "  ");

  const inner = framed
    ? renderPageFrame({
        title,
        headerKind: def.headerKind,
        headerSubtitle: def.headerSubtitle,
        headerImage: def.headerImage,
        body,
      })
    : body;

  return `/*
 * ${title}
 * SKELETON — placeholder structure for instant preview.
 * Will be replaced by the full definition scaffold.
 */
a!localVariables(
${inner}
)`;
}

function render(opts) {
  if (!opts.definition) {
    throw new Error(
      "Layout template requires a definition JSON with a \"root\" layout-tree node. " +
      "Use the definition pipeline: node generator/define.js --write <uuid> '<json>' " +
      "then node generator/scaffold.js --from-definition <uuid>"
    );
  }
  if (opts.definition.root && opts.definition.root.skeleton === true) {
    return renderSkeleton(opts.definition);
  }
  return renderFromDefinition(opts.definition);
}

module.exports = { render, renderFromDefinition, renderSkeleton };
