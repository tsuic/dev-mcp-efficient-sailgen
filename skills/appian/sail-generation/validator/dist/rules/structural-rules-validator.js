import { parseComponentTree, flattenTree } from "./lib/component-tree.js";
import { COMPONENT_SCHEMAS } from "../data/schema-tables.js";
/**
 * The set of names that are genuinely UI COMPONENTS (not a!-prefixed
 * functions like a!map / a!forEach / a!isNotNullOrEmpty / a!save, which share
 * the "a!" prefix but are not components). The component-tree parser can't
 * tell them apart structurally, so containment checks must only flag a child
 * that is a KNOWN component — never an arbitrary a! call — otherwise a
 * perfectly valid `if(a!isNotNullOrEmpty(...), a!richTextItem(...), ...)`
 * inside a richText value array would be mis-flagged.
 *
 * Sourced from COMPONENT_SCHEMAS keys (every enum-bearing component) plus a
 * few component names that carry no enum params and so aren't in that table.
 */
const KNOWN_COMPONENTS = new Set([
    ...Object.keys(COMPONENT_SCHEMAS),
    "a!richTextItem",
    "a!richTextIcon",
    "a!richTextBulletedList",
    "a!richTextNumberedList",
    "a!richTextHeader",
    "a!richTextParagraph",
    "a!buttonArrayLayout",
    "a!columnLayout",
    "a!sideBySideItem",
    "a!cardGroupLayout",
    "a!gridColumn",
    "a!gridLayout",
    "a!gridRowLayout",
    "a!boxLayout",
    "a!billboardLayout",
    "a!image",
    "a!webImage",
    "a!documentImage",
    "a!safeImage",
]);
/**
 * Declarative structural rules built on the shared component-tree parser
 * (rules/lib/component-tree.ts). These enforce constraints that every agent
 * prompt already asserts but that no scanner previously checked:
 *
 *  1. CONTAINMENT — component X may only contain component types in set Y.
 *  2. REQUIRED PARAMS — component X must set parameters P.
 *  3. COMPANION PARAMS — if X sets param A it must also set param B (and v.v.).
 *
 * All three are pure structural/param-name checks (no value parsing), so they
 * have a low false-positive risk. Numeric-range checks live in
 * checkNumericRanges below (regex-based, since the tree doesn't track values).
 */
