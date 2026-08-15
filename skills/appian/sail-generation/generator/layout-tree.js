/**
 * layout-tree.js
 *
 * General-purpose recursive layout/component planner.
 *
 * This is the generalized engine extracted from dashboard.js's sections
 * array (which was already a small closed recursion: "columns" containing
 * kpis/chart/grid). This module opens that up into two extensible
 * vocabularies so any page type — dashboard, record-view, pane, component —
 * can describe "a bunch of things arranged in a shape" as data, instead of
 * each page type re-inventing its own bespoke container/leaf schema.
 *
 * VOCABULARY
 * ==========
 *
 * CONTAINER nodes hold other nodes; they contribute no unique content:
 *   - columns:    N side-by-side columns (a!columnsLayout), equal-width AUTO
 *   - cardGroup:  N repeating cards, uniform width, wraps (a!cardGroupLayout)
 *   - sideBySide: flex-0 pairs/groups (a!sideBySideLayout) — icon+text, label+value
 *   - tabs:       N mutually-exclusive views (a!tabLayout)
 *
 * LEAF nodes terminate a branch and render actual content. Each leaf type
 * is a registry entry — see LEAF_TYPES below — with a uniform interface:
 *   { validate(node, context, errors), render(node, indent), renderSkeleton(node, indent),
 *     collectVarDecls(node, state) }
 *
 * Existing leaf renderers (grid/chart/kpis) are NOT reimplemented here —
 * they still live in dashboard.js (their original home) and are wired into
 * the registry by reference, so dashboard.js/pane.js/component.js keep
 * working unchanged while record-view (and anything else) gets the same
 * recursive planner via this module.
 *
 * A node is either:
 *   { "layout": "columns" | "cardGroup" | "sideBySide" | "tabs" | "card", "items": [...], "label"?: string }
 *   { "leaf": "grid" | "chart" | "kpis" | "keyValueList" | "tagGroup" | "richTextBlock" | "banner" | "imageCard" | "stamp" | "heading" | "itemList", ...leafProps }
 *
 * The planner's job for an LLM caller is exactly: "is this chunk of the
 * request a container (how many children, what layout) or a leaf (which
 * leaf type)?" — recurse until every branch terminates in a leaf. Anything
 * that is neither a known container shape nor a known leaf shape is where
 * the LLM should stop planning and hand-write SAIL instead.
 */

const { toSailValue, renderTagColorExpr } = require("./templates/grid");

// =============================================================================
// LEAF REGISTRY
// =============================================================================
// Populated lazily for grid/chart/kpis (to avoid a require() cycle with
// dashboard.js, which itself may want to use the "columns" container via
// this module). Call registerCoreLeaves(dashboardModule) once, from any
// entry point that has already loaded dashboard.js.

const LEAF_TYPES = {};

function registerLeaf(name, impl) {
  LEAF_TYPES[name] = impl;
}

/**
 * Wires grid/chart/kpis into the registry using dashboard.js's existing
 * renderers (renderGridSection/renderChartSection/renderKpisSection/
 * renderSkeletonSection), so there is exactly one implementation of each,
 * reused everywhere. Idempotent — safe to call multiple times.
 */
function registerCoreLeaves(dashboardModule) {
  const {
    renderKpisSection,
    renderChartSection,
    renderGridSection,
    renderSkeletonSection,
    collectKpiDecls,
  } = dashboardModule;

  registerLeaf("kpis", {
    validate(node, context, errors) {
      const { validateKpisItems } = require("./define");
      validateKpisItems(node.items, context, errors);
    },
    render(node, indent, state) {
      const offset = state.kpiOffset || 0;
      const result = renderKpisSection(node, offset, indent);
      state.kpiOffset = offset + node.items.length;
      return result;
    },
    renderSkeleton(node, indent) {
      return renderSkeletonSection({ ...node, type: "kpis" }, indent);
    },
    collectVarDecls(node) {
      return collectKpiDecls([{ type: "kpis", items: node.items }]);
    },
  });

  registerLeaf("chart", {
    validate(node, context, errors) {
      const { validateChartFields } = require("./define");
      validateChartFields(node, context, errors);
    },
    render(node, indent) {
      return renderChartSection(node, indent);
    },
    renderSkeleton(node, indent) {
      return renderSkeletonSection({ ...node, type: "chart" }, indent);
    },
    collectVarDecls() {
      return "";
    },
  });

  registerLeaf("grid", {
    validate(node, context, errors) {
      const { validateGridColumnsAndRows } = require("./define");
      validateGridColumnsAndRows(node.columns, node.rows, context, errors);
      if (node.filters) {
        errors.push(`${context}: "filters" is not supported inside a layout-tree grid leaf — they render without search/filter chrome.`);
      }
    },
    render(node, indent, state) {
      state.gridIndex = (state.gridIndex || 0) + 1;
      return renderGridSection(node, state.gridIndex, indent);
    },
    renderSkeleton(node, indent) {
      return renderSkeletonSection({ ...node, type: "grid" }, indent);
    },
    collectVarDecls(node, state) {
      const { renderRowsFromDefinition } = require("./templates/grid");
      state.gridIndex = (state.gridIndex || 0) + 1;
      const idx = state.gridIndex;
      const rows = renderRowsFromDefinition(node.columns, node.rows, "    ");
      return `  /* TODO-CONVERTER: Replace with record type data source */\n  local!layoutGrid${idx}Data: {\n${rows}\n  },`;
    },
  });
}

// ---------------------------------------------------------------------------
// New leaf: keyValueList — label/value pairs, no card chrome (lighter-weight
// than record-view's "sections", useful as a nested leaf inside a container).
// ---------------------------------------------------------------------------
registerLeaf("keyValueList", {
  validate(node, context, errors) {
    if (!Array.isArray(node.items) || node.items.length === 0) {
      errors.push(`${context}: "items" must be a non-empty array of { label, value }`);
      return;
    }
    node.items.forEach((item, ii) => {
      const ic = `${context}.items[${ii}]`;
      if (!item.label) errors.push(`${ic}: "label" is required`);
      if (item.value === undefined || item.value === null || item.value === "") {
        errors.push(`${ic}: "value" is required`);
      }
    });
  },
  render(node, indent) {
    const i = indent;
    const rows = node.items
      .map(
        (item) =>
          `${i}  a!richTextDisplayField(\n${i}    label: "${item.label}",\n${i}    value: a!richTextItem(text: ${toSailValue(item.value)}, color: "#262626")\n${i}  )`
      )
      .join(",\n");
    return `${i}a!sectionLayout(\n${i}  label: "${node.label || "Details"}",\n${i}  labelColor: "STANDARD",\n${i}  contents: {\n${rows}\n${i}  }\n${i})`;
  },
  renderSkeleton(node, indent) {
    const i = indent;
    return `${i}a!sectionLayout(\n${i}  label: "${node.label || "Details"}",\n${i}  labelColor: "STANDARD",\n${i}  contents: {}\n${i})`;
  },
  collectVarDecls() {
    return "";
  },
});

// ---------------------------------------------------------------------------
// New leaf: tagGroup — a row of short chip/tag text (e.g. criteria lists,
// skill tags). One or two words each, colored via the same tagColors map
// convention used by grid tag columns and record-view tag fields.
// ---------------------------------------------------------------------------
registerLeaf("tagGroup", {
  validate(node, context, errors) {
    const { isValidTagColor } = require("./define");
    if (!Array.isArray(node.items) || node.items.length === 0) {
      errors.push(`${context}: "items" must be a non-empty array of { text, color? }`);
      return;
    }
    node.items.forEach((item, ii) => {
      const ic = `${context}.items[${ii}]`;
      if (!item.text) errors.push(`${ic}: "text" is required`);
      if (item.color && !isValidTagColor(item.color)) {
        errors.push(`${ic}: "color" must be ACCENT/POSITIVE/NEGATIVE/SECONDARY or a hex color, got: ${JSON.stringify(item.color)}`);
      }
    });
  },
  render(node, indent) {
    const i = indent;
    const tags = node.items
      .map((item) => `${i}    a!tagItem(text: ${toSailValue(item.text)}, backgroundColor: "${item.color || "SECONDARY"}")`)
      .join(",\n");
    const labelLine = node.label
      ? `${i}  label: "${node.label}",\n`
      : `${i}  labelPosition: "COLLAPSED",\n`;
    return `${i}a!tagField(\n${labelLine}${i}  tags: {\n${tags}\n${i}  },\n${i}  size: "STANDARD"\n${i})`;
  },
  renderSkeleton(node, indent) {
    const i = indent;
    return `${i}a!tagField(\n${i}  labelPosition: "COLLAPSED",\n${i}  tags: {},\n${i}  size: "STANDARD"\n${i})`;
  },
  collectVarDecls() {
    return "";
  },
});

