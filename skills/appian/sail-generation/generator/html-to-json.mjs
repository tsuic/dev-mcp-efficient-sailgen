#!/usr/bin/env node
/**
 * html-to-json.js — HTML mockup → SAIL definition JSON converter
 *
 * Parses an HTML file using cheerio, classifies elements by data-sail-*
 * attributes and structural heuristics, and emits a JSON definition
 * compatible with the generator/define.js pipeline.
 *
 * Usage (from sail-generation/ root):
 *   node generator/html-to-json.js <html-file>
 *   node generator/html-to-json.js <html-file> --write <uuid>
 */

import { readFileSync, existsSync } from "fs";
import { resolve, basename } from "path";
import { execSync } from "child_process";
import * as cheerio from "cheerio";

// ─────────────────────────────────────────────────────────────────────────────
// CLI entry
// ─────────────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const htmlPath = args.find((a) => !a.startsWith("--"));
const writeFlag = args.includes("--write");
const writeName = writeFlag ? args[args.indexOf("--write") + 1] : null;

if (!htmlPath) {
  console.error("Usage: node generator/html-to-json.js <html-file> [--write <uuid>]");
  process.exit(1);
}

const resolved = resolve(htmlPath);
if (!existsSync(resolved)) {
  console.error(`Error: file not found: ${resolved}`);
  process.exit(1);
}

const html = readFileSync(resolved, "utf-8");
const $ = cheerio.load(html);

// ─────────────────────────────────────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Warn to stderr (never pollutes stdout JSON) */
function warn(msg) {
  process.stderr.write(`[html-to-json] WARN: ${msg}\n`);
}

/** Get trimmed text of an element, excluding nested deep content if shallow=true */
function text(el, shallow = false) {
  if (!el || !el.length) return "";
  if (shallow) {
    // Only direct text nodes
    return el
      .contents()
      .filter((_, n) => n.type === "text")
      .text()
      .trim();
  }
  return el.text().trim();
}

/** Extract inline style property value from an element */
function inlineStyle(el, prop) {
  const style = el.attr("style") || "";
  const match = style.match(new RegExp(`${prop}\\s*:\\s*([^;]+)`));
  return match ? match[1].trim() : null;
}

/** Extract a hex color from inline style background-color or color */
function extractColor(el, prop = "background-color") {
  const val = inlineStyle(el, prop);
  if (!val) return null;
  if (val.startsWith("#")) return val;
  // Try to parse rgb(r,g,b)
  const rgb = val.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (rgb) {
    const hex = (n) => parseInt(n).toString(16).padStart(2, "0");
    return `#${hex(rgb[1])}${hex(rgb[2])}${hex(rgb[3])}`;
  }
  return val;
}

/** Get data-sail-* attribute */
function sail(el, attr) {
  return el.attr(`data-sail-${attr}`) || null;
}

