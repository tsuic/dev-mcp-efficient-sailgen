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
export {};