// ── 1. CONTAINMENT ──────────────────────────────────────────────────────────
// component -> set of component names allowed as its DIRECT component children.
// Only components whose child set is genuinely closed are listed. `if`, `char`,
// `a!map`, etc. never appear because they aren't `a!`-prefixed component nodes
// (parseComponentTree only tracks a!componentName( invocations), so plain
// function calls inside a value array don't count as children.
const CONTAINMENT = {
    "a!richTextDisplayField": {
        allowed: new Set([
            "a!richTextItem",
            "a!richTextIcon",
            "a!richTextBulletedList",
            "a!richTextNumberedList",
            "a!richTextHeader",
            "a!richTextParagraph",
            "a!image", // richText can embed an inline a!image via richTextItem in some cases — permissive
        ]),
        message: "a!richTextDisplayField's value/label may only contain richText children " +
            "(a!richTextItem, a!richTextIcon, a!richTextBulletedList, a!richTextNumberedList). " +
            "Found a non-richText component nested inside it.",
    },
};
// ── 2. REQUIRED PARAMS ───────────────────────────────────────────────────────
const REQUIRED_PARAMS = {
    "a!gridColumn": {
        params: ["label", "value"],
        message: (m) => `a!gridColumn requires "${m}" — every column needs both a label and a value.`,
    },
    "a!gridLayoutHeaderCell": {
        params: ["label"],
        message: () => `a!gridLayoutHeaderCell requires "label".`,
    },
};
// ── 3. COMPANION PARAMS ──────────────────────────────────────────────────────
// If a component sets one param in a group, it must set the others too.
const COMPANION_PARAMS = [
    {
        component: "a!gridField",
        group: ["selectionValue", "selectionSaveInto"],
        message: 'a!gridField row selection needs both "selectionValue" and "selectionSaveInto" — ' +
            "setting one without the other leaves selection non-functional.",
    },
    {
        component: "a!gridLayout",
        group: ["selectionValue", "selectionSaveInto"],
        message: 'a!gridLayout row selection needs both "selectionValue" and "selectionSaveInto".',
    },
    {
        component: "a!cardLayout",
        group: ["decorativeBarColor", "decorativeBarPosition"],
        message: 'a!cardLayout\'s decorative bar needs both "decorativeBarColor" and ' +
            '"decorativeBarPosition" — one without the other renders nothing.',
    },
];
export function checkStructuralRules(source) {
    const errors = [];
    const roots = parseComponentTree(source);
    const all = flattenTree(roots);
    for (const node of all) {
        checkContainment(node, errors);
        checkForbiddenChildren(node, errors);
        checkRequiredParams(node, errors);
        checkCompanionParams(node, errors);
    }
    errors.push(...checkNumericRanges(source));
    errors.push(...checkPageFrameInArray(source));
    return errors;
}
function checkContainment(node, errors) {
    const rule = CONTAINMENT[node.name];
    if (!rule)
        return;
    for (const child of node.children) {
        // Only flag KNOWN components — never a!-prefixed functions (a!map,
        // a!isNotNullOrEmpty, a!save, ...), which are legal inside a value array.
        if (!KNOWN_COMPONENTS.has(child.name))
            continue;
        if (!rule.allowed.has(child.name)) {
            errors.push({
                rule: "STRUCT_CONTAINMENT",
                severity: "ERROR",
                line: child.line,
                col: child.col,
                snippet: child.name + "(",
                message: `${rule.message} (found ${child.name} inside ${node.name})`,
            });
        }
    }
}
// ── 1b. FORBIDDEN CHILDREN ──────────────────────────────────────────────────
// component -> set of component names that must NOT appear as its direct children.
// Inverse of CONTAINMENT — used when a container accepts almost everything
// EXCEPT certain components (e.g. buttons can't go directly in column/card contents).
const FORBIDDEN_CHILDREN = {
    "a!columnLayout": {
        forbidden: new Set(["a!buttonWidget"]),
        message: "a!buttonWidget cannot be placed directly inside a!columnLayout contents. " +
            "Wrap it in a!buttonArrayLayout(buttons: { a!buttonWidget(...) }).",
    },
    "a!cardLayout": {
        forbidden: new Set(["a!buttonWidget"]),
        message: "a!buttonWidget cannot be placed directly inside a!cardLayout contents. " +
            "Wrap it in a!buttonArrayLayout(buttons: { a!buttonWidget(...) }).",
    },
};
function checkForbiddenChildren(node, errors) {
    const rule = FORBIDDEN_CHILDREN[node.name];
    if (!rule)
        return;
    for (const child of node.children) {
        if (rule.forbidden.has(child.name)) {
            errors.push({
                rule: "STRUCT_FORBIDDEN_CHILD",
                severity: "ERROR",
                line: child.line,
                col: child.col,
                snippet: child.name + "(",
                message: rule.message,
            });
        }
    }
}
function checkRequiredParams(node, errors) {
    const rule = REQUIRED_PARAMS[node.name];
    if (!rule)
        return;
    for (const p of rule.params) {
        if (!node.params.has(p)) {
            errors.push({
                rule: "STRUCT_REQUIRED_PARAM",
                severity: "ERROR",
                line: node.line,
                col: node.col,
                snippet: node.name + "(",
                message: rule.message(p),
            });
        }
    }
}
function checkCompanionParams(node, errors) {
    for (const rule of COMPANION_PARAMS) {
        if (rule.component !== node.name)
            continue;
        const present = rule.group.filter((p) => node.params.has(p));
        if (present.length > 0 && present.length < rule.group.length) {
            const missing = rule.group.filter((p) => !node.params.has(p));
            errors.push({
                rule: "STRUCT_COMPANION_PARAM",
                severity: "ERROR",
                line: node.line,
                col: node.col,
                snippet: node.name + "(",
                message: `${rule.message} Missing: ${missing.join(", ")}.`,
            });
        }
    }
}
const RANGE_RULES = [
    { param: /\bweight\s*:\s*(-?\d+(?:\.\d+)?)/g, min: 1, max: 10, label: 'weight (a!gridLayoutColumnConfig/a!columnLayout) must be an integer 1-10' },
    { param: /\bpercentage\s*:\s*(-?\d+(?:\.\d+)?)/g, min: 0, max: 100, label: 'percentage (a!progressBarField/a!gaugeField) must be 0-100' },
    { param: /\bpageSize\s*:\s*(-?\d+)/g, min: 1, label: 'pageSize must be a positive integer' },
    { param: /\bbatchSize\s*:\s*(-?\d+)/g, min: 0, max: 5000, label: 'batchSize must be 0-5000 (use 5000 for max rows, not -1)' },
    { param: /\bdataLimit\s*:\s*(-?\d+)/g, min: 1, max: 5000, label: 'dataLimit must be 1-5000' },
];
function checkNumericRanges(source) {
    const errors = [];
    const lines = source.split("\n");
    // Precompute which offsets are inside strings/comments to avoid false hits.
    for (let li = 0; li < lines.length; li++) {
        const line = lines[li];
        const trimmed = line.trim();
        if (trimmed.startsWith("/*") || trimmed.startsWith("*"))
            continue;
        for (const rule of RANGE_RULES) {
            rule.param.lastIndex = 0;
            let m;
            while ((m = rule.param.exec(line)) !== null) {
                const value = parseFloat(m[1]);
                if (Number.isNaN(value))
                    continue;
                const belowMin = rule.min !== undefined && value < rule.min;
                const aboveMax = rule.max !== undefined && value > rule.max;
                if (belowMin || aboveMax) {
                    errors.push({
                        rule: "NUMERIC_RANGE",
                        severity: "ERROR",
                        line: li + 1,
                        col: m.index + 1,
                        snippet: m[0],
                        message: `${rule.label}, got: ${m[1]}.`,
                    });
                }
            }
        }
    }
    return errors;
}
// ── PAGE FRAME IN ARRAY ───────────────────────────────────────────────────────
// Page-frame layouts (headerContentLayout, formLayout, wizardStepLayout) cannot
// be inside a `{ ... }` component array — they must be the SOLE return value of
// a!localVariables. Appian rejects `{ a!headerContentLayout(...) }` with
// "An array of components cannot contain a header content layout."
const PAGE_FRAME_RE = /\ba!(headerContentLayout|formLayout|wizardStepLayout)\s*\(/g;
function checkPageFrameInArray(source) {
    const errors = [];
    const lines = source.split("\n");
    // Strategy: for each page-frame invocation, look backwards in the source to
    // see if the immediately preceding non-whitespace/comment character is `{`.
    // If so, the frame is inside an array literal — that's invalid.
    let inString = false;
    let inBlockComment = false;
    // Build a "clean" source map where strings and comments are blanked out,
    // so we only match real component invocations.
    const clean = [];
    for (let i = 0; i < source.length; i++) {
        const ch = source[i];
        const next = source[i + 1];
        if (!inString && ch === "/" && next === "*") {
            inBlockComment = true;
            clean.push(" ", " ");
            i++;
            continue;
        }
        if (inBlockComment && ch === "*" && next === "/") {
            inBlockComment = false;
            clean.push(" ", " ");
            i++;
            continue;
        }
        if (inBlockComment) {
            clean.push(" ");
            continue;
        }
        if (ch === '"') {
            if (!inString) {
                inString = true;
                clean.push(" ");
                continue;
            }
            else if (next === '"') {
                clean.push(" ", " ");
                i++;
                continue;
            }
            else {
                inString = false;
                clean.push(" ");
                continue;
            }
        }
        if (inString) {
            clean.push(" ");
            continue;
        }
        clean.push(ch);
    }
    const cleanSrc = clean.join("");
    PAGE_FRAME_RE.lastIndex = 0;
    let m;
    while ((m = PAGE_FRAME_RE.exec(cleanSrc)) !== null) {
        const offset = m.index;
        // Walk backwards from `offset` skipping whitespace/newlines to find the
        // preceding significant character.
        let prev = offset - 1;
        while (prev >= 0 && /[\s\n\r]/.test(cleanSrc[prev]))
            prev--;
        if (prev >= 0 && cleanSrc[prev] === "{") {
            // Determine line number
            let lineNum = 1;
            for (let c = 0; c < offset; c++) {
                if (source[c] === "\n")
                    lineNum++;
            }
            errors.push({
                rule: "PAGE_FRAME_IN_ARRAY",
                severity: "ERROR",
                line: lineNum,
                col: 1,
                snippet: m[0].trim(),
                message: `a!${m[1]} cannot be inside a { } array. It must be the sole return value of a!localVariables — remove the surrounding braces.`,
            });
        }
    }
    return errors;
}
