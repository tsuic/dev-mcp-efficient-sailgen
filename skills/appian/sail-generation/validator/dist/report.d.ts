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
export declare function buildReport(file: string, errors: ValidationError[]): ValidationReport;
export declare function formatReport(report: ValidationReport): string;
