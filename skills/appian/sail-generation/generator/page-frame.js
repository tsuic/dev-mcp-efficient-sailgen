/**
 * page-frame.js
 *
 * The one shared page shell for full-page templates (grid, dashboard,
 * record-view). Historically each of those three carried a byte-identical
 * copy of the a!headerContentLayout wrapper + the AUTO/EXTRA_WIDE/AUTO
 * gutter-column body wrapper, duplicated again in each one's skeleton
 * renderer — six near-identical copies. This module owns that shell so the
 * frame is defined once, and exposes a "headerKind" intent so callers pick a
 * header STYLE (plain card / hero / billboard / none) and the SAIL is emitted
 * programmatically rather than hand-assembled per template.
 *
 * Callers supply:
 *   - title              page title text
 *   - body               SAIL string for the centered column contents,
 *                        rendered at BODY_INDENT (14 spaces) to match the
 *                        historical output exactly
 *   - headerKind         "PLAIN_CARD" (default) | "HERO" | "BILLBOARD" | "NONE"
 *   - headerSubtitle     optional secondary line
 *   - headerRight        optional SAIL string placed right-aligned in the
 *                        header (e.g. a "New X" / "Edit" button) — honored by
 *                        PLAIN_CARD only
 *   - headerImage        image URL — required by BILLBOARD, ignored otherwise
 *   - backgroundColor / headerBackgroundColor / centerWidth / contentsPadding
 */

const { THEME_DEFAULTS } = require("./theme");

const HEADER_KINDS = ["PLAIN_CARD", "HERO", "BILLBOARD", "NONE"];

// Center-column body indent. All three legacy templates emitted body content
// at 14 spaces; keeping it identical means the refactor produces the same
// structure it always did.
const BODY_INDENT = "              ";

