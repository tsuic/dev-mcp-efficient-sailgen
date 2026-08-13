#!/usr/bin/env node
/**
 * timing.js — Phase timing recorder for SAIL generation requests
 *
 * Writes append-only event records to /output/{uuid}/timing.json.
 * Each record captures a named phase event with a wall-clock timestamp.
 * Gaps between events represent real elapsed time including LLM latency.
 *
 * Usage (from agent shell commands):
 *   node generator/timing.js <uuid> record "<phase>" "<event>" [--note "..."]
 *   node generator/timing.js <uuid> report
 *   node generator/timing.js <uuid> summary       (one-line JSON for agent consumption)
 *
 * Phase naming convention:
 *   scaffold      — programmatic template generation
 *   llm           — LLM content generation pass (N=iteration number)
 *   validation    — validator run
 *   fix           — LLM fix iteration after validation failure
 *   complete      — final output delivered to user
 *
 * Event naming convention (start/end pairs):
 *   start, end
 *
 * Examples:
 *   node generator/timing.js gen-abc123 record "request" "start"
 *   node generator/timing.js gen-abc123 record "scaffold" "start"
 *   node generator/timing.js gen-abc123 record "scaffold" "end"
 *   node generator/timing.js gen-abc123 record "llm:1" "start"
 *   node generator/timing.js gen-abc123 record "llm:1" "end"
 *   node generator/timing.js gen-abc123 record "validation:1" "start"
 *   node generator/timing.js gen-abc123 record "validation:1" "end" --note "2 errors"
 *   node generator/timing.js gen-abc123 record "fix:1" "start"
 *   node generator/timing.js gen-abc123 record "fix:1" "end"
 *   node generator/timing.js gen-abc123 record "validation:2" "start"
 *   node generator/timing.js gen-abc123 record "validation:2" "end" --note "0 errors"
 *   node generator/timing.js gen-abc123 record "complete" "end"
 *   node generator/timing.js gen-abc123 report
 */

const fs = require("fs");
const path = require("path");

const WORKSPACE_ROOT = path.join(__dirname, "..");
const { outputDir } = require("./output-dir");

function timingFilePath(uuid) {
  return path.join(outputDir(uuid), "timing.json");
}

function loadEvents(uuid) {
  const fp = timingFilePath(uuid);
  if (!fs.existsSync(fp)) return [];
  try {
    return JSON.parse(fs.readFileSync(fp, "utf-8"));
  } catch {
    return [];
  }
}

function saveEvents(uuid, events) {
  const fp = timingFilePath(uuid);
  const dir = path.dirname(fp);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fp, JSON.stringify(events, null, 2), "utf-8");
}

/**
 * Record a phase event. Pure side effect (no stdout) so it's safe to call
 * as a library from define.js/scaffold.js without polluting their JSON output.
 */
function recordEvent(uuid, phase, event, note) {
  const events = loadEvents(uuid);
  const entry = {
    phase,
    event,
    ts: Date.now(),
    iso: new Date().toISOString(),
  };
  if (note) entry.note = note;
  events.push(entry);
  saveEvents(uuid, events);
  return entry;
}

/** Format milliseconds as human-readable */
function fmtDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

/**
 * Build phase intervals from raw events.
 * Pairs up start/end events for each phase.
 * Returns array of { phase, startTs, endTs, durationMs, note }
 *
 * Special case: "request" uses "complete" end timestamp if no explicit end.
 */