/** Get the data-sail-component value */
function sailComp(el) {
  return sail(el, "component");
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1: Determine page type
// ─────────────────────────────────────────────────────────────────────────────

function determinePageType($) {
  const body = $("body");
  const firstChild = body.children().first();

  // Pane layout detection — highest priority, unambiguous structure
  if (
    body.find(".pane-layout").length ||
    body.find('[data-sail-component="paneLayout"]').length
  ) {
    return "pane";
  }

  // Wizard detection — stepper panel with steps + form content
  // Must come before form/dashboard since wizards contain form fields
  const hasStepperPanel = body.find(".stepper-panel, .wizard-steps, [class*='stepper']").length > 0;
  const hasSteps = body.find(".step .step-icon, .step .step-label").length >= 2;
  const hasWizardBody = body.find(".wizard-body, .form-content, [class*='wizard']").length > 0;
  if ((hasStepperPanel || hasSteps) && hasWizardBody) {
    return "wizard";
  }
  // Also detect by step-connector pattern (vertical stepper)
  if (body.find(".step-connector").length >= 2 && body.find(".step-label").length >= 3) {
    return "wizard";
  }

  // Dashboard detection: KPI cards or chart-heavy content with card groups
  // Takes priority over form because dashboards often have filter dropdowns
  const hasKpis =
    body.find(".kpi-card").length > 0 ||
    body.find(".kpi-value").length > 0 ||
    (body.find('[data-sail-component="cardGroupLayout"] [data-sail-component="cardLayout"]').length > 0 &&
     body.find(".chart-placeholder, [data-sail-component*='ChartField'], [data-sail-component*='chartField']").length > 0);
  const hasCharts =
    body.find(".chart-placeholder, [data-sail-component*='ChartField'], [data-sail-component*='chartField']").length >= 2;

  if (hasKpis || (hasCharts && body.find(".card-group").length)) {
    return "dashboard";
  }

  // Form detection: multiple dedicated form fields (not filter dropdowns)
  const formFieldCount =
    body.find("input, select, textarea, .form-field").length;
  if (body.find("form").length || formFieldCount >= 3) {
    // But if there are also many charts, it's likely a dashboard with filters
    if (hasCharts) return "dashboard";
    return "form";
  }

  // Billboard header detection
  if (
    firstChild.hasClass("billboard") ||
    sailComp(firstChild) === "billboardLayout"
  ) {
    if (formFieldCount >= 2) return "form";
    return "layout";
  }

  // Tab-based layouts could be dashboard or layout
  if (body.find(".tabs").length || body.find('[data-sail-component="tabLayout"]').length) {
    if (body.find(".chart-placeholder, .data-table, [data-sail-component*='Chart']").length) {
      return "dashboard";
    }
    return "layout";
  }

  return "layout";
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2: Extract theme colors
// ─────────────────────────────────────────────────────────────────────────────

function extractTheme($) {
  const theme = {};
  const body = $("body");

  // Page background from body or inline style
  const bodyBgFromCSS = extractBodyBgFromStyleTag($);
  if (bodyBgFromCSS) theme.pageBg = bodyBgFromCSS;

  const bodyInline = inlineStyle(body, "background-color");
  if (bodyInline) theme.pageBg = bodyInline;

  // Card background
  const card = $(".card, [data-sail-component='cardLayout']").first();
  if (card.length) {
    const cardBg = extractBgFromStylesheet($, ".card") || inlineStyle(card, "background-color");
    if (cardBg) theme.cardBg = cardBg;
  }

  // Header/billboard background
  const header = $(".billboard, .hero-header, [data-sail-component='billboardLayout']").first();
  if (header.length) {
    const headerBg = inlineStyle(header, "background-color");
    if (headerBg) theme.headerBg = headerBg;
  }

  // KPI colors
  const kpiValue = $(".kpi-value").first();
  if (kpiValue.length) {
    const kpiValColor = extractBgFromStylesheet($, ".kpi-value", "color");
    if (kpiValColor) theme.kpiValueColor = kpiValColor;
  }
  const kpiName = $(".kpi-name").first();
  if (kpiName.length) {
    const kpiLabColor = extractBgFromStylesheet($, ".kpi-name", "color");
    if (kpiLabColor) theme.kpiLabelColor = kpiLabColor;
  }

  return Object.keys(theme).length ? theme : undefined;
}

/** Parse <style> tag to find a CSS property value for a selector */
function extractBgFromStylesheet($, selector, prop = "background-color") {
  const styleText = $("style").text();
  // Simple regex-based CSS extraction (good enough for single-file mockups)
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`${escaped}\\s*\\{[^}]*${prop}\\s*:\\s*([^;]+)`, "i");
  const match = styleText.match(regex);
  return match ? match[1].trim() : null;
}

function extractBodyBgFromStyleTag($) {
  return extractBgFromStylesheet($, "body", "background-color");
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3: Section extractors
// ─────────────────────────────────────────────────────────────────────────────


// ── KPI extraction ──

function extractKpis($, container) {
  const items = [];
  const cards = container
    ? $(container).find(".kpi-card, [data-sail-component='cardLayout']")
    : $(".kpi-card");

  cards.each((_, el) => {
    const card = $(el);
    // Skip cards that don't look like KPIs (must have a big value)
    const valueEl = card.find(".kpi-value");
    if (!valueEl.length) return;

    const item = {};
    item.label = text(card.find(".kpi-name, .kpi-label")) || "Metric";
    item.value = text(valueEl);

    const subEl = card.find(".kpi-change, .kpi-sub");
    if (subEl.length) {
      item.sub = text(subEl);
      // Detect positive/negative color from class
      if (subEl.hasClass("positive")) item.color = "#4CC900";
      else if (subEl.hasClass("negative")) item.color = "#E64345";
    }

    // Default icon (icon resolution pass handles final mapping)
    item.icon = "circle";

    items.push(item);
  });

  return items.length ? { type: "kpis", items } : null;
}

/** Extract KPIs from non-card layouts (e.g. .kpi-header-row with .kpi-value elements) */
function extractKpisFromRow($, container) {
  const items = [];
  const row = $(container);

  // Find distinct KPI items by looking for value elements
  row.find(".kpi-value, .kpi-header-item").each((_, el) => {
    const itemEl = $(el);
    // If this is .kpi-header-item, extract from its children
    const valueEl = itemEl.hasClass("kpi-value") ? itemEl : itemEl.find(".kpi-value");
    if (!valueEl.length) return;

    const item = {};
    item.value = text(valueEl);

    // Look for label in parent or sibling
    const parent = itemEl.closest("[class*='kpi']").parent();
    const label = parent.find(".kpi-header-label, .kpi-label, .kpi-name").first();
    item.label = label.length ? text(label) : "Metric";

    // Look for unit/suffix
    const unit = itemEl.find(".kpi-unit").first();
    if (unit.length) item.sub = text(unit);

    item.icon = "circle";
    items.push(item);
  });

  // Deduplicate: if we got items from both .kpi-header-item AND .kpi-value,
  // keep only the higher-level ones
  if (items.length > 6) {
    return { type: "kpis", items: items.slice(0, Math.ceil(items.length / 2)) };
  }

  return items.length ? { type: "kpis", items } : null;
}

// ── Chart extraction ──

const CHART_TYPE_MAP = {
  columnChartField: "column",
  lineChartField: "line",
  barChartField: "bar",
  pieChartField: "pie",
  areaChartField: "area",
};

function detectChartType(el) {
  const comp = sailComp(el);
  if (comp && CHART_TYPE_MAP[comp]) return CHART_TYPE_MAP[comp];

  // Fallback: parse placeholder text for hints
  const content = text(el).toLowerCase();
  if (content.includes("column chart") || content.includes("[column")) return "column";
  if (content.includes("line chart") || content.includes("[line")) return "line";
  if (content.includes("bar chart") || content.includes("[bar") || content.includes("stacked bar")) return "bar";
  if (content.includes("pie chart") || content.includes("[pie") || content.includes("donut")) return "pie";
  if (content.includes("area chart") || content.includes("[area")) return "area";

  return "column"; // default
}

function extractChart($, el) {
  const chartEl = $(el);
  const chartType = detectChartType(chartEl);
  const content = text(chartEl);

  const section = {
    type: "chart",
    chartType,
    label: "", // will be filled by parent heading
  };

  // Extract stacking and color scheme from data attributes
  const stacking = sail(chartEl, "stacking");
  if (stacking) section.stacking = stacking;

  const colorScheme = sail(chartEl, "color-scheme");
  if (colorScheme) section.colorScheme = colorScheme;

  const height = sail(chartEl, "height");
  if (height) section.height = height;

  // Try to parse categories and series from placeholder text
  // Format: "[Type chart: Cat1/Cat2/Cat3 × Series1/Series2]"
  const parsed = parseChartPlaceholder(content);
  if (parsed) {
    section.categories = parsed.categories;
    section.series = parsed.series;
  } else {
    // Generate placeholder data
    section.categories = ["Q1", "Q2", "Q3", "Q4"];
    section.series = [{ label: "Series 1", data: [25, 35, 30, 40] }];
  }

  return section;
}

/** Try to parse chart placeholder text for data hints */
function parseChartPlaceholder(content) {
  if (!content || content.length < 5) return null;

  // Strip surrounding brackets: "[...content...]" → "...content..."
  const stripped = content.replace(/^\[/, "").replace(/\]$/, "").trim();

  // Pattern: "Stacked column chart: Northeast/Southeast/Midwest/Southwest × Full Price/Clearance/Promotion"
  const catMatch = stripped.match(/:\s*([^×]+?)(?:\s*×\s*(.+))?$/i);
  if (catMatch && catMatch[1].includes("/")) {
    const categories = catMatch[1].split("/").map((s) => s.trim()).filter(Boolean);
    const seriesLabels = catMatch[2]
      ? catMatch[2].split("/").map((s) => s.trim()).filter(Boolean)
      : ["Series 1"];

    if (categories.length >= 2) {
      const series = seriesLabels.map((label) => ({
        label,
        data: categories.map(() => Math.floor(Math.random() * 80 + 20)),
      }));
      return { categories, series };
    }
  }

  // Pattern: "Line chart: Returning vs New customers over time — two series"
  const vsMatch = stripped.match(/:\s*(.+?)\s+(?:vs|versus)\s+(.+?)(?:\s+over|\s+—|$)/i);
  if (vsMatch) {
    const categories = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
    return {
      categories,
      series: [
        { label: vsMatch[1].trim(), data: categories.map(() => Math.floor(Math.random() * 50 + 30)) },
        { label: vsMatch[2].trim(), data: categories.map(() => Math.floor(Math.random() * 50 + 10)) },
      ],
    };
  }

  // Pattern: "Donut chart: Social Media 41.7%, Referral Link 31.9%, Promotion 18.1%, Direct 8.3%"
  const pieMatch = stripped.match(/:\s*(.+)$/i);
  if (pieMatch) {
    const pairs = pieMatch[1].split(",").map((s) => s.trim());
    const categories = [];
    const data = [];
    for (const pair of pairs) {
      const m = pair.match(/^(.+?)\s+([\d.]+)%?$/);
      if (m) {
        categories.push(m[1].trim());
        data.push(parseFloat(m[2]));
      }
    }
    if (categories.length >= 2) {
      return { categories, series: [{ label: "Value", data }] };
    }
  }

  // Pattern with explicit data: "Stacked bar: Not Satisfied 23, Neutral 13, Satisfied 76"
  const dataMatch = stripped.match(/:\s*(.+)$/i);
  if (dataMatch) {
    const parts = dataMatch[1].split(",").map((s) => s.trim());
    const categories = [];
    const data = [];
    for (const part of parts) {
      const m = part.match(/^(.+?)\s+(\d+)$/);
      if (m) {
        categories.push(m[1].trim());
        data.push(parseInt(m[2]));
      }
    }
    if (categories.length >= 2) {
      return { categories, series: [{ label: "Value", data }] };
    }
  }

  return null;
}

// ── Grid extraction ──

function extractGrid($, tableEl) {
  const table = $(tableEl);
  const columns = [];
  const rows = [];

  // Extract columns from <th> elements
  table.find("thead th, tr:first-child th").each((_, th) => {
    const thEl = $(th);
    const label = text(thEl);
    const name = toCamelCase(label);
    const col = { name, label, type: "text", width: "MEDIUM" };

    // Detect alignment
    if (thEl.css("text-align") === "right" || thEl.hasClass("right") || inlineStyle(thEl, "text-align") === "right") {
      col.align = "END";
      col.width = "NARROW_PLUS";
    }

    columns.push(col);
  });

  // Detect primary column (first column with links)
  const firstBodyRow = table.find("tbody tr, tr").not(":has(th)").first();
  if (firstBodyRow.length) {
    const firstTd = firstBodyRow.find("td").first();
    if (firstTd.find("a").length && columns.length > 0) {
      columns[0].type = "primary";
    }
  }

  // Extract rows
  table.find("tbody tr, tr").not(":has(th)").each((_, tr) => {
    const row = {};
    $(tr)
      .find("td")
      .each((i, td) => {
        if (i < columns.length) {
          const tdEl = $(td);
          // Check for tags
          const tag = tdEl.find(".tag, [data-sail-component='tagField']");
          if (tag.length) {
            row[columns[i].name] = text(tag);
            if (columns[i].type === "text") columns[i].type = "tag";
          } else {
            // Use link text or plain text
            const link = tdEl.find("a");
            row[columns[i].name] = link.length ? text(link) : text(tdEl);
          }
        }
      });
    if (Object.keys(row).length) rows.push(row);
  });

  // Adjust widths: numeric-looking columns get NARROW_PLUS
  for (const col of columns) {
    if (col.align === "END") continue; // already set
    const values = rows.map((r) => r[col.name] || "");
    const allNumeric = values.every((v) => /^[\$€£]?[\d,]+\.?\d*[%]?$/.test(v.trim()));
    if (allNumeric && values.length) {
      col.width = "NARROW_PLUS";
      col.align = "END";
    }
  }

  return { type: "grid", columns, rows };
}

function toCamelCase(str) {
  return str
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .trim()
    .split(/\s+/)
    .map((w, i) => (i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join("");
}

// ── Form field extraction ──

const INPUT_TYPE_MAP = {
  text: "text",
  email: "email",
  tel: "phone",
  number: "number",
  date: "date",
  password: "encrypted",
};

function extractFormField($, el) {
  const fieldEl = $(el);
  const field = {};

  if (fieldEl.is("input")) {
    const type = fieldEl.attr("type") || "text";
    field.type = INPUT_TYPE_MAP[type] || "text";
    field.name = fieldEl.attr("name") || fieldEl.attr("id") || `field${Date.now()}`;
    field.label = extractFieldLabel($, fieldEl);
    field.placeholder = fieldEl.attr("placeholder") || undefined;
    if (fieldEl.prop("required")) field.required = true;
  } else if (fieldEl.is("select")) {
    field.type = "dropdown";
    field.name = fieldEl.attr("name") || fieldEl.attr("id") || `dropdown${Date.now()}`;
    field.label = extractFieldLabel($, fieldEl);
    field.choices = [];
    fieldEl.find("option").each((_, opt) => {
      const optEl = $(opt);
      const val = optEl.attr("value") || text(optEl);
      if (val) field.choices.push({ label: text(optEl), value: val });
    });
  } else if (fieldEl.is("textarea")) {
    field.type = "paragraph";
    field.name = fieldEl.attr("name") || fieldEl.attr("id") || `paragraph${Date.now()}`;
    field.label = extractFieldLabel($, fieldEl);
    field.placeholder = fieldEl.attr("placeholder") || undefined;
  }

  return field;
}

function extractFieldLabel($, fieldEl) {
  // Look for associated label
  const id = fieldEl.attr("id");
  if (id) {
    const label = $(`label[for="${id}"]`);
    if (label.length) return text(label);
  }
  // Look for parent label
  const parentLabel = fieldEl.closest("label");
  if (parentLabel.length) return text(parentLabel, true);
  // Look for preceding label-like sibling
  const prev = fieldEl.prev("label, .label, .form-label");
  if (prev.length) return text(prev);
  // Use placeholder or name as fallback
  return fieldEl.attr("placeholder") || fieldEl.attr("name") || "Field";
}


// ─────────────────────────────────────────────────────────────────────────────
// Page type specific builders
// ─────────────────────────────────────────────────────────────────────────────

// ── Dashboard builder ──

function buildDashboard($) {
  const sections = [];
  const body = $("body");

  // Look for KPI card groups at the top level (various structures)
  const kpiGroup = body.find(".card-group, [data-sail-component='cardGroupLayout']").first();
  if (kpiGroup.length) {
    const kpis = extractKpis($, kpiGroup);
    if (kpis) sections.push(kpis);
  } else {
    // Fallback: look for .kpi-header-row or other KPI containers
    const kpiRow = body.find(".kpi-header-row, .kpi-row, .kpis").first();
    if (kpiRow.length) {
      const kpis = extractKpisFromRow($, kpiRow);
      if (kpis) sections.push(kpis);
    }
  }

  // Look for columns layout (side-by-side charts/grids)
  const columnsLayout = body.find(".columns-layout, [data-sail-component='columnsLayout']");
  columnsLayout.each((_, colLayout) => {
    const colEl = $(colLayout);
    // Skip KPI-only rows (no charts or grids inside)
    const hasChartsOrGrids = colEl.find(
      ".chart-placeholder, [data-sail-component*='ChartField'], [data-sail-component*='chartField'], table.data-table, [data-sail-component='gridField']"
    ).length > 0;
    if (!hasChartsOrGrids && colEl.find(".kpi-value").length > 0) return;

    // Skip nested columnsLayouts (already processed by parent)
    if (colEl.parent().closest("[data-sail-component='columnsLayout'], .columns-layout").length) return;

    const columnItems = buildColumnsContent($, colEl);
    if (columnItems.length === 1) {
      sections.push(columnItems[0]);
    } else if (columnItems.length > 1) {
      sections.push({ type: "columns", items: columnItems });
    }
  });

  // Look for standalone charts not inside columns
  body
    .find(".chart-placeholder, [data-sail-component*='ChartField'], [data-sail-component*='chartField']")
    .each((_, el) => {
      const chartEl = $(el);
      // Skip if inside a columns layout (already processed) or micro charts inside KPIs
      if (chartEl.closest(".columns-layout, [data-sail-component='columnsLayout']").length) return;
      if (chartEl.closest(".kpi-card").length) return;
      if (sail(chartEl, "height") === "MICRO") return;

      const chart = extractChart($, chartEl);
      chart.label = findSectionHeading($, chartEl);
      sections.push(chart);
    });

  // Look for standalone tables not inside columns
  body.find("table.data-table, [data-sail-component='gridField']").each((_, el) => {
    const tableEl = $(el);
    if (tableEl.closest(".columns-layout, [data-sail-component='columnsLayout']").length) return;

    const grid = extractGrid($, tableEl);
    grid.label = findSectionHeading($, tableEl);
    sections.push(grid);
  });

  return sections;
}

/** Build content items from each column in a columnsLayout */
function buildColumnsContent($, columnsEl) {
  const allColumnSections = [];

  // Find column children — support various class patterns
  const columnChildren = $(columnsEl).children(
    ".column, [data-sail-component='columnLayout'], [class*='-col'], [class*='column']"
  );

  // Fallback: if no recognized column children, use all direct children
  const colElements = columnChildren.length ? columnChildren : $(columnsEl).children();

  colElements.each((_, colEl) => {
    const col = $(colEl);
    const colSections = [];

    // Process each card/section within the column
    const cardElements = col.find(".card, .metric-card, .chart-card, [data-sail-component='cardLayout']");

    // If no nested cards, treat the column itself as content
    if (!cardElements.length) {
      // Check if the column directly contains a chart or table
      const directChart = col.find(
        ".chart-placeholder, [data-sail-component*='ChartField'], [data-sail-component*='chartField']"
      ).not("[data-sail-height='MICRO']").first();
      const directTable = col.find("table.data-table, [data-sail-component='gridField']").first();

      if (directChart.length) {
        const chart = extractChart($, directChart);
        chart.label = text(col.find("h2, h3, .section-heading").first()) || chart.label;
        colSections.push(chart);
      } else if (directTable.length) {
        const grid = extractGrid($, directTable);
        grid.label = text(col.find("h2, h3, .section-heading").first()) || "Data";
        colSections.push(grid);
      }
    } else {
      cardElements.each((_, cardEl) => {
        const card = $(cardEl);
        // Get the heading for this specific card
        const heading = text(card.find(".section-heading").first())
          || text(card.prevAll("h2, h3, .section-heading").first());

        // Check for chart (skip MICRO charts that are inline sparklines)
        const chartEl = card.find(
          ".chart-placeholder, [data-sail-component*='ChartField'], [data-sail-component*='chartField']"
        ).filter((_, c) => {
          // Only skip MICRO charts that are sparklines inside KPI cards
          const cEl = $(c);
          if (sail(cEl, "height") === "MICRO" && cEl.closest(".kpi-card, .product-row").length) return false;
          return true;
        }).first();

        // Also check if the card itself is a chart
        const cardIsChart = sailComp(card) && (
          sailComp(card).includes("ChartField") || sailComp(card).includes("chartField")
        );

        // Check for grid/table
        const tableEl = card.find("table.data-table, [data-sail-component='gridField']").first();

        // Check for product-list style content
        const productRows = card.find(".product-row");

        if (tableEl.length) {
          const grid = extractGrid($, tableEl);
          grid.label = heading || "Data";
          colSections.push(grid);
        } else if (cardIsChart) {
          const chart = extractChart($, card);
          chart.label = heading || chart.label;
          colSections.push(chart);
        } else if (chartEl.length && !productRows.length) {
          const chart = extractChart($, chartEl);
          chart.label = heading || chart.label;
          colSections.push(chart);
        } else if (productRows.length) {
          const grid = buildProductGrid($, card, heading);
          if (grid) colSections.push(grid);
        } else {
          // KPI-like metric cards — extract as KPI items
          const metricValue = card.find(".metric-value, .kpi-value").first();
          if (metricValue.length) {
            const kpi = {
              type: "kpis",
              items: [{
                label: heading || "Metric",
                value: text(metricValue, true),
                sub: text(card.find(".metric-unit, .kpi-sub").first()),
                icon: "circle",
              }],
            };
            colSections.push(kpi);
          } else {
            warn(`Could not classify card content under heading "${heading}"`);
          }
        }
      });
    }

    for (const s of colSections) {
      allColumnSections.push(s);
    }
  });

  return allColumnSections;
}

/** Build a grid section from product-row style list */
function buildProductGrid($, card, heading) {
  const columns = [
    { name: "product", label: "Product", type: "primary", width: "MEDIUM_PLUS" },
    { name: "id", label: "ID", type: "text", width: "NARROW_PLUS" },
    { name: "status", label: "Status", type: "tag", width: "NARROW" },
  ];

  const rows = [];
  const tagColors = {};
  let hasAnyStatus = false;

  card.find(".product-row").each((_, rowEl) => {
    const row = $(rowEl);
    const name = text(row.find(".product-name"), true);
    const metaText = text(row.find(".product-meta"));
    const idMatch = metaText.match(/(?:Product\s*)?ID:\s*(\d+)/i);
    const id = idMatch ? idMatch[1] : "";
    const tag = row.find(".tag");
    const status = tag.length ? text(tag) : "";

    if (status) {
      hasAnyStatus = true;
      if (tag.hasClass("restock")) tagColors[status] = "NEGATIVE";
      else if (tag.hasClass("low-stock")) tagColors[status] = "SECONDARY";
      else tagColors[status] = "ACCENT";
    }

    rows.push({ product: name, id, status });
  });

  // If there are tag values, ensure every row value is in tagColors
  // (define.js requires all values to have a matching tagColors entry)
  if (hasAnyStatus && Object.keys(tagColors).length) {
    columns[2].tagColors = tagColors;
    // Remove the status column for rows with no status, or add "—" as a neutral value
    // Better: filter to only rows that have a status, or add empty key
    tagColors[""] = "SECONDARY";
  } else {
    // No tags at all — remove the status column
    columns.pop();
    for (const row of rows) delete row.status;
  }

  return {
    type: "grid",
    label: heading || "Products",
    columns,
    rows,
  };
}

/** Find the section heading text above or inside an element */
function findSectionHeading($, el) {
  const elJq = $(el);
  // Look for .section-heading sibling above
  const prevHeading = elJq.prevAll(".section-heading").first();
  if (prevHeading.length) return text(prevHeading);
  // Look inside parent card for heading
  const parentCard = elJq.closest(".card, [data-sail-component='cardLayout']");
  if (parentCard.length) {
    const heading = parentCard.find(".section-heading").first();
    if (heading.length) return text(heading);
  }
  return "";
}

// ── Pane builder ──

function buildPanes($) {
  const panes = [];
  const paneLayout = $(".pane-layout, [data-sail-component='paneLayout']").first();

  paneLayout.children("[data-sail-component='pane'], .pane-menu, .pane-order, [class*='pane-']").each((_, paneEl) => {
    const pane = $(paneEl);
    const paneObj = {};

    // Determine width
    const sailWidth = sail(pane, "width");
    if (sailWidth) {
      paneObj.width = sailWidth;
    } else {
      // Heuristic: if it has a fixed pixel width in CSS, it's likely a fixed pane
      const style = pane.attr("style") || "";
      const widthMatch = style.match(/width:\s*(\d+)px/);
      if (widthMatch) {
        const px = parseInt(widthMatch[1]);
        if (px <= 250) paneObj.width = "NARROW";
        else if (px <= 350) paneObj.width = "MEDIUM";
        else if (px <= 450) paneObj.width = "MEDIUM_PLUS";
        else paneObj.width = "WIDE";
      } else if (pane.hasClass("medium") || pane.css("flex")?.includes("0 0")) {
        paneObj.width = "MEDIUM_PLUS";
      } else {
        paneObj.width = "AUTO";
      }
    }

    // Background color
    const bg = sail(pane, "background");
    if (bg) {
      // Named backgrounds like "GRAY"
      paneObj.backgroundColor = bg === "GRAY" ? "#F5F6F8" : bg;
    }

    // Determine content type
    paneObj.content = classifyPaneContent($, pane);

    panes.push(paneObj);
  });

  // Ensure exactly one AUTO pane
  const autoCount = panes.filter((p) => p.width === "AUTO").length;
  if (autoCount === 0 && panes.length > 0) {
    // Make the largest/first non-fixed pane AUTO
    panes[0].width = "AUTO";
  }

  return panes;
}

function classifyPaneContent($, pane) {
  // Check for grid/table
  const table = pane.find("table.data-table, [data-sail-component='gridField']").first();
  if (table.length) {
    const grid = extractGrid($, table);
    return { type: "grid", ...grid };
  }

  // Check for chart
  const chart = pane.find(".chart-placeholder, [data-sail-component*='ChartField']").first();
  if (chart.length) {
    return extractChart($, chart);
  }

  // Check for card group (menu-like grids)
  const cardGroup = pane.find(".menu-grid, [data-sail-component='cardGroupLayout']").first();
  if (cardGroup.length) {
    // Treat as a nav/detail hybrid — extract as placeholder for now
    return { type: "placeholder" };
  }

  // Check for navigation-like structure (list of links/tabs)
  const tabs = pane.find(".tabs, [data-sail-component='tabLayout']");
  if (tabs.length && !pane.find(".chart-placeholder, table").length) {
    const navItems = [];
    tabs.find(".tab").each((_, tab) => {
      navItems.push({ label: text($(tab)) });
    });
    if (navItems.length) return { type: "nav", items: navItems };
  }

  // Check for detail/key-value content (order summaries, etc.)
  const summaryRows = pane.find(".summary-row, .order-item");
  if (summaryRows.length >= 2) {
    const fields = [];
    pane.find(".summary-row").each((_, row) => {
      const rowEl = $(row);
      const label = text(rowEl.find(".label"));
      const value = text(rowEl.find(".value"));
      if (label && value) fields.push({ label, value });
    });
    if (fields.length) return { type: "detail", fields };
  }

  // Check for heading + misc content → detail
  const headings = pane.find("[data-sail-component='headingField'], h1, h2, h3");
  if (headings.length) {
    // Generic content pane
    return { type: "placeholder" };
  }

  return { type: "placeholder" };
}

// ── Wizard builder ──

function buildWizardSteps($) {
  const body = $("body");
  const steps = [];

  // Find all step labels from the stepper panel
  const stepLabels = [];
  body.find(".step .step-label, .step-label").each((_, el) => {
    const label = text($(el));
    if (label) stepLabels.push(label);
  });

  if (!stepLabels.length) {
    warn("Wizard detected but no step labels found");
    return [{ label: "Step 1", rows: [] }];
  }

  // Determine which step is currently active/visible
  let activeStepIndex = 0;
  body.find(".step").each((i, el) => {
    const stepEl = $(el);
    if (stepEl.find(".step-icon.active, .step-label.active").length) {
      activeStepIndex = i;
    }
  });

  // Extract form fields from the visible step content area
  const formContent = body.find(".form-content, .wizard-content, .step-content").first();
  const activeRows = formContent.length ? buildFormRows($, formContent) : [];

  // Build steps array — active step gets the extracted rows, others get empty rows
  for (let i = 0; i < stepLabels.length; i++) {
    const step = {
      label: stepLabels[i],
      instructions: "",
    };

    if (i === activeStepIndex) {
      // The active step has the visible form fields
      step.rows = activeRows;
      // Try to extract instructions from a subtitle or description
      const title = formContent.find(".form-title, .form-subtitle, h2, h3").first();
      if (title.length) step.instructions = text(title);
    } else {
      // Non-active steps: empty rows (only labels known from stepper)
      step.rows = [];
    }

    steps.push(step);
  }

  return steps;
}

// ── Form builder ──

function buildFormSections($) {
  const sections = [];
  const body = $("body");

  // Look for explicit sections
  const sectionEls = body.find(".section-layout, section, fieldset");
  if (sectionEls.length) {
    sectionEls.each((_, secEl) => {
      const sec = $(secEl);
      const label =
        text(sec.find("legend, .section-heading, h2, h3").first()) || "Section";
      const rows = buildFormRows($, sec);
      if (rows.length) sections.push({ label, rows });
    });
  } else {
    // No explicit sections — group all fields into one section
    const rows = buildFormRows($, body);
    if (rows.length) {
      sections.push({ label: "Details", rows });
    }
  }

  return sections;
}

function buildFormRows($, container) {
  const rows = [];
  const fields = [];

  // Standard form inputs
  container.find("input, select, textarea, .form-field").each((_, el) => {
    const fieldEl = $(el);
    // Skip hidden inputs
    if (fieldEl.attr("type") === "hidden") return;
    // Skip inputs inside already-processed containers
    if (fieldEl.closest("[data-sail-component='cardGroupLayout']").length) return;
    // Skip radio/checkbox inputs that are part of a card-choice group
    if (fieldEl.closest(".card-choice-group, .card-choice, [data-sail-component='cardChoiceField']").length) return;

    const field = extractFormField($, fieldEl);
    if (field && field.name) {
      // Clean up the name
      field.name = toCamelCase(field.label || field.name);
      fields.push(field);
    }
  });

  // Card choice fields — rendered as cardchoice type in SAIL
  container.find(".card-choice-group, [data-sail-component='cardChoiceField']").each((_, el) => {
    const group = $(el);
    const label = text(group.find("> label").first()) || text(group.prev("label")) || "Selection";
    const choices = [];
    group.find(".card-choice, .card-option").each((_, card) => {
      const cardEl = $(card);
      const primary = text(cardEl.find(".primary, .label-text, .card-choice-text .primary").first());
      const secondary = text(cardEl.find(".secondary, .sublabel, .card-choice-text .secondary").first());
      if (primary) {
        choices.push({ label: primary, value: toCamelCase(primary) });
      }
    });
    if (choices.length) {
      fields.push({
        name: toCamelCase(label),
        label,
        type: "cardchoice",
        choices,
        maxSelections: 1,
      });
    }
  });

  // Group fields into rows (2 per row for short fields, 1 for long fields)
  let currentRow = [];
  for (const field of fields) {
    const isFullWidth = ["paragraph", "richtext", "fileupload", "cardchoice"].includes(field.type);
    if (isFullWidth) {
      if (currentRow.length) {
        rows.push({ fields: currentRow.map((f) => ({ ...f, width: 1 })) });
        currentRow = [];
      }
      rows.push({ fields: [field] });
    } else {
      currentRow.push(field);
      if (currentRow.length >= 2) {
        rows.push({ fields: currentRow.map((f) => ({ ...f, width: 1 })) });
        currentRow = [];
      }
    }
  }
  if (currentRow.length) {
    rows.push({ fields: currentRow.map((f) => ({ ...f, width: 1 })) });
  }

  return rows;
}

// ── Layout builder (catch-all) ──

function buildLayoutTree($, root) {
  const rootEl = root || $("body");
  return walkTree($, rootEl);
}

function walkTree($, el) {
  const children = el.children();
  if (!children.length) return null;

  const items = [];

  children.each((_, child) => {
    const childEl = $(child);
    const node = classifyNode($, childEl);
    if (node) items.push(node);
  });

  if (items.length === 0) return null;
  if (items.length === 1) return items[0];

  // Multiple items at top level → columns container
  return { layout: "columns", items };
}

function classifyNode($, el) {
  const comp = sailComp(el);

  // ── Explicit data-sail-component mappings ──
  if (comp === "columnsLayout") {
    const items = [];
    el.children().each((_, child) => {
      const node = classifyNode($, $(child));
      if (node) {
        const width = sail($(child), "width");
        if (width) node.width = width;
        items.push(node);
      }
    });
    return items.length ? { layout: "columns", items } : null;
  }

  if (comp === "cardGroupLayout") {
    const items = [];
    const cardWidth = sail(el, "card-width");
    el.children().each((_, child) => {
      const node = classifyNode($, $(child));
      if (node) items.push(node);
    });
    const result = { layout: "cardGroup", items };
    if (cardWidth) result.cardWidth = cardWidth;
    return items.length ? result : null;
  }

  if (comp === "tabLayout") {
    const items = [];
    el.find(".tab").each((_, tab) => {
      items.push({ leaf: "heading", text: text($(tab)), tabLabel: text($(tab)) });
    });
    return items.length >= 2 ? { layout: "tabs", items } : null;
  }

  if (comp === "cardLayout") {
    const style = sail(el, "style");
    const items = [];
    el.children().each((_, child) => {
      const node = classifyNode($, $(child));
      if (node) items.push(node);
    });
    const result = { layout: "card", items };
    if (style) result.style = style;
    return items.length ? result : null;
  }

  if (comp === "gridField" || el.is("table.data-table")) {
    const grid = extractGrid($, el);
    grid.label = findSectionHeading($, el);
    return { leaf: "grid", ...grid };
  }

  if (comp && comp.includes("ChartField") || comp && comp.includes("chartField")) {
    const chart = extractChart($, el);
    return { leaf: "chart", ...chart };
  }

  if (comp === "headingField") {
    return { leaf: "heading", text: text(el), size: sail(el, "size") || "MEDIUM" };
  }

  // ── Structural/class heuristics ──

  // Flex row → columns
  if (el.hasClass("columns-layout") || el.css("display") === "flex") {
    const flexChildren = el.children();
    if (flexChildren.length >= 2) {
      const items = [];
      flexChildren.each((_, child) => {
        const node = classifyNode($, $(child));
        if (node) items.push(node);
      });
      if (items.length >= 2) return { layout: "columns", items };
    }
  }

  // Chart placeholder
  if (el.hasClass("chart-placeholder")) {
    if (sail(el, "height") === "MICRO") return null; // skip micro sparklines
    const chart = extractChart($, el);
    return { leaf: "chart", ...chart };
  }

  // Table
  if (el.is("table") || el.hasClass("data-table")) {
    const grid = extractGrid($, el);
    return { leaf: "grid", ...grid };
  }

  // Headings
  if (el.is("h1, h2, h3") || el.hasClass("section-heading")) {
    return { leaf: "heading", text: text(el) };
  }

  // KPI cards
  if (el.hasClass("kpi-card")) {
    return null; // KPIs are handled at group level
  }
  if (el.hasClass("card-group")) {
    const kpis = extractKpis($, el);
    if (kpis) return { leaf: "kpis", ...kpis };
  }

  // Paragraph text
  if (el.is("p") && text(el).length > 10) {
    return { leaf: "richTextBlock", text: text(el) };
  }

  // Tags/badges
  if (el.hasClass("order-tags") || comp === "tagField") {
    const items = [];
    el.find(".tag, .order-tag, span").each((_, tag) => {
      const t = text($(tag));
      if (t) items.push({ text: t });
    });
    if (items.length) return { leaf: "tagGroup", items };
  }

  // Button
  if (el.is("button") || comp === "buttonWidget") {
    const style = sail(el, "style") || "SOLID";
    return { leaf: "button", label: text(el), style };
  }

  // Recurse into container divs that have meaningful children
  if (el.is("div, section, main, article")) {
    const childNodes = [];
    el.children().each((_, child) => {
      const node = classifyNode($, $(child));
      if (node) childNodes.push(node);
    });
    if (childNodes.length === 1) return childNodes[0];
    if (childNodes.length > 1) return { layout: "card", items: childNodes };
  }

  return null;
}


// ─────────────────────────────────────────────────────────────────────────────
// Step 4: Main orchestrator — assemble the final definition
// ─────────────────────────────────────────────────────────────────────────────

function buildDefinition($) {
  const pageType = determinePageType($);
  const title = $("title").text().trim() || "Untitled";
  const entityName = deriveEntityName(title);
  const theme = extractTheme($);

  const definition = {
    type: pageType,
    title,
    entityName,
  };

  // Determine header kind
  const body = $("body");
  const hasBillboard =
    body.find(".billboard, [data-sail-component='billboardLayout']").length > 0;
  if (hasBillboard) {
    definition.headerKind = "BILLBOARD";
  } else if (pageType === "dashboard") {
    definition.headerKind = "NONE";
  }

  if (theme) definition.theme = theme;

  switch (pageType) {
    case "dashboard":
      definition.sections = buildDashboard($);
      break;

    case "pane":
      definition.panes = buildPanes($);
      // Extract title from first heading inside pane layout
      const paneHeading = $("[data-sail-component='paneLayout']")
        .find("h1, [data-sail-component='headingField']")
        .first();
      if (paneHeading.length) {
        definition.title = text(paneHeading);
      }
      break;

    case "wizard":
      definition.steps = buildWizardSteps($);
      break;

    case "form":
      definition.sections = buildFormSections($);
      break;

    case "layout":
    default:
      const root = buildLayoutTree($);
      if (root) definition.root = root;
      break;
  }

  return definition;
}

/** Derive a short entity name from the page title */
function deriveEntityName(title) {
  // Strip common suffixes like "Dashboard", "Form", "Page", "View"
  const cleaned = title
    .replace(/\s*(Dashboard|Form|Page|View|Layout|Panel|Screen)\s*$/i, "")
    .trim();
  // Take first meaningful word(s) — up to 2 words
  const words = cleaned.split(/\s+/).slice(0, 2);
  return words.join(" ") || "Item";
}

// ─────────────────────────────────────────────────────────────────────────────
// Execute
// ─────────────────────────────────────────────────────────────────────────────

const definition = buildDefinition($);

if (writeFlag && writeName) {
  // Pipe to define.js --write (sibling script in same directory)
  const json = JSON.stringify(definition);
  const defineScript = resolve(
    new URL(".", import.meta.url).pathname,
    "define.js"
  );
  try {
    execSync(`node "${defineScript}" --write "${writeName}" '${json.replace(/'/g, "'\\''")}'`, {
      stdio: ["pipe", "inherit", "inherit"],
    });
  } catch (e) {
    console.error("Failed to write definition via define.js:", e.message);
    // Fallback: output to stdout
    process.stdout.write(JSON.stringify(definition, null, 2) + "\n");
    process.exit(1);
  }
} else {
  // Output JSON to stdout
  process.stdout.write(JSON.stringify(definition, null, 2) + "\n");
}
