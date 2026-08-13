/**
 * Pre-compiled schema lookup tables derived from guidelines/ui-guidelines/reference/schemas/
 * Structure: componentName -> paramName -> Set of valid enum values (null = accepts any value)
 * Components with acceptsHexColors have hex validated separately.
 */

// Shared margin/spacing values used across many components
const MARGIN_VALUES = ["NONE", "EVEN_LESS", "LESS", "STANDARD", "MORE", "EVEN_MORE"] as const;
const LABEL_POSITION_VALUES = ["ABOVE", "ADJACENT", "JUSTIFIED", "COLLAPSED"] as const;
const PADDING_VALUES = ["NONE", "EVEN_LESS", "LESS", "STANDARD", "MORE", "EVEN_MORE"] as const;
const SHAPE_VALUES = ["SQUARED", "SEMI_ROUNDED", "ROUNDED"] as const;
const ALIGN_LCR = ["LEFT", "CENTER", "RIGHT"] as const;
const ALIGN_SCE = ["START", "CENTER", "END"] as const;
const SIZE_STANDARD = ["TINY", "SMALL", "MEDIUM", "LARGE"] as const;
const CONTENTS_WIDTH = ["EXTRA_NARROW", "NARROW", "MEDIUM", "WIDE", "FULL"] as const;
const HEADING_TAG = ["H1", "H2", "H3", "H4", "H5", "H6"] as const;
const LABEL_SIZE = ["LARGE_PLUS", "LARGE", "MEDIUM_PLUS", "MEDIUM", "SMALL", "EXTRA_SMALL"] as const;
const COLUMN_WIDTH = ["AUTO","EXTRA_NARROW","NARROW","NARROW_PLUS","MEDIUM","MEDIUM_PLUS","WIDE","WIDE_PLUS","EXTRA_WIDE","1X","2X","3X","4X","5X","6X","7X","8X","9X","10X"] as const;
const PANE_WIDTH = ["AUTO","EXTRA_NARROW","NARROW","NARROW_PLUS","MEDIUM","MEDIUM_PLUS","WIDE","WIDE_PLUS"] as const;
const HEIGHT_CARDS = ["EXTRA_SHORT","SHORT","SHORT_PLUS","MEDIUM","MEDIUM_PLUS","TALL","TALL_PLUS","EXTRA_TALL","AUTO"] as const;
const CHART_HEIGHT = ["MICRO","SHORT","MEDIUM","TALL"] as const;
const COLOR_SCHEME = ["CLASSIC","MIDNIGHT","OCEAN","MOSS","BERRY","PARACHUTE","RAINFOREST","SUNSET"] as const;
const CHART_STACKING = ["NONE","NORMAL","PERCENT_TO_TOTAL"] as const;
const REFRESH_AFTER_TEXT = ["KEYPRESS","UNFOCUS"] as const;
const BG_COLOR_FORM = ["WHITE","TRANSPARENT","CHARCOAL_SCHEME","NAVY_SCHEME","PLUM_SCHEME"] as const;
const OVERLAY_STYLE = ["DARK","SEMI_DARK","NONE","SEMI_LIGHT","LIGHT"] as const;

export type ParamEnums = Record<string, readonly string[] | null>;
export type ComponentSchema = Record<string, ParamEnums>;


/**
 * Main schema lookup table.
 * Key: component function name (e.g. "a!buttonWidget")
 * Value: map of paramName -> allowed string enum values (null = no enum restriction)
 *
 * Only enum-validated parameters are listed. Boolean/Any/Text params are omitted.
 * Parameters marked acceptsHexColors are validated separately by hex pattern check.
 */