// a!cardLayout's "style" enum is NOT the same as the tag-color convention
// (POSITIVE/NEGATIVE/SECONDARY/ACCENT) used by tagField/stampField — cards
// use their own enum. Map the familiar RAG vocabulary onto it so callers
// can still say "POSITIVE"/"NEGATIVE" (matching tagColors elsewhere in the
// same definition) without needing to know cardLayout's specific enum.
const CARD_STYLE_VALUES = [
  "NONE", "TRANSPARENT", "STANDARD", "ACCENT", "SUCCESS", "INFO", "WARN", "ERROR",
  "CHARCOAL_SCHEME", "NAVY_SCHEME", "PLUM_SCHEME",
];
const CARD_STYLE_ALIASES = {
  POSITIVE: "SUCCESS",
  NEGATIVE: "ERROR",
  SECONDARY: "STANDARD",
};
function resolveCardStyle(color) {
  if (!color) return "STANDARD";
  if (CARD_STYLE_ALIASES[color]) return CARD_STYLE_ALIASES[color];
  return color; // already a valid cardLayout style keyword or hex color
}
function isValidCardStyle(color) {
  return CARD_STYLE_VALUES.includes(color) || CARD_STYLE_ALIASES[color] !== undefined || /^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/.test(color);
}

// ---------------------------------------------------------------------------
// New leaf: itemList — N repeating cards of the SAME shape. This is the ONE
// leaf for any "list of same-shaped records" content — comments, messages,
// notifications, activity/audit entries, notes, and any other feed-like
// list — generalizing card_lists.md's "message list card" pattern: white
// card (style: "#FFFFFF"), dark title/body text, avatar + title + body text
// + trailing timestamp/tag. Cards are always white/light with dark text —
// there is no per-item color parameter — precisely so an LLM caller can't
// reproduce the white-title-on-light-card contrast bug a colored-card leaf
// invites. (Tiered/RAG/colored cards where a vivid background IS the
// intent are a different shape — arrange N `card` containers, each with its
// own `style`/`headerColor`, inside a `cardGroup`.)
// Data-driven — the LLM supplies "items" (an array of plain field maps)
// ONCE, plus two leaf-level style flags; the renderer forEach's over them.
// A list of N same-shaped records has no per-item SAIL to author, so it
// belongs in the cheap definition->scaffold pipeline, not a Pass 3 LLM
// SAIL-authoring step.
// ---------------------------------------------------------------------------
const AVATAR_DEFAULT_COLORS = ["#3B82F6", "#8B5CF6", "#EC4899", "#F59E0B", "#10B981", "#6366F1"];

registerLeaf("itemList", {
  validate(node, context, errors) {
    const { isValidTagColor } = require("./define");
    const avatarType = node.avatarType || "text";
    const trailingType = node.trailingType || "text";

    if (!["text", "icon"].includes(avatarType)) {
      errors.push(`${context}: "avatarType" must be "text" or "icon", got: ${JSON.stringify(node.avatarType)}`);
    }
    if (!["text", "tag", "none"].includes(trailingType)) {
      errors.push(`${context}: "trailingType" must be "text", "tag", or "none", got: ${JSON.stringify(node.trailingType)}`);
    }

    // Data-bound path (live record views only): bind this itemList to a
    // dataBinding.relatedRecordData[] collection instead of hardcoded mock
    // "items" — the referenced entry's own "itemFields" mapping (already
    // validated as part of dataBinding) drives the per-item card shape, via
    // renderRelatedCollectionBlock in templates/record-view.js. This is the
    // ONLY way to place a relatedRecordData collection's rendered feed
    // on the page — declaring itemFields on the relatedRecordData entry
    // alone does not do it. Cross-checked against dataBinding (does the
    // localName resolve? does that entry have itemFields?) separately in
    // define.js's validateRecordViewDefinition, mirroring how fieldRef is
    // cross-checked outside this per-leaf validate.
    if (node.collectionRef !== undefined) {
      if (typeof node.collectionRef !== "string" || !node.collectionRef) {
        errors.push(`${context}: "collectionRef" must be a non-empty string`);
      }
      if (node.items !== undefined) {
        errors.push(`${context}: "collectionRef" and "items" are mutually exclusive — use "collectionRef" to bind to a dataBinding.relatedRecordData collection (its own "itemFields" mapping drives per-item rendering), or "items" for hardcoded mock data, not both`);
      }
      return;
    }

    if (!Array.isArray(node.items) || node.items.length === 0) {
      errors.push(`${context}: "items" must be a non-empty array`);
      return;
    }
    node.items.forEach((item, ii) => {
      const ic = `${context}.items[${ii}]`;
      if (!item.title) errors.push(`${ic}: "title" is required`);
      if (!item.text) errors.push(`${ic}: "text" is required`);
      if (avatarType === "text" && !item.avatarText) {
        errors.push(`${ic}: "avatarText" is required when avatarType is "text" (default)`);
      }
      if (avatarType === "icon" && !item.avatarIcon) {
        errors.push(`${ic}: "avatarIcon" is required when avatarType is "icon"`);
      }
      if (item.avatarColor && !/^#[0-9A-Fa-f]{6}$/.test(item.avatarColor)) {
        errors.push(`${ic}: "avatarColor" must be a hex color, got: ${JSON.stringify(item.avatarColor)}`);
      }
      if (trailingType === "text" && !item.trailing) {
        errors.push(`${ic}: "trailing" is required when trailingType is "text" (default)`);
      }
      if (trailingType === "tag") {
        if (!item.tag) errors.push(`${ic}: "tag" is required when trailingType is "tag"`);
        if (!item.tagColor) {
          errors.push(`${ic}: "tagColor" is required when trailingType is "tag"`);
        } else if (!isValidTagColor(item.tagColor)) {
          errors.push(`${ic}: "tagColor" must be ACCENT/POSITIVE/NEGATIVE/SECONDARY or a hex color, got: ${JSON.stringify(item.tagColor)}`);
        }
      }
    });
  },
  render(node, indent, state) {
    const i = indent;

    // Data-bound path — delegate entirely to renderRelatedCollectionBlock,
    // which already renders the if(isNotNullOrEmpty(...), a!forEach(itemFields
    // card), <empty-state>) shape for a relatedRecordData entry. No mock
    // a!cardGroupLayout/local!itemListNData involved on this path at all.
    if (node.collectionRef !== undefined) {
      const { renderRelatedCollectionBlock } = require("./templates/record-view");
      const dataBinding = state.dataBinding;
      const rrd = (dataBinding && dataBinding.relatedRecordData || [])
        .find((r) => r.localName === node.collectionRef);
      // Guarded by define.js's validateRecordViewDefinition before render ever
      // runs — rrd is always found on a validated definition. Defensive only.
      const block = rrd ? renderRelatedCollectionBlock(rrd, i) : `${i}/* TODO-DATA-MODEL: collectionRef "${node.collectionRef}" not found in dataBinding.relatedRecordData */`;
      if (!node.label) return block;
      return `${i}a!sectionLayout(\n${i}  label: "${node.label}",\n${i}  labelColor: "STANDARD",\n${i}  contents: {\n${block}\n${i}  }\n${i})`;
    }

    state.itemListIndex = (state.itemListIndex || 0) + 1;
    const idx = state.itemListIndex;
    const varName = `local!itemList${idx}Data`;
    const avatarType = node.avatarType || "text";
    const trailingType = node.trailingType || "text";
    const cardWidth = node.cardWidth || "WIDE_PLUS";

    const avatarItem =
      avatarType === "icon"
        ? `${i}      a!sideBySideItem(\n${i}        item: a!stampField(\n${i}          icon: fv!item.avatarIcon,\n${i}          backgroundColor: fv!item.avatarColor,\n${i}          contentColor: "#FFFFFF",\n${i}          size: "SMALL",\n${i}          shape: "SEMI_ROUNDED",\n${i}          labelPosition: "COLLAPSED"\n${i}        ),\n${i}        width: "MINIMIZE"\n${i}      )`
        : `${i}      a!sideBySideItem(\n${i}        item: a!stampField(\n${i}          text: fv!item.avatarText,\n${i}          backgroundColor: fv!item.avatarColor,\n${i}          contentColor: "#FFFFFF",\n${i}          size: "TINY",\n${i}          shape: "SEMI_ROUNDED",\n${i}          labelPosition: "COLLAPSED"\n${i}        ),\n${i}        width: "MINIMIZE"\n${i}      )`;

    const bodyItem = `${i}      a!sideBySideItem(\n${i}        item: a!richTextDisplayField(\n${i}          labelPosition: "COLLAPSED",\n${i}          value: {\n${i}            a!richTextItem(text: fv!item.title, style: "STRONG", size: "MEDIUM", color: "#262626"),\n${i}            char(10),\n${i}            a!richTextItem(text: fv!item.text, color: "#6B7280", size: "STANDARD")\n${i}          }\n${i}        ),\n${i}        width: "AUTO"\n${i}      )`;

    let trailingItem = "";
    if (trailingType === "text") {
      trailingItem = `,\n${i}      a!sideBySideItem(\n${i}        item: a!richTextDisplayField(\n${i}          labelPosition: "COLLAPSED",\n${i}          align: "RIGHT",\n${i}          value: a!richTextItem(text: fv!item.trailing, color: "#9CA3AF", size: "SMALL")\n${i}        ),\n${i}        width: "MINIMIZE"\n${i}      )`;
    } else if (trailingType === "tag") {
      trailingItem = `,\n${i}      a!sideBySideItem(\n${i}        item: a!tagField(\n${i}          labelPosition: "COLLAPSED",\n${i}          tags: a!tagItem(text: fv!item.tag, backgroundColor: fv!item.tagColor),\n${i}          size: "SMALL"\n${i}        ),\n${i}        width: "MINIMIZE"\n${i}      )`;
    }

    const cardGroup = `${i}a!cardGroupLayout(
${i}  cards: a!forEach(
${i}    items: ${varName},
${i}    expression: a!cardLayout(
${i}      contents: {
${i}        a!sideBySideLayout(
${i}          items: {
${avatarItem},
${bodyItem}${trailingItem}
${i}          },
${i}          alignVertical: "TOP",
${i}          spacing: "STANDARD"
${i}        )
${i}      },
${i}      style: "#FFFFFF",
${i}      showBorder: true(),
${i}      padding: "STANDARD",
${i}      shape: "ROUNDED"
${i}    )
${i}  ),
${i}  cardWidth: "${cardWidth}",
${i}  spacing: "DENSE",
${i}  marginBelow: "STANDARD"
${i})`;

    if (!node.label) return cardGroup;
    return `${i}a!sectionLayout(\n${i}  label: "${node.label}",\n${i}  labelColor: "STANDARD",\n${i}  contents: {\n${cardGroup}\n${i}  }\n${i})`;
  },
  renderSkeleton(node, indent) {
    const i = indent;
    return `${i}a!sectionLayout(\n${i}  label: "${node.label || "Items"}",\n${i}  labelColor: "STANDARD",\n${i}  contents: {}\n${i})`;
  },
  collectVarDecls(node, state) {
    // Data-bound path — the local!{localName} binding for the referenced
    // relatedRecordData collection is already declared by the Query_Prologue
    // (renderBindingLocals in templates/record-view.js); this leaf needs no
    // var decl of its own on this path.
    if (node.collectionRef !== undefined) return "";

    state.itemListIndex = (state.itemListIndex || 0) + 1;
    const idx = state.itemListIndex;
    const avatarType = node.avatarType || "text";
    const trailingType = node.trailingType || "text";

    const rows = node.items
      .map((item, ii) => {
        const fields = [];
        if (avatarType === "icon") {
          fields.push(`avatarIcon: ${toSailValue(item.avatarIcon)}`);
        } else {
          fields.push(`avatarText: ${toSailValue(item.avatarText)}`);
        }
        const avatarColor = item.avatarColor || AVATAR_DEFAULT_COLORS[ii % AVATAR_DEFAULT_COLORS.length];
        fields.push(`avatarColor: ${toSailValue(avatarColor)}`);
        fields.push(`title: ${toSailValue(item.title)}`);
        fields.push(`text: ${toSailValue(item.text)}`);
        if (trailingType === "text") {
          fields.push(`trailing: ${toSailValue(item.trailing)}`);
        } else if (trailingType === "tag") {
          fields.push(`tag: ${toSailValue(item.tag)}`);
          fields.push(`tagColor: ${toSailValue(item.tagColor)}`);
        }
        return `    a!map(${fields.join(", ")})`;
      })
      .join(",\n");

    return `  /* TODO-CONVERTER: Replace with record type data source (e.g. a!relatedRecordData() over the relationship — see conversion-relationships.md's One-to-many pattern) */\n  local!itemList${idx}Data: {\n${rows}\n  },`;
  },
});

