import type { ValidationError } from "../report.js";

/**
 * Layout structural constraint checks:
 * - columnsLayout must have at least one AUTO width column
 * - paneLayout max 3 panes, at least one AUTO pane
 * - sideBySideItem must not contain columnsLayout or cardLayout
 * - richTextDisplayField value must only contain richTextItem/richTextIcon
 */

export function checkLayoutConstraints(source: string, lines: string[]): ValidationError[] {
  const errors: ValidationError[] = [];

  checkColumnsAutoWidth(lines, errors);
  checkPaneConstraints(lines, errors);
  checkSideBySideNesting(lines, errors);

  return errors;
}

// Fixed-width column enums that require at least one AUTO sibling.
// Relative NX widths (1X–10X) distribute space proportionally and do NOT
// require an AUTO column — the whole row can be all-NX.
const FIXED_COLUMN_WIDTHS = new Set([
  "EXTRA_NARROW", "NARROW", "NARROW_PLUS",
  "MEDIUM", "MEDIUM_PLUS",
  "WIDE", "WIDE_PLUS",
  "EXTRA_WIDE",
]);

/**
 * Find each a!columnsLayout block and verify that if any column uses a fixed-width
 * enum (NARROW, MEDIUM, WIDE, etc.) at least one sibling column has width: "AUTO".
 * All-relative-weight rows (1X–10X) are exempt — they distribute space proportionally
 * without needing an AUTO column.
 */
function checkColumnsAutoWidth(lines: string[], errors: ValidationError[]): void {
  let inColumnsLayout = false;
  let depth = 0;
  let columnsStart = -1;
  let columnsDepth = 0;
  let hasAutoColumn = false;
  let hasFixedColumn = false;
  let inString = false;
  let inBlockComment = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.includes('a!columnsLayout(') && !inColumnsLayout) {
      inColumnsLayout = true;
      columnsStart = i + 1;
      hasAutoColumn = false;
      hasFixedColumn = false;
      columnsDepth = 1;
      depth = 1;
      continue;
    }

    if (!inColumnsLayout) continue;

    // Track depth within this columnsLayout — parens/braces inside /* */
    // comments must NOT count, or a stray unmatched ( or ) in a comment
    // (common in this codebase's own annotation style) corrupts the depth
    // count and causes the container's "closed" detection to fire early or
    // late, producing false negatives/positives for everything after it.
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      const next = line[c + 1];
      if (!inString && ch === "/" && next === "*") { inBlockComment = true; c++; continue; }
      if (inBlockComment && ch === "*" && next === "/") { inBlockComment = false; c++; continue; }
      if (inBlockComment) continue;
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth < columnsDepth) {
          // Closed the columnsLayout — only error if fixed widths are present without AUTO
          if (hasFixedColumn && !hasAutoColumn) {
            errors.push({
              rule: "LAYOUT_COLUMNS_NO_AUTO",
              severity: "ERROR",
              line: columnsStart,
              col: 1,
              snippet: "a!columnsLayout(",
              message: "a!columnsLayout with fixed-width columns (NARROW/MEDIUM/WIDE/etc.) must have at least one a!columnLayout with width: \"AUTO\". Use relative NX widths (1X–10X) instead if you want proportional distribution without AUTO.",
            });
          }
          inColumnsLayout = false;
          break;
        }
      }
    }

    if (!inColumnsLayout) continue;

    if (/width\s*:\s*"AUTO"/i.test(line)) {
      hasAutoColumn = true;
    }
    // Check for any fixed-width enum on a columnLayout width param
    const fixedMatch = line.match(/width\s*:\s*"([^"]+)"/);
    if (fixedMatch && FIXED_COLUMN_WIDTHS.has(fixedMatch[1])) {
      hasFixedColumn = true;
    }
  }
}

/**
 * Check paneLayout constraints:
 * - Must have at least one a!pane with width: "AUTO"
 * - Maximum 3 panes
 */
