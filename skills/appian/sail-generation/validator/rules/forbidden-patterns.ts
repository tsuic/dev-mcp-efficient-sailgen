import type { ValidationError } from "../report.js";

interface ForbiddenRule {
  id: string;
  pattern: RegExp;
  message: string;
  severity: "ERROR" | "WARNING";
}

const FORBIDDEN_RULES: ForbiddenRule[] = [
  // Regex functions — no regex in SAIL
  {
    id: "FORBIDDEN_REGEX_FN",
    pattern: /\bregexmatch\s*\(/gi,
    message: "regexmatch() is not supported in SAIL. Use find(), contains(), or search().",
    severity: "ERROR",
  },
  {
    id: "FORBIDDEN_REGEX_FN",
    pattern: /(?<![a-zA-Z!])regex\s*\(/g,
    message: "regex() is not supported in SAIL. Use find(), contains(), or search().",
    severity: "ERROR",
  },

  // JS-style boolean operators
  {
    id: "FORBIDDEN_OPERATOR_AND",
    // match "word and word" but NOT inside strings (best-effort — catches most cases)
    pattern: /\b(\w+)\s+and\s+(\w+)\b/g,
    message: "Use and(a, b) instead of 'a and b' (JavaScript syntax is invalid in SAIL).",
    severity: "ERROR",
  },
  {
    id: "FORBIDDEN_OPERATOR_OR",
    pattern: /\b(\w+)\s+or\s+(\w+)\b/g,
    message: "Use or(a, b) instead of 'a or b' (JavaScript syntax is invalid in SAIL).",
    severity: "ERROR",
  },

  // Wrong comment style
  {
    id: "FORBIDDEN_COMMENT_STYLE",
    // Match // not inside a string (heuristic: not preceded by http: or https:)
    pattern: /(?<!https?:)\/\/(?!\*)/g,
    message: "Use /* */ for comments, not //.",
    severity: "ERROR",
  },

  // Runtime generators forbidden in sample data
  {
    id: "FORBIDDEN_RUNTIME_FN_RAND",
    pattern: /\brand\s*\(/g,
    message: "rand() must not be used in mockup sample data — use hardcoded static values.",
    severity: "ERROR",
  },

  // Mockup forbidden references
  {
    id: "FORBIDDEN_MOCKUP_RI",
    pattern: /\bri!/g,
    message: "ri! references are forbidden in mockups. Use local! variables with TODO-CONVERTER comments.",
    severity: "ERROR",
  },
  {
    id: "FORBIDDEN_MOCKUP_RECORDTYPE",
    pattern: /\brecordtype!/gi,
    message: "recordtype! references are forbidden in mockups. Use a!map() with local! data.",
    severity: "ERROR",
  },
  {
    id: "FORBIDDEN_MOCKUP_SEARCHBOX",
    pattern: /\bshowSearchBox\s*:/g,
    message: "showSearchBox is record-data only and forbidden in mockups. Use a custom textField with TODO-CONVERTER comment.",
    severity: "ERROR",
  },
  {
    id: "FORBIDDEN_MOCKUP_USERFILTERS",
    pattern: /\buserFilters\s*:/g,
    message: "userFilters is record-data only and forbidden in mockups. Use a custom dropdownField with TODO-CONVERTER comment.",
    severity: "ERROR",
  },
  {
    id: "FORBIDDEN_MOCKUP_RECORDACTIONS",
    pattern: /\brecordActions\s*:/g,
    message: "recordActions is record-data only and forbidden in mockups.",
    severity: "ERROR",
  },

  // null in saveInto / value on input fields — broad check, caught contextually
  {
    id: "FORBIDDEN_NULL_SAVEINTO",
    pattern: /saveInto\s*:\s*null\b/g,
    message: "saveInto: null is invalid in input fields.",
    severity: "ERROR",
  },
  {
    id: "FORBIDDEN_NULL_VALUE",
    pattern: /\bvalue\s*:\s*null\b/g,
    message: "value: null is invalid in input fields. Leave the variable uninitialized instead.",
    severity: "WARNING", // WARNING because value: null might appear in non-field contexts
  },

  // fv!row outside a grid column — caught by checkFvVariableContext below
  // fv!item / fv!index outside forEach — caught by checkFvVariableContext below

  // Empty choiceValues array
  {
    id: "FORBIDDEN_EMPTY_CHOICE_VALUES",
    pattern: /choiceValues\s*:\s*\{\s*\}/g,
    message: "choiceValues cannot be an empty array. Remove the field or provide at least one value.",
    severity: "ERROR",
  },

  // save!value used outside a!save()
  {
    id: "FORBIDDEN_SAVE_VALUE_OUTSIDE",
    // Detect save!value that doesn't appear immediately inside a!save(
    // Heuristic: save!value NOT preceded by a!save( on the same/previous token
    pattern: /\bsave!value\b/g,
    message: "save!value may only be used inside a!save(target, save!value). Verify this usage.",
    severity: "WARNING",
  },

  // HTML color names — only flagged when assigned to a color-bearing parameter
  // (a param whose name ends in "Color"/"color", or "style"), NOT when the same
  // word merely appears as literal display text (e.g. text: "Silver", a card
  // title, a tag label). Scoping to the key avoids false positives on content.
  {
    id: "FORBIDDEN_HTML_COLOR",
    pattern: /\b(?:[A-Za-z]*[Cc]olor|[Ss]tyle)\s*:\s*"(RED|GREEN|BLUE|YELLOW|BLACK|WHITE|GRAY|GREY|ORANGE|PURPLE|PINK|BROWN|CYAN|MAGENTA|TEAL|NAVY|MAROON|OLIVE|LIME|AQUA|SILVER|FUCHSIA)"/gi,
    message: "HTML color names are invalid. Use 6-character hex codes (#RRGGBB) or documented enum values.",
    severity: "ERROR",
  },

  // Spacing values less/more (not valid — must be LESS/MORE enum)
  {
    id: "FORBIDDEN_SPACING_VALUE",
    pattern: /spacing\s*:\s*"(less|more)"/gi,
    message: 'Invalid spacing value. Use "LESS", "MORE", "STANDARD", "DENSE", "SPARSE", or "NONE" (uppercase).',
    severity: "ERROR",
  },

  // Backslash-escaped quotes — invalid in SAIL; must use "" to embed a literal "
  {
    id: "FORBIDDEN_BACKSLASH_QUOTE",
    pattern: /\\"/g,
    message: 'SAIL doesn\'t support backslash-escaped quotes — to embed a literal " inside a string you double it (""), not \\".',
    severity: "ERROR",
  },

];

/**
 * Strip string literals from a line for pattern matching purposes.
 * Replaces the content inside double-quoted strings with spaces so that
 * patterns don't fire on words inside string values (e.g. "search by name or role").
 * Handles SAIL's escaped-quote convention ("").
 */
function stripStringLiterals(line: string): string {
  let result = "";
  let inString = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (!inString && ch === '"') {
      inString = true;
      result += ch;
    } else if (inString && ch === '"') {
      if (line[i + 1] === '"') {
        // escaped quote — skip both characters
        result += "  ";
        i++;
      } else {
        inString = false;
        result += ch;
      }
    } else {
      result += inString ? " " : ch;
    }
  }
  return result;
}

/** Rules that must NOT fire inside string literals */
const STRING_SENSITIVE_RULE_IDS = new Set([
  "FORBIDDEN_OPERATOR_AND",
  "FORBIDDEN_OPERATOR_OR",
]);

/**
 * Rule IDs that are exempted throughout a file the generator reports as
 * record-backed (i.e. `isRecordMode: true` passed to
 * `checkForbiddenPatterns`). These are the five mockup-only bans that no
 * longer apply once a file is legitimately record-backed rather than a
 * Static Data Mode mockup. Every other rule fires exactly as it would in
 * any other file — the exemption is file-scoped, not line-scoped: a
 * record-backed file may still mix static and record-bound UI elements,
 * but once ANY part of the file is record-backed, these five identifiers
 * are expected to appear legitimately and are no longer flagged anywhere
 * in that file.
 */
const RECORD_MODE_EXEMPT_IDS = new Set([
  "FORBIDDEN_MOCKUP_RI",
  "FORBIDDEN_MOCKUP_RECORDTYPE",
  "FORBIDDEN_MOCKUP_SEARCHBOX",
  "FORBIDDEN_MOCKUP_USERFILTERS",
  "FORBIDDEN_MOCKUP_RECORDACTIONS",
]);

export function checkForbiddenPatterns(lines: string[], isRecordMode?: boolean): ValidationError[] {
  const errors: ValidationError[] = [];

  lines.forEach((line, lineIndex) => {
    // Skip lines that are pure comments
    const trimmed = line.trim();
    if (trimmed.startsWith("/*") || trimmed.startsWith("*")) return;

    const strippedLine = stripStringLiterals(line);

    for (const rule of FORBIDDEN_RULES) {
      // Exempt only the five mockup-only rules, and only when the whole
      // file has been reported as record-backed. Every other rule is
      // unaffected — an absent/false isRecordMode behaves exactly as
      // calling checkForbiddenPatterns(lines) today.
      if (isRecordMode && RECORD_MODE_EXEMPT_IDS.has(rule.id)) continue;
      rule.pattern.lastIndex = 0; // reset stateful regex
      // Use the string-stripped line for rules that must not fire inside literals
      const testLine = STRING_SENSITIVE_RULE_IDS.has(rule.id) ? strippedLine : line;
      let match: RegExpExecArray | null;
      while ((match = rule.pattern.exec(testLine)) !== null) {
        errors.push({
          rule: rule.id,
          severity: rule.severity,
          line: lineIndex + 1,
          col: match.index + 1,
          snippet: match[0],
          message: rule.message,
        });
      }
    }
  });

  // Context-aware fv! variable checks (separate pass over full source)
  errors.push(...checkFvVariableContext(lines));

  // index(array, wherecontains(...), default) without a [n] scalar unwrap (separate
  // pass over full source since this pattern is almost always formatted across
  // multiple lines in real code)
  errors.push(...checkWherecontainsScalarUnwrap(lines));

  return errors;
}

/**
 * Detects `index(array, wherecontains(...), default)` where the wherecontains(...)
 * call is used directly as index()'s position argument without a `[n]` unwrap
 * (e.g. `wherecontains(...)[1]`).
 *
 * wherecontains() ALWAYS returns an array of positions, even for a single match
 * (e.g. `{2}`, not `2`). Passing that array straight into index()'s position
 * argument makes index() return an array of matches instead of a single
 * scalar/map — chaining `.fieldName` afterward then yields an array like
 * `{"value"}` instead of the scalar `"value"`. See
 * logic-guidelines/array-manipulation-patterns.md for the full pattern.
 *
 * This is a whole-source scan (rather than per-line) because in real code this
 * expression is almost always formatted across multiple lines:
 *
 *   index(
 *     local!items,
 *     wherecontains(local!id, local!items.id),
 *     null
 *   )
 */
function checkWherecontainsScalarUnwrap(lines: string[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const source = lines.join("\n");

  // Find every `wherecontains(` call, then walk forward from its matching close
  // paren to see whether it's immediately followed by `[<digits>]`. Separately
  // confirm the wherecontains() call sits as an argument inside an enclosing
  // index( ... ) call (heuristic: an unmatched "index(" appears before it,
  // scanning backward, without an intervening top-level comma boundary being
  // required — we just require that "index(" is the nearest unclosed call).
  const wcRegex = /wherecontains\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = wcRegex.exec(source)) !== null) {
    const openParenIdx = source.indexOf("(", match.index);
    const closeParenIdx = findMatchingCloseParen(source, openParenIdx);
    if (closeParenIdx === -1) continue;

    // Check for a following [n] unwrap (allow whitespace/newlines before '[')
    const afterMatch = /^\s*\[\s*\d+\s*\]/.exec(source.slice(closeParenIdx + 1));
    if (afterMatch) continue; // properly unwrapped — not a violation

    // Confirm this wherecontains() call is the position argument of an
    // enclosing index( ... ) call. Walk backward to find the nearest
    // enclosing open paren whose preceding identifier is "index".
    if (!isPositionArgumentOfIndex(source, match.index)) continue;

    const line = source.slice(0, match.index).split("\n").length;
    const lineStartIdx = source.lastIndexOf("\n", match.index) + 1;
    const col = match.index - lineStartIdx + 1;

    errors.push({
      rule: "WHERECONTAINS_MISSING_SCALAR_UNWRAP",
      severity: "WARNING",
      line,
      col,
      snippet: "wherecontains(...)",
      message: "index(array, wherecontains(...), default) is missing a [n] scalar unwrap (e.g. wherecontains(...)[1]). wherecontains() always returns an array of positions, even for a single match — without unwrapping, index() returns an array instead of a scalar/map. Add [1] if a single item/scalar result is expected.",
    });
  }

  return errors;
}

/** Given the index of an open paren, return the index of its matching close paren, or -1. */
function findMatchingCloseParen(source: string, openParenIdx: number): number {
  let depth = 0;
  let inString = false;
  for (let i = openParenIdx; i < source.length; i++) {
    const ch = source[i];
    if (ch === '"') {
      if (inString && source[i + 1] === '"') { i++; continue; }
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Determines whether the wherecontains( call starting at wcStartIdx is used as
 * the position argument (2nd argument) directly inside an enclosing index(...) call,
 * i.e. `index(<data>, wherecontains(...)..., <default>)`.
 *
 * Heuristic: scan backward from wcStartIdx, tracking paren depth. The first
 * unmatched open paren we hit is the enclosing call. Check whether the
 * identifier immediately before that paren is "index", AND that there is
 * exactly one top-level comma between that open paren and wcStartIdx (i.e.
 * wherecontains is the 2nd argument, not the 1st).
 */
function isPositionArgumentOfIndex(source: string, wcStartIdx: number): boolean {
  let depth = 0;
  let inString = false;
  let enclosingOpenIdx = -1;

  for (let i = wcStartIdx - 1; i >= 0; i--) {
    const ch = source[i];
    if (ch === '"') {
      if (inString && source[i - 1] === '"') { i--; continue; }
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === ")") depth++;
    else if (ch === "(") {
      if (depth === 0) {
        enclosingOpenIdx = i;
        break;
      }
      depth--;
    }
  }

  if (enclosingOpenIdx === -1) return false;

  const preceding = source.slice(Math.max(0, enclosingOpenIdx - 20), enclosingOpenIdx);
  const nameMatch = /\bindex\s*$/.exec(preceding);
  if (!nameMatch) return false;

  // Count top-level commas between enclosingOpenIdx and wcStartIdx — must be
  // exactly 1 (data arg, then wherecontains as 2nd arg).
  let commaDepth = 0;
  let commaCount = 0;
  let innerString = false;
  for (let i = enclosingOpenIdx + 1; i < wcStartIdx; i++) {
    const ch = source[i];
    if (ch === '"') {
      if (innerString && source[i + 1] === '"') { i++; continue; }
      innerString = !innerString;
      continue;
    }
    if (innerString) continue;
    if (ch === "(") commaDepth++;
    else if (ch === ")") commaDepth--;
    else if (ch === "," && commaDepth === 0) commaCount++;
  }

  return commaCount === 1;
}

/**
 * Context-aware fv! variable validation.
 *
 * Rules:
 * - fv!item and fv!index are valid ONLY inside a!forEach() blocks
 * - fv!row is valid ONLY inside a!gridColumn() blocks
 *
 * Approach: maintain a stack of enclosing component names by tracking
 * paren depth across the whole file, recording a snapshot of the stack at
 * the exact character offset of every push/pop. Each fv! occurrence is then
 * checked against the stack as it stood AT THAT OFFSET, not against
 * whatever the stack happened to be after the rest of the line was scanned.
 *
 * The previous implementation updated the depth stack for an entire line
 * first, then checked fv! matches against the post-line stack state. That
 * misattributes context whenever a component opens AND closes on the same
 * line — e.g. `a!gridColumn(label: "N", value: fv!row.name)` — because by
 * the time fv!row is checked, a!gridColumn has already been popped off the
 * stack, producing a false FV_ROW_OUTSIDE_GRID_COLUMN finding. Scaffold
 * output is always multi-line, but hand-written LLM SAIL frequently packs
 * short components onto one line, so this is exactly where false positives
 * would have shown up most.
 */
function checkFvVariableContext(lines: string[]): ValidationError[] {
  const errors: ValidationError[] = [];

  const source = lines.join("\n");

  // Stack entries: { name: string, depth: number }
  const stack: Array<{ name: string; depth: number }> = [];
  let globalDepth = 0;
  let inString = false;
  let inBlockComment = false;

  // events: absolute offset -> full context-name stack AFTER the change at that offset
  const events: Array<{ offset: number; names: string[] }> = [];

  for (let idx = 0; idx < source.length; idx++) {
    const ch = source[idx];
    const nx = source[idx + 1];

    if (!inString && ch === "/" && nx === "*") { inBlockComment = true; idx++; continue; }
    if (inBlockComment && ch === "*" && nx === "/") { inBlockComment = false; idx++; continue; }
    if (inBlockComment) continue;

    if (ch === '"') {
      if (!inString) inString = true;
      else if (nx === '"') idx++; // escaped quote
      else inString = false;
      continue;
    }
    if (inString) continue;

    if (ch === "(") {
      globalDepth++;
      const preceding = source.slice(Math.max(0, idx - 60), idx);
      const m = /\ba!([\w]+)\s*$/.exec(preceding);
      if (m) {
        stack.push({ name: "a!" + m[1], depth: globalDepth });
        events.push({ offset: idx, names: stack.map((s) => s.name) });
      }
    } else if (ch === ")") {
      while (stack.length > 0 && stack[stack.length - 1].depth >= globalDepth) {
        stack.pop();
      }
      globalDepth--;
      events.push({ offset: idx, names: stack.map((s) => s.name) });
    }
  }

  /** Context-name stack as it stood at (or just before) the given absolute offset. */
  function contextNamesAt(offset: number): string[] {
    let result: string[] = [];
    for (const ev of events) {
      if (ev.offset > offset) break;
      result = ev.names;
    }
    return result;
  }

  const lineStartOffsets: number[] = [];
  let running = 0;
  lines.forEach((line) => {
    lineStartOffsets.push(running);
    running += line.length + 1;
  });

  const FV_ITEM = /\bfv!(item|index)\b/g;
  const FV_ROW  = /\bfv!row\b/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip comment lines for fv! checks
    const trimmed = line.trim();
    if (trimmed.startsWith("/*") || trimmed.startsWith("*")) continue;

    const absoluteBase = lineStartOffsets[i];

    // ── Check fv!item / fv!index ─────────────────────────────────────────
    FV_ITEM.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = FV_ITEM.exec(line)) !== null) {
      const varName = m[1]; // "item" or "index"
      const contextNames = contextNamesAt(absoluteBase + m.index);
      if (!contextNames.includes("a!forEach")) {
        errors.push({
          rule: "FV_ITEM_OUTSIDE_FOREACH",
          severity: "ERROR",
          line: i + 1,
          col: m.index + 1,
          snippet: m[0],
          message: `fv!${varName} is only valid inside a!forEach(). Current context: ${contextNames.slice(-3).join(" > ") || "top-level"}`,
        });
      }
    }

    // ── Check fv!row ─────────────────────────────────────────────────────
    FV_ROW.lastIndex = 0;
    while ((m = FV_ROW.exec(line)) !== null) {
      const contextNames = contextNamesAt(absoluteBase + m.index);
      if (!contextNames.includes("a!gridColumn")) {
        errors.push({
          rule: "FV_ROW_OUTSIDE_GRID_COLUMN",
          severity: "ERROR",
          line: i + 1,
          col: m.index + 1,
          snippet: m[0],
          message: `fv!row is only valid inside a!gridColumn(). Current context: ${contextNames.slice(-3).join(" > ") || "top-level"}`,
        });
      }
    }
  }

  return errors;
}