function buildIntervals(events) {
  const startMap = new Map(); // phase → start event
  const intervals = [];
  let completeTs = null;

  // First pass: find complete timestamp
  for (const e of events) {
    if (e.phase === "complete" && e.event === "end") {
      completeTs = e.ts;
    }
  }

  for (const e of events) {
    if (e.event === "start") {
      startMap.set(e.phase, e);
    } else if (e.event === "end") {
      const start = startMap.get(e.phase);
      if (start) {
        intervals.push({
          phase: e.phase,
          startTs: start.ts,
          endTs: e.ts,
          durationMs: e.ts - start.ts,
          note: e.note || start.note || null,
        });
        startMap.delete(e.phase);
      } else {
        // end without matching start — record as a point event
        intervals.push({
          phase: e.phase,
          startTs: e.ts,
          endTs: e.ts,
          durationMs: 0,
          note: e.note || null,
          pointEvent: true,
        });
      }
    }
  }

  // Any open (start without end) phases — still in-progress
  for (const [phase, startEvent] of startMap) {
    // "request" span: close it at complete time if available
    if (phase === "request" && completeTs) {
      intervals.unshift({
        phase: "request (total)",
        startTs: startEvent.ts,
        endTs: completeTs,
        durationMs: completeTs - startEvent.ts,
        note: startEvent.note || null,
      });
    } else {
      intervals.push({
        phase,
        startTs: startEvent.ts,
        endTs: null,
        durationMs: null,
        inProgress: true,
        note: startEvent.note || null,
      });
    }
  }

  return intervals;
}

/**
 * Categorize a phase name into a group for summary rollups.
 */
function phaseGroup(phase) {
  if (phase === "request" || phase === "request (total)") return "request";
  if (phase === "scaffold") return "scaffold";
  if (/^llm/.test(phase)) return "llm";
  if (/^validation/.test(phase)) return "validation";
  if (/^fix/.test(phase)) return "fix";
  if (phase === "complete") return "complete";
  return "other";
}

/** Generate the human-readable report */
function generateReport(uuid) {
  const events = loadEvents(uuid);
  if (events.length === 0) {
    console.log(`No timing data found for ${uuid}`);
    return;
  }

  const intervals = buildIntervals(events);
  const firstTs = events[0].ts;
  const lastEndedTs = Math.max(
    ...intervals.filter((i) => i.endTs).map((i) => i.endTs)
  );
  const totalMs = lastEndedTs - firstTs;

  // Group summaries (skip the "request (total)" derived span to avoid double-counting)
  const groupTotals = {};
  for (const interval of intervals) {
    if (interval.phase === "request (total)") continue;
    const g = phaseGroup(interval.phase);
    if (!groupTotals[g]) groupTotals[g] = 0;
    if (interval.durationMs != null) groupTotals[g] += interval.durationMs;
  }

  // Count iterations
  const llmCount = intervals.filter((i) => /^llm/.test(i.phase)).length;
  const validationCount = intervals.filter((i) => /^validation/.test(i.phase)).length;
  const fixCount = intervals.filter((i) => /^fix/.test(i.phase)).length;
  const validationErrors = intervals
    .filter((i) => /^validation/.test(i.phase) && i.note && /\d+ error/.test(i.note))
    .map((i) => {
      const m = i.note.match(/(\d+) error/);
      return m ? parseInt(m[1]) : 0;
    });

  const lines = [
    ``,
    `╔══════════════════════════════════════════════════════╗`,
    `║  SAIL Generation Timing Report                       ║`,
    `║  UUID: ${uuid.padEnd(44)}║`,
    `╚══════════════════════════════════════════════════════╝`,
    ``,
    `  Total elapsed:  ${fmtDuration(totalMs)}`,
    `  Started:        ${new Date(firstTs).toLocaleString()}`,
    ``,
    `  ── Phase Breakdown ───────────────────────────────────`,
    ``,
  ];

  // Phase-by-phase detail
  for (const interval of intervals) {
    const dur = interval.durationMs != null
      ? fmtDuration(interval.durationMs).padStart(8)
      : interval.inProgress
      ? "  (open)"
      : "       -";
    const noteStr = interval.note ? `  ← ${interval.note}` : "";
    const pct = interval.durationMs != null && totalMs > 0
      ? ` (${Math.round((interval.durationMs / totalMs) * 100)}%)`
      : "";
    lines.push(`  ${interval.phase.padEnd(20)} ${dur}${pct}${noteStr}`);
  }

  lines.push(``);
  lines.push(`  ── Rollup by Category ───────────────────────────────`);
  lines.push(``);

  const groupOrder = ["request", "scaffold", "llm", "validation", "fix", "complete", "other"];
  for (const g of groupOrder) {
    if (groupTotals[g] != null && groupTotals[g] > 0) {
      const pct = totalMs > 0 ? ` (${Math.round((groupTotals[g] / totalMs) * 100)}%)` : "";
      lines.push(`  ${g.padEnd(20)} ${fmtDuration(groupTotals[g]).padStart(8)}${pct}`);
    }
  }

  lines.push(``);
  lines.push(`  ── Iteration Counts ─────────────────────────────────`);
  lines.push(``);
  lines.push(`  LLM passes:          ${llmCount}`);
  lines.push(`  Validation runs:     ${validationCount}`);
  lines.push(`  Fix iterations:      ${fixCount}`);
  if (validationErrors.length > 0) {
    lines.push(`  Errors by run:       [${validationErrors.join(", ")}]`);
    const totalErrors = validationErrors.reduce((a, b) => a + b, 0);
    lines.push(`  Total errors fixed:  ${totalErrors}`);
  }
  lines.push(``);

  console.log(lines.join("\n"));
}