export const COMPONENT_SCHEMAS: ComponentSchema = {

  // ── LAYOUTS ──────────────────────────────────────────────────────────────

  "a!formLayout": {
    backgroundColor: [...BG_COLOR_FORM],
    contentsWidth: [...CONTENTS_WIDTH],
    marginAbove: [...MARGIN_VALUES],
    marginBelow: [...MARGIN_VALUES],
  },

  "a!headerContentLayout": {
    backgroundColor: ["WHITE", "TRANSPARENT"],
    contentsPadding: [...PADDING_VALUES],
    marginAbove: [...MARGIN_VALUES],
    marginBelow: [...MARGIN_VALUES],
  },

  "a!paneLayout": {},

  "a!pane": {
    width: [...PANE_WIDTH],
    padding: [...PADDING_VALUES],
    marginAbove: [...MARGIN_VALUES],
    marginBelow: [...MARGIN_VALUES],
  },

  "a!wizardLayout": {
    backgroundColor: [...BG_COLOR_FORM],
    style: ["DOT_VERTICAL","DOT_HORIZONTAL","CHEVRON_VERTICAL","CHEVRON_HORIZONTAL","LINE_VERTICAL","LINE_HORIZONTAL","MINIMAL"],
    contentsWidth: [...CONTENTS_WIDTH],
    marginAbove: [...MARGIN_VALUES],
    marginBelow: [...MARGIN_VALUES],
  },

  "a!columnsLayout": {
    alignVertical: ["TOP","MIDDLE","BOTTOM"],
    spacing: ["STANDARD","NONE","DENSE","SPARSE"],
    stackWhen: ["PHONE","TABLET_PORTRAIT","TABLET_LANDSCAPE","DESKTOP","DESKTOP_WIDE","NEVER"],
    marginAbove: [...MARGIN_VALUES],
    marginBelow: [...MARGIN_VALUES],
  },

  "a!columnLayout": {
    width: [...COLUMN_WIDTH],
  },

  "a!sideBySideLayout": {
    alignVertical: ["TOP","MIDDLE","BOTTOM"],
    spacing: ["STANDARD","NONE","DENSE","SPARSE"],
    stackWhen: ["PHONE","TABLET_PORTRAIT","TABLET_LANDSCAPE","DESKTOP_NARROW","DESKTOP","DESKTOP_WIDE","NEVER"],
    marginAbove: [...MARGIN_VALUES],
    marginBelow: [...MARGIN_VALUES],
  },

  "a!sideBySideItem": {
    width: ["AUTO","MINIMIZE","1X","2X","3X","4X","5X","6X","7X","8X","9X","10X"],
  },


  "a!cardLayout": {
    style: ["NONE","TRANSPARENT","STANDARD","ACCENT","SUCCESS","INFO","WARN","ERROR","CHARCOAL_SCHEME","NAVY_SCHEME","PLUM_SCHEME"],
    shape: [...SHAPE_VALUES],
    padding: [...PADDING_VALUES],
    height: [...HEIGHT_CARDS],
    decorativeBarPosition: ["NONE","TOP","BOTTOM","START","END"],
    decorativeBarColor: ["ACCENT","POSITIVE","WARN","NEGATIVE"],
    borderColor: ["ACCENT","POSITIVE","WARN","NEGATIVE"],
    marginAbove: [...MARGIN_VALUES],
    marginBelow: [...MARGIN_VALUES],
  },

  "a!cardGroupLayout": {
    cardWidth: ["EXTRA_NARROW","NARROW","NARROW_PLUS","MEDIUM","MEDIUM_PLUS","WIDE","WIDE_PLUS","EXTRA_WIDE"],
    cardHeight: [...HEIGHT_CARDS],
    spacing: ["STANDARD","NONE","DENSE","SPARSE"],
    labelPosition: [...LABEL_POSITION_VALUES],
    marginAbove: [...MARGIN_VALUES],
    marginBelow: [...MARGIN_VALUES],
  },

  "a!sectionLayout": {
    labelSize: [...LABEL_SIZE],
    labelHeadingTag: [...HEADING_TAG],
    labelColor: ["ACCENT","STANDARD","POSITIVE","NEGATIVE","SECONDARY"],
    divider: ["NONE","ABOVE","BELOW"],
    dividerColor: ["SECONDARY","STANDARD","ACCENT"],
    dividerWeight: ["THIN","MEDIUM","THICK"],
    marginAbove: [...MARGIN_VALUES],
    marginBelow: [...MARGIN_VALUES],
  },

  "a!boxLayout": {
    style: ["STANDARD","ACCENT","SUCCESS","INFO","WARN","ERROR"],
    padding: [...PADDING_VALUES],
    shape: [...SHAPE_VALUES],
    labelSize: [...LABEL_SIZE],
    labelHeadingTag: [...HEADING_TAG],
    marginAbove: [...MARGIN_VALUES],
    marginBelow: [...MARGIN_VALUES],
  },

  "a!billboardLayout": {
    height: [...HEIGHT_CARDS],
    backgroundMediaPositionHorizontal: ["LEFT","CENTER","RIGHT"],
    backgroundMediaPositionVertical: ["TOP","MIDDLE","BOTTOM"],
    marginAbove: [...MARGIN_VALUES],
    marginBelow: [...MARGIN_VALUES],
  },

  "a!fullOverlay": {
    alignVertical: ["TOP","MIDDLE","BOTTOM"],
    style: [...OVERLAY_STYLE],
    padding: [...PADDING_VALUES],
  },

  "a!barOverlay": {
    position: ["TOP","MIDDLE","BOTTOM"],
    style: [...OVERLAY_STYLE],
    padding: [...PADDING_VALUES],
  },

  "a!columnOverlay": {
    alignVertical: ["TOP","MIDDLE","BOTTOM"],
    position: ["START","CENTER","END"],
    width: ["NARROW","MEDIUM","WIDE"],
    style: [...OVERLAY_STYLE],
    padding: [...PADDING_VALUES],
  },

  "a!tabLayout": {
    contentsPadding: [...PADDING_VALUES],
    marginAbove: [...MARGIN_VALUES],
    marginBelow: [...MARGIN_VALUES],
  },


  // ── INPUT COMPONENTS ─────────────────────────────────────────────────────

  "a!textField": {
    labelPosition: [...LABEL_POSITION_VALUES],
    refreshAfter: [...REFRESH_AFTER_TEXT],
    align: [...ALIGN_LCR],
    inputPurpose: ["NAME","EMAIL","PHONE_NUMBER","STREET_ADDRESS","POSTAL_CODE","CREDIT_CARD_NUMBER","OFF"],
    marginAbove: [...MARGIN_VALUES],
    marginBelow: [...MARGIN_VALUES],
  },

  "a!paragraphField": {
    labelPosition: [...LABEL_POSITION_VALUES],
    height: ["SHORT","MEDIUM","TALL"],
    refreshAfter: [...REFRESH_AFTER_TEXT],
    marginAbove: [...MARGIN_VALUES],
    marginBelow: [...MARGIN_VALUES],
  },

  "a!styledTextEditorField": {
    labelPosition: [...LABEL_POSITION_VALUES],
    height: ["EXTRA_SHORT","SHORT","SHORT_PLUS","MEDIUM","MEDIUM_PLUS","TALL","TALL_PLUS","EXTRA_TALL"],
    refreshAfter: [...REFRESH_AFTER_TEXT],
    allowedFormats: ["BOLD","ITALIC","UNDERLINE","STRIKETHROUGH","SUBSCRIPT","SUPERSCRIPT","LINK","TEXT_ALIGNMENT","NUMBERED_LIST","BULLETED_LIST","TABLE"],
    marginAbove: [...MARGIN_VALUES],
    marginBelow: [...MARGIN_VALUES],
  },

  "a!integerField": {
    labelPosition: [...LABEL_POSITION_VALUES],
    refreshAfter: [...REFRESH_AFTER_TEXT],
    align: [...ALIGN_LCR],
    marginAbove: [...MARGIN_VALUES],
    marginBelow: [...MARGIN_VALUES],
  },

  "a!floatingPointField": {
    labelPosition: [...LABEL_POSITION_VALUES],
    refreshAfter: [...REFRESH_AFTER_TEXT],
    align: [...ALIGN_LCR],
    marginAbove: [...MARGIN_VALUES],
    marginBelow: [...MARGIN_VALUES],
  },

  "a!dateField": {
    labelPosition: [...LABEL_POSITION_VALUES],
    align: [...ALIGN_LCR],
    marginAbove: [...MARGIN_VALUES],
    marginBelow: [...MARGIN_VALUES],
  },

  "a!dateTimeField": {
    labelPosition: [...LABEL_POSITION_VALUES],
    marginAbove: [...MARGIN_VALUES],
    marginBelow: [...MARGIN_VALUES],
  },

  "a!timeField": {
    labelPosition: [...LABEL_POSITION_VALUES],
    marginAbove: [...MARGIN_VALUES],
    marginBelow: [...MARGIN_VALUES],
  },

  "a!dropdownField": {
    labelPosition: [...LABEL_POSITION_VALUES],
    searchDisplay: ["AUTO","ON","OFF"],
    marginAbove: [...MARGIN_VALUES],
    marginBelow: [...MARGIN_VALUES],
  },

  "a!radioButtonField": {
    labelPosition: [...LABEL_POSITION_VALUES],
    choiceLayout: ["STACKED","COMPACT"],
    choiceStyle: ["STANDARD","CARDS"],
    spacing: ["STANDARD","MORE","EVEN_MORE"],
    marginAbove: [...MARGIN_VALUES],
    marginBelow: [...MARGIN_VALUES],
  },

  "a!checkboxField": {
    labelPosition: [...LABEL_POSITION_VALUES],
    align: [...ALIGN_LCR],
    choiceLayout: ["STACKED","COMPACT"],
    choiceStyle: ["STANDARD","CARDS"],
    spacing: ["STANDARD","MORE","EVEN_MORE"],
    marginAbove: [...MARGIN_VALUES],
    marginBelow: [...MARGIN_VALUES],
  },

  "a!booleanCheckboxField": {
    choicePosition: ["START","END"],
    marginAbove: [...MARGIN_VALUES],
    marginBelow: [...MARGIN_VALUES],
  },

  "a!toggleField": {
    choicePosition: ["START","END"],
    marginAbove: [...MARGIN_VALUES],
    marginBelow: [...MARGIN_VALUES],
  },

  "a!fileUploadField": {
    labelPosition: [...LABEL_POSITION_VALUES],
    buttonStyle: ["NORMAL","PRIMARY","SECONDARY","LINK"],
    buttonDisplay: ["LABEL","ICON","LABEL_AND_ICON"],
    buttonSize: ["SMALL","STANDARD","LARGE"],
    uploadMethods: ["SIGNATURE","CAMERA","CHOOSE_PHOTO","CHOOSE_FILE"],
    marginAbove: [...MARGIN_VALUES],
    marginBelow: [...MARGIN_VALUES],
  },

  "a!cardChoiceField": {
    labelPosition: [...LABEL_POSITION_VALUES],
    spacing: ["STANDARD","NONE","DENSE","SPARSE"],
    align: [...ALIGN_SCE],
    marginAbove: [...MARGIN_VALUES],
    marginBelow: [...MARGIN_VALUES],
  },

  "a!barcodeField": {
    labelPosition: [...LABEL_POSITION_VALUES],
    refreshAfter: [...REFRESH_AFTER_TEXT],
    align: [...ALIGN_LCR],
    marginAbove: [...MARGIN_VALUES],
    marginBelow: [...MARGIN_VALUES],
  },

  "a!encryptedTextField": {
    labelPosition: [...LABEL_POSITION_VALUES],
    marginAbove: [...MARGIN_VALUES],
    marginBelow: [...MARGIN_VALUES],
  },


  // ── DISPLAY COMPONENTS ───────────────────────────────────────────────────

  "a!richTextDisplayField": {
    labelPosition: [...LABEL_POSITION_VALUES],
    align: [...ALIGN_LCR],
    marginAbove: [...MARGIN_VALUES],
    marginBelow: [...MARGIN_VALUES],
  },

  "a!stampField": {
    labelPosition: [...LABEL_POSITION_VALUES],
    align: [...ALIGN_SCE],
    backgroundColor: ["ACCENT","POSITIVE","NEGATIVE","SECONDARY","TRANSPARENT"],
    contentColor: ["STANDARD","ACCENT","POSITIVE","NEGATIVE"],
    size: [...SIZE_STANDARD],
    shape: [...SHAPE_VALUES],
    marginAbove: [...MARGIN_VALUES],
    marginBelow: [...MARGIN_VALUES],
  },

  "a!headingField": {
    size: [...LABEL_SIZE],
    headingTag: [...HEADING_TAG],
    color: ["ACCENT","STANDARD","SECONDARY"],
    fontWeight: ["LIGHT","REGULAR","SEMI_BOLD","BOLD"],
    align: [...ALIGN_SCE],
    marginAbove: [...MARGIN_VALUES],
    marginBelow: [...MARGIN_VALUES],
  },

  "a!progressBarField": {
    labelPosition: [...LABEL_POSITION_VALUES],
    color: ["ACCENT","POSITIVE","NEGATIVE","WARN"],
    style: ["THIN","THICK"],
    marginAbove: [...MARGIN_VALUES],
    marginBelow: [...MARGIN_VALUES],
  },

  "a!tagField": {
    labelPosition: [...LABEL_POSITION_VALUES],
    align: [...ALIGN_SCE],
    size: ["SMALL","STANDARD"],
    marginAbove: [...MARGIN_VALUES],
    marginBelow: [...MARGIN_VALUES],
  },

  "a!linkField": {
    labelPosition: [...LABEL_POSITION_VALUES],
    align: [...ALIGN_LCR],
    marginAbove: [...MARGIN_VALUES],
    marginBelow: [...MARGIN_VALUES],
  },

  "a!imageField": {
    labelPosition: [...LABEL_POSITION_VALUES],
    align: [...ALIGN_SCE],
    size: ["ICON","ICON_PLUS","TINY","EXTRA_SMALL","SMALL","SMALL_PLUS","MEDIUM","MEDIUM_PLUS","LARGE","LARGE_PLUS","EXTRA_LARGE","FIT","GALLERY"],
    style: ["STANDARD","AVATAR"],
    marginAbove: [...MARGIN_VALUES],
    marginBelow: [...MARGIN_VALUES],
  },

  "a!gaugeField": {
    labelPosition: [...LABEL_POSITION_VALUES],
    align: [...ALIGN_SCE],
    color: ["ACCENT","POSITIVE","NEGATIVE","WARN"],
    size: ["SMALL","MEDIUM","LARGE"],
    marginAbove: [...MARGIN_VALUES],
    marginBelow: [...MARGIN_VALUES],
  },

  "a!milestoneField": {
    labelPosition: [...LABEL_POSITION_VALUES],
    orientation: ["HORIZONTAL","VERTICAL"],
    stepStyle: ["LINE","CHEVRON","DOT"],
    color: ["ACCENT","POSITIVE","NEGATIVE","WARN"],
    marginAbove: [...MARGIN_VALUES],
    marginBelow: [...MARGIN_VALUES],
  },

  "a!horizontalLine": {
    color: ["SECONDARY","STANDARD","ACCENT"],
    weight: ["THIN","MEDIUM","THICK"],
    style: ["SOLID","DOT","DASH"],
    marginAbove: [...MARGIN_VALUES],
    marginBelow: [...MARGIN_VALUES],
  },

  "a!documentViewerField": {
    labelPosition: [...LABEL_POSITION_VALUES],
    height: ["SHORT","MEDIUM","TALL"],
    marginAbove: [...MARGIN_VALUES],
    marginBelow: [...MARGIN_VALUES],
  },

  "a!messageBanner": {
    backgroundColor: ["INFO","SUCCESS","WARN","ERROR"],
    highlightColor: ["INFO","POSITIVE","WARN","NEGATIVE"],
    shape: [...SHAPE_VALUES],
    announceBehavior: ["DISPLAY_ONLY","DISPLAY_AND_ANNOUNCE","ANNOUNCE_ONLY"],
    marginAbove: [...MARGIN_VALUES],
    marginBelow: [...MARGIN_VALUES],
  },

  "a!recordActionField": {
    align: [...ALIGN_SCE],
    style: ["TOOLBAR","LINKS","CARDS","SIDEBAR","CALL_TO_ACTION","MENU","MENU_ICON","TOOLBAR_PRIMARY","SIDEBAR_PRIMARY"],
    display: ["LABEL","ICON","LABEL_AND_ICON"],
    openActionsIn: ["DIALOG","NEW_TAB","SAME_TAB"],
  },


  // ── BUTTON COMPONENTS ────────────────────────────────────────────────────

  "a!buttonWidget": {
    style: ["OUTLINE","GHOST","LINK","SOLID"],
    color: ["ACCENT","NEGATIVE","SECONDARY"],
    size: ["SMALL","STANDARD","LARGE"],
    width: ["MINIMIZE","FILL"],
    iconPosition: ["START","END"],
  },

  "a!buttonArrayLayout": {
    align: [...ALIGN_SCE],
    marginBelow: [...MARGIN_VALUES],
  },

  // a!buttonLayout has no enum params

  // ── GRID COMPONENTS ──────────────────────────────────────────────────────

  "a!gridField": {
    selectionStyle: ["CHECKBOX","CHECKBOX_SUBTLE_HIGHLIGHT","SUBTLE_HIGHLIGHT","ROW_HIGHLIGHT"],
    showSelectionCount: ["AUTO","ON","OFF"],
    height: ["SHORT","SHORT_PLUS","MEDIUM","MEDIUM_PLUS","TALL","TALL_PLUS","EXTRA_TALL","AUTO"],
    spacing: ["STANDARD","DENSE"],
    borderStyle: ["STANDARD","LIGHT"],
    labelPosition: [...LABEL_POSITION_VALUES],
    pagingControls: ["STANDARD","ROW_COUNT"],
    openActionsIn: ["DIALOG","NEW_TAB","SAME_TAB"],
    actionsDisplay: ["LABEL_AND_ICON","LABEL","ICON"],
    actionsStyle: ["TOOLBAR","TOOLBAR_PRIMARY"],
    marginAbove: [...MARGIN_VALUES],
    marginBelow: [...MARGIN_VALUES],
  },

  "a!gridColumn": {
    width: ["AUTO","ICON","ICON_PLUS","NARROW","NARROW_PLUS","MEDIUM","MEDIUM_PLUS","WIDE","1X","2X","3X","4X","5X","6X","7X","8X","9X","10X"],
    align: [...ALIGN_SCE],
    backgroundColor: ["NONE","ACCENT","SUCCESS","INFO","WARN","ERROR"],
  },

  "a!gridLayout": {
    selectionStyle: ["CHECKBOX","CHECKBOX_SUBTLE_HIGHLIGHT","SUBTLE_HIGHLIGHT","ROW_HIGHLIGHT"],
    height: ["SHORT","SHORT_PLUS","MEDIUM","MEDIUM_PLUS","TALL","TALL_PLUS","EXTRA_TALL","AUTO"],
    spacing: ["STANDARD","DENSE"],
    borderStyle: ["STANDARD","LIGHT"],
    labelPosition: [...LABEL_POSITION_VALUES],
    marginAbove: [...MARGIN_VALUES],
    marginBelow: [...MARGIN_VALUES],
  },

  /* a!gridLayoutColumnConfig's width vocabulary is NOT the same as a!gridColumn's
   * (read-only grid) above: no "AUTO" and no relative "NX" values. Proportional
   * sizing is expressed as width: "DISTRIBUTE" plus the separate weight
   * parameter (integers 1-10). See Grid_Column_Config_Component.html. */
  "a!gridLayoutColumnConfig": {
    width: ["DISTRIBUTE","ICON","ICON_PLUS","NARROW","NARROW_PLUS","MEDIUM","MEDIUM_PLUS","WIDE"],
  },

  "a!gridLayoutHeaderCell": {
    align: [...ALIGN_LCR],
  },

  "a!queryFilter": {
    operator: ["=","<>",">","<",">=","<=","in","not in","is null","not null","between","starts with","not starts with","ends with","not ends with","includes","not includes","like"],
  },

  "a!queryLogicalExpression": {
    operator: ["AND","OR"],
  },

  "a!measure": {
    function: ["COUNT","SUM","AVG","MIN","MAX","DISTINCT_COUNT"],
  },

  "a!grouping": {
    interval: ["AUTO","YEAR","MONTH_OF_YEAR","MONTH_OF_YEAR_SHORT_TEXT","MONTH_OF_YEAR_TEXT","MONTH_TEXT","MONTH_SHORT_TEXT","MONTH_DATE","DATE","DATE_SHORT_TEXT","DATE_TEXT","DAY_OF_MONTH","HOUR_OF_DAY","HOUR","MINUTE_OF_HOUR","MINUTE"],
  },


  // ── CHART COMPONENTS ─────────────────────────────────────────────────────

  "a!columnChartField": {
    labelPosition: [...LABEL_POSITION_VALUES],
    height: [...CHART_HEIGHT],
    colorScheme: [...COLOR_SCHEME],
    stacking: [...CHART_STACKING],
    xAxisStyle: ["STANDARD","NONE"],
    yAxisStyle: ["STANDARD","MINIMAL","NONE"],
    marginAbove: [...MARGIN_VALUES],
    marginBelow: [...MARGIN_VALUES],
  },

  "a!barChartField": {
    labelPosition: [...LABEL_POSITION_VALUES],
    height: ["MICRO","SHORT","MEDIUM","TALL","AUTO"],
    colorScheme: [...COLOR_SCHEME],
    stacking: [...CHART_STACKING],
    xAxisStyle: ["STANDARD","NONE"],
    yAxisStyle: ["STANDARD","MINIMAL","NONE"],
    marginAbove: [...MARGIN_VALUES],
    marginBelow: [...MARGIN_VALUES],
  },

  "a!lineChartField": {
    labelPosition: [...LABEL_POSITION_VALUES],
    height: [...CHART_HEIGHT],
    colorScheme: [...COLOR_SCHEME],
    xAxisStyle: ["STANDARD","NONE"],
    yAxisStyle: ["STANDARD","MINIMAL","NONE"],
    marginAbove: [...MARGIN_VALUES],
    marginBelow: [...MARGIN_VALUES],
  },

  "a!areaChartField": {
    labelPosition: [...LABEL_POSITION_VALUES],
    height: [...CHART_HEIGHT],
    colorScheme: [...COLOR_SCHEME],
    stacking: ["NORMAL","PERCENT_TO_TOTAL","NONE"],
    xAxisStyle: ["STANDARD","NONE"],
    yAxisStyle: ["STANDARD","MINIMAL","NONE"],
    marginAbove: [...MARGIN_VALUES],
    marginBelow: [...MARGIN_VALUES],
  },

  "a!pieChartField": {
    labelPosition: [...LABEL_POSITION_VALUES],
    height: ["SHORT","MEDIUM","TALL"],
    style: ["PIE","DONUT"],
    seriesLabelStyle: ["ON_CHART","LEGEND","NONE"],
    colorScheme: [...COLOR_SCHEME],
    marginAbove: [...MARGIN_VALUES],
    marginBelow: [...MARGIN_VALUES],
  },

  "a!scatterChartField": {
    labelPosition: [...LABEL_POSITION_VALUES],
    height: [...CHART_HEIGHT],
    colorScheme: [...COLOR_SCHEME],
    marginAbove: [...MARGIN_VALUES],
    marginBelow: [...MARGIN_VALUES],
  },

  // ── HELPER / EXPRESSION COMPONENTS ───────────────────────────────────────

  "a!richTextItem": {
    style: ["PLAIN","EMPHASIS","STRONG","UNDERLINE","STRIKETHROUGH"],
    size: ["SMALL","STANDARD","MEDIUM","MEDIUM_PLUS","LARGE","LARGE_PLUS","EXTRA_LARGE"],
    color: ["STANDARD","ACCENT","POSITIVE","NEGATIVE","SECONDARY"],
    linkStyle: ["INLINE","STANDALONE"],
  },

  "a!richTextIcon": {
    color: ["STANDARD","ACCENT","POSITIVE","NEGATIVE","SECONDARY"],
    size: ["SMALL","STANDARD","MEDIUM","MEDIUM_PLUS","LARGE","LARGE_PLUS","EXTRA_LARGE"],
  },

  "a!chartSeries": {
    color: ["ACCENT","BLUEGRAY","GREEN","GOLD","ORANGE","PURPLE","RED","SKYBLUE","LIMEGREEN","YELLOW","AMBER","PINK","VIOLETRED"],
  },

  "a!tagItem": {
    backgroundColor: ["ACCENT","POSITIVE","NEGATIVE","SECONDARY"],
    textColor: ["STANDARD"],
  },

  "a!validationMessage": {
    color: ["ERROR","WARN","INFO","SUCCESS"],
  },

  "a!chartReferenceLine": {
    style: ["SOLID","DASHED"],
  },

  "a!cardTemplateTile": {
    // no enum params — only id, primaryText, secondaryText (all text)
  },

  "a!cardTemplateBarTextStacked": {
    emphasize: ["PRIMARY","SECONDARY","TERTIARY"],
  },

  "a!cardTemplateBarTextJustified": {
    // no enum params
  },

  "a!isPageWidth": {
    widths: ["PHONE","TABLET_PORTRAIT","TABLET_LANDSCAPE","DESKTOP","DESKTOP_WIDE"],
  },

  "a!userImage": {
    backgroundColor: ["ACCENT","SECONDARY"],
  },
};

/**
 * Parameters that accept hex colors (#RRGGBB or #RRGGBBAA) IN ADDITION to their enum values.
 * Used by the hex validator to skip false-positive hex-value warnings.
 */
export const HEX_ACCEPTING_PARAMS = new Set([
  "backgroundColor", "color", "borderColor", "decorativeBarColor",
  "contentColor", "titleColor", "secondaryTextColor", "stampColor",
  "highlightColor", "style", // cardLayout style accepts hex
]);
