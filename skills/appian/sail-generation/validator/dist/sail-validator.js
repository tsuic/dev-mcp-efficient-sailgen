#!/usr/bin/env node
/**
 * SAIL Validator — programmatic syntax and schema checker for generated .sail files.
 *
 * Usage:
 *   npx ts-node sail-validator.ts <path-to-file.sail> [--json] [--warn-only]
 *
 * Options:
 *   --json        Output machine-readable JSON report (default: human-readable)
 *   --warn-only   Exit 0 even if there are errors (warnings-only mode)
 *
 * Exit codes:
 *   0  — Pass (no errors)
 *   1  — Fail (one or more errors)
 *   2  — File not found or unreadable
 */
import * as fs from "fs";
import * as path from "path";
import { checkForbiddenPatterns } from "./rules/forbidden-patterns.js";
import { checkStructure } from "./rules/structure-validator.js";
import { checkIcons } from "./rules/icon-validator.js";
import { checkSchemaEnums } from "./rules/schema-validator.js";
import { checkLayoutConstraints } from "./rules/layout-validator.js";
import { checkLocalVariablesShape } from "./rules/local-variables-validator.js";
import { checkStructuralRules } from "./rules/structural-rules-validator.js";
import { checkParamNames } from "./rules/param-name-validator.js";
import { checkFunctionArity } from "./rules/function-arity-validator.js";
import { buildReport, formatReport } from "./report.js";
/**
 * Reads the co-located `record-mode.json` marker for a `.sail` file, if
 * present (design.md "Scoping forbidden-patterns.ts for record mode").
 * The marker lives alongside the `.sail` file — e.g.
 * `output/{uuid}/record-mode.json` next to
 * `output/{uuid}/{slug}-scaffold.sail` — per `generator/scaffold.js`'s
 * `recordModeMarkerPath(uuid)` convention. Its contents are simply
 * `{ "isRecordMode": true }` or `{ "isRecordMode": false }` — the
 * generator's own `isRecordDataMode(def)` check, persisted so the
 * validator (a separate process/package) can read it back.
 *
 * Returns `false` when the marker is absent, fails to parse, or doesn't
 * carry a boolean `isRecordMode` — a missing or malformed marker must
 * never crash the validator, and defaults to the strictest behavior
 * (every rule active, same as today's unscoped validator).
 */
function loadIsRecordMode(sailFilePath) {
    const markerPath = path.join(path.dirname(sailFilePath), "record-mode.json");
    try {
        if (!fs.existsSync(markerPath)) {
            return false;
        }
        const raw = fs.readFileSync(markerPath, "utf-8");
        const parsed = JSON.parse(raw);
        return typeof parsed?.isRecordMode === "boolean" ? parsed.isRecordMode : false;
    }
    catch {
        return false;
    }
}
function main() {
    const args = process.argv.slice(2);
    const jsonMode = args.includes("--json");
    const warnOnly = args.includes("--warn-only");
    const filePath = args.find(a => !a.startsWith("--"));
    if (!filePath) {
        console.error("Usage: sail-validator <path-to-file.sail> [--json] [--warn-only]");
        process.exit(2);
    }
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) {
        console.error(`File not found: ${resolved}`);
        process.exit(2);
    }
    const source = fs.readFileSync(resolved, "utf-8");
    const lines = source.split("\n");
    const start = Date.now();
    const isRecordMode = loadIsRecordMode(resolved);
    // Run all rule sets — independent, can run in any order
    const allErrors = [
        ...checkStructure(source, lines),
        ...checkForbiddenPatterns(lines, isRecordMode),
        ...checkSchemaEnums(lines),
        ...checkIcons(lines),
        ...checkLayoutConstraints(source, lines),
        ...checkLocalVariablesShape(source, lines),
        ...checkStructuralRules(source),
        ...checkParamNames(source),
        ...checkFunctionArity(lines),
    ];
    // Sort by line number for readable output
    allErrors.sort((a, b) => a.line - b.line || a.col - b.col);
    const elapsed = Date.now() - start;
    const report = buildReport(path.basename(resolved), allErrors);
    if (jsonMode) {
        console.log(JSON.stringify({ ...report, elapsed_ms: elapsed }, null, 2));
    }
    else {
        console.log(formatReport(report));
        console.log(`\n   Validated in ${elapsed}ms`);
    }
    process.exit(warnOnly || report.pass ? 0 : 1);
}
main();
