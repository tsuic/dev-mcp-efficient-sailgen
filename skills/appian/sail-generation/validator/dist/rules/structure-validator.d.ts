import type { ValidationError } from "../report.js";
/**
 * Structural checks that require scanning the whole file:
 * - Must start with a!localVariables(
 * - Balanced parentheses
 * - Balanced braces
 * - No unmatched double quotes (heuristic)
 */
export declare function checkStructure(source: string, lines: string[]): ValidationError[];
