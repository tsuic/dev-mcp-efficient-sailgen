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
      secondaryTextColor: "${theme.subtitleColor}"${headerIcon ? `,\n      stampIcon: "${headerIcon}",\n      stampColor: "${theme.stampContent}"` : ""}
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
// Live data-binding render — ri!record[...] pattern
// ---------------------------------------------------------------------------

function renderLiveFromDefinition(def) {
  const { title, entityName, sections, headerIcon, headerSubtitle, submitLabel, cancelLabel, dataBinding } = def;
  const theme = resolveTheme(def.theme);

  // Build lookup query prologues
  const lookupDecls = (dataBinding.lookups || []).map((lk) => {
    return [
      `  local!${lk.localName}: a!queryRecordType(`,
      `    recordType: '${lk.lookupRecordType}',`,
      `    fields: {`,
      `      '${lk.labelField}',`,
      `      '${lk.valueField}'`,
      `    },`,
      `    pagingInfo: a!pagingInfo(startIndex: 1, batchSize: 500)`,
      `  ).data,`,
    ].join("\n");
  });

  const varDecls = [
    ...(lookupDecls.length > 0
      ? [`  /* ── Lookup query prologues ── */`, ...lookupDecls, ``]
      : []),
  ].join("\n");

  const subtitle = headerSubtitle || `Complete this form to submit your ${entityName.toLowerCase()}.`;
  const contentsWidth = sections.length > 1 ? "WIDE" : "MEDIUM";
  const riName = dataBinding.ruleInputName || "record";

  const sectionsSail = sections.map((section) => {
    const rowsSail = !section.rows || section.rows.length === 0
      ? `              /* TODO: Add fields for this section */`
      : section.rows.map((row) => renderLiveRow(row, "              ", dataBinding, riName)).join(",\n");

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

  // TODO comments for dataBinding.todos
  const todoComments = (dataBinding.todos || []).length > 0
    ? `\n${dataBinding.todos.map((t) => ` * TODO: ${t}`).join("\n")}\n`
    : "";

  return `/*
 * ${title}
 * Live-data form — fields bind to ri!${riName}[recordType!...fields...]
 * Generated from definition.json — edit definition.json to change structure.
 *${todoComments} * Rule inputs: ${riName} (${dataBinding.recordType}), isUpdate (Boolean), cancel (Boolean)
 */
a!localVariables(
${varDecls}
  a!formLayout(
    titleBar: a!headerTemplateFull(
      title: if(a!defaultValue(ri!isUpdate, false()), "Update ${entityName}", "Create ${entityName}"),
      secondaryText: "${subtitle}",
      backgroundColor: "${theme.headerBg}",
      titleColor: "${theme.titleColor}",
      secondaryTextColor: "${theme.subtitleColor}"${headerIcon ? `,\n      stampIcon: "${headerIcon}",\n      stampColor: "${theme.stampContent}"` : ""}
    ),
    contentsWidth: "${contentsWidth}",
    backgroundColor: "${theme.pageBg}",
    contents: {
${sectionsSail}
    },
    buttons: a!buttonLayout(
      primaryButtons: {
        a!buttonWidget(
          label: if(a!defaultValue(ri!isUpdate, false()), "Save", "${submitLabel || "Submit"}"),
          style: "SOLID",
          color: "ACCENT",
          submit: true(),
          validate: true(),
          loadingIndicator: true()
        )
      },
      secondaryButtons: {
        a!buttonWidget(
          label: "${cancelLabel || "Cancel"}",
          style: "OUTLINE",
          saveInto: a!save(ri!cancel, true()),
          submit: true(),
          validate: false()
        )
      }
    )
  )
)`;
}

/**
 * Renders a single row for a live-data form.
 * Fields with fieldRef bind to ri!record[...], others fall back to local!.
 */
function renderLiveRow(row, indent, dataBinding, riName) {
  const fields = row.fields || [];
  if (fields.length === 0) return `${indent}/* empty row */`;

  if (fields.length === 1) {
    return renderLiveField(fields[0], indent, dataBinding, riName);
  }

  // Multi-field row with columnsLayout
  const cols = fields.map((field, i) => {
    const width = weightToSailWidth(field.width || 1);
    const isLast = i === fields.length - 1;
    // Last column gets AUTO to satisfy the "at least one AUTO" rule
    const colWidth = isLast ? `"AUTO"` : `"${width}"`;
    return [
      `${indent}    a!columnLayout(`,
      `${indent}      width: ${colWidth},`,
      `${indent}      contents: {`,
      `${indent}        ${renderLiveField(field, indent + "        ", dataBinding, riName).trim()}`,
      `${indent}      }`,
      `${indent}    )`,
    ].join("\n");
  });

  return [
    `${indent}a!columnsLayout(`,
    `${indent}  columns: {`,
    cols.join(",\n"),
    `${indent}  }`,
    `${indent})`,
  ].join("\n");
}

/**
 * Renders a single field for a live-data form.
 */
function renderLiveField(field, indent, dataBinding, riName) {
  const valueExpr = field.fieldRef
    ? `ri!${riName}['${field.fieldRef}']`
    : `local!${field.name}`;
  const saveIntoExpr = field.fieldRef
    ? `ri!${riName}['${field.fieldRef}']`
    : `local!${field.name}`;

  const req = field.required ? `,\n${indent}  required: true()` : "";
  const placeholder = field.placeholder ? `,\n${indent}  placeholder: "${field.placeholder}"` : "";

  // Find lookup if this field has a lookupRef
  const lookup = field.lookupRef && dataBinding.lookups
    ? dataBinding.lookups.find((lk) => lk.localName === field.lookupRef)
    : null;

  switch (field.type) {
    case "dropdown":
      if (lookup) {
        return [
          `${indent}a!dropdownField(`,
          `${indent}  label: "${field.label}",`,
          `${indent}  labelPosition: "ABOVE",`,
          `${indent}  placeholder: "${field.placeholder || "--- Select a value ---"}",`,
          `${indent}  choiceLabels: local!${lookup.localName}['${lookup.labelField}'],`,
          `${indent}  choiceValues: local!${lookup.localName}['${lookup.valueField}'],`,
          `${indent}  value: ${valueExpr},`,
          `${indent}  saveInto: ${saveIntoExpr}${req}`,
          `${indent})`,
        ].join("\n");
      }
      // Static choices fallback
      return renderField(field, indent);

    case "radio":
      if (lookup) {
        return [
          `${indent}a!radioButtonField(`,
          `${indent}  label: "${field.label}",`,
          `${indent}  labelPosition: "ABOVE",`,
          `${indent}  choiceLabels: local!${lookup.localName}['${lookup.labelField}'],`,
          `${indent}  choiceValues: local!${lookup.localName}['${lookup.valueField}'],`,
          `${indent}  value: ${valueExpr},`,
          `${indent}  saveInto: ${saveIntoExpr},`,
          `${indent}  choiceLayout: "COMPACT"${req}`,
          `${indent})`,
        ].join("\n");
      }
      return renderField(field, indent);

    case "text":
    case "email":
    case "phone":
      const inputPurpose = field.type === "email" ? `,\n${indent}  inputPurpose: "EMAIL"` :
                           field.type === "phone" ? `,\n${indent}  inputPurpose: "PHONE_NUMBER"` : "";
      return [
        `${indent}a!textField(`,
        `${indent}  label: "${field.label}",`,
        `${indent}  labelPosition: "ABOVE",`,
        `${indent}  value: ${valueExpr},`,
        `${indent}  saveInto: ${saveIntoExpr}${inputPurpose}${placeholder}${req}`,
        `${indent})`,
      ].join("\n");

    case "number":
      return [
        `${indent}a!integerField(`,
        `${indent}  label: "${field.label}",`,
        `${indent}  labelPosition: "ABOVE",`,
        `${indent}  value: ${valueExpr},`,
        `${indent}  saveInto: ${saveIntoExpr}${placeholder}${req}`,
        `${indent})`,
      ].join("\n");

    case "decimal":
      return [
        `${indent}a!floatingPointField(`,
        `${indent}  label: "${field.label}",`,
        `${indent}  labelPosition: "ABOVE",`,
        `${indent}  value: ${valueExpr},`,
        `${indent}  saveInto: ${saveIntoExpr}${placeholder}${req}`,
        `${indent})`,
      ].join("\n");

    case "paragraph":
      return [
        `${indent}a!paragraphField(`,
        `${indent}  label: "${field.label}",`,
        `${indent}  labelPosition: "ABOVE",`,
        `${indent}  value: ${valueExpr},`,
        `${indent}  saveInto: ${saveIntoExpr},`,
        `${indent}  height: "MEDIUM"${placeholder}${req}`,
        `${indent})`,
      ].join("\n");

    case "date":
      return [
        `${indent}a!dateField(`,
        `${indent}  label: "${field.label}",`,
        `${indent}  labelPosition: "ABOVE",`,
        `${indent}  value: ${valueExpr},`,
        `${indent}  saveInto: ${saveIntoExpr}${req}`,
        `${indent})`,
      ].join("\n");

    case "datetime":
      return [
        `${indent}a!dateTimeField(`,
        `${indent}  label: "${field.label}",`,
        `${indent}  labelPosition: "ABOVE",`,
        `${indent}  value: ${valueExpr},`,
        `${indent}  saveInto: ${saveIntoExpr}${req}`,
        `${indent})`,
      ].join("\n");

    case "boolean":
      return [
        `${indent}a!checkboxField(`,
        `${indent}  label: "${field.label}",`,
        `${indent}  labelPosition: "ABOVE",`,
        `${indent}  choiceLabels: {"Yes"},`,
        `${indent}  choiceValues: {true},`,
        `${indent}  value: ${valueExpr},`,
        `${indent}  saveInto: ${saveIntoExpr}${req}`,
        `${indent})`,
      ].join("\n");

    case "toggle":
      return [
        `${indent}a!toggleField(`,
        `${indent}  label: "${field.label}",`,
        `${indent}  labelPosition: "ABOVE",`,
        `${indent}  value: ${valueExpr},`,
        `${indent}  saveInto: ${saveIntoExpr}${req}`,
        `${indent})`,
      ].join("\n");

    case "userpicker":
      return [
        `${indent}a!pickerFieldUsers(`,
        `${indent}  label: "${field.label}",`,
        `${indent}  labelPosition: "ABOVE",`,
        `${indent}  value: ${valueExpr},`,
        `${indent}  saveInto: ${saveIntoExpr}${req}`,
        `${indent})`,
      ].join("\n");

    default:
      // Fall back to the mockup renderField for unsupported live types
      return renderField(field, indent);
  }
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
  // Dispatch to live renderer when dataBinding is present
  if (opts.definition.dataBinding) {
    return renderLiveFromDefinition(opts.definition);
  }
  return renderFromDefinition(opts.definition);
}

module.exports = { render, renderLiveField, renderLiveRow };
