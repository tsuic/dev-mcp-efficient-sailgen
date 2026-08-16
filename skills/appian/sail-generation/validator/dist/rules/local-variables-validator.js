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
export function checkLocalVariablesShape(source, lines) {
    const errors = [];
    let searchFrom = 0;
    while (true) {
        const startIdx = findLocalVariablesStart(source, searchFrom);
        if (startIdx === -1)
            break;
        const openParenIdx = startIdx + "a!localVariables(".length;
        const topLevelArgs = splitTopLevelArgs(source, openParenIdx);
        searchFrom = openParenIdx + 1;
        if (topLevelArgs === null || topLevelArgs.length === 0)
            continue;
        // Every argument except the last must look like a variable declaration:
        // `local!name` or `local!name: <anything>`. The last argument is the
        // free-form expression and is exempt from this check.
        for (let i = 0; i < topLevelArgs.length - 1; i++) {
            const raw = topLevelArgs[i].text;
            const trimmed = stripComments(raw).trim();
            if (!isVariableDeclaration(trimmed)) {
                const line = lineOfIndex(source, openParenIdx + topLevelArgs[i].start);
                errors.push({
                    rule: "LOCALVARS_NON_DECL_ARG",
                    severity: "ERROR",
                    line,
                    col: 1,
                    snippet: trimmed.slice(0, 60).replace(/\n/g, " "),
                    message: `a!localVariables() parameter ${i + 1} is not a variable declaration ("local!name" or "local!name: value"). ` +
                        `Only the LAST argument may be a free-form expression — every argument before it must declare a local! variable. ` +
                        `Fold this and any remaining non-declaration arguments into a single final expression (e.g. wrap sibling components in one "{ ... }" array or one layout). ` +
                        `Runtime error otherwise: "A variable is incorrectly defined. Parameter: ${i + 1}. Expected syntax: localvariables(local!a, ..., expr)".`,
                });
            }
        }
        // Check for undeclared local! references in the body expression
        errors.push(...checkUndeclaredLocals(source, openParenIdx, topLevelArgs));
    }
    return errors;
}
/** A top-level arg is a variable declaration iff it starts with `local!<identifier>` immediately followed by end-of-text, whitespace, or a colon (for the `local!name: value` form). It must NOT be a call like `local!name(...)`. */
function isVariableDeclaration(arg) {
    return /^local!\s*[a-zA-Z_][a-zA-Z0-9_]*\s*(:[\s\S]*)?$/.test(arg);
}
/** Removes /* block *\/ and any resulting blank lines are left to trim(). */
function stripComments(text) {
    return text.replace(/\/\*[\s\S]*?\*\//g, "");
}
function findLocalVariablesStart(source, from) {
    // Skip block comments so a commented-out "a!localVariables(" isn't matched.
    const stripped = source.replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length));
    return stripped.indexOf("a!localVariables(", from);
}
/**
 * Splits the contents starting just past an opening "(" into top-level
 * comma-separated arguments, respecting nested (), {}, and string literals.
 * Returns null if the parens never balance back to 0 (unbalanced file —
 * defer to structure-validator for that error).
 */
function splitTopLevelArgs(text, openParenIdx) {
    const args = [];
    let depth = 1; // just past the opening "(" — its contents are at depth 1
    let segStart = openParenIdx;
    let inString = false;
    let inComment = false;
    for (let i = openParenIdx; i < text.length; i++) {
        const ch = text[i];
        const two = text.substr(i, 2);
        if (inComment) {
            if (two === "*/") {
                inComment = false;
                i++;
            }
            continue;
        }
        if (inString) {
            if (ch === '"') {
                if (text[i + 1] === '"') {
                    i++;
                    continue;
                } // escaped quote
                inString = false;
            }
            continue;
        }
        if (two === "/*") {
            inComment = true;
            i++;
            continue;
        }
        if (ch === '"') {
            inString = true;
            continue;
        }
        if (ch === "(" || ch === "{") {
            depth++;
        }
        else if (ch === ")" || ch === "}") {
            depth--;
            if (depth === 0) {
                args.push({ text: text.slice(segStart, i), start: segStart - openParenIdx });
                return args;
            }
            if (depth < 0)
                return null; // unbalanced
        }
        else if (ch === "," && depth === 1) {
            args.push({ text: text.slice(segStart, i), start: segStart - openParenIdx });
            segStart = i + 1;
        }
    }
    return null; // reached end of text without closing — unbalanced
}
function lineOfIndex(source, idx) {
    return source.slice(0, idx).split("\n").length;
}
/**
 * Checks for local! references in the body (last argument) of a!localVariables()
 * that were never declared in the preceding arguments. Only flags references that
 * clearly don't match any declaration — conservative to avoid false positives on
 * nested a!localVariables blocks (which declare their own scope).
 */
function checkUndeclaredLocals(source, openParenIdx, topLevelArgs) {
    const errors = [];
    if (topLevelArgs.length < 2)
        return errors; // need at least 1 decl + 1 body
    // Collect declared variable names from all args except the last
    const declared = new Set();
    for (let i = 0; i < topLevelArgs.length - 1; i++) {
        const raw = stripComments(topLevelArgs[i].text).trim();
        const m = /^local!\s*([a-zA-Z_][a-zA-Z0-9_]*)/.exec(raw);
        if (m)
            declared.add(m[1]);
    }
    // Scan the body (last arg) for all local! references
    const body = topLevelArgs[topLevelArgs.length - 1].text;
    const bodyOffset = openParenIdx + topLevelArgs[topLevelArgs.length - 1].start;
    // Skip checking if body contains nested a!localVariables (those have their own scope)
    if (/a!localVariables\s*\(/.test(body))
        return errors;
    const refPattern = /\blocal!([a-zA-Z_][a-zA-Z0-9_]*)\b/g;
    let match;
    const reported = new Set(); // report each undeclared name only once
    while ((match = refPattern.exec(body)) !== null) {
        const varName = match[1];
        if (declared.has(varName))
            continue;
        if (reported.has(varName))
            continue;
        reported.add(varName);
        const absoluteOffset = bodyOffset + match.index;
        const line = lineOfIndex(source, absoluteOffset);
        errors.push({
            rule: "UNDECLARED_LOCAL_VARIABLE",
            severity: "ERROR",
            line,
            col: 1,
            snippet: `local!${varName}`,
            message: `"local!${varName}" is referenced but never declared in a!localVariables(). Declared variables: ${[...declared].sort().join(", ") || "(none)"}`,
        });
    }
    return errors;
}