// ---------------------------------------------------------------------------
// New leaf: richTextBlock — a plain paragraph of formatted text, no card.
// ---------------------------------------------------------------------------
registerLeaf("richTextBlock", {
  validate(node, context, errors) {
    if (!node.text) errors.push(`${context}: "text" is required`);
  },
  render(node, indent) {
    const i = indent;
    return `${i}a!richTextDisplayField(\n${i}  labelPosition: "COLLAPSED",\n${i}  value: a!richTextItem(text: ${toSailValue(node.text)}, color: "#262626")\n${i})`;
  },
  renderSkeleton(node, indent) {
    const i = indent;
    return `${i}a!richTextDisplayField(\n${i}  labelPosition: "COLLAPSED",\n${i}  value: a!richTextItem(text: "", color: "#262626")\n${i})`;
  },
  collectVarDecls() {
    return "";
  },
});

// ---------------------------------------------------------------------------
// New leaf: stamp — a single stamp element (icon + optional text + optional
// color). Modeled on the stamp emitted inside renderKpiCard. The finest
// granularity needed for an "icon-then-title" row inside a sideBySide.
// ---------------------------------------------------------------------------
const STAMP_DEFAULT_COLOR = "#2C3E50"; // page-primary; matches KPI_DEFAULT_COLORS[0]

registerLeaf("stamp", {
  validate(node, context, errors) {
    if (!node.icon && !node.text) {
      errors.push(`${context}: a "stamp" requires at least one of "icon" or "text"`);
    }
    if (node.color && !/^#[0-9A-Fa-f]{6}$/.test(node.color)) {
      errors.push(`${context}: "color" must be a hex color, got: ${JSON.stringify(node.color)}`);
    }
    if (node.icon) {
      const { validateIcon } = require("./define");
      validateIcon(node.icon, `${context}.icon`, errors);
    }
  },
  render(node, indent) {
    const i = indent;
    const icon = node.icon || "circle";
    const color = node.color || STAMP_DEFAULT_COLOR;
    // Built as a joined list rather than interpolated fragments: the optional
    // text/labelPosition params sit at opposite ends of the call, so hand-placed
    // commas silently produced "shape: "ROUNDED"\n  labelPosition: ...," —
    // a missing separator plus a trailing comma — on every icon-only stamp.
    const params = [];
    if (node.text) params.push(`text: ${toSailValue(node.text)}`);
    params.push(`icon: "${icon}"`);
    params.push(`backgroundColor: "${color}"`);
    params.push(`contentColor: "#FFFFFF"`);
    params.push(`size: "SMALL"`);
    params.push(`shape: "ROUNDED"`);
    if (!node.text) params.push(`labelPosition: "COLLAPSED"`);
    return `${i}a!stampField(\n${params.map((p) => `${i}  ${p}`).join(",\n")}\n${i})`;
  },
  renderSkeleton(node, indent) {
    const i = indent;
    const color = node.color || STAMP_DEFAULT_COLOR;
    return `${i}a!stampField(\n${i}  icon: "circle",\n${i}  backgroundColor: "${color}",\n${i}  contentColor: "#FFFFFF",\n${i}  size: "SMALL",\n${i}  shape: "ROUNDED",\n${i}  labelPosition: "COLLAPSED"\n${i})`;
  },
  collectVarDecls() {
    return "";
  },
});

// ---------------------------------------------------------------------------
// New leaf: heading — a standalone title/heading row, distinct from
// richTextBlock (which is a paragraph). Renders a!headingField.
// ---------------------------------------------------------------------------
const HEADING_SIZES = ["SMALL", "MEDIUM", "LARGE", "EXTRA_LARGE"];

