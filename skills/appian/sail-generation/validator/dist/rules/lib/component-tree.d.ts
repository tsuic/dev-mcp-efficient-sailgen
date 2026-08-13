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
    line: number;
    col: number;
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
export declare function parseComponentTree(source: string): ComponentNode[];
/** Flatten a forest into a single array of all nodes (pre-order). */
export declare function flattenTree(roots: ComponentNode[]): ComponentNode[];
