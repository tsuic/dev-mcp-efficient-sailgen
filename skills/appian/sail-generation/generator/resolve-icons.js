#!/usr/bin/env node
/**
 * resolve-icons.js — Post-generation icon resolution (Step 4, automated)
 *
 * Replaces "circle" placeholder icons in generated SAIL files with contextually
 * appropriate real icons from the verified alias list.
 *
 * This script combines what previously required 4-5 separate orchestrator tool
 * calls (grep → icon-search → icon-search --exact → str_replace × N → validate)
 * into ONE programmatic CLI call. The LLM still decides the domain concepts
 * (passed as arguments), but the mechanical grep/replace/validate loop is handled
 * by code, eliminating the orchestrator's opportunity to read output files,
 * make redundant calls, or violate efficiency rules.
 *
 * Usage:
 *   node generator/resolve-icons.js <uuid> <concept1:alias1> [concept2:alias2] ...
 *
 *   Each argument after the UUID is a "concept:alias" pair. The script:
 *     1. Finds all "circle" occurrences in the output file
 *     2. Validates each alias against the verified list
 *     3. Replaces placeholders in order (first concept:alias → first occurrence, etc.)
 *     4. Reports results as JSON
 *
 *   If no concept:alias pairs are given, the script just reports how many
 *   placeholders exist (dry-run / discovery mode).
 *
 * Alternate usage (auto mode — lets the script pick icons by line context):
 *   node generator/resolve-icons.js <uuid> --auto
 *
 *   In auto mode, the script reads each line with "circle" and attempts to
 *   infer a domain concept from surrounding text, then picks the best alias.
 *   Falls back to a generic icon if no match is found.
 *
 * Exit codes:
 *   0 — success (all placeholders resolved, or none existed)
 *   1 — some aliases were invalid (reported in output)
 *   2 — usage error (bad args, missing file)
 *
 * Output (JSON to stdout):
 *   {
 *     "file": "output/gen-xxxx/name.sail",
 *     "placeholders": 5,
 *     "resolved": 5,
 *     "replacements": [{ "line": 42, "from": "circle", "to": "user-circle" }],
 *     "errors": []
 *   }
 */

const fs = require("fs");
const path = require("path");

const WORKSPACE_ROOT = path.join(__dirname, "..");
const { setOutputRoot } = require("./output-dir");

// ─── Parse --output-dir before accessing OUTPUT_ROOT ───────────────────────
const rawArgs = process.argv.slice(2);
const outputDirIdx = rawArgs.indexOf("--output-dir");
if (outputDirIdx !== -1 && rawArgs[outputDirIdx + 1]) {
  const dir = path.resolve(WORKSPACE_ROOT, rawArgs[outputDirIdx + 1]);
  setOutputRoot(dir);
  rawArgs.splice(outputDirIdx, 2);
}
// Re-export after potential override so findSailFile uses the correct root
const { OUTPUT_ROOT } = require("./output-dir");

const ALIASES_PATH = path.join(
  WORKSPACE_ROOT,
  "guidelines",
  "ui-guidelines",
  "reference",
  "rich-text-icon-aliases.md"
);