registerLeaf("heading", {
  validate(node, context, errors) {
    if (!node.text) errors.push(`${context}: "text" is required`);
    if (node.size && !HEADING_SIZES.includes(node.size)) {
      errors.push(`${context}: "size" must be one of [${HEADING_SIZES.join(", ")}], got: ${JSON.stringify(node.size)}`);
    }
  },
  render(node, indent) {
    const i = indent;
    const size = node.size || "MEDIUM";
    return `${i}a!headingField(\n${i}  text: ${toSailValue(node.text)},\n${i}  size: "${size}",\n${i}  headingTag: "H2",\n${i}  marginBelow: "STANDARD"\n${i})`;
  },
  renderSkeleton(node, indent) {
    const i = indent;
    const text = (node.text || "Heading").replace(/"/g, '""');
    return `${i}a!headingField(\n${i}  text: "${text}",\n${i}  size: "MEDIUM",\n${i}  headingTag: "H2"\n${i})`;
  },
  collectVarDecls() {
    return "";
  },
});

// ---------------------------------------------------------------------------
// New leaf: imageCard — a single card led by a photo, with a heading, body
// text, and an optional trailing link. The marketing/"content card" shape
// used by home pages, product/room tiles, feature grids, etc. — the piece a
// billboard-header page's body is usually made of.
//
// The image is rendered as an a!billboardLayout (NOT a bare a!imageField) so
// every card in a group gets an identical image height regardless of the
// source photo's aspect ratio — the card_lists.md convention. The outer card
// carries padding: "NONE" so the photo sits edge-to-edge; an inner card holds
// the padded text block.
// ---------------------------------------------------------------------------
const IMAGE_CARD_HEIGHTS = [
  "EXTRA_SHORT", "SHORT", "SHORT_PLUS", "MEDIUM", "MEDIUM_PLUS", "TALL", "TALL_PLUS", "EXTRA_TALL",
];
registerLeaf("imageCard", {
  validate(node, context, errors) {
    if (!node.image || typeof node.image !== "string") {
      errors.push(`${context}: "image" (an image URL string) is required`);
    }
    if (!node.heading) errors.push(`${context}: "heading" is required`);
    if (node.imageHeight !== undefined && !IMAGE_CARD_HEIGHTS.includes(node.imageHeight)) {
      errors.push(`${context}: "imageHeight" must be one of [${IMAGE_CARD_HEIGHTS.join(", ")}], got: ${JSON.stringify(node.imageHeight)}`);
    }
    if (node.link !== undefined && !node.link.text) {
      errors.push(`${context}.link: "text" is required`);
    }
  },
  render(node, indent) {
    const i = indent;
    const height = node.imageHeight || "SHORT_PLUS";
    const textLine = node.text
      ? `,\n${i}      a!richTextDisplayField(\n${i}        labelPosition: "COLLAPSED",\n${i}        value: a!richTextItem(text: ${toSailValue(node.text)}, color: "#6B7280", size: "STANDARD")\n${i}      )`
      : "";
    const linkLine = node.link
      ? `,\n${i}      a!richTextDisplayField(\n${i}        labelPosition: "COLLAPSED",\n${i}        marginAbove: "STANDARD",\n${i}        value: a!richTextItem(text: ${toSailValue(node.link.text)}, link: a!dynamicLink(), linkStyle: "STANDALONE", color: "ACCENT", style: "STRONG")\n${i}      )`
      : "";
    return `${i}a!cardLayout(
${i}  contents: {
${i}    a!billboardLayout(
${i}      backgroundMedia: a!webImage(source: ${toSailValue(node.image)}),
${i}      backgroundColor: "#F0F0F0",
${i}      height: "${height}",
${i}      marginBelow: "NONE"
${i}    ),
${i}    a!cardLayout(
${i}      contents: {
${i}        a!richTextDisplayField(
${i}          labelPosition: "COLLAPSED",
${i}          value: a!richTextItem(text: ${toSailValue(node.heading)}, style: "STRONG", color: "#262626", size: "MEDIUM")
${i}        )${textLine}${linkLine}
${i}      },
${i}      style: "NONE",
${i}      padding: "STANDARD",
${i}      showBorder: false(),
${i}      marginBelow: "NONE"
${i}    )
${i}  },
${i}  style: "NONE",
${i}  padding: "NONE",
${i}  showBorder: true(),
${i}  shape: "SEMI_ROUNDED",
${i}  marginBelow: "STANDARD"
${i})`;
  },
  renderSkeleton(node, indent) {
    const i = indent;
    const height = node.imageHeight || "SHORT_PLUS";
    return `${i}a!cardLayout(\n${i}  contents: {\n${i}    a!billboardLayout(\n${i}      backgroundColor: "#F0F0F0",\n${i}      height: "${height}",\n${i}      marginBelow: "NONE"\n${i}    ),\n${i}    a!cardLayout(\n${i}      contents: {\n${i}        a!richTextDisplayField(\n${i}          labelPosition: "COLLAPSED",\n${i}          value: a!richTextItem(text: "${(node.heading || "").replace(/"/g, '""')}", style: "STRONG", color: "#262626", size: "MEDIUM")\n${i}        )\n${i}      },\n${i}      style: "NONE",\n${i}      padding: "STANDARD",\n${i}      showBorder: false()\n${i}    )\n${i}  },\n${i}  style: "NONE",\n${i}  padding: "NONE",\n${i}  showBorder: true(),\n${i}  shape: "SEMI_ROUNDED",\n${i}  marginBelow: "STANDARD"\n${i})`;
  },
  collectVarDecls() {
    return "";
  },
});

// ---------------------------------------------------------------------------
// New leaf: banner — an informational/warning/success/error/closed message
// card (guidelines/ui-guidelines/patterns/messages.md). Entirely mechanical:
// the icon, icon color, and card background are 100% determined by
// "severity" — nothing left for the LLM to decide there. Only the message
// text (and optional actions) vary.
// ---------------------------------------------------------------------------
const BANNER_SEVERITIES = {
  INFO:    { style: "#F0F2FC", icon: "info-circle",          iconColor: "#143CCC" },
  SUCCESS: { style: "#EDFCEA", icon: "check-circle",         iconColor: "#24990F" },
  WARN:    { style: "#FFF9DB", icon: "exclamation-triangle", iconColor: "#E5BF00" },
  ERROR:   { style: "#FFEFEF", icon: "exclamation-triangle", iconColor: "#B22D2D" },
  CLOSED:  { style: "#F2F2F5", icon: "lock",                 iconColor: "#5C5C66" },
};
const BANNER_BUTTON_STYLES = ["OUTLINE", "GHOST", "LINK", "SOLID"];

registerLeaf("banner", {
  validate(node, context, errors) {
    if (!node.severity || !BANNER_SEVERITIES[node.severity]) {
      errors.push(`${context}: "severity" must be one of [${Object.keys(BANNER_SEVERITIES).join(", ")}], got: ${JSON.stringify(node.severity)}`);
    }
    if (!node.text) errors.push(`${context}: "text" is required`);
    if (node.link !== undefined) {
      if (!node.link.text) errors.push(`${context}.link: "text" is required`);
    }
    if (node.buttons !== undefined) {
      if (!Array.isArray(node.buttons) || node.buttons.length === 0 || node.buttons.length > 2) {
        errors.push(`${context}: "buttons" must be an array with 1-2 entries (messages.md: "Avoid placing more than two actions in a banner")`);
      } else {
        node.buttons.forEach((b, bi) => {
          if (!b.label) errors.push(`${context}.buttons[${bi}]: "label" is required`);
        });
      }
    }
    if (node.link !== undefined && node.buttons !== undefined) {
      errors.push(`${context}: "link" and "buttons" are mutually exclusive — messages.md shows banners with either a standalone link OR action buttons, never both`);
    }
    if (node.dismissible === true && node.dismissLabel !== undefined && typeof node.dismissLabel !== "string") {
      errors.push(`${context}: "dismissLabel" must be a string`);
    }
  },
  render(node, indent) {
    const i = indent;
    const sev = BANNER_SEVERITIES[node.severity];
    const persistent = node.persistent === true;

    // Trailing element: dismiss icon (dismissible), OR 1-2 action buttons,
    // OR a standalone link, OR nothing. At most one of these per messages.md.
    let trailingItem = "";
    if (node.dismissible === true) {
      const label = node.dismissLabel || "this message";
      // NOTE: messages.md's own dismiss-icon example uses icon: "close", but
      // "close" is not a verified alias in rich-text-icon-aliases.md — using
      // it would fail icon validation. "times" is the closest verified
      // equivalent (the standard X/dismiss glyph).
      trailingItem = `${i}          a!sideBySideItem(\n${i}            item: a!richTextDisplayField(\n${i}              labelPosition: "COLLAPSED",\n${i}              value: a!richTextIcon(\n${i}                icon: "times",\n${i}                color: "#000000",\n${i}                link: a!dynamicLink(),\n${i}                linkStyle: "STANDALONE",\n${i}                accessibilityText: "Dismiss ${label.replace(/"/g, '""')}"\n${i}              ),\n${i}              marginAbove: "NONE",\n${i}              marginBelow: "NONE"\n${i}            ),\n${i}            width: "MINIMIZE"\n${i}          ),\n`;
    } else if (Array.isArray(node.buttons) && node.buttons.length > 0) {
      // 1 action -> SECONDARY/SOLID; 2 actions -> SOLID (primary) + LINK (secondary);
      // all SMALL — per messages.md's action guidance.
      const buttons = node.buttons.map((b, bi) => {
        const style = node.buttons.length === 1 ? "SOLID" : bi === 0 ? "LINK" : "SOLID";
        const validStyle = BANNER_BUTTON_STYLES.includes(b.style) ? b.style : style;
        return `${i}                a!buttonWidget(\n${i}                  size: "SMALL",\n${i}                  style: "${validStyle}",\n${i}                  label: ${toSailValue(b.label)}\n${i}                )`;
      }).join(",\n");
      trailingItem = `${i}          a!sideBySideItem(\n${i}            item: a!buttonArrayLayout(\n${i}              align: "END",\n${i}              marginAbove: "NONE",\n${i}              marginBelow: "NONE",\n${i}              buttons: {\n${buttons}\n${i}              }\n${i}            ),\n${i}            width: "MINIMIZE"\n${i}          ),\n`;
    } else if (node.link) {
      trailingItem = `${i}          a!sideBySideItem(\n${i}            item: a!richTextDisplayField(\n${i}              labelPosition: "COLLAPSED",\n${i}              value: a!richTextItem(\n${i}                text: ${toSailValue(node.link.text)},\n${i}                color: "ACCENT",\n${i}                link: a!dynamicLink(),\n${i}                linkStyle: "STANDALONE"\n${i}              ),\n${i}              marginAbove: "NONE",\n${i}              marginBelow: "NONE"\n${i}            ),\n${i}            width: "MINIMIZE"\n${i}          ),\n`;
    }

    if (persistent) {
      // Persistent variant: bordered card, no icon-in-sideBySide chrome —
      // instead an EXTRA_NARROW icon chip column + heading/body column.
      // messages.md's persistent pattern has no dismiss/actions slot, so
      // "buttons"/"link"/"dismissible" are ignored in this mode.
      return `${i}a!cardLayout(
${i}  shape: "SEMI_ROUNDED",
${i}  showBorder: true(),
${i}  marginAbove: "STANDARD",
${i}  contents: {
${i}    a!columnsLayout(
${i}      alignVertical: "MIDDLE",
${i}      spacing: "DENSE",
${i}      columns: {
${i}        a!columnLayout(
${i}          width: "EXTRA_NARROW",
${i}          contents: {
${i}            a!cardLayout(
${i}              showBorder: false(),
${i}              style: "${sev.style}",
${i}              padding: "STANDARD",
${i}              shape: "SEMI_ROUNDED",
${i}              contents: {
${i}                a!richTextDisplayField(
${i}                  labelPosition: "COLLAPSED",
${i}                  align: "CENTER",
${i}                  marginAbove: "EVEN_LESS",
${i}                  marginBelow: "EVEN_LESS",
${i}                  value: a!richTextIcon(icon: "${sev.icon}", color: "${sev.iconColor}")
${i}                )
${i}              }
${i}            )
${i}          }
${i}        ),
${i}        a!columnLayout(
${i}          width: "AUTO",
${i}          contents: {
${i}            a!headingField(
${i}              text: ${toSailValue(node.heading || node.text)},
${i}              size: "EXTRA_SMALL",
${i}              headingTag: "H3",
${i}              marginAbove: "NONE",
${i}              marginBelow: "NONE"
${i}            ),
${i}            a!richTextDisplayField(
${i}              labelPosition: "COLLAPSED",
${i}              marginAbove: "NONE",
${i}              marginBelow: "NONE",
${i}              value: a!richTextItem(text: ${toSailValue(node.heading ? node.text : "")})
${i}            )
${i}          }
${i}        )
${i}      }
${i}    )
${i}  }
${i})`;
    }

    return `${i}a!cardLayout(
${i}  shape: "SEMI_ROUNDED",
${i}  style: "${sev.style}",
${i}  showBorder: false(),
${i}  marginAbove: "STANDARD",
${i}  contents: {
${i}    a!sideBySideLayout(
${i}      spacing: "STANDARD",
${i}      items: {
${i}        a!sideBySideItem(
${i}          item: a!richTextDisplayField(
${i}            labelPosition: "COLLAPSED",
${i}            value: a!richTextIcon(
${i}              icon: "${sev.icon}",
${i}              color: "${sev.iconColor}",
${i}              size: "STANDARD"
${i}            ),
${i}            marginAbove: "NONE",
${i}            marginBelow: "NONE"
${i}          ),
${i}          width: "MINIMIZE"
${i}        ),
${i}        a!sideBySideItem(
${i}          item: a!richTextDisplayField(
${i}            labelPosition: "COLLAPSED",
${i}            value: a!richTextItem(text: ${toSailValue(node.text)}),
${i}            marginAbove: "NONE",
${i}            marginBelow: "NONE"
${i}          ),
${i}          width: "AUTO"
${i}        ),
${trailingItem}${i}      },
${i}      alignVertical: "MIDDLE",
${i}      marginAbove: "STANDARD",
${i}      marginBelow: "STANDARD"
${i}    )
${i}  }
${i})`;
  },
  renderSkeleton(node, indent) {
    const i = indent;
    const sev = BANNER_SEVERITIES[node.severity] || BANNER_SEVERITIES.INFO;
    return `${i}a!cardLayout(\n${i}  shape: "SEMI_ROUNDED",\n${i}  style: "${sev.style}",\n${i}  showBorder: false(),\n${i}  marginAbove: "STANDARD",\n${i}  contents: {\n${i}    a!richTextDisplayField(\n${i}      labelPosition: "COLLAPSED",\n${i}      value: a!richTextIcon(icon: "${sev.icon}", color: "${sev.iconColor}")\n${i}    )\n${i}  }\n${i})`;
  },
  collectVarDecls() {
    return "";
  },
});

// =============================================================================
// CONTAINER TYPES
// =============================================================================

const CONTAINER_TYPES = ["columns", "cardGroup", "sideBySide", "tabs", "card", "box"];

// a!sideBySideItem's width enum — deliberately NOT the same vocabulary as
// a!columnLayout (no NARROW/MEDIUM/WIDE — using those raises a runtime error).
// Default stays "AUTO" for backward compatibility with existing definitions
// that don't set a per-item width.
const SIDE_BY_SIDE_ITEM_WIDTHS = ["AUTO", "MINIMIZE", "1X", "2X", "3X", "4X", "5X", "6X", "7X", "8X", "9X", "10X"];

// a!columnLayout's width enum (page/section structure) — a superset that
// also includes the fixed enums forbidden on sideBySideItem above.
const COLUMN_LAYOUT_WIDTHS = [
  "AUTO", "EXTRA_NARROW", "NARROW", "NARROW_PLUS", "MEDIUM", "MEDIUM_PLUS", "WIDE", "WIDE_PLUS", "EXTRA_WIDE",
  "1X", "2X", "3X", "4X", "5X", "6X", "7X", "8X", "9X", "10X",
];
const COLUMN_LAYOUT_FIXED_WIDTHS = new Set(["EXTRA_NARROW", "NARROW", "NARROW_PLUS", "MEDIUM", "MEDIUM_PLUS", "WIDE", "WIDE_PLUS", "EXTRA_WIDE"]);

// ---------------------------------------------------------------------------
// New leaf: milestone — process step indicator (a!milestoneField). Renders a
// horizontal or vertical milestone bar showing which step is active. Common in
// record summary views for lifecycle/workflow status.
// ---------------------------------------------------------------------------
const MILESTONE_ORIENTATIONS = ["HORIZONTAL", "VERTICAL"];
const MILESTONE_STYLES = ["LINE", "CHEVRON", "DOT"];

registerLeaf("milestone", {
  validate(node, context, errors) {
    if (!Array.isArray(node.steps) || node.steps.length < 2) {
      errors.push(`${context}: "steps" must be an array with at least 2 labels`);
    }
    if (node.active !== undefined && (typeof node.active !== "number" || node.active < 1)) {
      errors.push(`${context}: "active" must be a positive integer (1-based step index)`);
    }
    if (node.orientation && !MILESTONE_ORIENTATIONS.includes(node.orientation)) {
      errors.push(`${context}: "orientation" must be one of [${MILESTONE_ORIENTATIONS.join(", ")}], got: ${JSON.stringify(node.orientation)}`);
    }
    if (node.stepStyle && !MILESTONE_STYLES.includes(node.stepStyle)) {
      errors.push(`${context}: "stepStyle" must be one of [${MILESTONE_STYLES.join(", ")}], got: ${JSON.stringify(node.stepStyle)}`);
    }
  },
  render(node, indent) {
    const i = indent;
    const active = node.active || 1;
    const orientation = node.orientation || "HORIZONTAL";
    const stepStyle = node.stepStyle || "LINE";
    const stepsStr = node.steps.map((s) => `"${s}"`).join(", ");
    const labelLine = node.label ? `\n${i}  label: "${node.label}",` : `\n${i}  labelPosition: "COLLAPSED",`;
    return `${i}a!milestoneField(${labelLine}
${i}  steps: {${stepsStr}},
${i}  active: ${active},
${i}  orientation: "${orientation}",
${i}  stepStyle: "${stepStyle}"
${i})`;
  },
  renderSkeleton(node, indent) {
    const i = indent;
    return `${i}a!milestoneField(\n${i}  labelPosition: "COLLAPSED",\n${i}  steps: {},\n${i}  active: 1\n${i})`;
  },
  collectVarDecls() {
    return "";
  },
});

// ---------------------------------------------------------------------------
// New leaf: gauge — circular progress indicator (a!gaugeField). Common in
// dashboards and KPI areas to show completion/utilization percentages.
// ---------------------------------------------------------------------------
const GAUGE_SIZES = ["SMALL", "MEDIUM", "LARGE"];
const GAUGE_COLORS = ["ACCENT", "POSITIVE", "NEGATIVE", "WARN"];

registerLeaf("gauge", {
  validate(node, context, errors) {
    if (node.percentage === undefined || typeof node.percentage !== "number") {
      errors.push(`${context}: "percentage" (number 0-100) is required`);
    }
    if (node.size && !GAUGE_SIZES.includes(node.size)) {
      errors.push(`${context}: "size" must be one of [${GAUGE_SIZES.join(", ")}], got: ${JSON.stringify(node.size)}`);
    }
    if (node.color && !GAUGE_COLORS.includes(node.color) && !/^#[0-9A-Fa-f]{6}$/.test(node.color)) {
      errors.push(`${context}: "color" must be one of [${GAUGE_COLORS.join(", ")}] or a hex color, got: ${JSON.stringify(node.color)}`);
    }
  },
  render(node, indent) {
    const i = indent;
    const percentage = node.percentage;
    const primaryText = node.primaryText || `${percentage}%`;
    const secondaryText = node.secondaryText || "";
    const color = node.color || "ACCENT";
    const size = node.size || "MEDIUM";
    const labelLine = node.label
      ? `${i}  label: "${node.label}",\n`
      : `${i}  labelPosition: "COLLAPSED",\n`;
    const secondaryLine = secondaryText ? `\n${i}  secondaryText: "${secondaryText}",` : "";
    return `${i}a!gaugeField(\n${labelLine}${i}  percentage: ${percentage},
${i}  primaryText: "${primaryText}",${secondaryLine}
${i}  color: "${color}",
${i}  size: "${size}"
${i})`;
  },
  renderSkeleton(node, indent) {
    const i = indent;
    return `${i}a!gaugeField(\n${i}  labelPosition: "COLLAPSED",\n${i}  percentage: 0,\n${i}  primaryText: "0%",\n${i}  size: "MEDIUM"\n${i})`;
  },
  collectVarDecls() {
    return "";
  },
});

// ---------------------------------------------------------------------------
// New leaf: horizontalLine — simple divider (a!horizontalLine). Useful for
// visual separation between content blocks without the weight of a section.
// ---------------------------------------------------------------------------
const LINE_COLORS = ["SECONDARY", "STANDARD", "ACCENT"];
const LINE_WEIGHTS = ["THIN", "MEDIUM", "THICK"];
const LINE_STYLES = ["SOLID", "DOT", "DASH"];

registerLeaf("horizontalLine", {
  validate(node, context, errors) {
    if (node.color && !LINE_COLORS.includes(node.color) && !/^#[0-9A-Fa-f]{6}$/.test(node.color)) {
      errors.push(`${context}: "color" must be one of [${LINE_COLORS.join(", ")}] or a hex color, got: ${JSON.stringify(node.color)}`);
    }
    if (node.weight && !LINE_WEIGHTS.includes(node.weight)) {
      errors.push(`${context}: "weight" must be one of [${LINE_WEIGHTS.join(", ")}], got: ${JSON.stringify(node.weight)}`);
    }
    if (node.style && !LINE_STYLES.includes(node.style)) {
      errors.push(`${context}: "style" must be one of [${LINE_STYLES.join(", ")}], got: ${JSON.stringify(node.style)}`);
    }
  },
  render(node, indent) {
    const i = indent;
    const color = node.color || "SECONDARY";
    const weight = node.weight || "THIN";
    const style = node.style || "SOLID";
    return `${i}a!horizontalLine(\n${i}  color: "${color}",\n${i}  weight: "${weight}",\n${i}  style: "${style}"\n${i})`;
  },
  renderSkeleton(node, indent) {
    const i = indent;
    return `${i}a!horizontalLine(\n${i}  color: "SECONDARY",\n${i}  weight: "THIN"\n${i})`;
  },
  collectVarDecls() {
    return "";
  },
});

// ---------------------------------------------------------------------------
// New leaf: recordActionField — displays record actions (a!recordActionField).
//
// CONSTRAINT: Only valid in record-backed definitions (live record-view or
// live dashboard with dataBinding/dataSource). The definition-level
// cross-check lives in define.js — this leaf's validate() only checks
// structural correctness of the actions array.
//
// Each action item requires:
//   - actionRef: the full recordType!{uuid}Name.actions.key reference
//   - identifier (optional): expression for the record identifier; required
//     for related actions, omitted for list actions
// ---------------------------------------------------------------------------
const RECORD_ACTION_STYLES = ["TOOLBAR", "LINKS", "CARDS", "SIDEBAR", "CALL_TO_ACTION", "MENU", "MENU_ICON", "TOOLBAR_PRIMARY", "SIDEBAR_PRIMARY"];
const RECORD_ACTION_DISPLAYS = ["LABEL", "ICON", "LABEL_AND_ICON"];
const RECORD_ACTION_OPENS = ["DIALOG", "NEW_TAB", "SAME_TAB"];

registerLeaf("recordActionField", {
  validate(node, context, errors) {
    if (!Array.isArray(node.actions) || node.actions.length === 0) {
      errors.push(`${context}: "actions" must be a non-empty array of { actionRef, identifier? }`);
      return;
    }
    node.actions.forEach((action, ai) => {
      const ac = `${context}.actions[${ai}]`;
      if (!action.actionRef || typeof action.actionRef !== "string") {
        errors.push(`${ac}: "actionRef" is required (e.g. "recordType!{uuid}Name.actions.key")`);
      }
    });
    if (node.style && !RECORD_ACTION_STYLES.includes(node.style)) {
      errors.push(`${context}: "style" must be one of [${RECORD_ACTION_STYLES.join(", ")}], got: ${JSON.stringify(node.style)}`);
    }
    if (node.display && !RECORD_ACTION_DISPLAYS.includes(node.display)) {
      errors.push(`${context}: "display" must be one of [${RECORD_ACTION_DISPLAYS.join(", ")}], got: ${JSON.stringify(node.display)}`);
    }
    if (node.openActionsIn && !RECORD_ACTION_OPENS.includes(node.openActionsIn)) {
      errors.push(`${context}: "openActionsIn" must be one of [${RECORD_ACTION_OPENS.join(", ")}], got: ${JSON.stringify(node.openActionsIn)}`);
    }
  },
  render(node, indent) {
    const i = indent;
    const style = node.style || "TOOLBAR";
    const display = node.display || "LABEL_AND_ICON";
    const openIn = node.openActionsIn || "DIALOG";

    const actionsStr = node.actions.map((action) => {
      const idLine = action.identifier
        ? `,\n${i}      identifier: ${action.identifier}`
        : "";
      return `${i}    a!recordActionItem(\n${i}      action: '${action.actionRef}'${idLine}\n${i}    )`;
    }).join(",\n");

    return `${i}a!recordActionField(
${i}  actions: {
${actionsStr}
${i}  },
${i}  style: "${style}",
${i}  display: "${display}",
${i}  openActionsIn: "${openIn}"
${i})`;
  },
  renderSkeleton(node, indent) {
    const i = indent;
    return `${i}a!recordActionField(\n${i}  actions: {},\n${i}  style: "TOOLBAR"\n${i})`;
  },
  collectVarDecls() {
    return "";
  },
});

// ---------------------------------------------------------------------------
// New leaf: linkField — displays one or more clickable links (a!linkField).
// ---------------------------------------------------------------------------
registerLeaf("linkField", {
  validate(node, context, errors) {
    if (!Array.isArray(node.links) || node.links.length === 0) {
      errors.push(`${context}: "links" must be a non-empty array of { text, ... }`);
      return;
    }
    node.links.forEach((link, li) => {
      if (!link.text) errors.push(`${context}.links[${li}]: "text" is required`);
    });
  },
  render(node, indent) {
    const i = indent;
    const labelLine = node.label
      ? `${i}  label: "${node.label}",\n`
      : `${i}  labelPosition: "COLLAPSED",\n`;
    const linksStr = node.links.map((link) =>
      `${i}    a!safeLink(label: ${toSailValue(link.text)}, uri: ${toSailValue(link.uri || "#")})`
    ).join(",\n");
    return `${i}a!linkField(\n${labelLine}${i}  links: {\n${linksStr}\n${i}  }\n${i})`;
  },
  renderSkeleton(node, indent) {
    const i = indent;
    return `${i}a!linkField(\n${i}  labelPosition: "COLLAPSED",\n${i}  links: {}\n${i})`;
  },
  collectVarDecls() {
    return "";
  },
});

// a!cardGroupLayout's cardWidth enum — applies to the WHOLE group, not per card.
const CARD_GROUP_WIDTHS = ["EXTRA_NARROW", "NARROW", "NARROW_PLUS", "MEDIUM", "MEDIUM_PLUS", "WIDE", "WIDE_PLUS"];

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

// Guard: a!sideBySideLayout cannot legally contain a!cardLayout, a!columnsLayout,
// or a!cardGroupLayout as descendants. Recursively scans a node's container
// children and returns the first offending container type name, or null.
const SIDE_BY_SIDE_FORBIDDEN = new Set(["card", "columns", "cardGroup"]);
function hasForbiddenSideBySideDescendant(node) {
  if (!node || !node.layout) return null;
  if (SIDE_BY_SIDE_FORBIDDEN.has(node.layout)) return node.layout;
  for (const child of node.items || []) {
    const hit = hasForbiddenSideBySideDescendant(child);
    if (hit) return hit;
  }
  return null;
}

function validateNode(node, context, errors) {
  if (!node || typeof node !== "object") {
    errors.push(`${context}: node must be an object`);
    return;
  }

  const isContainer = !!node.layout;
  const isLeaf = !!node.leaf;

  if (isContainer === isLeaf) {
    errors.push(`${context}: node must have exactly one of "layout" or "leaf", got layout=${JSON.stringify(node.layout)} leaf=${JSON.stringify(node.leaf)}`);
    return;
  }

  if (isContainer) {
    if (!CONTAINER_TYPES.includes(node.layout)) {
      errors.push(`${context}: "layout" must be one of [${CONTAINER_TYPES.join(", ")}], got: ${JSON.stringify(node.layout)}`);
      return;
    }
    if (node.layout === "cardGroup" && node.cardWidth !== undefined && !CARD_GROUP_WIDTHS.includes(node.cardWidth)) {
      errors.push(`${context}: "cardWidth" must be one of [${CARD_GROUP_WIDTHS.join(", ")}], got: ${JSON.stringify(node.cardWidth)}`);
    }
    if (node.skeleton === true) {
      if (!Array.isArray(node.items) || node.items.length < 1) {
        errors.push(`${context}: skeleton container needs at least 1 item (with skeleton: true on each)`);
      } else {
        node.items.forEach((item, ii) => validateNode(item, `${context}.items[${ii}]`, errors));
      }
      return;
    }
    const minItems = node.layout === "sideBySide" ? 2 : node.layout === "tabs" ? 2 : node.layout === "cardGroup" ? 1 : node.layout === "card" ? 1 : node.layout === "box" ? 1 : node.layout === "columns" ? 1 : 2;
    if (!Array.isArray(node.items) || node.items.length < minItems) {
      errors.push(`${context}: "${node.layout}" requires at least ${minItems} item(s) in "items"`);
      return;
    }
    if (node.layout === "tabs") {
      node.items.forEach((item, ii) => {
        if (!item.tabLabel) errors.push(`${context}.items[${ii}]: "tabLabel" is required for tabs items`);
      });
    }
    if (node.layout === "sideBySide") {
      node.items.forEach((item, ii) => {
        if (item.width !== undefined && !SIDE_BY_SIDE_ITEM_WIDTHS.includes(item.width)) {
          errors.push(`${context}.items[${ii}]: "width" must be one of [${SIDE_BY_SIDE_ITEM_WIDTHS.join(", ")}] (sideBySideItem does not support fixed enums like NARROW/MEDIUM/WIDE), got: ${JSON.stringify(item.width)}`);
        }
        // Guard: sideBySide items may not contain card/columns/cardGroup as descendants
        // (a!sideBySideLayout cannot legally hold a!cardLayout/a!columnsLayout/a!cardGroupLayout)
        const forbidden = hasForbiddenSideBySideDescendant(item);
        if (forbidden) {
          errors.push(`${context}.items[${ii}]: a "sideBySide" item may not contain a "${forbidden}" container as a descendant (a!sideBySideLayout cannot hold cardLayout/columnsLayout/cardGroupLayout) — hoist it out of the sideBySide.`);
        }
      });
    }
    if (node.layout === "columns") {
      const widths = node.items.map((item) => item.width || "AUTO");
      widths.forEach((w, ii) => {
        if (!COLUMN_LAYOUT_WIDTHS.includes(w)) {
          errors.push(`${context}.items[${ii}]: "width" must be one of [${COLUMN_LAYOUT_WIDTHS.join(", ")}], got: ${JSON.stringify(w)}`);
        }
      });
      const hasFixed = widths.some((w) => COLUMN_LAYOUT_FIXED_WIDTHS.has(w));
      const hasAuto = widths.some((w) => w === "AUTO");
      if (hasFixed && !hasAuto) {
        errors.push(`${context}: "columns" mixes fixed-width items (NARROW/MEDIUM/WIDE/etc.) with no "AUTO" item — a!columnsLayout requires at least one AUTO column when any fixed width is used.`);
      }
    }
    if (node.layout === "card") {
      const style = node.style || node.headerColor;
      if (style !== undefined && !isValidCardStyle(style)) {
        errors.push(`${context}: "style"/"headerColor" must be a card style keyword [${CARD_STYLE_VALUES.join(", ")}], an alias [${Object.keys(CARD_STYLE_ALIASES).join(", ")}], or a hex color, got: ${JSON.stringify(style)}`);
      }
      const VALID_BAR_POSITIONS = ["TOP", "BOTTOM", "START", "END"];
      if (node.decorativeBarPosition && !VALID_BAR_POSITIONS.includes(node.decorativeBarPosition)) {
        errors.push(`${context}: "decorativeBarPosition" must be one of [${VALID_BAR_POSITIONS.join(", ")}], got: ${JSON.stringify(node.decorativeBarPosition)}`);
      }
    }
    if (node.layout === "box") {
      if (!node.label) {
        errors.push(`${context}: "label" is required for "box" layout`);
      }
      const VALID_BOX_STYLES = ["STANDARD", "ACCENT", "SUCCESS", "INFO", "WARN", "ERROR"];
      if (node.style && !VALID_BOX_STYLES.includes(node.style) && !/^#[0-9A-Fa-f]{6}$/.test(node.style)) {
        errors.push(`${context}: "style" must be one of [${VALID_BOX_STYLES.join(", ")}] or a hex color, got: ${JSON.stringify(node.style)}`);
      }
    }
    node.items.forEach((item, ii) => validateNode(item, `${context}.items[${ii}]`, errors));
    return;
  }

  // Leaf
  if (node.skeleton === true) {
    if (!node.leaf) errors.push(`${context}: skeleton leaf requires "leaf" type`);
    return;
  }
  const impl = LEAF_TYPES[node.leaf];
  if (!impl) {
    errors.push(`${context}: unknown leaf type "${node.leaf}" — known types: [${Object.keys(LEAF_TYPES).join(", ")}]`);
    return;
  }
  impl.validate(node, context, errors);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderNode(node, indent, state) {
  if (node.layout) {
    return renderContainer(node, indent, state);
  }
  const impl = LEAF_TYPES[node.leaf];
  if (!impl) return `${indent}/* Unknown leaf type: ${node.leaf} */`;
  return impl.render(node, indent, state);
}

function renderContainer(node, indent, state) {
  const i = indent;
  const childIndent = i + "    ";

  switch (node.layout) {
    case "columns": {
      const cols = node.items.map((item) => {
        const inner = renderNode(item, childIndent + "  ", state);
        const width = item.width || "AUTO";
        return `${i}  a!columnLayout(\n${i}    width: "${width}",\n${i}    contents: {\n${inner}\n${i}    }\n${i}  )`;
      });
      const stackWhen = node.stackWhen ? `\n${i}  stackWhen: {${Array.isArray(node.stackWhen) ? node.stackWhen.map(s => `"${s}"`).join(", ") : `"${node.stackWhen}"`}},` : "";
      const marginAbove = node.marginAbove ? `\n${i}  marginAbove: "${node.marginAbove}",` : "";
      const marginBelow = node.marginBelow || "STANDARD";
      return `${i}a!columnsLayout(\n${i}  columns: {\n${cols.join(",\n")}\n${i}  },\n${i}  spacing: "STANDARD",${stackWhen}${marginAbove}\n${i}  marginBelow: "${marginBelow}"\n${i})`;
    }

    case "cardGroup": {
      // Each item renders as the contents of one card in the group. If the
      // item is itself a "card" container node, renderNode() already emits
      // a full a!cardLayout(...) — that stands as its own card-shaped
      // fragment inside the group (e.g. N tiered/RAG "card" containers).
      const cards = node.items.map((item) => {
        return renderNode(item, childIndent, state);
      });
      const cardWidth = node.cardWidth || "NARROW_PLUS";
      const marginBelow = node.marginBelow || "STANDARD";
      return `${i}a!cardGroupLayout(\n${i}  cards: {\n${cards.join(",\n")}\n${i}  },\n${i}  cardWidth: "${cardWidth}",\n${i}  spacing: "STANDARD",\n${i}  marginBelow: "${marginBelow}"\n${i})`;
    }

    case "sideBySide": {
      const items = node.items.map((item) => {
        const inner = renderNode(item, childIndent + "    ", state);
        const width = item.width || "AUTO";
        return `${i}    a!sideBySideItem(\n${i}      item: ${inner.trim()},\n${i}      width: "${width}"\n${i}    )`;
      });
      const stackWhen = node.stackWhen ? `\n${i}  stackWhen: {${Array.isArray(node.stackWhen) ? node.stackWhen.map(s => `"${s}"`).join(", ") : `"${node.stackWhen}"`}},` : "";
      const marginBelow = node.marginBelow ? `\n${i}  marginBelow: "${node.marginBelow}"` : "";
      return `${i}a!sideBySideLayout(\n${i}  items: {\n${items.join(",\n")}\n${i}  },\n${i}  alignVertical: "MIDDLE",\n${i}  spacing: "STANDARD"${stackWhen}${marginBelow}\n${i})`;
    }

    case "tabs": {
      const tabs = node.items.map((item) => {
        const inner = renderNode(item, childIndent + "  ", state);
        return `${i}  a!tabItem(\n${i}    label: "${item.tabLabel}",\n${i}    contents: {\n${inner}\n${i}    }\n${i}  )`;
      });
      return `${i}a!tabLayout(\n${i}  tabs: {\n${tabs.join(",\n")}\n${i}  }\n${i})`;
    }

    case "card": {
      const style = resolveCardStyle(node.style || node.headerColor);
      const contents = node.items.map((item) => renderNode(item, childIndent, state)).join(",\n");
      const decBarPos = node.decorativeBarPosition;
      const decBarColor = node.decorativeBarColor;
      const decBarLines = decBarPos
        ? `\n${i}  decorativeBarPosition: "${decBarPos}",\n${i}  decorativeBarColor: "${decBarColor || "ACCENT"}",`
        : "";
      return `${i}a!cardLayout(\n${i}  contents: {\n${contents}\n${i}  },\n${i}  style: "${style}",\n${i}  showBorder: true(),\n${i}  shape: "ROUNDED",\n${i}  padding: "STANDARD",${decBarLines}\n${i}  marginBelow: "STANDARD"\n${i})`;
    }

    case "box": {
      const boxLabel = node.label || "Section";
      const boxStyle = node.style || "STANDARD";
      const contents = node.items.map((item) => renderNode(item, childIndent, state)).join(",\n");
      const collapsible = node.isCollapsible ? `\n${i}  isCollapsible: true(),` : "";
      return `${i}a!boxLayout(\n${i}  label: "${boxLabel}",\n${i}  style: "${boxStyle}",${collapsible}\n${i}  padding: "STANDARD",\n${i}  shape: "SEMI_ROUNDED",\n${i}  showBorder: true(),\n${i}  contents: {\n${contents}\n${i}  },\n${i}  marginBelow: "STANDARD"\n${i})`;
    }

    default:
      return `${i}/* Unknown container layout: ${node.layout} */`;
  }
}

function renderSkeletonNode(node, indent) {
  const i = indent;
  if (node.layout) {
    const childIndent = i + "    ";
    const rendered = node.items.map((item) => renderSkeletonNode(item, childIndent + "  "));
    switch (node.layout) {
      case "columns": {
        const cols = rendered.map(
          (inner, idx) => {
            const width = node.items[idx].width || "AUTO";
            return `${i}  a!columnLayout(\n${i}    width: "${width}",\n${i}    contents: {\n${inner}\n${i}    }\n${i}  )`;
          }
        );
        return `${i}a!columnsLayout(\n${i}  columns: {\n${cols.join(",\n")}\n${i}  },\n${i}  spacing: "STANDARD",\n${i}  marginBelow: "STANDARD"\n${i})`;
      }
      case "cardGroup": {
        const cardWidth = node.cardWidth || "NARROW_PLUS";
        return `${i}a!cardGroupLayout(\n${i}  cards: {\n${rendered.join(",\n")}\n${i}  },\n${i}  cardWidth: "${cardWidth}",\n${i}  spacing: "STANDARD",\n${i}  marginBelow: "STANDARD"\n${i})`;
      }
      case "sideBySide": {
        const items = rendered.map(
          (inner, idx) => {
            const width = node.items[idx].width || "AUTO";
            return `${i}    a!sideBySideItem(\n${i}      item: ${inner.trim()},\n${i}      width: "${width}"\n${i}    )`;
          }
        );
        return `${i}a!sideBySideLayout(\n${i}  items: {\n${items.join(",\n")}\n${i}  },\n${i}  alignVertical: "MIDDLE",\n${i}  spacing: "STANDARD"\n${i})`;
      }
      case "tabs": {
        const tabs = node.items.map((item, idx) => {
          return `${i}  a!tabItem(\n${i}    label: "${item.tabLabel || "Tab"}",\n${i}    contents: {\n${rendered[idx]}\n${i}    }\n${i}  )`;
        });
        return `${i}a!tabLayout(\n${i}  tabs: {\n${tabs.join(",\n")}\n${i}  }\n${i})`;
      }
      case "card": {
        const style = resolveCardStyle(node.style || node.headerColor);
        return `${i}a!cardLayout(\n${i}  contents: {\n${rendered.join(",\n")}\n${i}  },\n${i}  style: "${style}",\n${i}  showBorder: true(),\n${i}  shape: "ROUNDED",\n${i}  padding: "STANDARD",\n${i}  marginBelow: "STANDARD"\n${i})`;
      }
      case "box": {
        const boxLabel = node.label || "Section";
        return `${i}a!boxLayout(\n${i}  label: "${boxLabel}",\n${i}  style: "STANDARD",\n${i}  padding: "STANDARD",\n${i}  shape: "SEMI_ROUNDED",\n${i}  showBorder: true(),\n${i}  contents: {\n${rendered.join(",\n")}\n${i}  },\n${i}  marginBelow: "STANDARD"\n${i})`;
      }
    }
  }
  const impl = LEAF_TYPES[node.leaf];
  if (impl && impl.renderSkeleton) return impl.renderSkeleton(node, i);
  return `${i}a!cardLayout(\n${i}  contents: { a!sectionLayout(label: "${node.label || node.leaf || "Section"}", contents: {}) }\n${i})`;
}

// ---------------------------------------------------------------------------
// Variable-declaration collection (KPI values, grid sample data, etc.)
// Walks the whole tree so the top-level a!localVariables( block can declare
// everything any nested leaf needs, regardless of nesting depth.
// ---------------------------------------------------------------------------

function collectVarDecls(node, state) {
  state = state || {};
  if (node.layout) {
    return node.items.map((item) => collectVarDecls(item, state)).filter(Boolean).join("\n\n");
  }
  const impl = LEAF_TYPES[node.leaf];
  if (!impl) return "";
  return impl.collectVarDecls(node, state) || "";
}

module.exports = {
  CONTAINER_TYPES,
  registerLeaf,
  registerCoreLeaves,
  LEAF_TYPES,
  validateNode,
  renderNode,
  renderSkeletonNode,
  collectVarDecls,
};
