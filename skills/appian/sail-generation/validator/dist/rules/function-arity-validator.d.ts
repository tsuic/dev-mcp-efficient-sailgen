import type { ValidationError } from "../report.js";
/**
 * Match function calls that look like: functionName(singleExpr)
 * where singleExpr contains no commas at the same paren depth.
 * This is a heuristic — it won't catch all cases but has very low
 * false-positive rate for the patterns we care about.
 */
export declare function checkFunctionArity(lines: string[]): ValidationError[];