// ─── Domain concept → icon alias mapping for --auto mode ───────────────────
const DOMAIN_HINTS = [
  { patterns: /user|person|people|employee|staff|team|assignee|owner|author|creator/i, aliases: ["user-circle", "user", "users"] },
  { patterns: /time|clock|hour|minute|duration|schedule|created|updated|date/i, aliases: ["clock-o", "clock", "calendar"] },
  { patterns: /money|dollar|price|cost|payment|finance|budget|amount|currency/i, aliases: ["dollar", "money", "credit-card"] },
  { patterns: /status|health|heart|vital|wellness/i, aliases: ["heartbeat", "heart", "heart-o"] },
  { patterns: /document|file|report|paper|clipboard|form|attachment/i, aliases: ["file-text-o", "file-o", "clipboard"] },
  { patterns: /setting|config|gear|cog|wrench|preference|option/i, aliases: ["cog", "wrench", "sliders"] },
  { patterns: /email|mail|envelope|message|communication|contact/i, aliases: ["envelope", "envelope-o", "comment"] },
  { patterns: /comment|chat|discuss|conversation|note|remark|reply/i, aliases: ["comment", "comments", "comment-o"] },
  { patterns: /phone|call|mobile|telephone/i, aliases: ["phone", "mobile"] },
  { patterns: /location|map|address|building|office|place|geo/i, aliases: ["map-marker", "building", "map"] },
  { patterns: /chart|metric|graph|analytics|dashboard|performance|kpi/i, aliases: ["bar-chart", "line-chart", "tachometer"] },
  { patterns: /security|shield|lock|protect|guard|auth|permission/i, aliases: ["shield", "lock", "key"] },
  { patterns: /travel|plane|flight|car|vehicle|trip|transport/i, aliases: ["plane", "car", "ship"] },
  { patterns: /warning|alert|exclamation|caution|danger/i, aliases: ["exclamation-triangle", "exclamation-circle", "bell"] },
  { patterns: /check|success|complete|done|approve|verify/i, aliases: ["check-circle", "check", "check-square-o"] },
  { patterns: /close|remove|delete|cancel|reject|deny/i, aliases: ["times-circle", "times", "trash"] },
  { patterns: /search|find|lookup|magnify|filter/i, aliases: ["search", "filter"] },
  { patterns: /edit|pencil|modify|update|change|write/i, aliases: ["pencil", "pencil-square-o", "edit"] },
  { patterns: /link|chain|connect|attach|reference/i, aliases: ["link", "chain", "paperclip"] },
  { patterns: /star|favorite|bookmark|important|priority/i, aliases: ["star", "star-o", "bookmark"] },
  { patterns: /tag|label|category|classify|group/i, aliases: ["tag", "tags", "folder"] },
  { patterns: /info|information|detail|about|help/i, aliases: ["info-circle", "info", "question-circle"] },
  { patterns: /ticket|issue|bug|incident|request|case/i, aliases: ["ticket", "bug", "life-ring"] },
  { patterns: /resolution|solve|fix|repair|remedy|answer/i, aliases: ["wrench", "check-circle", "lightbulb-o"] },
  { patterns: /history|log|audit|timeline|activity|event/i, aliases: ["history", "clock-o", "list-alt"] },
  { patterns: /deploy|release|rocket|launch|ship|publish/i, aliases: ["rocket", "paper-plane", "cloud-upload"] },
  { patterns: /server|uptime|cpu|memory|system|infrastructure/i, aliases: ["server", "database", "hdd-o"] },
  { patterns: /revenue|sales|deal|pipeline|quota|growth/i, aliases: ["dollar", "line-chart", "trending-up"] },
  { patterns: /headcount|hire|recruit|workforce|employee|onboard/i, aliases: ["users", "user-plus", "id-badge"] },
  { patterns: /open|unassign|pending|queue|backlog|waiting/i, aliases: ["inbox", "hourglass", "clock-o"] },
  { patterns: /close|resolve|complete|finish|done|win/i, aliases: ["check-circle", "trophy", "thumbs-up"] },
  { patterns: /critical|urgent|high|severe|escalat/i, aliases: ["exclamation-circle", "fire", "bolt"] },
];

// ─── Load alias list ───────────────────────────────────────────────────────
function loadAliases() {
  const raw = fs.readFileSync(ALIASES_PATH, "utf-8");
  return new Set(
    raw
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"))
  );
}

