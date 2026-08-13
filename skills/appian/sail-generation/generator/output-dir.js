/**
 * output-dir.js — Centralized output directory resolution.
 *
 * All generated artifacts (definition.json, scaffolded .sail files, timing.json)
 * are written to a temp directory rather than polluting the repo tree.
 *
 * Structure: {tmpdir}/sail-generation/{uuid}/
 *
 * Override: Set SAIL_OUTPUT_ROOT env var or pass --output-dir <path> on the CLI
 * to write to a workspace-local directory instead (useful when the orchestrator
 * needs to edit the output with workspace file tools before deploying).
 */

const os = require("os");
const path = require("path");

const DEFAULT_OUTPUT_ROOT = path.join(os.tmpdir(), "sail-generation");

/**
 * Resolve the output root from (in priority order):
 * 1. --output-dir CLI arg (parsed by caller and passed via setOutputRoot)
 * 2. SAIL_OUTPUT_ROOT environment variable
 * 3. Default: $TMPDIR/sail-generation
 */
let _overrideRoot = null;

function setOutputRoot(dir) {
  _overrideRoot = dir;
}

function getOutputRoot() {
  if (_overrideRoot) return _overrideRoot;
  if (process.env.SAIL_OUTPUT_ROOT) return process.env.SAIL_OUTPUT_ROOT;
  return DEFAULT_OUTPUT_ROOT;
}

// Keep OUTPUT_ROOT as a getter for backward compat with code that reads it
Object.defineProperty(module.exports, "OUTPUT_ROOT", {
  get: getOutputRoot,
  enumerable: true,
});

/**
 * Returns the output directory for a given UUID.
 * Creates it if it doesn't exist.
 */
function outputDir(uuid) {
  const fs = require("fs");
  const root = getOutputRoot();
  const dir = path.join(root, uuid);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

module.exports.outputDir = outputDir;
module.exports.setOutputRoot = setOutputRoot;
module.exports.getOutputRoot = getOutputRoot;
