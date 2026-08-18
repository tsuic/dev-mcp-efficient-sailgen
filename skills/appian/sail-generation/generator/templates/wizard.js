/**
 * templates/wizard.js
 *
 * Renders a SAIL wizard scaffold from a structured definition object.
 *
 * Accepts two calling modes:
 *
 * render({ definition }) — the definition comes from define.js and contains
 * typed rows with widths.
 *
 * KEY STRUCTURAL GUARANTEES (enforced by this renderer, not the LLM):
 *   ✅ Multi-field rows use proportional NX widths (1X–10X) — no fixed enums
 *   ✅ Single-field rows skip a!columnsLayout entirely
 *   ✅ choiceLayout is always "COMPACT" (not "HORIZONTAL")
 *   ✅ All local! variables declared before a!wizardLayout
 *   ✅ isUpdate / cancel control params with TODO-CONVERTER
 *   ✅ Submit only on last step (fv!isLastStep), Cancel in secondaryButtons
 *   ✅ No record-only params (showSearchBox, userFilters, recordActions)
 */

const { toTitleCase } = require("../shared");
const { weightToSailWidth } = require("../define");
const { resolveTheme } = require("../theme");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toLocalVar(name) {
  // Accepts either camelCase (from definition) or space-separated (legacy)
  const words = name.trim().split(/[\s_]+/);
  return (
    "local!" +
    words[0].charAt(0).toLowerCase() + words[0].slice(1) +
    words
      .slice(1)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join("")
  );
}

// ---------------------------------------------------------------------------
// Field renderer — produces the SAIL component string for one field
// ---------------------------------------------------------------------------

/**
 * Builds optional parameter lines shared across most input components.
 * Returns an array of formatted lines (without trailing commas on last item —
 * callers splice these into their line arrays before the closing paren).
 */
function optionalFieldParams(field, indent) {
  const i = indent;
  const lines = [];
  if (field.instructions) lines.push(`${i}  instructions: "${field.instructions}",`);
  if (field.helpTooltip) lines.push(`${i}  helpTooltip: "${field.helpTooltip}",`);
  if (field.readOnly) lines.push(`${i}  readOnly: true(),`);
  return lines;
}

