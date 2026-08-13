# CLAUDE.md

This repository provides **skills for building Appian applications** using the Appian MCP tools. The skill files teach you domain knowledge — naming conventions, relationship rules, data modeling patterns, dependency order, UUID handling — that MCP tool schemas cannot express on their own.

## How to use this repo

You have Appian MCP tools available (e.g., `createRecordType`, `createInterface`, `createProcessModel`). Before calling them, load the relevant skill references from `skills/appian/` to avoid common failures like broken relationships, wrong naming conventions, or dependency ordering issues.

**Start here:** Read `skills/appian/SKILL.md` — it contains the resource reference map that tells you which file to load for any given task, plus the mandatory loading strategy.

## Quick start

1. Identify your task (e.g., create a record type, build an interface, wire a process model)
2. Load universal references first (Step 1 in SKILL.md)
3. Load the domain-specific reference for your task (Step 2)
4. Follow the dependency order when creating multiple objects
5. Use the validation checkpoint before creating interfaces or expression rules

## Skill structure

```
skills/appian/
  SKILL.md                  ← Entry point: reference map, loading strategy, dependency order
  references/
    tools-mcp.md            ← MCP tool patterns, UUID handling, non-obvious behaviors
    record-types.md         ← Record type schemas, fields, relationships, actions
    data-modeling.md        ← Entity design, normalization, naming conventions
    interfaces.md           ← SAIL forms, dashboards, summary views
    process-models.md       ← Nodes, variables, start forms, flow patterns
    sail.md                 ← Components, layouts, data binding, grids
    ...                     ← Additional reference files (see resource map in SKILL.md)
```

## Dependency order

Create Appian objects in this order (later objects reference earlier ones):

1. Application
2. Groups
3. Folders
4. Constants
5. Record types (with fields)
6. Record type relationships
7. Expression rules
8. Interfaces
9. Process models
10. Record type actions, views, filters
11. Sites
12. Web APIs

## Key principles

- **Always load references before calling MCP tools.** The skill prevents failures that tool schemas alone cannot prevent.
- **Never fabricate UUIDs.** Get them from the environment via list/get operations.
- **Follow naming conventions.** Each reference file documents the conventions for its object type.
- **Validate before creating.** Use `validateExpression` before calling `createInterface` or `createExpressionRule`.

## Git workflow (for contributing to this repo)

- Work on feature branches off `main`
- One concern per PR, DCO sign-off required
- Reference files are tool-agnostic (no MCP tool names except in `tools-mcp.md`)
- See CONTRIBUTING.md for details
