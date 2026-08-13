# Choice Field Patterns {#choice-field-patterns}

> **Parent guide:** `logic-guidelines/LOGIC-PRIMARY-REFERENCE.md`
>
> **Related:**
> - `logic-guidelines/null-safety-quick-ref.md` (null checking)
> - `logic-guidelines/functions-reference.md` (function reference)

---

## Quick Component Selection

**What are you capturing?**
- Multiple selections from a list → `a!checkboxField`
- Single yes/no → `a!booleanCheckboxField` or `a!toggleField`
- One selection from multiple options → `a!radioButtonField` or `a!dropDownField` or `a!pickerField` etc

**When to use toggleField vs booleanCheckboxField:**
Both are functionally identical (same parameters, same boolean value). Choose based on UI:
- **toggleField** → Looks like iOS-style toggle
- **booleanCheckboxField** → Looks like checkbox

---

## ⚠️ CRITICAL: Multi-Checkbox Field Pattern

When a checkbox field has multiple choice values (multi-select), use a **single array variable** to store selections—do NOT use separate boolean variables for each choice.

### ✅ CORRECT - Single Array Variable

```sail
a!localVariables(
  local!selectedPriorities: {},  /* Single array for all selections */
  {
    a!checkboxField(
      label: "Case Priorities",
      choiceLabels: {"High", "Medium", "Low", "Critical"},
      choiceValues: {"HIGH", "MEDIUM", "LOW", "CRITICAL"},
      value: local!selectedPriorities,     /* Direct reference */
      saveInto: local!selectedPriorities,  /* Direct save */
      choiceLayout: "STACKED"
    ),
    /* Check if any selections exist */
    if(
      a!isNotNullOrEmpty(local!selectedPriorities),
      a!textField(
        label: "Filter Reason",
        value: local!filterReason,
        saveInto: local!filterReason
      ),
      {}
    ),
    /* Check if specific value is selected */
    if(
      contains(local!selectedPriorities, "CRITICAL"),
      a!textField(
        label: "Escalation Contact",
        value: local!escalationContact,
        saveInto: local!escalationContact,
        required: true
      ),
      {}
    )
  }
)
```

### ❌ WRONG - Separate Boolean Variables

```sail
a!localVariables(
  /* DON'T create separate variables for each choice */
  local!highPriority,
  local!mediumPriority,
  local!lowPriority,
  local!criticalPriority,
  {
    a!checkboxField(
      label: "Case Priorities",
      choiceLabels: {"High", "Medium", "Low", "Critical"},
      choiceValues: {"HIGH", "MEDIUM", "LOW", "CRITICAL"},
      /* DON'T reconstruct array from multiple booleans */
      value: a!flatten({
        if(a!defaultValue(local!highPriority, false), "HIGH", null),
        if(a!defaultValue(local!mediumPriority, false), "MEDIUM", null),
        if(a!defaultValue(local!lowPriority, false), "LOW", null),
        if(a!defaultValue(local!criticalPriority, false), "CRITICAL", null)
      }),
      /* DON'T reverse-map array back to separate booleans */
      saveInto: {
        a!save(local!highPriority, if(contains(save!value, "HIGH"), true, null)),
        a!save(local!mediumPriority, if(contains(save!value, "MEDIUM"), true, null)),
        a!save(local!lowPriority, if(contains(save!value, "LOW"), true, null)),
        a!save(local!criticalPriority, if(contains(save!value, "CRITICAL"), true, null))
      }
    )
  }
)
```

### Why the Wrong Pattern Fails

- **Complex and verbose**: Requires mapping logic in both `value` and `saveInto`
- **Maintenance nightmare**: Adding/removing choices requires changes in 4+ places
- **Error-prone**: Easy to miss updating one of the mappings
- **Inefficient**: Unnecessary data transformation on every interaction

### Key Rules

- ✅ Multi-select checkboxes → Single array variable
- ✅ Check selections using `contains(arrayVariable, value)`
- ✅ Check if any selected using `a!isNotNullOrEmpty(arrayVariable)`
- ✅ Get selection count using `length(arrayVariable)`
- ❌ NEVER create separate boolean variables for each checkbox choice
- ❌ NEVER use `a!flatten()` to reconstruct arrays from booleans

---

## Boolean Checkbox Field Pattern (Preferred for Single Boolean)

For capturing a single true/false value (confirmations, opt-ins, acknowledgments), prefer `a!booleanCheckboxField` or `a!toggleField` over `a!checkboxField` with `choiceValues: {true}`. It's simpler and purpose-built for this use case.

⚠️ **Parameter Warning:** `a!booleanCheckboxField` and `a!toggleField` do NOT have `label` or `labelPosition` parameters. Use `choiceLabel` for the display text and `choicePosition` (`"START"` or `"END"`) for placement.

```sail
/* ✅ PREFERRED — a!booleanCheckboxField for single boolean capture */
local!agreeToTerms,
a!booleanCheckboxField(
  choiceLabel: "I agree to the terms and conditions",
  value: local!agreeToTerms,
  saveInto: local!agreeToTerms,
  required: true,
  requiredMessage: "You must agree to the terms to continue"
)
```
---

## Boolean Checkbox with Dependent Field Clearing

When a boolean checkbox controls dependent fields that need to be cleared on uncheck, use this pattern.

