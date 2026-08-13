export function buildReport(file, errors) {
    const errCount = errors.filter(e => e.severity === "ERROR").length;
    const warnCount = errors.filter(e => e.severity === "WARNING").length;
    return {
        pass: errCount === 0,
        file,
        errorCount: errCount,
        warningCount: warnCount,
        errors,
    };
}
export function formatReport(report) {
    const icon = report.pass ? "✅" : "❌";
    const lines = [
        `${icon} ${report.pass ? "PASS" : "FAIL"} — ${report.file}`,
        `   ${report.errorCount} error(s), ${report.warningCount} warning(s)`,
    ];
    if (report.errors.length === 0) {
        lines.push("   No issues found.");
        return lines.join("\n");
    }
    lines.push("");
    for (const err of report.errors) {
        const sev = err.severity === "ERROR" ? "ERR " : "WARN";
        const loc = `L${err.line}:${err.col}`;
        const snip = err.snippet ? ` → "${err.snippet.slice(0, 50)}"` : "";
        lines.push(`   [${sev}] ${loc}  [${err.rule}]${snip}`);
        lines.push(`          ${err.message}`);
    }
    return lines.join("\n");
}
