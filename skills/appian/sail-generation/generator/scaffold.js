#!/usr/bin/env node
/**
 * scaffold.js — SAIL programmatic template generator (Pass 2 of 2)
 *
 *   node generator/scaffold.js --from-definition <uuid>
 *
 * Reads /output/{uuid}/definition.json (written by the LLM via define.js).
 * Renders structurally-correct SAIL with proper row groupings and widths.
 * Output: /output/{uuid}/{slug}-scaffold.sail
 *
 * OUTPUT
 *   Always writes: /output/{uuid}/{slug}-scaffold.sail
 *   Returns JSON to stdout for the agent to consume.
 */

const fs = require("fs");
const path = require("path");
const { definitionPath, validateDefinition } = require("./define");
// DISABLED: timing logging commented out — can be re-enabled later.
// const { tryRecordEvent } = require("./timing");
const { tryRecordEvent } = require("./timing"); // no-op stub

const templates = {
  form:          require("./templates/form"),
  grid:          require("./templates/grid"),
  dashboard:     require("./templates/dashboard"),
  "record-view": require("./templates/record-view"),
  wizard:        require("./templates/wizard"),
  component:     require("./templates/component"),
  pane:          require("./templates/pane"),
  layout:        require("./templates/layout"),
};

function toSlug(str) {
  const slug = str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  // Degenerate titles (e.g. "!!!", emoji-only) slugify to "" — fall back to
  // a stable placeholder so the output filename is never just "-scaffold.sail".
  return slug || "untitled";
}

// ---------------------------------------------------------------------------
// Mode A: --from-definition
// ---------------------------------------------------------------------------
function runFromDefinition(uuid) {
  tryRecordEvent(uuid, "scaffold", "start");
  const fp = definitionPath(uuid);
  if (!fs.existsSync(fp)) {
    console.error(`No definition found at ${fp}`);
    console.error(`Run: node generator/define.js --write ${uuid} '<json>'`);
    process.exit(1);
  }

  let def;
  try {
    def = JSON.parse(fs.readFileSync(fp, "utf-8"));
  } catch (e) {
    console.error(`Failed to parse definition.json: ${e.message}`);
    process.exit(1);
  }

  const errors = validateDefinition(def);
  if (errors.length > 0) {
    console.error("❌ Definition validation failed — fix these before scaffolding:");
    errors.forEach((e) => console.error(`   • ${e}`));
    process.exit(1);
  }

  const { type, title } = def;
  const template = templates[type];
  if (!template) {
    console.error(`No template for type: ${type}`);
    process.exit(1);
  }

  const slug = toSlug(title);
  const fileName = `${slug}-scaffold.sail`;
  const { outputDir } = require("./output-dir");
  const outDir = outputDir(uuid);
  const outputPath = path.join(outDir, fileName);

  const sailContent = template.render({ definition: def });
  fs.writeFileSync(outputPath, sailContent, "utf-8");

  // Persist a co-located record-mode marker so the validator (a separate
  // process/package) knows whether this file is legitimately record-backed.
  // Record-view carries `dataBinding`, dashboard carries `dataSource`,
  // form/wizard carry `dataBinding` for live-data forms.
  const isRecordMode = (type === "record-view" && !!def.dataBinding) ||
                       (type === "dashboard" && !!def.dataSource) ||
                       (type === "form" && !!def.dataBinding) ||
                       (type === "wizard" && !!def.dataBinding);
  const recordModeMarkerPath = path.join(outDir, "record-mode.json");
  fs.writeFileSync(recordModeMarkerPath, JSON.stringify({ isRecordMode }, null, 2), "utf-8");

  tryRecordEvent(uuid, "scaffold", "end");

  console.log(JSON.stringify({
    uuid,
    type,
    title,
    entityName: def.entityName,
    mode: "definition",
    outputPath,
    fileName,
    lines: sailContent.split("\n").length,
  }));
}

// ---------------------------------------------------------------------------
// CLI dispatch
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);

// Parse --output-dir if provided (must come before --from-definition)
let filteredArgs = [...args];
const outputDirIdx = filteredArgs.indexOf("--output-dir");
if (outputDirIdx !== -1 && filteredArgs[outputDirIdx + 1]) {
  const { setOutputRoot } = require("./output-dir");
  setOutputRoot(filteredArgs[outputDirIdx + 1]);
  filteredArgs.splice(outputDirIdx, 2);
}

if (filteredArgs[0] !== "--from-definition" || !filteredArgs[1]) {
  console.error("Usage: node generator/scaffold.js [--output-dir <path>] --from-definition <uuid>");
  process.exit(1);
}
runFromDefinition(filteredArgs[1]);