```sail
a!localVariables(
  local!caseUrgent,        /* null by default */
  local!assignedTo,
  local!escalationReason,

  {
    a!booleanCheckboxField(
      choiceLabel: "This is an urgent case requiring immediate attention",
      value: local!caseUrgent,
      saveInto: {
        /* Save the new checkbox state */
        a!save(local!caseUrgent, save!value),
        /* Set assignedTo when checked, preserve when unchecked */
        a!save(local!assignedTo, if(local!caseUrgent, "urgent-team@example.com", local!assignedTo)),
        /* Clear escalationReason when unchecked */
        a!save(local!escalationReason, if(not(save!value), null, local!escalationReason))
      }
    ),
    /* Dependent fields check boolean state */
    a!textField(
      label: "Escalation Reason",
      value: local!escalationReason,
      saveInto: local!escalationReason,
      required: a!defaultValue(local!caseUrgent, false),
      showWhen: a!defaultValue(local!caseUrgent, false)
    )
  }
)
```

**Pattern Explanation:**
- **First a!save**: Updates the checkbox variable directly
- **Second a!save**: Sets a value when checking, preserves when unchecking
- **Third a!save**: Clears the dependent field when unchecked

### Simple Right-Aligned Toggle

```sail
  a!toggleField(
    choiceLabel: "Get notified about order confirmations and status changes",
    choicePosition: "END",  /* Toggle appears on right */
    value: local!orderUpdates,
    saveInto: local!orderUpdates
  )
```

---

## Common Mistakes

```sail
/* ❌ WRONG - Using conditional value binding unnecessarily */
value: if(local!caseUrgent, {true}, {})

/* ✅ RIGHT - Direct assignment */
value: local!caseUrgent

/* ❌ WRONG - Using save!value in conditional */
saveInto: {
  a!save(local!var, or(save!value = {true})),
  if(or(save!value = {true}), ...) /* ERROR: save!value not allowed here */
}

/* ✅ RIGHT - Check local variable state, not save!value */
saveInto: {
  if(a!isNullOrEmpty(local!var), ...)
}

/* ❌ WRONG - Using length() on save!value */
saveInto: {
  a!save(local!var, if(length(save!value) > 0, true, null))  /* ERROR: fails when null */
}

/* ✅ RIGHT - Use a!isNotNullOrEmpty() */
saveInto: {
  a!save(local!var, if(a!isNotNullOrEmpty(save!value), true, null))
}
```

**Critical Rule:** `save!value` can ONLY be used inside the `value` parameter of `a!save(target, value)`. It cannot be used in conditionals, the target parameter, or anywhere outside `a!save()`.

---

## Selection Component Patterns

```sail
/* ✅ Single array variable with checkbox controls */
a!localVariables(
  local!visibleColumns: {"id", "title", "status"},
  {
    a!checkboxField(
      choiceValues: {"id", "title", "status"},
      value: local!visibleColumns,
      saveInto: local!visibleColumns
    ),
    a!gridColumn(
      showWhen: contains(local!visibleColumns, "id")
    )
  }
)
```

---

## Initialization Patterns Quick Reference

### Pre-Checked Checkbox
```sail
/* Use when checkbox should be checked by default (opt-out scenarios) */
local!agreeToTerms: true(),  /* Pre-checked */

a!booleanCheckboxField(
  choiceLabel: "I agree to the terms and conditions",
  value: local!agreeToTerms,
  saveInto: local!agreeToTerms
)
```

### Pre-Selected Multi-Checkbox
```sail
/* Use when some options should be selected by default (default filters, saved preferences) */
local!selectedPriorities: {"HIGH", "MEDIUM"},  /* Pre-select specific options */

a!checkboxField(
  label: "Case Priorities",
  choiceLabels: {"High", "Medium", "Low", "Critical"},
  choiceValues: {"HIGH", "MEDIUM", "LOW", "CRITICAL"},
  value: local!selectedPriorities,
  saveInto: local!selectedPriorities
)
```

---

## Radio Button Patterns

Radio buttons allow selecting **one value** from multiple options (unlike checkboxes which allow multiple selections or toggle behavior).

### Unselected Radio Button
```sail
local!priority,  /* null = no selection */

a!radioButtonField(
  label: "Priority Level",
  choiceLabels: {"High", "Medium", "Low"},
  choiceValues: {"HIGH", "MEDIUM", "LOW"},
  value: local!priority,
  saveInto: local!priority
)
```

### Pre-Selected Radio Button
```sail
local!priority: "MEDIUM",  /* Pre-select Medium */

a!radioButtonField(
  label: "Priority Level",
  choiceLabels: {"High", "Medium", "Low"},
  choiceValues: {"HIGH", "MEDIUM", "LOW"},
  value: local!priority,
  saveInto: local!priority
)
```

**Key Differences from Checkboxes:**
- Radio buttons store a **single value** (not an array)
- Checkboxes with multiple choiceValues store an **array of values**
- Single checkbox with `choiceValues: {true}` stores a **boolean value**

---

## Checkbox showWhen Pattern

**Multi-value checkbox** (`choiceValues: {"a", "b", "c"}`):
```sail
/* ✅ CORRECT - Use contains() */
showWhen: contains(local!preferences, "email")
```

---

## Best Practices Summary

### ✅ DO:
- **Use single array variable** for multi-select checkboxes
- **Initialize boolean checkbox variables to null** (not false)
- **Use `a!isNotNullOrEmpty()`** to check if checkbox is checked
- **Use `contains()`** to check for specific values in multi-select
- **Use `a!isNotNullOrEmpty(save!value)`** in saveInto logic

### ❌ DON'T:
- **Don't create separate variables** for each checkbox option
- **Don't initialize to false** when using `choiceValues: {true}`
- **Don't use length()** on potentially null save!value
- **Don't use save!value** outside of a!save() value parameter
- **Don't use a!flatten()** to reconstruct checkbox arrays from booleans