function esc(s) {
  return String(s == null ? "" : s).replace(/"/g, '""');
}

// ---------------------------------------------------------------------------
// Header renderers, one per headerKind. Each returns the SAIL for the
// headerContentLayout "header:" value (already including the surrounding
// "{ ... }"), or null for NONE.
// ---------------------------------------------------------------------------

function titleRichText(title, indent, theme) {
  const i = indent;
  return `${i}a!richTextDisplayField(
${i}  labelPosition: "COLLAPSED",
${i}  value: a!richTextItem(
${i}    text: "${esc(title)}",
${i}    size: "LARGE",
${i}    style: "STRONG",
${i}    color: "${theme.titleColor}"
${i}  )
${i})`;
}

function subtitleRichText(subtitle, indent, theme) {
  const i = indent;
  return `${i}a!richTextDisplayField(
${i}  labelPosition: "COLLAPSED",
${i}  value: a!richTextItem(
${i}    text: "${esc(subtitle)}",
${i}    color: "${theme.subtitleColor}",
${i}    size: "STANDARD"
${i}  )
${i})`;
}

function renderPlainCardHeader({ title, headerSubtitle, headerRight, headerBackgroundColor, theme }) {
  // Left item: title alone, or title + subtitle stacked in an array.
  const leftItem = headerSubtitle
    ? `                item: {
${titleRichText(title, "                  ", theme)},
${subtitleRichText(headerSubtitle, "                  ", theme)}
                }`
    : `                item: ${titleRichText(title, "                ", theme).trimStart()}`;

  const rightItemBlock = headerRight
    ? `,
              a!sideBySideItem(
                item: ${headerRight},
                width: "MINIMIZE"
              )`
    : "";

  return `{
      a!cardLayout(
        contents: {
          a!sideBySideLayout(
            items: {
              a!sideBySideItem(
${leftItem},
                width: "AUTO"
              )${rightItemBlock}
            },
            alignVertical: "MIDDLE",
            spacing: "STANDARD"
          )
        },
        style: "${headerBackgroundColor}",
        showBorder: false(),
        padding: "MORE",
        marginBelow: "NONE"
      )
    }`;
}

function renderHeroHeader({ title, headerSubtitle, headerBackgroundColor, theme }) {
  const subtitleLine = headerSubtitle
    ? `,
          a!richTextDisplayField(
            labelPosition: "COLLAPSED",
            align: "CENTER",
            value: a!richTextItem(
              text: "${esc(headerSubtitle)}",
              color: "${theme.subtitleColor}",
              size: "MEDIUM"
            )
          )`
    : "";

  return `{
      a!cardLayout(
        contents: {
          a!richTextDisplayField(
            labelPosition: "COLLAPSED",
            align: "CENTER",
            value: a!richTextItem(
              text: "${esc(title)}",
              size: "EXTRA_LARGE",
              style: "STRONG",
              color: "${theme.titleColor}"
            )
          )${subtitleLine}
        },
        style: "${headerBackgroundColor}",
        showBorder: false(),
        padding: "EVEN_MORE",
        marginBelow: "NONE"
      )
    }`;
}

function renderBillboardHeader({ title, headerSubtitle, headerBackgroundColor, headerImage, theme }) {
  const subtitleLine = headerSubtitle
    ? `,
            a!richTextDisplayField(
              labelPosition: "COLLAPSED",
              value: a!richTextItem(
                text: "${esc(headerSubtitle)}",
                color: "${theme.titleColor}",
                size: "MEDIUM"
              )
            )`
    : "";

  return `{
      a!billboardLayout(
        backgroundMedia: a!webImage(source: "${esc(headerImage)}"),
        backgroundColor: "${headerBackgroundColor}",
        height: "MEDIUM",
        marginBelow: "NONE",
        overlay: a!fullOverlay(
          alignVertical: "BOTTOM",
          style: "SEMI_DARK",
          padding: "MORE",
          contents: {
            a!richTextDisplayField(
              labelPosition: "COLLAPSED",
              value: a!richTextItem(
                text: "${esc(title)}",
                size: "LARGE",
                style: "STRONG",
                color: "${theme.titleColor}"
              )
            )${subtitleLine}
          }
        )
      )
    }`;
}

function renderHeader(kind, opts) {
  switch (kind) {
    case "NONE":       return null;
    case "HERO":       return renderHeroHeader(opts);
    case "BILLBOARD":  return renderBillboardHeader(opts);
    case "PLAIN_CARD":
    default:           return renderPlainCardHeader(opts);
  }
}

// ---------------------------------------------------------------------------
// Full frame
// ---------------------------------------------------------------------------

function renderPageFrame(opts) {
  const {
    title,
    body,
    headerKind = "PLAIN_CARD",
    headerSubtitle,
    headerRight = null,
    headerImage,
    backgroundColor = THEME_DEFAULTS.pageBg,
    headerBackgroundColor = THEME_DEFAULTS.headerBg,
    centerWidth = "EXTRA_WIDE",
    contentsPadding = "MORE",
    theme = THEME_DEFAULTS,
  } = opts;

  const headerSail = renderHeader(headerKind, {
    title, headerSubtitle, headerRight, headerBackgroundColor, headerImage, theme,
  });

  const headerParam = headerSail ? `    header: ${headerSail},\n` : "";

  return `  a!headerContentLayout(
${headerParam}    contents: {
      a!columnsLayout(
        columns: {
          a!columnLayout(width: "AUTO", showWhen: a!isPageWidth({"DESKTOP", "DESKTOP_WIDE"})),
          a!columnLayout(
            width: if(a!isPageWidth({"DESKTOP", "DESKTOP_WIDE"}), "${centerWidth}", "AUTO"),
            contents: {
${body}
            }
          ),
          a!columnLayout(width: "AUTO", showWhen: a!isPageWidth({"DESKTOP", "DESKTOP_WIDE"}))
        }
      )
    },
    backgroundColor: "${backgroundColor}",
    contentsPadding: "${contentsPadding}"
  )`;
}

module.exports = { renderPageFrame, HEADER_KINDS, BODY_INDENT };
