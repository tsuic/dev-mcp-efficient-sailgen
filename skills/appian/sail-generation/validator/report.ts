export interface ValidationError {
  rule: string;
  severity: "ERROR" | "WARNING";
  line: number;
  col: number;
  snippet: string;
  message: string;
}

export interface ValidationReport {
  pass: boolean;
  file: string;
  errorCount: number;
  warningCount: number;
  errors: ValidationError[];
}

export function buildReport(file: string, errors: ValidationError[]): ValidationReport {
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

export function formatReport(report: ValidationReport): string {
  const icon = report.pass ? "✅" : "❌";
  const lines: string[] = [
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