/** One-line JSON summary for agent consumption */
function generateSummary(uuid) {
  const events = loadEvents(uuid);
  if (events.length === 0) {
    console.log(JSON.stringify({ error: "No timing data", uuid }));
    return;
  }

  const intervals = buildIntervals(events);
  const firstTs = events[0].ts;
  const endedIntervals = intervals.filter((i) => i.endTs);
  const lastEndedTs = endedIntervals.length > 0
    ? Math.max(...endedIntervals.map((i) => i.endTs))
    : null;

  const groupTotals = {};
  for (const interval of intervals) {
    const g = phaseGroup(interval.phase);
    if (!groupTotals[g]) groupTotals[g] = 0;
    if (interval.durationMs != null) groupTotals[g] += interval.durationMs;
  }

  console.log(JSON.stringify({
    uuid,
    totalMs: lastEndedTs ? lastEndedTs - firstTs : null,
    phases: groupTotals,
    llmPasses: intervals.filter((i) => /^llm/.test(i.phase)).length,
    validationRuns: intervals.filter((i) => /^validation/.test(i.phase)).length,
    fixIterations: intervals.filter((i) => /^fix/.test(i.phase)).length,
    eventCount: events.length,
  }));
}

// --- CLI dispatch ---
if (require.main === module) {
  const [,, uuid, command, ...rest] = process.argv;

  if (!uuid || !command) {
    console.error("Usage: node generator/timing.js <uuid> record|report|summary [...args]");
    process.exit(1);
  }

  if (command === "record") {
    const [phase, event, ...noteArgs] = rest;
    const noteFlag = noteArgs.indexOf("--note");
    const note = noteFlag !== -1 ? noteArgs[noteFlag + 1] : null;
    if (!phase || !event) {
      console.error("Usage: timing.js <uuid> record <phase> <event> [--note <text>]");
      process.exit(1);
    }
    const entry = recordEvent(uuid, phase, event, note);
    console.log(JSON.stringify({ recorded: true, phase, event, ts: entry.ts }));
  } else if (command === "report") {
    generateReport(uuid);
  } else if (command === "summary") {
    generateSummary(uuid);
  } else {
    console.error(`Unknown command: ${command}. Use record, report, or summary.`);
    process.exit(1);
  }
}

// --- Library API (define.js / scaffold.js self-instrumentation) ---
// DISABLED: timing logging commented out — can be re-enabled later.
// function tryRecordEvent(uuid, phase, event, note) {
//   try {
//     recordEvent(uuid, phase, event, note);
//   } catch {
//     // ignore — timing must never break the generation pipeline
//   }
// }

// No-op stub so imports don't break while timing is disabled.
function tryRecordEvent() {}

module.exports = { recordEvent, tryRecordEvent };
