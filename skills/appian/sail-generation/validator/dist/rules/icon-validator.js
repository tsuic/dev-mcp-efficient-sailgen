import { VALID_ICONS } from "../data/icons.js";
/**
 * Validates icon parameter values against the official rich-text icon alias list.
 * Checks any parameter named "icon" or "stampIcon" with a string literal value.
 *
 * a!buttonWidget.icon is intentionally excluded from strict validation because
 * Appian's button icons support a broader set — we flag only obvious non-aliases.
 */
const ICON_PARAM_PATTERN = /\b(icon|stampIcon|labelIcon)\s*:\s*"([^"]+)"/g;
export function checkIcons(lines) {
    const errors = [];
    lines.forEach((line, lineIndex) => {
        const trimmed = line.trim();
        // Skip comment lines
        if (trimmed.startsWith("/*") || trimmed.startsWith("*"))
            return;
        ICON_PARAM_PATTERN.lastIndex = 0;
        let match;
        while ((match = ICON_PARAM_PATTERN.exec(line)) !== null) {
            const paramName = match[1];
            const iconValue = match[2];
            // Skip TODO/placeholder strings
            if (iconValue.startsWith("TODO") || iconValue.includes("PLACEHOLDER"))
                continue;
            if (!VALID_ICONS.has(iconValue)) {
                errors.push({
                    rule: "UNKNOWN_ICON",
                    severity: "WARNING",
                    line: lineIndex + 1,
                    col: match.index + 1,
                    snippet: match[0],
                    message: `Unknown icon alias "${iconValue}" for ${paramName}. Verify against rich-text-icon-aliases.md.`,
                });
            }
        }
    });
    return errors;
}