function renderField(field, varName, indent) {
  const i = indent;
  const label = field.label || toTitleCase(field.name);
  const type = field.type || "text";
  const required = field.required ? "true()" : "false()";
  const placeholder = field.placeholder ? `\n${i}  placeholder: "${field.placeholder}",` : "";
  const optParams = optionalFieldParams(field, i);

  switch (type) {
    case "number":
      return [
        `${i}a!integerField(`,
        `${i}  label: "${label}",`,
        `${i}  labelPosition: "ABOVE",`,
        ...(placeholder ? [`${i}  placeholder: "${field.placeholder}",`] : []),
        `${i}  value: ${varName},`,
        `${i}  saveInto: ${varName},`,
        ...optParams,
        `${i}  required: ${required},`,
        `${i}  refreshAfter: "UNFOCUS"`,
        `${i})`,
      ].join("\n");

    case "text":
    case "email":
    case "phone": {
      const purposeMap = { email: "EMAIL", phone: "PHONE_NUMBER" };
      const ip = purposeMap[type];
      return [
        `${i}a!textField(`,
        `${i}  label: "${label}",`,
        `${i}  labelPosition: "ABOVE",`,
        ...(placeholder ? [`${i}  placeholder: "${field.placeholder}",`] : []),
        `${i}  value: ${varName},`,
        `${i}  saveInto: ${varName},`,
        ...(ip ? [`${i}  inputPurpose: "${ip}",`] : []),
        ...optParams,
        `${i}  required: ${required},`,
        `${i}  refreshAfter: "UNFOCUS"`,
        `${i})`,
      ].join("\n");
    }

    case "encrypted":
      return [
        `${i}a!encryptedTextField(`,
        `${i}  label: "${label}",`,
        `${i}  labelPosition: "ABOVE",`,
        `${i}  value: ${varName},`,
        `${i}  saveInto: ${varName},`,
        ...optParams,
        `${i}  required: ${required}`,
        `${i})`,
      ].join("\n");

    case "paragraph": {
      const paraHeight = field.height || "SHORT";
      return [
        `${i}a!paragraphField(`,
        `${i}  label: "${label}",`,
        `${i}  labelPosition: "ABOVE",`,
        ...(placeholder ? [placeholder.trimStart().replace(/^/, `${i}  `)] : []),
        `${i}  value: ${varName},`,
        `${i}  saveInto: ${varName},`,
        ...optParams,
        `${i}  height: "${paraHeight}"`,
        `${i})`,
      ].join("\n");
    }

    case "date":
      return [
        `${i}a!dateField(`,
        `${i}  label: "${label}",`,
        `${i}  labelPosition: "ABOVE",`,
        `${i}  value: ${varName},`,
        `${i}  saveInto: ${varName},`,
        ...optParams,
        `${i}  required: ${required}`,
        `${i})`,
      ].join("\n");

    case "datetime":
      return [
        `${i}a!dateTimeField(`,
        `${i}  label: "${label}",`,
        `${i}  labelPosition: "ABOVE",`,
        `${i}  value: ${varName},`,
        `${i}  saveInto: ${varName},`,
        ...optParams,
        `${i}  required: ${required}`,
        `${i})`,
      ].join("\n");

    case "dropdown": {
      const choices = field.choices || [];
      const labelsStr = choices.map((c) => `"${c.label}"`).join(", ");
      const valuesStr = choices.map((c) => `"${c.value}"`).join(", ");
      return [
        `${i}a!dropdownField(`,
        `${i}  label: "${label}",`,
        `${i}  labelPosition: "ABOVE",`,
        `${i}  placeholder: "${field.placeholder || `Select ${label}...`}",`,
        `${i}  choiceLabels: {${labelsStr}},`,
        `${i}  choiceValues: {${valuesStr}},`,
        `${i}  value: ${varName},`,
        `${i}  saveInto: ${varName},`,
        ...optParams,
        `${i}  required: ${required}`,
        `${i})`,
      ].join("\n");
    }

    case "radio": {
      const choices = field.choices || [];
      const labelsStr = choices.map((c) => `"${c.label}"`).join(", ");
      const valuesStr = choices.map((c) => {
        // booleans stay unquoted, strings get quoted
        if (c.value === true || c.value === "true") return "true()";
        if (c.value === false || c.value === "false") return "false()";
        return `"${c.value}"`;
      }).join(", ");
      return [
        `${i}a!radioButtonField(`,
        `${i}  label: "${label}",`,
        `${i}  labelPosition: "ABOVE",`,
        `${i}  choiceLabels: {${labelsStr}},`,
        `${i}  choiceValues: {${valuesStr}},`,
        `${i}  value: ${varName},`,
        `${i}  saveInto: ${varName},`,
        `${i}  choiceLayout: "COMPACT",`,
        ...optParams,
        `${i}  required: ${required}`,
        `${i})`,
      ].join("\n");
    }

    case "checkbox": {
      const choices = field.choices || [];
      const labelsStr = choices.map((c) => `"${c.label}"`).join(", ");
      const valuesStr = choices.map((c) => `"${c.value}"`).join(", ");
      return [
        `${i}a!checkboxField(`,
        `${i}  label: "${label}",`,
        `${i}  labelPosition: "ABOVE",`,
        `${i}  choiceLabels: {${labelsStr}},`,
        `${i}  choiceValues: {${valuesStr}},`,
        `${i}  value: ${varName},`,
        `${i}  saveInto: ${varName},`,
        ...optParams,
        `${i}  required: ${required}`,
        `${i})`,
      ].join("\n");
    }

    case "decimal":
      return [
        `${i}a!floatingPointField(`,
        `${i}  label: "${label}",`,
        `${i}  labelPosition: "ABOVE",`,
        ...(placeholder ? [`${i}  placeholder: "${field.placeholder}",`] : []),
        `${i}  value: ${varName},`,
        `${i}  saveInto: ${varName},`,
        ...optParams,
        `${i}  required: ${required},`,
        `${i}  refreshAfter: "UNFOCUS"`,
        `${i})`,
      ].join("\n");

    case "time":
      return [
        `${i}a!textField(`,
        `${i}  label: "${label}",`,
        `${i}  labelPosition: "ABOVE",`,
        `${i}  value: ${varName},`,
        `${i}  saveInto: ${varName},`,
        ...optParams,
        `${i}  placeholder: "HH:MM",`,
        `${i}  required: ${required}`,
        `${i})`,
      ].join("\n");

    case "richtext": {
      const rteHeight = field.height || "SHORT";
      return [
        `${i}a!styledTextEditorField(`,
        `${i}  label: "${label}",`,
        `${i}  labelPosition: "ABOVE",`,
        `${i}  value: ${varName},`,
        `${i}  saveInto: ${varName},`,
        ...optParams,
        `${i}  height: "${rteHeight}",`,
        `${i}  sizeLimit: 10000`,
        `${i})`,
      ].join("\n");
    }

    case "cardchoice": {
      const choices = field.choices || [];
      const template = field.cardTemplate || "TILE";
      const templateFn = template === "BAR_STACKED"
        ? "a!cardTemplateBarTextStacked"
        : template === "BAR_JUSTIFIED"
          ? "a!cardTemplateBarTextJustified"
          : "a!cardTemplateTile";
      const dataRows = choices.map((c) =>
        `${i}    a!map(id: "${c.value}", primaryText: "${c.label}")`
      ).join(",\n");
      const maxSel = field.maxSelections ? `\n${i}  maxSelections: ${field.maxSelections},` : "";
      return [
        `${i}a!cardChoiceField(`,
        `${i}  label: "${label}",`,
        `${i}  labelPosition: "ABOVE",`,
        `${i}  data: {`,
        dataRows,
        `${i}  },`,
        `${i}  cardTemplate: ${templateFn}(`,
        `${i}    id: fv!data.id,`,
        `${i}    primaryText: fv!data.primaryText`,
        `${i}  ),`,
        `${i}  value: ${varName},`,
        `${i}  saveInto: ${varName},${maxSel}`,
        ...optParams,
        `${i}  required: ${required}`,
        `${i})`,
      ].join("\n");
    }

    case "fileupload":
      return [
        `${i}a!fileUploadField(`,
        `${i}  label: "${label}",`,
        `${i}  labelPosition: "ABOVE",`,
        `${i}  /* TODO-CONVERTER: Add constant value for upload folder */`,
        `${i}  target: null,`,
        `${i}  value: ${varName},`,
        `${i}  saveInto: ${varName},`,
        ...optParams,
        `${i}  required: ${required}`,
        `${i})`,
      ].join("\n");

    case "userpicker":
      return [
        `${i}a!pickerFieldUsers(`,
        `${i}  label: "${label}",`,
        `${i}  labelPosition: "ABOVE",`,
        `${i}  value: ${varName},`,
        `${i}  saveInto: ${varName},`,
        ...optParams,
        `${i}  required: ${required}`,
        `${i})`,
      ].join("\n");

    case "grouppicker":
      return [
        `${i}a!pickerFieldGroups(`,
        `${i}  label: "${label}",`,
        `${i}  labelPosition: "ABOVE",`,
        `${i}  value: ${varName},`,
        `${i}  saveInto: ${varName},`,
        ...optParams,
        `${i}  required: ${required}`,
        `${i})`,
      ].join("\n");

    case "toggle":
      return [
        `${i}a!toggleField(`,
        `${i}  choiceLabel: "${label}",`,
        `${i}  value: ${varName},`,
        `${i}  saveInto: ${varName}`,
        `${i})`,
      ].join("\n");

    case "boolean":
      return [
        `${i}a!booleanCheckboxField(`,
        `${i}  choiceLabel: "${label}",`,
        `${i}  value: ${varName},`,
        `${i}  saveInto: ${varName}`,
        `${i})`,
      ].join("\n");

    case "multipleDropdown": {
      const choices = field.choices || [];
      const labelsStr = choices.map((c) => `"${c.label}"`).join(", ");
      const valuesStr = choices.map((c) => `"${c.value}"`).join(", ");
      return [
        `${i}a!multipleDropdownField(`,
        `${i}  label: "${label}",`,
        `${i}  labelPosition: "ABOVE",`,
        `${i}  placeholder: "${field.placeholder || `Select ${label}...`}",`,
        `${i}  choiceLabels: {${labelsStr}},`,
        `${i}  choiceValues: {${valuesStr}},`,
        `${i}  value: ${varName},`,
        `${i}  saveInto: ${varName},`,
        ...optParams,
        `${i}  required: ${required}`,
        `${i})`,
      ].join("\n");
    }

    default:
      return [
        `${i}a!textField(`,
        `${i}  label: "${label}",`,
        `${i}  labelPosition: "ABOVE",`,
        `${i}  value: ${varName},`,
        `${i}  saveInto: ${varName},`,
        ...optParams,
        `${i}  required: ${required},`,
        `${i}  refreshAfter: "UNFOCUS"`,
        `${i})`,
      ].join("\n");
  }
}

