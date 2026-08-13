import type { ValidationError } from "../report.js";
/**
 * Layout structural constraint checks:
 * - columnsLayout must have at least one AUTO width column
 * - paneLayout max 3 panes, at least one AUTO pane
 * - sideBySideItem must not contain columnsLayout or cardLayout
 * - richTextDisplayField value must only contain richTextItem/richTextIcon
 */
export declare function checkLayoutConstraints(source: string, lines: string[]): ValidationError[];
