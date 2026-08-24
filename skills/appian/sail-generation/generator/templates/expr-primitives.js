/**
 * Expression Primitives — expands structured $expr objects into SAIL expression strings.
 *
 * These replace raw SAIL strings in definition JSON, so the definition agent
 * never needs to author SAIL syntax. It selects from a closed enum of $expr
 * types and the scaffold renders the correct SAIL mechanically.
 *
 * Usage:
 *   const { expandFilterValue, expandComputed } = require("./expr-primitives");
 *   const sail = expandFilterValue(filterValue);       // filter.value
 *   const sail = expandComputed(computedObj, dataSource); // column.computed
 */

"use strict";

// =============================================================================
// Filter Value Expansion
// =============================================================================

/**
 * Known $expr types for filter values.
 * Each maps to a function that receives the $expr object and returns a SAIL string.
 */
const FILTER_EXPR_TYPES = {
  daysAgo: (expr) => `todatetime(today() - ${expr.days})`,
  daysFromNow: (expr) => `todatetime(today() + ${expr.days})`,
  currentUser: () => `loggedInUser()`,
  today: () => `today()`,
  now: () => `now()`,
  startOfMonth: () => `todate(eomonth(today(), -1) + 1)`,
};

/**
 * Expand a filter value into a SAIL expression string.
 *
 * Accepts:
 * - Literals: number, boolean, string (quoted), array of literals
 * - $expr objects: { "$expr": "daysAgo", "days": 7 }
 *
 * Rejects raw SAIL strings (strings containing parentheses are no longer allowed).
 */
