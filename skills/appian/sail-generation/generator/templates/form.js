/**
 * templates/form.js
 *
 * Renders a SAIL form scaffold from a structured definition object.
 *
 * Accepts two calling modes:
 *
 * render({ definition }) — the definition comes from define.js and contains
 * typed rows with widths.
 *
 * KEY STRUCTURAL GUARANTEES (enforced by this renderer):
 *   ✅ Every a!columnsLayout has at least one AUTO-width column
 *   ✅ Single-field rows skip a!columnsLayout entirely
 *   ✅ All local! variables declared before a!formLayout
 *   ✅ isUpdate / cancel control params with TODO-CONVERTER
 *   ✅ contentsWidth set correctly (WIDE for multi-section, MEDIUM for single)
 */

const { weightToSailWidth } = require("../define");
const { renderField, renderRow } = require("./wizard");
const { resolveTheme } = require("../theme");

// ---------------------------------------------------------------------------
// Definition-based render
// ---------------------------------------------------------------------------

function renderFromDefinition(def) {
  const { title, entityName, sections, headerIcon, headerSubtitle, submitLabel, cancelLabel } = def;
  const theme = resolveTheme(def.theme);

  // Collect all field variables across all sections
  const allFields = [];
  const seenVars = new Set();
  for (const section of sections) {
    for (const row of (section.rows || [])) {
      for (const field of row.fields) {
        const words = field.name.trim().split(/[\s_]+/);
        const varName = "local!" +
          words[0].charAt(0).toLowerCase() + words[0].slice(1) +
          words.slice(1).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
        if (!seenVars.has(varName)) {
          seenVars.add(varName);
          allFields.push({ varName, field });
        }
      }
    }
  }

  const varDecls = [
    `  /* TODO-CONVERTER: Transform control params to ri!isUpdate, ri!cancel */`,
    `  local!isUpdate: false(),`,
    `  local!cancel: false(),`,
    ``,
    `  /* ── Form field variables ── */`,
    ...allFields.map(({ varName, field }) => {
      if (field.type === "checkbox") return `  ${varName}: touniformstring({}),`;
      return `  ${varName},`;
    }),
  ].join("\n");

  const icon = headerIcon || "circle";
  const subtitle = headerSubtitle || `Complete this form to submit your ${entityName.toLowerCase()}.`;

  // Multiple sections → WIDE with one card per section
  // Single section → MEDIUM with one card
  const contentsWidth = sections.length > 1 ? "WIDE" : "MEDIUM";

  const sectionsSail = sections.map((section) => {
    const rowsSail = !section.rows || section.rows.length === 0
      ? `              /* TODO: Add fields for this section */`
      : section.rows.map((row) => renderRow(row, "              ")).join(",\n");

    return [
      `      a!cardLayout(`,
      `        contents: {`,
      `          a!sectionLayout(`,
      `            label: "${section.label}",`,
      `            labelColor: "STANDARD",`,
      ...(section.isCollapsible ? [`            isCollapsible: true(),`] : []),
      `            contents: {`,
      rowsSail,
      `            }`,
      `          )`,
      `        },`,
      `        style: "${theme.cardBg}",`,
      `        showBorder: true(),`,
      `        shape: "ROUNDED",`,
      `        padding: "STANDARD",`,
      `        marginBelow: "STANDARD"`,
      `      )`,
    ].join("\n");
  }).join(",\n");

  return `/*
 * ${title}
 * Generated from definition.json — edit definition.json to change structure.
 *
 * TODO-CONVERTER comments mark spots to transform when converting to production.
 */
a!localVariables(
${varDecls}

  a!formLayout(
    titleBar: a!headerTemplateFull(
      title: "${title}",
      secondaryText: "${subtitle}",
      backgroundColor: "${theme.headerBg}",
      titleColor: "${theme.titleColor}",
      secondaryTextColor: "${theme.subtitleColor}",
      stampIcon: "${icon}",
      stampColor: "${theme.stampContent}"
    ),
    contentsWidth: "${contentsWidth}",
    backgroundColor: "${theme.pageBg}",
    contents: {
${sectionsSail}
    },
    buttons: a!buttonLayout(
      primaryButtons: {
        a!buttonWidget(
          label: if(a!defaultValue(local!isUpdate, false()), "Update", "${submitLabel || "Submit"}"),
          style: "SOLID",
          color: "ACCENT",
          submit: true(),
          loadingIndicator: true()
        )
      },
      secondaryButtons: {
        /* TODO-CONVERTER: Transform saveInto to ri!cancel */
        a!buttonWidget(
          label: "${cancelLabel || "Cancel"}",
          style: "OUTLINE",
          saveInto: a!save(local!cancel, true())
        )
      }
    )
  )
)`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

function render(opts) {
  if (!opts.definition) {
    throw new Error(
      "Form template requires a definition JSON with a \"sections\" array. " +
      "Use the definition pipeline: node generator/define.js --write <uuid> '<json>' " +
      "then node generator/scaffold.js --from-definition <uuid>"
    );
  }
  return renderFromDefinition(opts.definition);
}

module.exports = { render };
