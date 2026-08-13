const ARITY_RULES = [
    { name: "text", minArgs: 2, hint: 'text(value, format) — use tostring(value) for simple number-to-text conversion' },
    { name: "round", minArgs: 2, hint: 'round(number, numDecimalPlaces) — second arg is required' },
    { name: "fixed", minArgs: 2, hint: 'fixed(number, decimals) — second arg is required' },
];
/**
 * Match function calls that look like: functionName(singleExpr)
 * where singleExpr contains no commas at the same paren depth.
 * This is a heuristic — it won't catch all cases but has very low
 * false-positive rate for the patterns we care about.
 */
export function checkFunctionArity(lines) {
    const errors = [];
    for (const rule of ARITY_RULES) {
        // Build a regex that matches `functionName(` not preceded by a! (which
        // would make it a component, not a plain function).
        const pattern = new RegExp(`(?<!a!)\\b${rule.name}\\s*\\(`, "gi");
        for (let li = 0; li < lines.length; li++) {
            const line = lines[li];
            const trimmed = line.trim();
            if (trimmed.startsWith("/*") || trimmed.startsWith("*"))
                continue;
            pattern.lastIndex = 0;
            let m;
            while ((m = pattern.exec(line)) !== null) {
                // From the opening paren, count depth and look for commas at depth 1.
                const startOffset = m.index + m[0].length; // character after the (
                let depth = 1;
                let commaCount = 0;
                let inStr = false;
                let j = startOffset;
                let valid = true;
                while (j < line.length && depth > 0) {
                    const ch = line[j];
                    if (ch === '"') {
                        if (!inStr)
                            inStr = true;
                        else if (line[j + 1] === '"')
                            j++; // escaped
                        else
                            inStr = false;
                    }
                    else if (!inStr) {
                        if (ch === "(")
                            depth++;
                        else if (ch === ")") {
                            depth--;
                            if (depth === 0)
                                break;
                        }
                        else if (ch === "," && depth === 1)
                            commaCount++;
                    }
                    j++;
                }
                // If we didn't find the closing paren on this line, skip (multi-line call)
                if (depth !== 0) {
                    valid = false;
                }
                if (!valid)
                    continue;
                // commaCount + 1 = number of arguments (if any content exists between parens)
                const argContent = line.slice(startOffset, j).trim();
                if (argContent.length === 0)
                    continue; // empty call like text() — likely not what we match
                const argCount = commaCount + 1;
                if (argCount < rule.minArgs) {
                    errors.push({
                        rule: "FUNCTION_ARITY",
                        severity: "ERROR",
                        line: li + 1,
                        col: m.index + 1,
                        snippet: line.slice(m.index, j + 1).trim().slice(0, 60),
                        message: `${rule.name}() requires at least ${rule.minArgs} arguments, got ${argCount}. ${rule.hint}`,
                    });
                }
            }
        }
    }
    return errors;
}
