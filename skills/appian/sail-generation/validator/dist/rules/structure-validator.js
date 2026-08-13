/**
 * Structural checks that require scanning the whole file:
 * - Must start with a!localVariables(
 * - Balanced parentheses
 * - Balanced braces
 * - No unmatched double quotes (heuristic)
 */
export function checkStructure(source, lines) {
    const errors = [];
    // ── Root element check ────────────────────────────────────────────────────
    const firstCode = source.replace(/\/\*[\s\S]*?\*\//g, "").trimStart();
    if (!firstCode.startsWith("a!localVariables(")) {
        errors.push({
            rule: "STRUCTURE_ROOT",
            severity: "ERROR",
            line: 1,
            col: 1,
            snippet: firstCode.slice(0, 30),
            message: 'All SAIL expressions must begin with a!localVariables(). Found: "' + firstCode.slice(0, 40).replace(/\n/g, "↵") + '"',
        });
    }
    // ── Balanced parentheses ─────────────────────────────────────────────────
    let parenDepth = 0;
    let braceDepth = 0;
    let inString = false;
    let inLineComment = false; // not valid SAIL but catch anyway
    let inBlockComment = false;
    for (let i = 0; i < source.length; i++) {
        const ch = source[i];
        const next = source[i + 1];
        // Block comment tracking
        if (!inString && ch === "/" && next === "*") {
            inBlockComment = true;
            i++;
            continue;
        }
        if (inBlockComment && ch === "*" && next === "/") {
            inBlockComment = false;
            i++;
            continue;
        }
        if (inBlockComment)
            continue;
        // String tracking (SAIL uses double quotes, escaped as "")
        if (ch === '"') {
            if (!inString) {
                inString = true;
            }
            else if (next === '"') {
                // Escaped double-quote inside string — skip both
                i++;
            }
            else {
                inString = false;
            }
            continue;
        }
        if (inString)
            continue;
        if (ch === "(")
            parenDepth++;
        else if (ch === ")")
            parenDepth--;
        else if (ch === "{")
            braceDepth++;
        else if (ch === "}")
            braceDepth--;
    }
    if (parenDepth !== 0) {
        errors.push({
            rule: "STRUCTURE_UNBALANCED_PARENS",
            severity: "ERROR",
            line: lines.length,
            col: 1,
            snippet: "",
            message: `Unbalanced parentheses: ${parenDepth > 0 ? parenDepth + " unclosed '('" : Math.abs(parenDepth) + " extra ')'"}`,
        });
    }
    if (braceDepth !== 0) {
        errors.push({
            rule: "STRUCTURE_UNBALANCED_BRACES",
            severity: "ERROR",
            line: lines.length,
            col: 1,
            snippet: "",
            message: `Unbalanced braces: ${braceDepth > 0 ? braceDepth + " unclosed '{'" : Math.abs(braceDepth) + " extra '}'"}`,
        });
    }
    // ── Unmatched string (heuristic: odd number of unescaped quotes per line) ─
    lines.forEach((line, idx) => {
        const stripped = line.replace(/\/\*.*?\*\//g, "").replace(/""/g, ""); // remove escaped quotes
        let quoteCount = 0;
        for (const ch of stripped) {
            if (ch === '"')
                quoteCount++;
        }
        if (quoteCount % 2 !== 0) {
            errors.push({
                rule: "STRUCTURE_UNMATCHED_QUOTE",
                severity: "WARNING",
                line: idx + 1,
                col: 1,
                snippet: line.trim().slice(0, 60),
                message: "Possible unmatched string quote on this line.",
            });
        }
    });
    return errors;
}
