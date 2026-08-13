# Null Safety Implementation Patterns {#null-safety-implementation}

> **Parent guide:** `logic-guidelines/LOGIC-PRIMARY-REFERENCE.md`
>
> **Quick Reference:** `logic-guidelines/null-safety-quick-ref.md`
> **Related:** `logic-guidelines/short-circuit-evaluation.md` for nested if() patterns

---

## CHECKPOINT

**Before finalizing any SAIL expression, verify EVERY direct field reference uses a!defaultValue()**

### For Mock Data (local variables):
- ✅ `a!defaultValue(local!variable, "")`
- ✅ `a!defaultValue(local!variable, null)`
- ✅ `a!defaultValue(local!array, {})`
- ❌ `local!variable` (naked variable reference without null safety)

### For Record Data (rule inputs):
- ✅ `a!defaultValue(ri!record['recordType!Example.fields.field'], "")`
- ✅ `a!defaultValue(ri!record['recordType!Example.fields.field'], null)`
- ✅ `a!defaultValue(ri!record['recordType!Example.relationships.rel'], {})`
- ❌ `ri!record['recordType!Example.fields.field']` (naked field reference)

---

## Required Null Safety Patterns

### 1. Form Field Values

Always wrap in `a!defaultValue()`:

```sail
/* Mock data */
value: a!defaultValue(local!title, ""),

/* Record data */
value: a!defaultValue(ri!record['recordType!X.fields.title'], ""),
```

### 2. User Function Calls

Always check for null user IDs BEFORE calling user() function:

```sail
/* ✅ CORRECT - Check for null BEFORE calling user() */
if(
  a!isNotNullOrEmpty(a!defaultValue(userIdField, null)),
  trim(
    user(userIdField, "firstName") & " " & user(userIdField, "lastName")
  ),
  "–"
)

/* ❌ WRONG - Checking null INSIDE user() call - user() will fail if passed null */
trim(
  user(a!defaultValue(userIdField, null), "firstName") & " " &
  user(a!defaultValue(userIdField, null), "lastName")
)
```

**Critical Note**: The user() function CANNOT accept null as the first parameter. If the field value is null, user() will cause an error. You MUST check for null with an if() statement BEFORE calling user(), not inside the user() function call.

**Note on User Display Names:**
- Use `user(userId, "firstName") & " " & user(userId, "lastName")` instead of `displayName`
- The `displayName` field is actually a nickname and is not always populated
- Wrap in `trim()` to clean up any extra whitespace
- Use "–" (en dash) as fallback for null/empty users instead of text like "Unknown User" or "Unassigned"

### 3. Array Operations

Protect all array references:

```sail
/* Mock data */
length(a!defaultValue(local!items, {}))

/* Record data */
length(a!defaultValue(ri!record['recordType!X.relationships.items'], {}))
```

### 4. Validation Logic

Wrap all validation checks:

```sail
if(
  a!isNullOrEmpty(a!defaultValue(local!required, "")),
  "Field is required",
  null
)
```

**🚨 CRITICAL REMINDER**: The `a!defaultValue()` function prevents interface failures by handling null field references gracefully. This is MANDATORY for all direct field access, not optional. Missing this causes immediate runtime errors.

---

## Functions That Reject Null

**Some functions fail even with `a!defaultValue()` and require `if()` checks BEFORE calling:**

### Null-Rejecting Functions:
- `user(userId, property)`, `group(groupId, property)` - Cannot accept null ID
- `text(value, format)` - Cannot format null dates/numbers
- String manipulation: `upper()`, `lower()`, `left()`, `right()`, `find()` - Fail on null
- **Logical operators**: `not()` - Cannot accept null value

### Required Pattern:

```sail
/* ✅ CORRECT - Check for null BEFORE calling function */
if(
  a!isNotNullOrEmpty(a!defaultValue(fieldValue, null)),
  functionThatRejectsNull(fieldValue, otherParams),
  fallbackValue
)

/* ❌ WRONG - a!defaultValue() wrapper doesn't prevent the error */
functionThatRejectsNull(a!defaultValue(fieldValue, null), otherParams)
```

**Rule**: When a function operates ON a value (transforms/formats it), check for null BEFORE calling. The `a!defaultValue()` wrapper alone is insufficient.

---

## Special Case: not() with Variables and Rule Inputs

**The `not()` function cannot accept null. When using `not()` with variables or rule inputs that might be null, use `a!defaultValue()` to provide a fallback:**

```sail
/* ❌ WRONG - Direct use of not() with potentially null value */
readOnly: not(ri!isEditable)  /* Fails if ri!isEditable is null */
disabled: not(local!allowEdits)  /* Fails if local!allowEdits is null */

/* ✅ CORRECT - Use a!defaultValue() to provide fallback */
readOnly: not(a!defaultValue(ri!isEditable, false()))  /* Returns true if null */
disabled: not(a!defaultValue(local!allowEdits, false()))  /* Returns true if null */

/* ✅ ALTERNATIVE - Use if() to check for null first */
readOnly: if(
  a!isNullOrEmpty(ri!isEditable),
  true(),  /* Default to read-only if null */
  not(ri!isEditable)
)
```

### Common scenarios requiring null protection:
- `readOnly: not(ri!isEditable)` → Use `not(a!defaultValue(ri!isEditable, false()))`
- `disabled: not(local!allowEdits)` → Use `not(a!defaultValue(local!allowEdits, false()))`
- `showWhen: not(local!isHidden)` → Use `not(a!defaultValue(local!isHidden, false()))`

**Best Practice**: Always wrap rule inputs and variables in `a!defaultValue()` before passing to `not()`. Choose the default value (`true()` or `false()`) based on the desired behavior when the value is null.

---

## Null Safety for Computed Variables

**Computed variables that derive from empty arrays require special null checking with nested if() statements.**

**⚠️ IMPORTANT:** SAIL's `and()` and `or()` functions **DO NOT short-circuit**. For detailed explanation, see `logic-guidelines/short-circuit-evaluation.md`.

### Pattern for Null-Safe Property Access on Computed Variables

**Always use nested if() pattern when accessing properties on computed variables:**

```sail
if(
  if(
    a!isNotNullOrEmpty(local!variable),
    /* Safe to access properties here - variable is guaranteed not empty */
    local!variable.propertyName = "expectedValue",
    /* Return safe default - false, null, or {} depending on context */
    false
  ),
  /* Then branch */,
  /* Else branch */
)
```

### Common Scenarios Requiring Nested if()

**1. Computed variables from grid selections:**

```sail
local!selectedItemIds: {},
local!selectedItems: a!forEach(
  items: local!selectedItemIds,
  expression: index(local!allItems, wherecontains(fv!item, local!allItems.id)[1], null)  /* [1] unwraps the position to a scalar */
),

/* ✅ Accessing properties */
if(
  if(
    a!isNotNullOrEmpty(local!selectedItems),
    length(intersection(local!selectedItems.type, {"Contract"})) > 0,
    false
  ),
  /* Show additional fields */,
  {}
)
```

**2. Filtered or derived arrays:**

```sail
local!activeUsers: a!forEach(
  items: local!allUsers,
  expression: if(fv!item.status = "Active", fv!item, null)
),

/* ✅ Checking properties */
if(
  if(
    a!isNotNullOrEmpty(local!activeUsers),
    wherecontains("ADMIN", local!activeUsers.role),
    false
  ),
  /* Show admin panel */,
  {}
)
```