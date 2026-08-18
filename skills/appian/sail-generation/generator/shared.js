/**
 * shared.js
 *
 * Small string-conversion helpers shared across template renderers
 * (grid.js, record-view.js, dashboard.js). Extracted from duplicated
 * copies that used to live independently in grid.js and record-view.js.
 */

/** "first name" -> "local!firstName" */
function toLocalVar(name) {
  const words = name.trim().split(/\s+/);
  return (
    "local!" +
    words[0].toLowerCase() +
    words
      .slice(1)
      .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
      .join("")
  );
}

/** "first name" -> "firstName" */
function toCamelCase(name) {
  const words = name.trim().split(/\s+/);
  return (
    words[0].toLowerCase() +
    words
      .slice(1)
      .map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
      .join("")
  );
}

/** "employee record" -> "Employee Record" */
function toTitleCase(str) {
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Escape a string for use inside SAIL double-quoted literals.
 *  SAIL uses "" to represent a literal " inside a string. */
function sailEsc(str) {
  return str.replace(/"/g, '""');
}

module.exports = { toLocalVar, toCamelCase, toTitleCase, sailEsc };
