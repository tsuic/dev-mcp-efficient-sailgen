/**
 * component-tree.ts
 *
 * A single, comment/string-aware SAIL parser shared by the structural rule
 * checks. Historically each rule module re-implemented its own paren/brace/
 * string/comment tracking, and small differences between those copies were
 * the direct cause of several validator bugs (a stray "(" in a comment
 * corrupting depth counts, single-line invocations being missed, etc.).
 *
 * This is NOT a full SAIL grammar — it recognizes exactly what the structural
 * rules need:
 *   - a!componentName( ... ) invocations, nested arbitrarily
 *   - the set of parameter names each invocation sets directly (paramName:)
 *   - each node's absolute start offset (for line/col reporting)
 *   - parent/child component relationships (a child is any a!component(
 *     opened at a deeper paren depth before this node closes)
 *
 * It deliberately does NOT model arrays, param values, or expressions beyond
 * what is needed to attribute a component to its enclosing component.
 */

export interface ComponentNode {
  /** e.g. "a!gridColumn" */
  name: string;
  /** absolute character offset of the "a!" that starts this invocation */
  offset: number;
  line: number; // 1-indexed
  col: number; // 1-indexed
  /** parameter names set directly on THIS component (not nested ones) */
  params: Set<string>;
  /** direct child component invocations */
  children: ComponentNode[];
  parent: ComponentNode | null;
}

/**
 * Parse a SAIL source string into a forest of ComponentNodes (top-level
 * components are the roots — usually just a!localVariables).
 */
export function parseComponentTree(source: string): ComponentNode[] {
  const roots: ComponentNode[] = [];
  const lineStarts = computeLineStarts(source);

  // Stack of currently-open components, with the paren depth at which each opened.
  const open: Array<{ node: ComponentNode; depth: number; braceDepth: number }> = [];
  let depth = 0;
  let braceDepth = 0;
  let inString = false;
  let inBlockComment = false;

  // Tracks, for the innermost open component, the paren depth at which the
  // NEXT `identifier:` token would be a direct parameter (i.e. depth exactly
  // one inside the component's opening paren).
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];

    if (!inString && ch === "/" && next === "*") { inBlockComment = true; i++; continue; }
    if (inBlockComment && ch === "*" && next === "/") { inBlockComment = false; i++; continue; }
    if (inBlockComment) continue;

    if (ch === '"') {
      if (!inString) inString = true;
      else if (next === '"') i++; // escaped quote
      else inString = false;
      continue;
    }
    if (inString) continue;

    if (ch === "{") {
      braceDepth++;
      continue;
    }
    if (ch === "}") {
      braceDepth--;
      continue;
    }
    if (ch === "(") {
      // Is this the opening paren of an a!component( invocation?
      const preceding = source.slice(Math.max(0, i - 80), i);
      const m = /\b(a![A-Za-z][\w]*)\s*$/.exec(preceding);
      depth++;
      if (m) {
        const name = m[1];
        const offset = i - (preceding.length - (m.index)); // offset of the "a!"
        const { line, col } = lineColOf(offset, lineStarts);
        const parent = open.length > 0 ? open[open.length - 1].node : null;
        const node: ComponentNode = { name, offset, line, col, params: new Set(), children: [], parent };
        if (parent) parent.children.push(node);
        else roots.push(node);
        open.push({ node, depth, braceDepth });
      }
      continue;
    }

    if (ch === ")") {
      // Close any component opened at this depth.
      while (open.length > 0 && open[open.length - 1].depth === depth) {
        open.pop();
      }
      depth--;
      continue;
    }

    // Parameter detection: `name:` at exactly one level inside the innermost
    // open component. We detect an identifier followed by a colon that is NOT
    // "::" and is at the component's direct-param depth.
    // Skip when inside braces that opened AFTER the component — those keys
    // are dictionary/map literals, not component params. But braces that were
    // already open when the component started (e.g. `columns: { a!gridColumn(
    // label: ... ) }`) should NOT block param detection.
    if (isIdentStart(ch) && open.length > 0) {
      const top = open[open.length - 1];
      // Direct params sit at depth === component's open depth.
      // Only skip if braceDepth has increased SINCE the component opened
      // (meaning we're inside a nested map/dict literal within this component).
      if (depth === top.depth && braceDepth <= top.braceDepth) {
        // Read the identifier.
        let j = i;
        while (j < source.length && isIdentPart(source[j])) j++;
        // Skip whitespace, look for a single colon (not "::" or ":=" etc.).
        let k = j;
        while (k < source.length && (source[k] === " " || source[k] === "\t")) k++;
        if (source[k] === ":" && source[k + 1] !== ":") {
          top.node.params.add(source.slice(i, j));
        }
        i = j - 1; // advance past the identifier
      }
    }
  }

  return roots;
}

/** Flatten a forest into a single array of all nodes (pre-order). */
export function flattenTree(roots: ComponentNode[]): ComponentNode[] {
  const out: ComponentNode[] = [];
  const walk = (n: ComponentNode) => {
    out.push(n);
    n.children.forEach(walk);
  };
  roots.forEach(walk);
  return out;
}

function isIdentStart(ch: string): boolean {
  return /[A-Za-z_]/.test(ch);
}
function isIdentPart(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch);
}

function computeLineStarts(source: string): number[] {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\n") starts.push(i + 1);
  }
  return starts;
}

function lineColOf(offset: number, lineStarts: number[]): { line: number; col: number } {
  // Binary search for the last lineStart <= offset.
  let lo = 0, hi = lineStarts.length - 1, ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lineStarts[mid] <= offset) { ans = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return { line: ans + 1, col: offset - lineStarts[ans] + 1 };
}
