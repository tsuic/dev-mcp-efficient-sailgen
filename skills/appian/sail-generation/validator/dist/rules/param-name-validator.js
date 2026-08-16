import { COMPONENT_ALLOWED_PARAMS } from "../data/param-registry.js";
import { parseComponentTree, flattenTree } from "./lib/component-tree.js";
/**
 * Param-name validator (Fix #1).
 *
 * Uses the auto-generated param registry (derived from JSON schemas with
 * inherits expansion) to flag any parameter name set on a component that
 * is not in the component's known param set.
 *
 * This catches:
 * - `filters` placed on a!pieChartConfig (should be on a!recordData in data:)
 * - `showSearchBox` on a!gridField when used with non-record data
 * - any typo'd or misplaced param name
 *
 * Does NOT flag components absent from the registry (we only have partial
 * coverage) — silently skips them. False-positive risk is low because the
 * registry is compiled from the official schema JSONs and includes all
 * inherited params.
 */
/**
 * Parameters that are universally valid on any component but rarely appear
 * in schemas (testing/conditional params, dynamic expressions).
 */
const UNIVERSAL_PARAMS = new Set([
    "showWhen",
    "marginAbove",
    "marginBelow",
    "helpTooltip",
]);
/**
 * Components where parameter names are user-defined variable declarations
 * rather than a fixed param set (a!localVariables, a!forEach, etc.).
 * Never validate param names on these.
 */
const SKIP_COMPONENTS = new Set([
    "a!localVariables",
    "a!forEach",
    "a!refreshVariable",
    "a!map",
    "a!queryRecordType",
    "a!queryRecordByIdentifier",
    "a!aggregationFields",
    "a!queryLogicalExpression",
    "a!queryFilter",
    "a!pagingInfo",
    "a!sortInfo",
    "a!measure",
    "a!grouping",
    "a!recordData",
    "a!relatedRecordData",
    "a!save",
    "a!httpResponse",
    "a!httpFormPart",
]);
export function checkParamNames(source) {
    const errors = [];
    const roots = parseComponentTree(source);
    const all = flattenTree(roots);
    for (const node of all) {
        const allowed = COMPONENT_ALLOWED_PARAMS[node.name];
        if (!allowed)
            continue; // component not in registry — skip
        if (SKIP_COMPONENTS.has(node.name))
            continue; // variable-declaration containers
        for (const param of node.params) {
            if (allowed.has(param))
                continue;
            if (UNIVERSAL_PARAMS.has(param))
                continue;
            errors.push({
                rule: "UNKNOWN_PARAM",
                severity: "ERROR",
                line: node.line,
                col: node.col,
                snippet: `${node.name}( … ${param}: …)`,
                message: `"${param}" is not a valid parameter of ${node.name}. Check spelling or move it to the correct component.`,
            });
        }
    }
    return errors;
}
