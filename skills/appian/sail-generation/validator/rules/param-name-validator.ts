import { COMPONENT_ALLOWED_PARAMS } from "../data/param-registry.js";
import { parseComponentTree, flattenTree } from "./lib/component-tree.js";
import type { ValidationError } from "../report.js";

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
 * Also validates component EXISTENCE: any `a!` invocation that has named
 * parameters but is not in the registry, SKIP_COMPONENTS, or KNOWN_FUNCTIONS
 * is flagged as a potentially non-existent/hallucinated component.
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

/**
 * Known a!-prefixed FUNCTIONS that the component-tree parser may pick up
 * (they share the a! prefix with components but are not UI components).
 * These are never flagged as non-existent components.
 */
const KNOWN_FUNCTIONS = new Set([
  // Utility / expression functions
  "a!isNotNullOrEmpty",
  "a!isNullOrEmpty",
  "a!defaultValue",
  "a!match",
  "a!update",
  "a!flatten",
  "a!startProcess",
  "a!writeRecords",
  "a!deleteRecords",
  // Query building
  "a!queryExpression",
  "a!queryAggregation",
  "a!queryColumn",
  "a!querySelection",
  "a!queryRecordByIdentifier",
  // Custom record field functions
  "a!customFieldConcat",
  "a!customFieldMatch",
  "a!customFieldDateDiff",
  "a!customFieldSum",
  "a!customFieldSubtract",
  "a!customFieldMultiply",
  "a!customFieldDivide",
  "a!customFieldDefaultValue",
  "a!customFieldCondition",
  "a!customFieldLogicalExpression",
  // Record filter functions
  "a!recordFilterList",
  "a!recordFilterListOption",
  "a!recordFilterDateRange",
  "a!recordFilterChoices",
  // Interface / component utility
  "a!titleBar",
  "a!iconIndicator",
  "a!iconNewsEvent",
  // HTTP
  "a!httpHeader",
  "a!httpQuery",
  // Deprecated but may appear in older code
  "a!cmiMappingField",
]);

export function checkParamNames(source: string): ValidationError[] {
  const errors: ValidationError[] = [];
  const roots = parseComponentTree(source);
  const all = flattenTree(roots);

  for (const node of all) {
    if (SKIP_COMPONENTS.has(node.name)) continue;
    if (KNOWN_FUNCTIONS.has(node.name)) continue;

    const allowed = COMPONENT_ALLOWED_PARAMS[node.name];

    // ── Component existence check ──
    // If this a! invocation is not in the param registry and it has at least
    // one named parameter (distinguishing it from a plain function call), flag
    // it as a potentially non-existent component.
    if (!allowed) {
      if (node.params.size > 0) {
        errors.push({
          rule: "NONEXISTENT_COMPONENT",
          severity: "ERROR",
          line: node.line,
          col: node.col,
          snippet: `${node.name}(`,
          message: `${node.name} does not exist or is not a known SAIL component. Check spelling — common fixes: a!spacerWidget → remove (use marginAbove/marginBelow), a!processLink → a!startProcessLink, a!tabContainerLayout → a!tabLayout.`,
        });
      }
      continue;
    }

    // ── Parameter name validation ──
    for (const param of node.params) {
      if (allowed.has(param)) continue;
      if (UNIVERSAL_PARAMS.has(param)) continue;

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