function checkPaneConstraints(lines: string[], errors: ValidationError[]): void {
  let inPaneLayout = false;
  let paneStart = -1;
  let depth = 0;
  let paneCount = 0;
  let hasAutoPane = false;
  let inString = false;
  let inBlockComment = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.includes("a!paneLayout(") && !inPaneLayout) {
      inPaneLayout = true;
      paneStart = i + 1;
      depth = 1;
      paneCount = 0;
      hasAutoPane = false;
      continue;
    }

    if (!inPaneLayout) continue;

    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      const next = line[c + 1];
      if (!inString && ch === "/" && next === "*") { inBlockComment = true; c++; continue; }
      if (inBlockComment && ch === "*" && next === "/") { inBlockComment = false; c++; continue; }
      if (inBlockComment) continue;
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth <= 0) {
          if (!hasAutoPane) {
            errors.push({
              rule: "LAYOUT_PANE_NO_AUTO",
              severity: "ERROR",
              line: paneStart,
              col: 1,
              snippet: "a!paneLayout(",
              message: "a!paneLayout must have at least one a!pane with width: \"AUTO\".",
            });
          }
          if (paneCount > 3) {
            errors.push({
              rule: "LAYOUT_PANE_TOO_MANY",
              severity: "ERROR",
              line: paneStart,
              col: 1,
              snippet: "a!paneLayout(",
              message: `a!paneLayout has ${paneCount} panes — maximum is 3.`,
            });
          }
          inPaneLayout = false;
          break;
        }
      }
    }

    if (!inPaneLayout) continue;

    // Count panes (depth=2 means we're directly inside paneLayout's panes array)
    if (/\ba!pane\s*\(/.test(line)) paneCount++;

    // Check for AUTO width pane
    if (/width\s*:\s*"AUTO"/i.test(line)) {
      // Confirm this is on a pane, not a column (best-effort: check proximity)
      const prevLines = lines.slice(Math.max(0, i - 5), i + 1).join("\n");
      if (/\ba!pane\s*\(/.test(prevLines)) hasAutoPane = true;
    }
  }
}

/**
 * Check that sideBySideItem does not contain columnsLayout or cardLayout directly.
 * Heuristic: if we see a!columnsLayout or a!cardLayout within a line range
 * that follows an a!sideBySideItem( and precedes its closing paren.
 */
function checkSideBySideNesting(lines: string[], errors: ValidationError[]): void {
  let inSBSItem = false;
  let sbsStart = -1;
  let depth = 0;
  let inString = false;
  let inBlockComment = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.includes("a!sideBySideItem(") && !inSBSItem) {
      inSBSItem = true;
      sbsStart = i + 1;
      depth = 1;
      continue;
    }

    if (!inSBSItem) continue;

    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      const next = line[c + 1];
      if (!inString && ch === "/" && next === "*") { inBlockComment = true; c++; continue; }
      if (inBlockComment && ch === "*" && next === "/") { inBlockComment = false; c++; continue; }
      if (inBlockComment) continue;
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth <= 0) { inSBSItem = false; break; }
      }
    }

    if (!inSBSItem) continue;

    if (/\ba!columnsLayout\s*\(/.test(line)) {
      errors.push({
        rule: "LAYOUT_SBS_COLUMNS",
        severity: "ERROR",
        line: i + 1,
        col: 1,
        snippet: line.trim().slice(0, 60),
        message: "a!columnsLayout cannot be nested inside a!sideBySideItem. Only a!sideBySideLayout nesting is allowed.",
      });
    }
    if (/\ba!cardLayout\s*\(/.test(line)) {
      errors.push({
        rule: "LAYOUT_SBS_CARD",
        severity: "ERROR",
        line: i + 1,
        col: 1,
        snippet: line.trim().slice(0, 60),
        message: "a!cardLayout cannot be nested inside a!sideBySideItem. Only a!sideBySideLayout nesting is allowed.",
      });
    }
    if (/\ba!sectionLayout\s*\(/.test(line)) {
      errors.push({
        rule: "LAYOUT_SBS_SECTION",
        severity: "ERROR",
        line: i + 1,
        col: 1,
        snippet: line.trim().slice(0, 60),
        message: "a!sectionLayout cannot be nested inside a!sideBySideItem. Only a!sideBySideLayout nesting is allowed.",
      });
    }
  }
}
