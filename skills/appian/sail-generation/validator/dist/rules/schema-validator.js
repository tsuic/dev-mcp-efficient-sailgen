import { COMPONENT_SCHEMAS, HEX_ACCEPTING_PARAMS } from "../data/schema-tables.js";
/**
 * Schema-driven enum parameter validator.
 *
 * Algorithm (single-pass, O(n)):
 * 1. Scan for component invocations: `a!componentName(`
 * 2. Track the current component context (stack for nesting)
 * 3. For each `paramName: "value"` pattern, look up allowed enums
 * 4. Flag values not in the allowed set
 *
 * Limitations (by design — no full parser):
 * - Does not validate parameters that accept Any Type (non-enum)
 * - Hex color values are accepted for hex-accepting params
 * - Context is heuristic based on indentation/proximity, not full AST
 */
const HEX_6_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const HEX_8_PATTERN = /^#[0-9A-Fa-f]{8}$/;
function isHexColor(value) {
    return HEX_6_PATTERN.test(value) || HEX_8_PATTERN.test(value);
}
// Matches: a!componentName(
const COMPONENT_OPEN = /\ba!([\w]+)\s*\(/g;
// Matches: paramName: "value"  (captures paramName and value)
const PARAM_VALUE = /\b([a-zA-Z][a-zA-Z0-9_]*)\s*:\s*"([^"]+)"/g;
export function checkSchemaEnums(lines) {
    const errors = [];
    // Build a per-character-offset component context stack. Snapshotting the
    // context ONCE PER LINE (the previous approach) misattributes every param
    // on a line where a component opens AND closes on that same line — by the
    // time the end-of-line snapshot is taken, the component has already been
    // popped off the stack, so its params get silently skipped (no schema
    // lookup = no validation). Scaffold output is always multi-line, but
    // hand-written LLM SAIL frequently is not, so this blind spot sits exactly
    // where enum mistakes are most likely.
    const contextAt = buildContextIndex(lines);
    lines.forEach((line, lineIndex) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("/*") || trimmed.startsWith("*"))
            return;
        PARAM_VALUE.lastIndex = 0;
        let match;
        while ((match = PARAM_VALUE.exec(line)) !== null) {
            const paramName = match[1];
            const paramValue = match[2];
            // Skip values that look like expressions or variables
            if (paramValue.includes("!") || paramValue.includes("("))
                continue;
            // Skip TODO placeholders
            if (paramValue.startsWith("TODO") || paramValue === "PLACEHOLDER")
                continue;
            const componentName = contextAt(lineIndex, match.index);
            if (!componentName)
                continue;
            const schema = COMPONENT_SCHEMAS[componentName];
            if (!schema)
                continue;
            const allowedValues = schema[paramName];
            if (!allowedValues)
                continue; // parameter not in our enum table — skip
            // Check if hex is acceptable for this param
            if (HEX_ACCEPTING_PARAMS.has(paramName) && isHexColor(paramValue))
                continue;
            // Case-insensitive comparison — SAIL enum values are always uppercase
            const upperValue = paramValue.toUpperCase();
            const allowed = allowedValues;
            if (!allowed.map(v => v.toUpperCase()).includes(upperValue)) {
                errors.push({
                    rule: "INVALID_ENUM_VALUE",
                    severity: "ERROR",
                    line: lineIndex + 1,
                    col: match.index + 1,
                    snippet: match[0],
                    message: `${componentName}.${paramName} value "${paramValue}" is invalid. Allowed: ${allowed.join(", ")}`,
                });
            }
        }
    });
    return errors;
}
/**
 * Build a per-character-offset index of "which component's params are we
 * currently inside", and return a lookup function `(lineIndex, col) =>
 * componentName | undefined`.
 *
 * Walks the whole file once, tracking a stack of open components by paren
 * depth (same algorithm as before), but instead of snapshotting the stack
 * top only at end-of-line, it records a stack-top change event at the exact
 * character offset where it happens. The lookup then does a binary-search-
 * free linear scan (events list is small relative to file size) to find the
 * most recent event at or before the query position.
 */
function buildContextIndex(lines) {
    const contextStack = [];
    const depthStack = [];
    let globalDepth = 0;
    let inString = false;
    let inComment = false;
    // events: absolute-offset -> context stack top AFTER the change at that offset
    const events = [];
    let absoluteOffset = 0;
    lines.forEach((line) => {
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            const next = line[i + 1];
            if (!inString && ch === "/" && next === "*") {
                inComment = true;
                i++;
                absoluteOffset += 2;
                continue;
            }
            if (inComment && ch === "*" && next === "/") {
                inComment = false;
                i++;
                absoluteOffset += 2;
                continue;
            }
            if (inComment) {
                absoluteOffset++;
                continue;
            }
            if (ch === '"') {
                if (!inString)
                    inString = true;
                else if (next === '"') {
                    i++;
                    absoluteOffset++;
                } // escaped quote
                else
                    inString = false;
                absoluteOffset++;
                continue;
            }
            if (inString) {
                absoluteOffset++;
                continue;
            }
            if (ch === "(") {
                globalDepth++;
                const preceding = line.slice(Math.max(0, i - 60), i);
                const compFoundMatch = /\ba!([\w]+)\s*$/.exec(preceding);
                if (compFoundMatch) {
                    contextStack.push("a!" + compFoundMatch[1]);
                    depthStack.push(globalDepth);
                    events.push({ offset: absoluteOffset, top: contextStack[contextStack.length - 1] });
                }
            }
            else if (ch === ")") {
                while (depthStack.length > 0 && depthStack[depthStack.length - 1] >= globalDepth) {
                    depthStack.pop();
                    contextStack.pop();
                }
                globalDepth--;
                events.push({ offset: absoluteOffset, top: contextStack[contextStack.length - 1] });
            }
            absoluteOffset++;
        }
        absoluteOffset++; // account for the "\n" join character between lines
    });
    // Precompute the absolute offset at the start of each line for fast lookup.
    const lineStartOffsets = [];
    let running = 0;
    lines.forEach((line) => {
        lineStartOffsets.push(running);
        running += line.length + 1;
    });
    return function contextAt(lineIndex, col) {
        const targetOffset = lineStartOffsets[lineIndex] + col;
        // Find the last event at or before targetOffset. Events are pushed in
        // increasing offset order, so a simple backward scan is correct; a
        // binary search would be faster but this list is small in practice
        // (bounded by component-open/close count, not file size).
        let result;
        for (const ev of events) {
            if (ev.offset > targetOffset)
                break;
            result = ev.top;
        }
        return result;
    };
}