// ─── Find the .sail file for a given UUID ──────────────────────────────────
function findSailFile(uuid) {
  const dir = path.join(OUTPUT_ROOT, uuid);
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sail"));
  if (files.length === 0) return null;
  if (files.length === 1) return path.join(dir, files[0]);
  // Multiple .sail files (stale from previous runs) — pick the most recently modified
  const sorted = files
    .map((f) => ({ name: f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return path.join(dir, sorted[0].name);
}

// ─── Find all icon values that need resolution ────────────────────────────
function findPlaceholders(content, validAliases) {
  const lines = content.split("\n");
  const results = [];
  for (let i = 0; i < lines.length; i++) {
    // Match icon: "value" patterns in SAIL (stampField icon, richTextIcon)
    const match = lines[i].match(/icon:\s*"([^"]+)"/);
    if (match) {
      const iconValue = match[1];
      // Skip if already a valid alias — nothing to resolve
      if (validAliases.has(iconValue)) continue;
      results.push({ line: i + 1, text: lines[i], concept: iconValue });
    }
  }
  return results;
}

// ─── Infer best icon from surrounding line context ─────────────────────────
function inferIcon(lineText, validAliases) {
  for (const hint of DOMAIN_HINTS) {
    if (hint.patterns.test(lineText)) {
      // Return the first alias that's actually in the valid set
      for (const alias of hint.aliases) {
        if (validAliases.has(alias)) return alias;
      }
    }
  }
  // Check a few lines of context concepts that commonly appear near icons
  return null; // fallback: no match
}

// ─── Main ──────────────────────────────────────────────────────────────────
function main() {
  const args = rawArgs;

  if (args.length < 1) {
    console.error(
      "Usage:\n" +
        "  node generator/resolve-icons.js <uuid> [concept1:alias1] ...\n" +
        "  node generator/resolve-icons.js <uuid> --auto\n"
    );
    process.exit(2);
  }

  const uuid = args[0];
  const sailFile = findSailFile(uuid);

  if (!sailFile) {
    console.error(JSON.stringify({ error: `No .sail file found in output/${uuid}/` }));
    process.exit(2);
  }

  const validAliases = loadAliases();
  let content = fs.readFileSync(sailFile, "utf-8");
  const placeholders = findPlaceholders(content, validAliases);

  const result = {
    file: path.relative(WORKSPACE_ROOT, sailFile),
    placeholders: placeholders.length,
    resolved: 0,
    replacements: [],
    errors: [],
  };

  // No placeholders — nothing to do
  if (placeholders.length === 0) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  // Discovery / dry-run mode
  if (args.length === 1) {
    result.lines = placeholders.map((p) => ({ line: p.line, context: p.text.trim().substring(0, 120) }));
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }

  // --auto mode: infer icons from context
  if (args[1] === "--auto") {
    const lines = content.split("\n");
    for (const placeholder of placeholders) {
      const lineIdx = placeholder.line - 1;
      let icon = null;

      // If the placeholder has a concept hint (e.g. "circle:revenue"), use it directly
      if (placeholder.concept) {
        icon = inferIcon(placeholder.concept, validAliases);
      }

      // Fall back to line context if no concept or concept didn't match
      if (!icon) {
        const contextStart = Math.max(0, lineIdx - 15);
        const contextEnd = Math.min(lines.length - 1, lineIdx + 15);
        const contextText = lines.slice(contextStart, contextEnd + 1).join(" ");
        icon = inferIcon(contextText, validAliases);
      }
      if (icon) {
        // Replace the invalid icon value with the resolved valid alias
        lines[lineIdx] = lines[lineIdx].replace(`"${placeholder.concept}"`, `"${icon}"`);
        result.replacements.push({ line: placeholder.line, from: placeholder.concept, to: icon });
        result.resolved++;
      } else {
        // Use a safe generic fallback
        const fallback = "circle-o";
        if (validAliases.has(fallback)) {
          lines[lineIdx] = lines[lineIdx].replace(`"${placeholder.concept}"`, `"${fallback}"`);
          result.replacements.push({ line: placeholder.line, from: placeholder.concept, to: fallback, note: "fallback" });
          result.resolved++;
        } else {
          result.errors.push({ line: placeholder.line, error: "No matching icon found and no fallback available" });
        }
      }
    }
    content = lines.join("\n");
    fs.writeFileSync(sailFile, content, "utf-8");
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.errors.length > 0 ? 1 : 0);
  }

  // Manual mode: concept:alias pairs mapped to placeholders in order
  const pairs = args.slice(1).map((arg) => {
    const [concept, alias] = arg.split(":");
    return { concept, alias };
  });

  // Validate all aliases first
  for (const pair of pairs) {
    if (!validAliases.has(pair.alias)) {
      result.errors.push({ alias: pair.alias, error: `"${pair.alias}" is not a verified icon alias` });
    }
  }

  if (result.errors.length > 0) {
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  // Apply replacements: pair[i] → placeholder[i]
  const lines = content.split("\n");
  const limit = Math.min(pairs.length, placeholders.length);
  for (let i = 0; i < limit; i++) {
    const lineIdx = placeholders[i].line - 1;
    lines[lineIdx] = lines[lineIdx].replace(`"${placeholders[i].concept}"`, `"${pairs[i].alias}"`);
    result.replacements.push({ line: placeholders[i].line, from: placeholders[i].concept, to: pairs[i].alias });
    result.resolved++;
  }

  if (placeholders.length > pairs.length) {
    result.errors.push({
      warning: `${placeholders.length - pairs.length} placeholder(s) remain unresolved (not enough concept:alias pairs provided)`,
    });
  }

  content = lines.join("\n");
  fs.writeFileSync(sailFile, content, "utf-8");
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.errors.length > 0 ? 1 : 0);
}

main();
