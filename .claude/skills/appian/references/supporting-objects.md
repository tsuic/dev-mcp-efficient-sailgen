# Supporting Objects: Constants, Groups, Folders, Documents

These utility objects support all other Appian design objects. They are created early in the dependency order.

---

## Constants

### Create JSON

```json
{
  "name": "CM_ADMIN_GROUP",
  "type": "GROUP",
  "value": "CM Administrators",
  "description": "Reference to the admin group for visibility expressions"
}
```

### Types

| Type | Typical Use |
|---|---|
| TEXT | Status labels, config strings, emails |
| NUMBER | Thresholds, rates |
| INTEGER | Counts, limits, SLA days |
| BOOLEAN | Feature flags |
| DATE / DATETIME / TIME | Cutoff dates, schedules |
| USER | System accounts, default assignees |
| GROUP | Group references for security expressions |
| FOLDER | Target folders for uploads |
| DOCUMENT | Template documents |

### Naming
- `PREFIX_DESCRIPTIVE_NAME` in UPPER_SNAKE_CASE
- Examples: `CM_ADMIN_GROUP`, `CM_STATUS_OPEN`, `CM_MAX_ATTACHMENTS`

### Common Use Cases

**Group references** — store group IDs so security expressions are readable:
```
cons!CM_ADMIN_GROUP
cons!CM_CASE_MANAGER_GROUP
```

**Status values** — avoid hardcoded strings:
```
cons!CM_STATUS_OPEN
cons!CM_STATUS_CLOSED
```

**Configuration** — values that may change:
```
cons!CM_MAX_ATTACHMENTS     /* INTEGER: 10 */
cons!CM_DEFAULT_SLA_DAYS    /* INTEGER: 5 */
```

---

## Groups

### Application Default Groups

Creating an application auto-generates:
- **PREFIX Administrators** — developers and admins
- **PREFIX Users** — all end users (includes Administrators)

### Creating Additional Groups

Only create beyond defaults when a concrete security requirement demands it (different record-level access, role-restricted pages, role-gated actions).

Each group needs:
- `name` — `PREFIX RoleName` in Title Case (e.g., `CM Case Managers`)
- `parentGroupName` (optional) — nest under PREFIX Users for inherited base access
- `description` (optional)

### Hierarchy Patterns
- Role groups as children of PREFIX Users
- Keep hierarchy shallow (one level of role groups)
- Create corresponding GROUP-type constants after creating groups

### Naming
- `PREFIX RoleName` in Title Case
- Examples: `CM Case Managers`, `CM Supervisors`, `HR Recruiters`

---

## Folders

### Folder Types
- **Rule folders** — expression rules, interfaces, constants
- **Document folders (Knowledge Centers)** — documents and sub-folders
- **Process model folders** — process models only

### Application Defaults

App creation auto-generates:
- Rules folder (for rules, interfaces, constants)
- Document folder / Knowledge Center
- Process model folder

Discover them by listing folders scoped to the application.

### When to Create Additional Folders
- Sub-folders under Knowledge Center (Templates, Reports, Attachments)
- Sub-folders under rules folder for large applications

Every folder requires `parentFolderUuid` — no top-level creation without a parent.

---

## Documents

### Upload Requirements
- `name` — include extension (e.g., `report.pdf`, max 255 chars)
- `parentFolderUuid` — must be a document folder (Knowledge Center)
- `content` — file content (base64-encoded automatically by CLI)

### Naming
- Include file extension: `case-template.xlsx`, `welcome-email.html`
- For templates: `PREFIX Template Name.ext`

---

## Dependency Position

1. Application (creates default groups and folders)
2. **Groups** (additional role groups)
3. **Folders** (additional sub-folders)
4. **Constants** (reference groups, store config values)
5. ... then record types, rules, interfaces, PMs, sites ...
13. **Documents** (uploaded to folders, rarely referenced during creation)

Groups, folders, and constants must exist before objects that reference them.
