#!/usr/bin/env node
/**
 * icon-search.js — targeted lookup against the verified SAIL rich-text icon
 * alias list, without loading the full 1,138-line reference file into an
 * LLM's context.
 *
 * Source of truth: guidelines/ui-guidelines/reference/rich-text-icon-aliases.md
 * (one alias per line). This script just greps that list in-process.
 *
 * Usage:
 *   node generator/icon-search.js <term> [term2] [term3] ...
 *     Substring search (case-insensitive) against every alias.
 *     Prints up to 10 matches per term.
 *
 *   node generator/icon-search.js --exact <alias> [alias2] ...
 *     Checks each alias for an EXACT match. Prints "alias: OK" or
 *     "alias: NOT FOUND" per term. Exit code 1 if any are not found.
 *
 * Examples:
 *   node generator/icon-search.js user clock money
 *   node generator/icon-search.js --exact user-circle tachometer
 */

const fs = require("fs");
const path = require("path");

const ALIASES_PATH = path.join(
  __dirname,
  "..",
  "guidelines",
  "ui-guidelines",
  "reference",
  "rich-text-icon-aliases.md"
);

function loadAliases() {
  const raw = fs.readFileSync(ALIASES_PATH, "utf-8");
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error(
      "Usage:\n" +
        "  node generator/icon-search.js <term> [term2] ...\n" +
        "  node generator/icon-search.js --exact <alias> [alias2] ...\n"
    );
    process.exit(2);
  }

  const aliases = loadAliases();

  if (args[0] === "--exact") {
    const terms = args.slice(1);
    if (terms.length === 0) {
      console.error("Provide at least one alias to check.");
      process.exit(2);
    }
    const aliasSet = new Set(aliases);
    let allOk = true;
    for (const term of terms) {
      const ok = aliasSet.has(term);
      if (!ok) allOk = false;
      console.log(`${term}: ${ok ? "OK" : "NOT FOUND"}`);
    }
    process.exit(allOk ? 0 : 1);
  }

  const MAX_MATCHES = 10;
  for (const term of args) {
    const needle = term.toLowerCase();
    const matches = aliases.filter((a) => a.toLowerCase().includes(needle));
    const shown = matches.slice(0, MAX_MATCHES);
    const suffix = matches.length > MAX_MATCHES ? ` (+${matches.length - MAX_MATCHES} more)` : "";
    console.log(`${term}: ${shown.length ? shown.join(", ") : "(no matches)"}${suffix}`);
  }
}

main();
