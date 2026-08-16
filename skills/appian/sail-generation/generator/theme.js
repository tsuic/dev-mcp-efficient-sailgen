/**
 * theme.js — Single-source color constants for SAIL generation.
 *
 * All scaffold templates import colors from here. To change the default
 * look of generated UIs, edit this file — every template picks up the
 * change automatically.
 *
 * The definition JSON supports an optional top-level "theme" object that
 * overrides any of these keys per-generation. Templates merge at render
 * time: { ...THEME_DEFAULTS, ...(def.theme || {}) }.
 */

const THEME_DEFAULTS = {
  // -- Structural backgrounds ------------------------------------------------
  headerBg:       "#2C3E50",   // Header card / hero / billboard background
  pageBg:         "#F5F6F8",   // Page body (headerContentLayout / formLayout)
  cardBg:         "#FFFFFF",   // Section cards, KPI cards, grid filter cards

  // -- Header text -----------------------------------------------------------
  titleColor:     "#FFFFFF",   // Title text on dark header
  subtitleColor:  "#B0BEC5",   // Subtitle text on dark header (also #BDC3C7 in forms)

  // -- KPI palette -----------------------------------------------------------
  kpiColors:      ["#2C3E50", "#34495E", "#7F8C8D", "#95A5A6"],
  kpiLabelColor:  "#6B7280",   // KPI metric label
  kpiValueColor:  "#262626",   // KPI metric value (large number)
  kpiSubColor:    "#7F8C8D",   // KPI sub-text (trend / delta)

  // -- Chart defaults --------------------------------------------------------
  chartAccent:    "#2C3E50",   // Default single-series color
  piePalette:     ["#2C3E50", "#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EF4444", "#0EA5E9", "#84CC16"],

  // -- Stamp / icon ----------------------------------------------------------
  stampBg:        "#2C3E50",   // Default stamp backgroundColor
  stampContent:   "#FFFFFF",   // Stamp icon/text contentColor
};

/**
 * Merge definition-level theme overrides with defaults.
 * Call at the top of each template render function:
 *   const T = resolveTheme(def.theme);
 */
function resolveTheme(themeOverrides) {
  if (!themeOverrides) return THEME_DEFAULTS;
  return { ...THEME_DEFAULTS, ...themeOverrides };
}

module.exports = { THEME_DEFAULTS, resolveTheme };
