# Running Mockup Tests

## Execution Model

Each test case in `mockups.yaml` is an independent prompt that exercises the full
SAIL generation pipeline. Tests are executed by sending each prompt to the dev-mcp
agent and verifying the results.

## How to Run

### Single Test

Send the `prompt` from any test case directly to the agent. The prompt already includes
the `TEST_` prefix in the interface name, so no app association is needed.

Example — run test `form-01-employee-onboarding`:
```
Create a standalone interface called TEST_EmployeeOnboarding.
Build an employee onboarding form with sections for Personal Information...
```

### Batch Execution

To run all tests sequentially, iterate through the YAML file and dispatch each prompt.
Since these are standalone interfaces (no appUuid), deployment uses:

```
createInterface(name: "TEST_...", expression or expressionFilePath: "...")
```

### Cleanup

After testing, remove all test interfaces:
```
listInterfaces() with query "TEST_" → deleteInterface(uuid) for each
```

## Grading

| Outcome | Grade |
|---------|-------|
| Pipeline completes, validate.sh passes, Appian deploys cleanly | PASS |
| Pipeline completes, validate.sh passes, Appian rejects (patching needed) | PARTIAL |
| Pipeline completes, validate.sh fails (scaffold bug) | FAIL-SCAFFOLD |
| Agent falls back to hand-writing SAIL instead of using pipeline | FAIL-FALLBACK |
| Agent misclassifies the request type | FAIL-CLASSIFY |
| Definition JSON rejected by define.js | FAIL-DEFINITION |

## Coverage Matrix

Track which pipeline features each test exercises:

| Feature | Test IDs |
|---------|----------|
| form type | form-01 through form-06 |
| wizard type | wizard-01 through wizard-03 |
| grid type | grid-01 through grid-05 |
| dashboard type | dashboard-01 through dashboard-05 |
| record-view type | record-view-01 through record-view-04 |
| pane type | pane-01 through pane-04 |
| component type | component-01 through component-03 |
| layout type | layout-01 through layout-09 |
| HERO header | grid-02, dashboard-04, layout-01, layout-08 |
| BILLBOARD header | grid-04, layout-06 |
| NONE header | grid-03 |
| all field types | form-06 |
| all column types | grid-05 |
| all chart types | dashboard-05 |
| all leaf types | layout-09 |
| all pane content | pane-04 |
| record-view + layout | record-view-04 |
| tabs container | layout-02, layout-07, layout-09 |
| cardGroup container | layout-01, layout-06, layout-08, layout-09 |
| sideBySide container | layout-05, layout-09 |
| card container | layout-03, layout-05, layout-06, layout-07 |
| itemList leaf | layout-02, layout-04, layout-05, layout-09 |
| imageCard leaf | layout-01, layout-06, layout-08, layout-09 |
| banner leaf | layout-05, layout-09 |
| stamp leaf | layout-05, layout-06, layout-09 |
| tagGroup leaf | layout-05, layout-09 |
| keyValueList leaf | layout-03, layout-04, layout-07, layout-09 |
| richTextBlock leaf | layout-03, layout-06, layout-09 |
| heading leaf | layout-03, layout-04, layout-05, layout-06, layout-09 |
