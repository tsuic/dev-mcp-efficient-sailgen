# Record Link Patterns

## a!recordLink — Correct Parameters

`a!recordLink` requires `recordType` and `identifier`. There is no `record` parameter.

### In record-powered grids (a!recordData)

```sail
a!recordLink(
  recordType: 'recordType!{uuid}RecordName',
  identifier: fv!identifier
)
```

- `recordType`: full record type reference with single quotes
- `identifier`: use `fv!identifier` — this is the row's primary key provided automatically by `a!recordData`
- `label`: optional — if omitted, the link inherits text from the parent `a!richTextItem`

### Common pattern — primary column with clickable title

```sail
a!gridColumn(
  label: "Title",
  sortField: 'recordType!{uuid}Name.fields.{fieldUuid}title',
  value: a!richTextDisplayField(
    labelPosition: "COLLAPSED",
    value: a!richTextItem(
      text: fv!row['recordType!{uuid}Name.fields.{fieldUuid}title'],
      link: a!recordLink(
        recordType: 'recordType!{uuid}Name',
        identifier: fv!identifier
      ),
      linkStyle: "STANDALONE",
      style: "STRONG"
    )
  ),
  width: "MEDIUM"
)
```

### Invalid — do NOT use

```sail
/* ❌ WRONG — "record" is not a parameter */
a!recordLink(record: fv!identifier)

/* ❌ WRONG — missing recordType */
a!recordLink(identifier: fv!identifier)
```

### With explicit label (outside of richText)

When the record link is used directly in a `links` parameter (not inside `a!richTextItem`),
provide a label:

```sail
a!recordLink(
  label: "View Record",
  recordType: 'recordType!{uuid}Name',
  identifier: fv!row['recordType!{uuid}Name.fields.{fieldUuid}id']
)
```

### Opening in a new tab

```sail
a!recordLink(
  recordType: 'recordType!{uuid}Name',
  identifier: fv!identifier,
  openLinkIn: "NEW_TAB"
)
```

## User Record Links

For linking to user records specifically, use `a!userRecordLink`:

```sail
a!userRecordLink(
  label: fv!row['recordType!{uuid}Name.fields.{fieldUuid}assignedTo'],
  user: fv!row['recordType!{uuid}Name.fields.{fieldUuid}assignedTo']
)
```
