---
inclusion: auto
description: "Redirects SAIL UI generation requests to the canonical orchestrator instructions. Provides Kiro-specific platform notes only."
---

# SAIL UI Generation — Kiro Platform Notes

## Canonical Instructions

For any SAIL UI generation request (form, dashboard, grid, wizard, record-view, pane,
layout, component), read and follow the orchestrator:

**`skills/appian/sail-generation/agents/orchestrator.md`**

That file contains the full pipeline: classify → dispatch specialist → define JSON →
scaffold SAIL → validate → resolve icons → deploy → summarize to-dos. It is the single
source of truth for generation logic, shared across platforms.

Everything below covers only Kiro-specific platform mechanics.

---

## Kiro Platform Dispatch

### Sub-agent invocation

Use `invoke_sub_agent` to dispatch specialist agents. Pass the agent instruction file
via `contextFiles`:

```
contextFiles: [
  { "path": "skills/appian/sail-generation/agents/{agent-file}.md" },
  { "path": "skills/appian/sail-generation/generator/define.js" },
  { "path": "skills/appian/sail-generation/generator/scaffold.js" }
]
```

### MCP tool names

Kiro MCP tools use single-underscore naming: `mcp_appian_listApplications`,
`mcp_appian_createInterface`, etc. (not double-underscore).

### File I/O at $TMPDIR paths

The pipeline writes output to `$TMPDIR/sail-generation/{uuid}/`. This is outside
the workspace — do NOT use `read_file` or workspace file tools on it. Use
`execute_bash cat` if you need to inspect the file, or pass the path directly to
MCP `expressionFilePath` parameters.

### Output path for deploy

The sub-agent must report the absolute resolved output path in its summary.
Pass it directly to `mcp_appian_createInterface(expressionFilePath: "...")`.
