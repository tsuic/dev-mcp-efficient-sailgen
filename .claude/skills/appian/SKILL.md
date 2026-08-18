---
name: "appian"
description: "MANDATORY skill for Appian MCP tool usage. Provides critical domain knowledge (naming conventions, relationship rules, data modeling patterns, dependency order, UUID handling) that MCP tool schemas cannot express. Load this skill BEFORE calling any Appian MCP tools. Covers: record types, interfaces, expression rules, process models, sites, Web APIs, data modeling, relationships, SAIL expressions, security, accessibility auditing, change planning."
---

## CRITICAL: Read This Before Using Appian MCP Tools

**Stop.** If you are about to call Appian MCP tools (`createRecordType`, `addRecordTypeRelationship`, `createInterface`, etc.), you MUST load reference files from this skill first.

**Why this matters:**

MCP tool schemas describe **parameters** (what fields exist), but not **domain requirements** (how to use them correctly):

- ❌ Tool schema: "`createRecordType` accepts `name`, `fields`, `sourceType`"
- ✅ Skill reference: "Primary key must be named `id` (INTEGER), USER fields require SYSTEM_RECORD_TYPE_USER relationships, relationships need both MANY_TO_ONE + ONE_TO_MANY declarations"

**Without this skill, you will:**
- Create broken relationships (missing reverse sides)
- Use wrong naming conventions (404 errors, convention violations)
- Omit mandatory relationships (USER fields won't display correctly)
- Create objects in wrong order (dependency failures)
- Fabricate UUIDs (silent data corruption)

**Before calling ANY Appian MCP tool, follow the loading strategy below.**

---

## Configuration

**Appian Version:** 26.6

**Supported Versions (as of 2026-06-30):**
26.6, 26.5 (redirects to 26.6), 26.3, 25.4, 25.3, 25.2, 25.1, 24.4

Update this version to match your Appian environment. This affects:
- Documentation URL lookups
- Function availability checks
- Version-specific guidance

**To change:** Edit the version number above.

**Version Notes:**
- Most versions have dedicated documentation (26.6, 26.3, 25.4, 25.3, etc.)
- Version 26.5 redirects to 26.6 documentation (no separate 26.5 files)
- If your environment is 26.5, use 26.6 configuration (documentation is compatible)
- The VERSION variable pattern works for all supported versions

**Maintenance:** Update this list quarterly when new Appian versions are released. Typically add the latest version and remove the oldest (2+ years old).

**Last updated:** 2026-06-30

---

## Tool Surface

Appian MCP tools have names like `createApplication`, `createRecordType`, `addRecordTypeRelationship`, `listInterfaces`, `getProcessModel`. If you see these in your tool list (regardless of prefix), this skill is MANDATORY.

Tool schemas are self-describing for parameter structure. Load `references/tools-mcp.md` for usage patterns, UUID handling, and non-obvious behaviors the schemas don't communicate.

---

## ⚡ FAST PATH: Interface / UI Creation

**If the task is creating or updating an Appian interface (form, dashboard, grid, wizard, record view, pane, or any SAIL UI), SKIP the loading strategy below and go directly to the SAIL generation pipeline.**

The pipeline handles SAIL generation more efficiently than hand-writing — it uses JSON definitions + deterministic scaffolding + local validation. Do NOT load `appian-workflow-patterns.md`, `query-record-type-patterns.md`, `date-time-patterns.md`, or other reference files for interface creation.

**Do NOT explore the filesystem** with `find`, `grep`, or `ls` looking for ITSM/record type info. Appian objects live on the server, not in local files. Use MCP tools (`listApplications`, `listRecordTypes`, `getRecordType`) to discover UUIDs and field structures.

**Go to:** `skills/appian/sail-generation/agents/orchestrator.md` (from workspace root) — read it and follow its steps (including automatic deployment).

---

## ⚠️ CRITICAL: Deletion Operations Workflow

**STOP: Before deleting ANY Appian object, you MUST follow this workflow.**

This applies to ALL deletion operations:
- Delete constant, expression rule, record type, interface, process model, Web API, site, connected system
- Delete field, relationship, view, action (record type components)
- Delete group, application, folder, document

### Mandatory Pre-Deletion Steps

**1. ALWAYS Load `references/confirmation-patterns.md` FIRST**

This file contains **Universal Workflow 1: Delete Confirmation** — the complete workflow for safe deletions.

```
Load: references/confirmation-patterns.md
```

**Why this is mandatory:**
- Prevents breaking production applications
- Automatically detects what will break before deletion
- Provides user-facing presentation templates
- Shows impact assessment with line-level precision

**2. Follow Universal Workflow 1 Exactly — ALL 10 Steps, NO EXCEPTIONS**

After loading confirmation-patterns.md, follow all 10 steps IN ORDER:

- **Steps 1-3:** Receive request, verify object, extract details
- **Step 4:** Identify operation type (determines which dependency checks apply)
- **Step 5:** Check expression dependencies using `getObjectDependents` tool ← MANDATORY
- **Step 6:** Perform structural checks (relationships, views, data, hierarchy)
- **Step 7:** Present dependencies to user (use templates — NOT your own format)
- **Step 8:** Offer resolution strategies
- **Step 9:** Get user confirmation ← MANDATORY, NEVER SKIP THIS
- **Step 10:** Execute deletion

**⚠️ CRITICAL: Step 9 is MANDATORY even if zero dependencies found.**
- You MUST present findings to user
- You MUST wait for explicit confirmation
- You MUST NOT delete until user confirms
- Deletion is permanent and irreversible — user deserves final say

**3. Use the Templates in Step 4**

The templates in confirmation-patterns.md show EXACTLY what users should see:
- ✅ Clean dependency lists grouped by type
- ✅ Impact statements ("N objects will break")
- ✅ Action options (Cancel / Proceed / Details)
- ❌ NO tool call details ("getObjectDependents(uuid) →")
- ❌ NO step numbers ("Step 2: Expression dependencies")
- ❌ NO processing details ("Deduplicating by UUID...")

### Why This Matters

**Without this workflow:**
- You might delete objects with active dependencies
- User sees broken "Unknown constant" or "Unknown record type" errors
- Production applications fail at runtime
- No clear impact assessment before deletion

**With this workflow:**
- User sees exactly what will break BEFORE confirming deletion
- Automated dependency detection with line-level precision
- Clear presentation with structured options
- Follows Appian best practices for safe deletions

### Quick Reference: Common Deletions

| Operation | Files to Load | Workflow Steps |
|-----------|---------------|----------------|
| Delete constant | confirmation-patterns.md + supporting-objects.md | Steps 1-4 → Step 5 (getObjectDependents) → Step 7 (present) → Step 9 (confirm) → Step 10 (execute) |
| Delete expression rule | confirmation-patterns.md + expression-rules.md | Steps 1-4 → Step 5 (getObjectDependents) → Step 7 (present) → Step 9 (confirm) → Step 10 (execute) |
| Delete record type | confirmation-patterns.md + record-types.md | Steps 1-4 → Step 5 (getObjectDependents) + Step 6 (structural) → Step 7 (present) → Step 9 (confirm) → Step 10 (execute) |
| Delete interface | confirmation-patterns.md + interfaces.md | Steps 1-4 → Step 5 (getObjectDependents) → Step 7 (present) → Step 9 (confirm) → Step 10 (execute) |
| Delete group | confirmation-patterns.md + supporting-objects.md | Steps 1-4 → Step 6 (structural: hierarchy, members) → Step 7 (present) → Step 9 (confirm) → Step 10 (execute) |

**Non-negotiable:** Load confirmation-patterns.md for ALL deletion operations, no exceptions.

**Note:** Universal Workflow 1 is now the complete deletion workflow (10 steps). Previous "Workflow 7" has been merged into Workflow 1.

---

## Resource Reference Map

Each resource has a dedicated reference file with JSON schemas, design conventions, and pitfalls **that tool schemas cannot express**. 

**Loading is NOT optional** — reference files contain mandatory requirements (naming rules, relationship patterns, dependency constraints) that will cause failures if ignored.

Load the relevant reference(s) for your task:

| When to load | Reference File |
|---|---|
| You need usage patterns for the Appian MCP tools | `references/tools-mcp.md` |
| **Deleting or updating ANY Appian object (MANDATORY - see Deletion Operations section above)** | `references/confirmation-patterns.md` |
| Writing any expression or expression rule (ALWAYS load core pattern files) | `references/function-reference.md`, `references/null-safety-patterns.md`, `references/short-circuit-patterns.md` |
| Using Appian functions, operators, or type conversions in expressions | `references/function-reference.md`, `references/null-safety-patterns.md` |
| Need detailed array, date/time, match, or forEach patterns | `references/function-patterns-index.md` (loads pattern files on demand) |
| Need three-tier documentation lookup workflow (functions.json, doc search) | `references/documentation-lookup-strategy.md` |
| Verifying SAIL component existence or looking up component instruction files | `registry/components-registry.json` (comprehensive component list with existence flags and instruction file mapping) |
| Querying record types with filters, sorting, relationships, aggregations (KPIs), or paging | `references/query-record-type-patterns.md` |
| Using date/time filtering, arithmetic, or comparisons in queries or expressions. Requirements mention: dates, times, today(), now(), date ranges, past/future dates, intervals | `references/date-time-patterns.md` |
| Creating or managing an application | `references/applications.md` |
| Creating/modifying record types, fields, relationships, views, or actions | `references/record-types.md` |
| Requirements mention filtering, searching, faceted navigation, or record list dropdowns | `references/record-type-user-filters.md` |
| Understanding interface types, workflows (Dashboard → Summary View → Form), and when to use each type (MANDATORY before creating any interface) | `references/appian-workflow-patterns.md` |
| Creating record summary views (read-only detail pages for primary entities showing related records) | `references/record-summary-views.md` |
| Creating/modifying interfaces or writing SAIL form expressions | `references/interfaces.md` |
| Building dropdown fields with Priority, Status, Type, Category lookups. Requirements mention: dropdown, select, priority, status, lookup table | `references/dropdown-patterns.md` |
| Creating/modifying expression rules (architectural guidance) | `references/expression-rules.md` |
| Gathering expression rule requirements (clarifying inputs, outputs, validation depth, query scope before implementation) | `references/expressions.md` |
| Managing expression rules (create vs update vs version) | `references/expressions.md` |
| Expression rule architectural decisions (when to inline vs extract, performance pitfalls) | `references/expressions.md` |
| Creating/modifying process models, adding nodes, or wiring start forms | `references/process-models.md` |
| Creating/modifying sites or adding pages | `references/sites.md` |
| Creating constants, groups, folders, or documents | `references/supporting-objects.md` |
| Designing a data model, choosing entity structure, or normalizing fields into lookup tables | `references/data-modeling.md` |
| Writing SAIL expressions for interfaces (layout, components, patterns) | `references/sail.md` |
| Building editable forms with Save buttons (inline writes vs process-based updates) | `references/write-records-patterns.md` |
| Configuring security roles, record-level security, or group hierarchy | `references/security.md` |
| Configuring security expressions, group hierarchies, or role-based access patterns | `references/security-patterns.md` |
| Starting a multi-object task — need to plan dependency order and scope | `references/change-planning.md` |
| Validating or testing completed changes | `references/change-review.md` |
| Choosing field types or need type constraints (length, precision) | `references/field-types.md` |
| Configuring record events, writing events in process models, displaying event history in interfaces, or enabling process mining (Process HQ). Requirements mention: auditing, activity log, event history, tracking changes, collaboration on records, process mining. | `references/record-events.md` |
| Building a dashboard, form layout, or summary view | `references/ui-patterns.md` |
| Dashboard with KPI cards, list cards, message banners, or tabs | Load architectural pattern from `ui-patterns.md` PLUS component examples from `patterns/` directory (see Step 3 for which pattern files to load) |
| Creating any interface (use the SAIL generation pipeline) | `sail-generation/agents/orchestrator.md` |
| Need to look up a specific SAIL component's parameters | `references/component-reference.md` |
| Auditing interfaces for accessibility, fixing accessibility defects, or building accessible interfaces (WCAG compliance) | `references/accessibility-audit.md`, `references/component-checks.md`, `references/accessibility-reference.md` |

### MANDATORY Loading Strategy

**Before calling any Appian MCP tools, load reference files in this order:**

#### Step 1: ALWAYS Load Universal Patterns First
```
Load: references/tools-mcp.md
Load: references/confirmation-patterns.md
Load: references/function-reference.md
Load: references/component-reference.md
Load: references/null-safety-patterns.md
Load: references/short-circuit-patterns.md
```

These cover universal patterns across all Appian tasks:
- `tools-mcp.md`: UUID handling, update behaviors, CSV formats, tool-specific conventions (ALWAYS)
- `confirmation-patterns.md`: **MANDATORY for ALL delete/update operations** — Universal Workflow 7 (Dependency Checking), user confirmation workflows, when to auto-complete vs ask
- `function-reference.md`: Function catalog, anti-hallucination list, signatures for expression rules (ALWAYS)
- `component-reference.md`: SAIL component catalog, anti-hallucination list, signatures for interfaces (ALWAYS)
- `null-safety-patterns.md`: Null handling, functions that reject null, standard safety patterns (ALWAYS)
- `short-circuit-patterns.md`: Nested if() patterns for safe conditional evaluation (ALWAYS)

**Non-negotiable for all Appian work.**

**Why load both function-reference.md AND component-reference.md?**
- Expression rules need functions (logic)
- Interfaces need components (UX) AND functions (logic in saveInto, validation, data transformation)
- Loading both ensures you have complete coverage for any Appian development task
- Both contain anti-hallucination lists to prevent fabricating non-existent functions/components

**For detailed patterns (load on demand):**
- Need detailed array/date/match/forEach patterns → Load `references/function-patterns-index.md` for navigation

#### Step 2: Load Primary Domain Reference
Use the Resource Reference Map above to identify which reference file matches your task, then load it.

**Common scenarios:**
- Creating record types → Load `references/record-types.md` AND `references/data-modeling.md`
- Adding relationships → Load `references/relationship-patterns.md`
- **Building any interface** → Load `references/appian-workflow-patterns.md` (MANDATORY - provides interface type decision criteria) AND `references/interfaces.md` AND `references/sail.md`
- Building interfaces (editable with Save button / Forms) → Load `references/appian-workflow-patterns.md` AND `references/interfaces.md` AND `references/sail.md` AND `references/write-records-patterns.md`
- Building interfaces (read-only / Summary Views) → Load `references/appian-workflow-patterns.md` AND `references/interfaces.md` AND `references/sail.md`
- Creating process models → Load `references/process-models.md` AND `references/node-types.md`

---

#### Step 3: Load UI Pattern Examples (for interfaces)

**If building an interface, check which pattern files apply:**

- [ ] **KPI cards?** → Load `references/patterns/kpis.md`
  - Complete examples: Revenue KPI, User KPI, Task completion KPI
  - Shows stamp + richText + growth indicator pattern
  - Sample data structures and color schemes

- [ ] **List of items as cards?** → Load `references/patterns/card_lists.md`
  - Complete examples: User cards, Task cards, Product cards
  - Shows cardGroupLayout + a!forEach + sideBySideLayout pattern
  - Sample a!map data with all required fields

- [ ] **Message banners?** → Load `references/patterns/messages.md`
  - Complete examples: Info, Warning, Success, Error messages
  - Shows messageBanner patterns with icons and colors

- [ ] **Tab navigation?** → Load `references/patterns/tabs.md`
  - Complete examples: Tab bar with multiple tabs
  - Shows tab state management and content switching

**Pattern files provide:**
- ✅ Complete working SAIL code (copy-paste ready)
- ✅ Correct data structure (a!map with proper fields)
- ✅ Layout composition (sideBySideLayout, cardGroupLayout)
- ✅ Consistent styling (color schemes, spacing)

**Skip patterns if:**
- ❌ Request doesn't mention these specific components
- ❌ Building simple forms or single components
- ❌ Creating expression rules (not interfaces)

---

### Step 4: Generate Interface (SAIL Generation Pipeline)

**For interface creation, use the script-driven SAIL generation pipeline.**

The pipeline generates structurally-correct SAIL from JSON design decisions.
The LLM writes a definition; Node.js scripts render the SAIL deterministically.
No manual function/component verification needed — the local validator catches errors.

**Pipeline location:** `sail-generation/`
**Orchestrator instructions:** `sail-generation/agents/orchestrator.md`

**Flow:**
1. Classify the UI request (form, wizard, grid, dashboard, record-view, pane, layout, component)
2. Dispatch specialist sub-agent → writes JSON definition → scripts scaffold SAIL → local validator checks it
3. Icon resolution pass
4. Deploy: `createInterface(expressionFilePath: ".../output/{uuid}/{slug}.sail")`

Load `references/interfaces.md` for naming conventions when calling `createInterface`.

---

### Step 4 (Expression Rules only): Write and Validate

For **expression rules** (logic, not UI), hand-writing remains appropriate:

1. Generate the expression body as a string
2. Ensure all `ri!` references match input parameter names
3. Apply null safety patterns from `null-safety-patterns.md`
4. Use verified functions from `function-reference.md`
5. Call `createExpressionRule` with the expression

---

#### Step 5: Load Supplementary References (as needed)

Based on what you discover in Steps 2-3, load additional references:
- Field type constraints → `references/field-types.md`
- Security configuration → `references/security.md`
- Multi-object tasks → `references/change-planning.md`

---

## Documentation Lookup Tiers (Overview)

When you need information beyond loaded skill references, use this three-tier approach:

- **Tier 1: Skill References** — Always check first (curated patterns, anti-patterns, examples, 146 components with registry)
- **Tier 2A: functions.json + curl** — For function existence checks and signatures (definitive, fast, 495 functions)
- **Tier 2B: Components registry + functions.json** — For component existence, instruction files, and signatures (146 components)
- **Tier 3: Documentation Search Tool** — For UI/UX patterns, recipes, best practices (semantic search, optional MCP server)

**Quick decision:**
- Need to verify a function exists? → Tier 2A
- Need to verify a component exists? → Tier 1 (registry) → Tier 2B
- Need UI pattern or recipe? → Tier 3
- Need both? → Use Tier 2A for functions, Tier 2B for components, Tier 3 for patterns

**For complete workflows, error handling, curl commands, and examples: Load `references/documentation-lookup-strategy.md`**

---

## Dependency Order

Appian objects must be created in dependency order. Later objects reference earlier ones:

1. Application (creates default groups and folders)
2. Groups (additional role groups)
3. Folders (additional sub-folders)
4. Constants (reference groups, store config values)
5. Record types (with fields)
6. Record type relationships (requires all record types to exist)
7. Expression rules
8. Interfaces
9. Process models
10. Record type actions, views, filters (reference process models and interfaces)
11. Sites (reference interfaces)
12. Web APIs
13. Documents (uploaded to folders)

---

## Common Failure Modes (What Happens When You Skip Skills)

These are real errors that occur when MCP tools are called without loading reference files:

**❌ Skipping USER field relationships:**
- Symptom: USER fields display as plain text (no name, email, profile picture)
- Cause: Created USER field but didn't add MANY_TO_ONE relationship to SYSTEM_RECORD_TYPE_USER
- Prevention: Load `references/record-types.md` + `references/relationship-patterns.md` (documents mandatory USER field pattern)

**❌ Creating only one side of relationship:**
- Symptom: Can navigate Ticket → Status but not Status → Tickets in UI
- Cause: Created MANY_TO_ONE from Ticket to Status, but missing ONE_TO_MANY reverse relationship
- Prevention: Load `references/relationship-patterns.md` (documents bidirectional requirement)

**❌ Wrong naming conventions:**
- Symptom: 404 errors, convention violations, failed validations
- Cause: Used `statusName` instead of `name` for lookup tables, or `customerId` as primary key instead of `id`
- Prevention: Load `references/data-modeling.md` (documents naming rules)

**❌ Fabricating UUIDs:**
- Symptom: Silent failures, 404 Not Found, data corruption
- Cause: Guessed UUID format or reused UUIDs from different environments
- Prevention: Load `references/tools-mcp.md` (documents UUID sourcing rules)

**❌ Wrong dependency order:**
- Symptom: Creation fails because referenced object doesn't exist yet
- Cause: Created interface before creating the record type it references
- Prevention: Load `references/change-planning.md` (documents dependency sequence)

**❌ Creating application without group hierarchy:**
- Symptom: Flat group structure (all groups at same level), no permission inheritance, missing group constants for security expressions
- Cause: Called `createApplication` and `createGroup` without loading `security-patterns.md`
- Example: Created role groups (e.g., "PREFIX Managers", "PREFIX Workers", "PREFIX Reviewers") but didn't set parent-child relationships → manual permission management required on every object
- Prevention: Load `references/applications.md` → redirects to `references/security-patterns.md` for group hierarchy template

## Universal Tips

- Always discover what exists before creating (list before create)
- Get an object before updating it — updates replace provided fields entirely
- Store UUIDs in variables for multi-step workflows
- Record type relationships require both sides declared (MANY_TO_ONE + ONE_TO_MANY)
- All `recordType!` references in expressions must use UUID-qualified format: `'recordType!{uuid}Name.fields.{fieldUuid}fieldName'`

---

## Appian Documentation Search (For Undocumented Functions)

When you encounter a function not documented in function-reference.md, use this workflow to look it up in Appian's official documentation.

### Step 1: Read configured version

Read the **Appian Version** from the Configuration section above. Use this version for all documentation URLs.

### Step 2: Check functions.json for function existence

**First lookup in session (cache for reuse):**
```bash
# Read configured version from Configuration section
VERSION="26.6"  # Use the configured version

# Fetch and cache functions.json
curl -s "https://docs.appian.com/suite/help/$VERSION/functions.json" \
  > /tmp/appian-functions-$VERSION.json
```

**Subsequent lookups (use cached):**
```bash
# Check if cached first
if [ ! -f /tmp/appian-functions-$VERSION.json ]; then
  curl -s "https://docs.appian.com/suite/help/$VERSION/functions.json" \
    > /tmp/appian-functions-$VERSION.json
fi

# Look up function (case-insensitive)
jq -r '.["a!queryrecordtype"]' /tmp/appian-functions-$VERSION.json
# Returns: "/suite/help/26.6/fnc_system_queryrecordtype.html" if exists
# Returns: null if doesn't exist
```

### Step 3: Fetch documentation page

```bash
# If function exists, fetch full documentation
DOC_PATH=$(jq -r '.["a!queryrecordtype"]' /tmp/appian-functions-$VERSION.json)

if [ "$DOC_PATH" != "null" ]; then
  curl -s "https://docs.appian.com$DOC_PATH"
fi
```

### Step 4: Extract key information

From the documentation page, extract:
- Function name and signature
- Parameters (name, type, required/optional, description)
- Return type
- Usage notes and examples
- Related functions

### When to use this workflow

**Use for:**
- ✅ Expression validation error mentions unknown function
- ✅ User asks about a function not in function-reference.md
- ✅ Need to verify function signature or parameters
- ✅ Function exists but signature unclear

**Don't use for:**
- ❌ Functions already in function-reference.md (trust our curated docs first)
- ❌ Every function (only when needed)
- ❌ Patterns/recipes (that's Phase 1b - different search mechanism)

### Fallback behavior

If configured version is not found or Configuration section is missing:
1. Default to version 26.6 (latest)
2. Suggest to user: "Using Appian 26.6 docs. To use a different version, update the Configuration section in skills/appian/SKILL.md"