// ---------------------------------------------------------------------------
// Row renderer — single field (no wrapper) or multi-field columnsLayout
// ---------------------------------------------------------------------------

function renderRow(row, baseIndent) {
  const fields = row.fields;
  const bi = baseIndent;
  const fieldIndent = bi + "  ";

  if (fields.length === 1) {
    // Single-field row: no columnsLayout, no width mapping needed
    const f = fields[0];
    const varName = toLocalVar(f.name);
    return renderField(f, varName, bi);
  }

  // Multi-field row: columnsLayout with proportional NX widths
  const columnsSail = fields.map((f) => {
    const varName = toLocalVar(f.name);
    const sailWidth = weightToSailWidth(f.width || 1);
    const fieldSail = renderField(f, varName, fieldIndent + "    ");
    return [
      `${fieldIndent}a!columnLayout(`,
      `${fieldIndent}  width: "${sailWidth}",`,
      `${fieldIndent}  contents: {`,
      fieldSail,
      `${fieldIndent}  }`,
      `${fieldIndent})`,
    ].join("\n");
  }).join(",\n");

  return [
    `${bi}a!columnsLayout(`,
    `${bi}  columns: {`,
    columnsSail,
    `${bi}  }`,
    `${bi})`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Step content renderer
// ---------------------------------------------------------------------------

function renderStepContents(rows, baseIndent) {
  if (!rows || rows.length === 0) {
    return `${baseIndent}/* TODO: Add fields for this step */`;
  }
  return rows.map((row) => renderRow(row, baseIndent)).join(",\n");
}

// ---------------------------------------------------------------------------
// Review step renderer — auto-generates a null-safe summary of all fields
// ---------------------------------------------------------------------------

/**
 * Detects whether a step is a "review" step: has no rows AND its label contains
 * "review" or "summary" (case-insensitive).
 */
function isReviewStep(step) {
  if (step.rows && step.rows.length > 0) return false;
  return /review|summary|confirm/i.test(step.label);
}

// ---------------------------------------------------------------------------
// disableNextButton — derived, not authored
// ---------------------------------------------------------------------------
// A step's "can I click Next" gate is fully determined by which of its own
// fields are marked required: true — there's nothing for the LLM to decide
// here. Deriving it removes a Pass 3 hand-edit that wizard-sail-agent.md
// previously listed as something the agent had to add by hand.
//
// boolean/toggle fields are excluded: their "required" concept (must be
// true, not merely non-empty) doesn't map to a!isNullOrEmpty, and
// renderField() never emits a `required:` param for them in the first
// place — a boolean/toggle field flagged required in the definition still
// isn't a null-safety gate the way a text/dropdown/date field is.
const REQUIRED_GATE_EXCLUDED_TYPES = new Set(["boolean", "toggle"]);

/** Collects the local! var names of a step's own required, gateable fields. */
function collectRequiredVarsForStep(step) {
  const vars = [];
  for (const row of (step.rows || [])) {
    for (const field of row.fields) {
      if (field.required === true && !REQUIRED_GATE_EXCLUDED_TYPES.has(field.type)) {
        vars.push(toLocalVar(field.name));
      }
    }
  }
  return vars;
}

/**
 * Renders the disableNextButton: line for a step, or "" if the step has no
 * required fields (matches the guideline's default: omit the param, which
 * defaults to false — Next stays enabled).
 */
function renderDisableNextButton(step, indent) {
  const vars = collectRequiredVarsForStep(step);
  if (vars.length === 0) return "";
  const expr = vars.length === 1
    ? `a!isNullOrEmpty(${vars[0]})`
    : `or(${vars.map((v) => `a!isNullOrEmpty(${v})`).join(", ")})`;
  return `\n${indent}disableNextButton: ${expr},`;
}

/**
 * Collects all fields from non-review steps for the review summary.
 * Groups them by step label for a sectioned display.
 */
function renderReviewContents(steps, baseIndent) {
  const bi = baseIndent;
  const sections = [];

  for (const step of steps) {
    if (isReviewStep(step)) continue;
    if (!step.rows || step.rows.length === 0) continue;

    const fields = [];
    for (const row of step.rows) {
      for (const field of row.fields) {
        fields.push(field);
      }
    }
    if (fields.length > 0) {
      sections.push({ label: step.label, fields });
    }
  }

  if (sections.length === 0) {
    return `${bi}/* TODO: Add review content */`;
  }

  const sectionsSail = sections.map((section) => {
    const fieldRows = section.fields.map((field) => {
      const varName = toLocalVar(field.name);
      const label = field.label || toTitleCase(field.name);
      // Null-safe display: show "—" if the field is empty
      return [
        `${bi}        a!richTextDisplayField(`,
        `${bi}          labelPosition: "COLLAPSED",`,
        `${bi}          value: {`,
        `${bi}            a!richTextItem(text: "${label.replace(/"/g, '""')}: ", style: "STRONG"),`,
        `${bi}            a!richTextItem(text: if(a!isNotNullOrEmpty(${varName}), ${varName}, char(8212)))`,
        `${bi}          }`,
        `${bi}        )`,
      ].join("\n");
    }).join(",\n");

    return [
      `${bi}    a!sectionLayout(`,
      `${bi}      label: "${section.label.replace(/"/g, '""')}",`,
      `${bi}      labelColor: "STANDARD",`,
      `${bi}      contents: {`,
      fieldRows,
      `${bi}      }`,
      `${bi}    )`,
    ].join("\n");
  }).join(",\n");

  return sectionsSail;
}

// ---------------------------------------------------------------------------
// Definition-based render (Pass 1 output → Pass 2 input)
// ---------------------------------------------------------------------------

function renderFromDefinition(def) {
  const { title, entityName, steps, headerIcon, headerSubtitle } = def;
  const theme = resolveTheme(def.theme);

  // Collect all field variables across all steps for declarations
  const allFields = [];
  const seenVars = new Set();
  for (const step of steps) {
    for (const row of (step.rows || [])) {
      for (const field of row.fields) {
        const varName = toLocalVar(field.name);
        if (!seenVars.has(varName)) {
          seenVars.add(varName);
          allFields.push({ varName, field });
        }
      }
    }
  }

  // Variable declarations
  const varDecls = [
    `  /* TODO-CONVERTER: Transform control params to ri!isUpdate, ri!cancel */`,
    `  local!isUpdate: false(),`,
    `  local!cancel: false(),`,
    ``,
    `  /* ── Form field variables ── */`,
    ...allFields.map(({ varName, field }) => {
      // checkbox multi-select: initialize as typed empty array
      if (field.type === "checkbox") return `  ${varName}: touniformstring({}),`;
      // cardchoice multi-select (no maxSelections or maxSelections > 1): typed empty array
      if (field.type === "cardchoice" && (!field.maxSelections || field.maxSelections > 1)) return `  ${varName}: touniformstring({}),`;
      // fileupload: empty document list
      if (field.type === "fileupload") return `  ${varName}: {},`;
      // userpicker / grouppicker: empty list
      if (field.type === "userpicker" || field.type === "grouppicker") return `  ${varName},`;
      return `  ${varName},`;
    }),
  ].join("\n");

  // Step indicator style: CHEVRON_HORIZONTAL for ≤4 steps, DOT_VERTICAL for more
  const style = steps.length <= 4 ? "CHEVRON_HORIZONTAL" : "DOT_VERTICAL";
  const subtitle = headerSubtitle || `Complete all steps to submit your ${entityName.toLowerCase()}.`;

  // Render each step
  const stepsSail = steps.map((step) => {
    let contentSail;
    if (isReviewStep(step)) {
      // Auto-generate review summary from all other steps' fields
      contentSail = renderReviewContents(steps, "          ");
    } else {
      contentSail = renderStepContents(step.rows, "          ");
    }
    const instructions = step.instructions
      ? `\n        instructions: "${step.instructions.replace(/"/g, '""')}",`
      : "";
    // disableNextButton is derived from this step's own required fields —
    // never authored by the LLM. Omitted on the review step (nothing left
    // to require there) and on any step with no required fields.
    const disableNext = isReviewStep(step) ? "" : renderDisableNextButton(step, "        ");
    return [
      `      a!wizardStep(`,
      `        label: "${step.label}",${instructions}${disableNext}`,
      `        contents: {`,
      `          a!cardLayout(`,
      `            contents: {`,
      contentSail,
      `            },`,
      `            style: "${theme.cardBg}",`,
      `            showBorder: true(),`,
      `            shape: "ROUNDED",`,
      `            padding: "STANDARD",`,
      `            marginBelow: "STANDARD"`,
      `          )`,
      `        }`,
      `      )`,
    ].join("\n");
  }).join(",\n\n");

  return `/*
 * ${title}
 * Generated from definition.json — edit definition.json to change structure.
 *
 * TODO-CONVERTER comments mark spots to transform when converting to production.
 */
a!localVariables(
${varDecls}

  a!wizardLayout(
    titleBar: a!headerTemplateFull(
      title: "${title}",
      secondaryText: "${subtitle}",
      backgroundColor: "${theme.headerBg}",
      titleColor: "${theme.titleColor}",
      secondaryTextColor: "${theme.subtitleColor}"${headerIcon ? `,\n      stampIcon: "${headerIcon}",\n      stampColor: "${theme.stampContent}"` : ""}
    ),
    isTitleBarFixed: false(),
    style: "${style}",
    contentsWidth: "WIDE",
    steps: {
${stepsSail}
    },
    primaryButtons: {
      a!buttonWidget(
        label: if(a!defaultValue(local!isUpdate, false()), "Update", "Submit"),
        style: "SOLID",
        color: "ACCENT",
        submit: true(),
        loadingIndicator: true(),
        showWhen: fv!isLastStep
      )
    },
    secondaryButtons: {
      /* TODO-CONVERTER: Transform saveInto to ri!cancel */
      a!buttonWidget(
        label: "Cancel",
        style: "LINK",
        saveInto: a!save(local!cancel, true())
      )
    }
  )
)`;
}

// ---------------------------------------------------------------------------
// Public API — called by scaffold.js
// ---------------------------------------------------------------------------

/**
 * @param {{ definition: object }} opts
 */
function render(opts) {
  if (!opts.definition) {
    throw new Error(
      "Wizard template requires a definition JSON with a \"steps\" array. " +
      "Use the definition pipeline: node generator/define.js --write <uuid> '<json>' " +
      "then node generator/scaffold.js --from-definition <uuid>"
    );
  }
  return renderFromDefinition(opts.definition);
}

module.exports = { render, renderField, renderRow };
