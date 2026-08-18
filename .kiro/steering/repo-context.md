---
inclusion: auto
description: "Provides context on the repo structure and how to use Appian MCP skills to build applications."
---

# Appian Application Development Skills

This repository provides **skills for building Appian applications** using the Appian MCP tools. The skill files teach domain knowledge — naming conventions, relationship rules, data modeling patterns, dependency order, UUID handling — that MCP tool schemas cannot express on their own.

## Two modes of working in this repo

### 1. Developing skill content (editing reference files, agents, guidelines)

When you're editing `.md` files, updating schemas, or refining agent instructions, you're
working on the skill itself — not calling Appian MCP tools. No special loading strategy
is needed. Follow `AGENTS.md` for contribution guidelines.

### 2. Building Appian applications (calling MCP tools)

When you need to create Appian objects (record types, interfaces, process models, etc.),
load the relevant skill references first:

**Start here:** Read `skills/appian/SKILL.md` — it contains the resource reference map
that tells you which file to load for any given task, plus the mandatory loading strategy.

**For SAIL UI generation:** The pipeline runs on Claude Code. See
`skills/appian/sail-generation/agents/orchestrator.md` for the full workflow, or the
Kiro platform notes in `.kiro/steering/sail-generation.md` for Kiro-specific dispatch.

## Skill structure

```
skills/appian/
  SKILL.md                  ← Entry point: reference map, loading strategy, dependency order
  references/               ← Domain knowledge (tool-agnostic)
  sail-generation/          ← Script-driven SAIL generation pipeline (runs on Claude Code)
    agents/                 ← Orchestrator + 14 specialist agent instructions
    generator/              ← Node.js scripts (define, scaffold, resolve-icons)
    validator/              ← Local SAIL validator (pre-compiled)
    guidelines/             ← Logic patterns, JSON schemas, icon aliases
    tests/                  ← Automated test suites (mockups + live data)
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
- **Use the SAIL generation pipeline for interfaces.** Runs on Claude Code — see `sail-generation/README.md`.

## Git workflow (for contributing to this repo)

- Work on feature branches off `main`
- One concern per PR, DCO sign-off required
- Reference files are tool-agnostic (no MCP tool names except in `tools-mcp.md`)
- See CONTRIBUTING.md for details
