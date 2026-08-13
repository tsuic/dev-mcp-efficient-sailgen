import type { ValidationError } from "../report.js";

/**
 * a!localVariables(...) shape check that pure paren/brace-balance counting
 * cannot catch, because the malformed shape is still perfectly balanced:
 *
 *   a!localVariables(
 *     local!clients: {...},   <-- param 1: valid variable declaration
 *     a!gridField(...),       <-- param 2: NOT a variable declaration
 *     a!richTextDisplayField(...)  <-- param 3: would-be final expression
 *   )
 *
 * a!localVariables()'s signature is `localvariables(local!a, ..., expr)` —
 * EVERY top-level argument except the LAST one must be a variable
 * declaration (`local!name` or `local!name: value`). Only the final
 * argument is allowed to be an arbitrary expression (a component, an array
 * of components, an if(), etc). Appian's runtime error for a violation is:
 *   "A variable is incorrectly defined. Parameter: N. Expected syntax:
 *    localvariables(local!a, ..., expr) or localvariables(local!a:10, ..., expr)"
 * — i.e. parameter N was expected to be a variable declaration and wasn't.
 *
 * This slips through pure balance-counting (STRUCTURE_UNBALANCED_*) because
 * the file can have 0 unclosed parens/braces while still having a non-decl
 * argument in a non-final position. The fix is always to fold everything
 * from the first non-declaration argument onward into ONE final expression
 * (typically a `{ ... }` array of sibling components, or a single wrapping
 * layout) — which is itself a normal, documented SAIL idiom and must NOT be
 * flagged when it legitimately IS the last argument.
 */
export function checkLocalVariablesShape(source: string, lines: string[]): ValidationError[] {
  const errors: ValidationError[] = [];

  let searchFrom = 0;
  while (true) {
    const startIdx = findLocalVariablesStart(source, searchFrom);
    if (startIdx === -1) break;

    const openParenIdx = startIdx + "a!localVariables(".length;
    const topLevelArgs = splitTopLevelArgs(source, openParenIdx);
    searchFrom = openParenIdx + 1;

    if (topLevelArgs === null || topLevelArgs.length === 0) continue;

    // Every argument except the last must look like a variable declaration:
    // `local!name` or `local!name: <anything>`. The last argument is the
    // free-form expression and is exempt from this check.
    for (let i = 0; i < topLevelArgs.length - 1; i++) {
      const raw = topLevelArgs[i].text;
      // Strip block/line comments (and the surrounding whitespace they leave
      // behind) before checking the declaration shape — a leading comment
      // like `/* Form fields */\n  local!email,` is a normal, documented
      // pattern and must not be mistaken for a non-declaration argument.
      const trimmed = stripComments(raw).trim();
      if (!isVariableDeclaration(trimmed)) {
        const line = lineOfIndex(source, openParenIdx + topLevelArgs[i].start);
        errors.push({
          rule: "LOCALVARS_NON_DECL_ARG",
          severity: "ERROR",
          line,
          col: 1,
          snippet: trimmed.slice(0, 60).replace(/\n/g, " "),
          message:
            `a!localVariables() parameter ${i + 1} is not a variable declaration ("local!name" or "local!name: value"). ` +
            `Only the LAST argument may be a free-form expression — every argument before it must declare a local! variable. ` +
            `Fold this and any remaining non-declaration arguments into a single final expression (e.g. wrap sibling components in one "{ ... }" array or one layout). ` +
            `Runtime error otherwise: "A variable is incorrectly defined. Parameter: ${i + 1}. Expected syntax: localvariables(local!a, ..., expr)".`,
        });
      }
    }
  }

  return errors;
}

/** A top-level arg is a variable declaration iff it starts with `local!<identifier>` immediately followed by end-of-text, whitespace, or a colon (for the `local!name: value` form). It must NOT be a call like `local!name(...)`. */
function isVariableDeclaration(arg: string): boolean {
  return /^local!\s*[a-zA-Z_][a-zA-Z0-9_]*\s*(:[\s\S]*)?$/.test(arg);
}

/** Removes /* block *\/ and any resulting blank lines are left to trim(). */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "");
}

function findLocalVariablesStart(source: string, from: number): number {
  // Skip block comments so a commented-out "a!localVariables(" isn't matched.
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length));
  return stripped.indexOf("a!localVariables(", from);
}

interface Arg {
  text: string;
  start: number; // offset from openParenIdx
}

/**
 * Splits the contents starting just past an opening "(" into top-level
 * comma-separated arguments, respecting nested (), {}, and string literals.
 * Returns null if the parens never balance back to 0 (unbalanced file —
 * defer to structure-validator for that error).
 */
function splitTopLevelArgs(text: string, openParenIdx: number): Arg[] | null {
  const args: Arg[] = [];
  let depth = 1; // just past the opening "(" — its contents are at depth 1
  let segStart = openParenIdx;
  let inString = false;
  let inComment = false;

  for (let i = openParenIdx; i < text.length; i++) {
    const ch = text[i];
    const two = text.substr(i, 2);

    if (inComment) {
      if (two === "*/") { inComment = false; i++; }
      continue;
    }
    if (inString) {
      if (ch === '"') {
        if (text[i + 1] === '"') { i++; continue; } // escaped quote
        inString = false;
      }
      continue;
    }
    if (two === "/*") { inComment = true; i++; continue; }
    if (ch === '"') { inString = true; continue; }

    if (ch === "(" || ch === "{") {
      depth++;
    } else if (ch === ")" || ch === "}") {
      depth--;
      if (depth === 0) {
        args.push({ text: text.slice(segStart, i), start: segStart - openParenIdx });
        return args;
      }
      if (depth < 0) return null; // unbalanced
    } else if (ch === "," && depth === 1) {
      args.push({ text: text.slice(segStart, i), start: segStart - openParenIdx });
      segStart = i + 1;
    }
  }

  return null; // reached end of text without closing — unbalanced
}

function lineOfIndex(source: string, idx: number): number {
  return source.slice(0, idx).split("\n").length;
}