function expandFilterValue(value) {
  if (value === null || value === undefined) return null;

  // $expr object — structured expression primitive
  if (typeof value === "object" && !Array.isArray(value) && value.$expr) {
    const handler = FILTER_EXPR_TYPES[value.$expr];
    if (!handler) {
      throw new Error(`Unknown $expr type in filter value: "${value.$expr}". Valid types: ${Object.keys(FILTER_EXPR_TYPES).join(", ")}`);
    }
    return handler(value);
  }

  // Array of literals
  if (Array.isArray(value)) {
    return `{${value.map(expandFilterValue).join(", ")}}`;
  }

  // Boolean
  if (typeof value === "boolean") return value ? "true()" : "false()";

  // Number
  if (typeof value === "number") return String(value);

  // String literal — quote it
  if (typeof value === "string") {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return String(value);
}

// =============================================================================
// Computed Column Expansion
// =============================================================================

/**
 * Known $expr types for computed columns.
 * Each maps to a function that receives the $expr object plus a resolveFieldRef function.
 */
const COMPUTED_EXPR_TYPES = {
  daysSince: (expr, resolve) => {
    const ref = resolve(expr.fieldRef);
    return `tointeger(today() - todate(fv!row['${ref}']))`;
  },
  daysUntil: (expr, resolve) => {
    const ref = resolve(expr.fieldRef);
    return `tointeger(todate(fv!row['${ref}']) - today())`;
  },
  concat: (expr, resolve) => {
    const parts = expr.parts.map((part) => {
      if (typeof part === "string") return `"${part.replace(/"/g, '""')}"`;
      if (part.fieldRef) {
        const ref = resolve(part.fieldRef);
        return `fv!row['${ref}']`;
      }
      return `"${String(part)}"`;
    });
    return `concat(${parts.join(", ")})`;
  },
};

/**
 * Expand a computed column $expr object into a SAIL expression string.
 *
 * @param {object} computed - The $expr object from column.computed
 * @param {function} resolveFieldRef - Function(alias) => full field reference string
 * @returns {string} SAIL expression
 */
function expandComputed(computed, resolveFieldRef) {
  if (!computed || typeof computed !== "object" || !computed.$expr) {
    throw new Error(`computed must be a $expr object, got: ${JSON.stringify(computed)}`);
  }
  const handler = COMPUTED_EXPR_TYPES[computed.$expr];
  if (!handler) {
    throw new Error(`Unknown $expr type in computed column: "${computed.$expr}". Valid types: ${Object.keys(COMPUTED_EXPR_TYPES).join(", ")}`);
  }
  return handler(computed, resolveFieldRef);
}

// =============================================================================
// Validation Helpers (used by define.js)
// =============================================================================

const VALID_FILTER_EXPR_TYPES = Object.keys(FILTER_EXPR_TYPES);
const VALID_COMPUTED_EXPR_TYPES = Object.keys(COMPUTED_EXPR_TYPES);

/**
 * Validate a filter value. Returns an array of error strings (empty = valid).
 */
function validateFilterValue(value, context) {
  const errors = [];
  if (value === null || value === undefined) return errors;

  // Alias strings (@lookup.X[...]) are resolved by bind.js before scaffold — skip validation.
  if (typeof value === "string" && value.startsWith("@")) return errors;

  if (typeof value === "object" && !Array.isArray(value)) {
    if (!value.$expr) {
      errors.push(`${context}: object filter values must have a "$expr" key. Raw objects are not allowed.`);
      return errors;
    }
    if (!VALID_FILTER_EXPR_TYPES.includes(value.$expr)) {
      errors.push(`${context}: unknown $expr type "${value.$expr}". Valid types: [${VALID_FILTER_EXPR_TYPES.join(", ")}]`);
      return errors;
    }
    // Type-specific parameter validation
    if (value.$expr === "daysAgo" || value.$expr === "daysFromNow") {
      if (typeof value.days !== "number" || value.days < 0) {
        errors.push(`${context}: $expr "${value.$expr}" requires "days" as a non-negative number`);
      }
    }
    return errors;
  }

  if (Array.isArray(value)) {
    value.forEach((item, i) => {
      if (typeof item === "object") {
        errors.push(`${context}[${i}]: array filter values must contain only literals (numbers, strings, booleans), not objects`);
      }
    });
    return errors;
  }

  // Reject raw SAIL expression strings (contain parentheses)
  if (typeof value === "string" && value.includes("(")) {
    errors.push(
      `${context}: raw SAIL expressions in filter values are not allowed. ` +
      `Use a $expr object instead. For example: { "$expr": "daysAgo", "days": 7 } ` +
      `instead of "todatetime(today() - 7)". Valid $expr types: [${VALID_FILTER_EXPR_TYPES.join(", ")}]`
    );
    return errors;
  }

  return errors;
}

/**
 * Validate a computed column value. Returns an array of error strings (empty = valid).
 */
function validateComputedValue(computed, context, validAliases) {
  const errors = [];
  if (!computed) return errors;

  if (typeof computed === "string") {
    errors.push(
      `${context}: raw SAIL strings in "computed" are not allowed. ` +
      `Use a $expr object instead. For example: { "$expr": "daysSince", "fieldRef": "createdAt" } ` +
      `instead of "tointeger(today() - todate(...))". Valid $expr types: [${VALID_COMPUTED_EXPR_TYPES.join(", ")}]`
    );
    return errors;
  }

  if (typeof computed !== "object" || Array.isArray(computed)) {
    errors.push(`${context}: "computed" must be a $expr object`);
    return errors;
  }

  if (!computed.$expr) {
    errors.push(`${context}: "computed" object must have a "$expr" key`);
    return errors;
  }

  if (!VALID_COMPUTED_EXPR_TYPES.includes(computed.$expr)) {
    errors.push(`${context}: unknown $expr type "${computed.$expr}". Valid types: [${VALID_COMPUTED_EXPR_TYPES.join(", ")}]`);
    return errors;
  }

  // Type-specific validation
  if (computed.$expr === "daysSince" || computed.$expr === "daysUntil") {
    if (!computed.fieldRef || typeof computed.fieldRef !== "string") {
      errors.push(`${context}: $expr "${computed.$expr}" requires "fieldRef" (alias from dataSource.fields)`);
    } else if (validAliases && !validAliases.has(computed.fieldRef)) {
      errors.push(`${context}: $expr fieldRef "${computed.fieldRef}" does not match any alias in dataSource.fields`);
    }
  }

  if (computed.$expr === "concat") {
    if (!Array.isArray(computed.parts) || computed.parts.length === 0) {
      errors.push(`${context}: $expr "concat" requires a non-empty "parts" array`);
    } else {
      computed.parts.forEach((part, i) => {
        if (typeof part === "object" && part.fieldRef) {
          if (validAliases && !validAliases.has(part.fieldRef)) {
            errors.push(`${context}: concat parts[${i}].fieldRef "${part.fieldRef}" does not match any alias in dataSource.fields`);
          }
        } else if (typeof part !== "string") {
          errors.push(`${context}: concat parts[${i}] must be a string literal or { "fieldRef": "alias" }`);
        }
      });
    }
  }

  return errors;
}

module.exports = {
  expandFilterValue,
  expandComputed,
  validateFilterValue,
  validateComputedValue,
  VALID_FILTER_EXPR_TYPES,
  VALID_COMPUTED_EXPR_TYPES,
};
