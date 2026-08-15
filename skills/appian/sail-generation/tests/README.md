# SAIL Generation Test Suite

End-to-end tests for the SAIL generation pipeline. Each test case is a plain-English prompt
representing what a user might ask the dev-mcp agent to build. Success is measured by
efficient generation of valid SAIL without falling back to LLM syntax writing.

## Test Groups

### Mockups (current)
Static mockup interfaces using hardcoded sample data. These exercise the pipeline's
ability to classify requests, dispatch to specialist agents, produce valid definition
JSON, and scaffold structurally-correct SAIL — all without needing live Appian record
types or data.

### Live Data (future)
Interfaces backed by real record types on an Appian instance. These will test the
pipeline's ability to discover record types/fields/relationships via MCP tools and
produce SAIL that references real UUIDs.

## Running Tests

Tests are executed by dispatching each prompt through the full SAIL generation pipeline
(classify → specialist agent → define.js → scaffold.js → validate.sh) and deploying the
result to Appian as a standalone interface (no app association) with the name prefix `TEST_`.

### Success Criteria

1. **Pipeline completion** — the definition → scaffold → validate chain completes without error
2. **Valid SAIL** — `validate.sh` passes with 0 errors
3. **No LLM fallback** — SAIL is rendered by scaffold.js, not hand-written by the agent
4. **Appian deployment** — `createInterface` succeeds without server-side validation errors

### Coverage Goals

- All 9 pipeline types exercised (form, wizard, grid, dashboard, record-view, pane, component, layout, display)
- All input field types (text, email, phone, number, decimal, paragraph, richtext, date, datetime, time, dropdown, radio, checkbox, cardchoice, boolean, toggle, fileupload, userpicker, grouppicker, encrypted)
- All grid column types (primary, tag, text, buttonArray, progressBar, image)
- All chart types (column, line, bar, area, pie)
- All layout-tree containers (columns, cardGroup, sideBySide, tabs, card)
- All layout-tree leaves (grid, chart, kpis, keyValueList, tagGroup, richTextBlock, banner, imageCard, stamp, heading, itemList)
- All headerKind variants (PLAIN_CARD, HERO, BILLBOARD, NONE)
- Width weighting and multi-field rows
- Pane content types (nav, grid, chart, kpis, detail, placeholder)
