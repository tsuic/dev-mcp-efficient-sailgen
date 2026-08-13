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
export declare function checkLocalVariablesShape(source: string, lines: string[]): ValidationError[];
