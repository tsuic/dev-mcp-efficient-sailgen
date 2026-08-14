# Sites

## Create JSON Schema

```json
{
  "name": "CM Case Management",
  "displayName": "Case Management",
  "webAddressIdentifier": "case-management",
  "description": "Case management application site",
  "pages": [
    {"name": "Dashboard", "targetUuid": "<dashboard-interface-uuid>", "iconId": "f015"},
    {"name": "Cases", "targetUuid": "<cases-interface-uuid>", "iconId": "f03a"},
    {"name": "Admin", "targetUuid": "<admin-interface-uuid>", "iconId": "f013", "visibilityExpr": "if(a!isUserMemberOfGroup(loggedInUser(), cons!CM_ADMIN_GROUP), true, false)"}
  ]
}
```

## Naming Conventions

Three name-related fields:
- `name` — internal object name in Appian Designer: `PREFIX DisplayName` (e.g., `CM Case Management`, `CM Employee Management`)
- `displayName` — user-facing, navigation menu: `Case Management`
- `webAddressIdentifier` — URL slug: `case-management` (produces `/sites/case-management`)

### Web Address Rules
- Lowercase kebab-case
- Short and descriptive
- Unique across environment
- Does not auto-update if display name changes

## Required Parameters

- `name`, `displayName`, `webAddressIdentifier`, `pages` (at least one)

## Page Configuration

Each page needs:
- `name` — tab title in navigation bar
- `targetUuid` — interface UUID to render

Optional:
- `description`
- `iconId` — icon hex code (e.g., `f015` for home, `f03a` for list, `f080` for analytics, `f013` for settings, `f0c0` for users)
- `visibilityExpr` — SAIL expression returning true/false for current user

## Typical Structure

1. **Dashboard** — KPIs, charts, key indicators (first = default landing)
2. **Record list pages** — lists of records users work with
3. **Action pages** — initiate processes
4. **Admin page** — restricted via visibility expression (last)

## Page Ordering

Pages appear in the `pages` array order. First page = default landing page.

## Visibility Expressions

Control which users see a page:

**Admin-only:**
```
"if(a!isUserMemberOfGroup(loggedInUser(), cons!PREFIX_ADMIN_GROUP), true, false)"
```

**Multiple roles:**
```
"if(or(a!isUserMemberOfGroup(loggedInUser(), cons!PREFIX_ADMIN_GROUP), a!isUserMemberOfGroup(loggedInUser(), cons!PREFIX_MANAGER_GROUP)), true, false)"
```

**All users:** Omit `visibilityExpr`.

### Prerequisites
Groups and group constants must exist before site creation (the expressions reference them).

## Updating Sites

**Pages array is full replacement** — always include all existing pages when updating. Get the current site, add/modify pages in the array, then update with the complete pages list.

## Dependency Position

Sites come late — after interfaces. Interfaces referenced by `targetUuid` must exist first.

## Common Pitfalls

- **No pages** — site requires at least one page
- **Missing existing pages on update** — replaces entire list; include all pages
- **Interface doesn't exist** — referenced interface must be created first
- **Web address conflicts** — must be unique across environment
- **Visibility references missing constants** — create groups/constants before site
- **Not associating with application** — always scope to application for default security
