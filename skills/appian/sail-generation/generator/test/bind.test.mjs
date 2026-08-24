/**
 * bind.js unit tests
 *
 * Run: node generator/test/bind.test.mjs
 * (or: npm test from generator/)
 */

import { strict as assert } from "node:assert";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  bind,
  resolveAlias,
  buildReverseLookup,
  validateBindings,
  rtRef,
  fieldRef,
  relRef,
  relFieldRef,
  actionRef,
  filterRef,
} = require("../bind.js");

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const BINDINGS = {
  recordType: {
    uuid: "08e470c4-0802-4f4b-b3c2-407d7486d21a",
    name: "ITSM Ticket",
    typeReference: "{urn:com:appian:recordtype:datatype}08e470c4-0802-4f4b-b3c2-407d7486d21a",
  },
  fields: {
    id: "ff1a2b3c-1111-2222-3333-444444444444",
    title: "aa4d5e6f-5555-6666-7777-888888888888",
    statusId: "bb7g8h9i-9999-aaaa-bbbb-cccccccccccc",
    priorityId: "cc0j1k2l-dddd-eeee-ffff-000000000000",
    assignedTo: "dd3m4n5o-1111-2222-3333-555555555555",
    createdDate: "ee6p7q8r-4444-5555-6666-777777777777",
  },
  relationships: {
    status: {
      uuid: "b7a3f1c9-aaaa-bbbb-cccc-dddddddddddd",
      targetFields: { id: "t1-aaaa-bbbb-cccc-dddddddddddd", label: "t2-aaaa-bbbb-cccc-dddddddddddd" },
    },
    priority: {
      uuid: "c8b4g2d0-eeee-ffff-0000-111111111111",
      targetFields: { id: "t3-aaaa-bbbb-cccc-dddddddddddd", label: "t4-aaaa-bbbb-cccc-dddddddddddd" },
    },
  },
  actions: {
    editTicket: "a548020f-fe34-4556-a25e-efcab665b8a4",
    closeTicket: "c7d9e1f2-1234-5678-9abc-def012345678",
  },
  lookups: {
    statusId: { "1": "New", "2": "In Progress", "3": "On Hold", "4": "Resolved", "5": "Closed" },
    priorityId: { "1": "Low", "2": "Medium", "3": "High", "4": "Critical" },
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${e.message}`);
  }
}

console.log("\nbind.js — Reference builders\n");

test("rtRef produces correct record type reference", () => {
  assert.equal(rtRef(BINDINGS), "recordType!{08e470c4-0802-4f4b-b3c2-407d7486d21a}ITSM Ticket");
});

test("fieldRef produces UUID-qualified field reference", () => {
  const ref = fieldRef(BINDINGS, "title");
  assert.equal(
    ref,
    "recordType!{08e470c4-0802-4f4b-b3c2-407d7486d21a}ITSM Ticket.fields.{aa4d5e6f-5555-6666-7777-888888888888}title"
  );
});

test("fieldRef returns null for unknown field", () => {
  assert.equal(fieldRef(BINDINGS, "nonexistent"), null);
});

test("relRef produces UUID-qualified relationship reference", () => {
  const ref = relRef(BINDINGS, "status");
  assert.equal(
    ref,
    "recordType!{08e470c4-0802-4f4b-b3c2-407d7486d21a}ITSM Ticket.relationships.{b7a3f1c9-aaaa-bbbb-cccc-dddddddddddd}status"
  );
});

test("relFieldRef produces full relationship.field reference", () => {
  const ref = relFieldRef(BINDINGS, "status", "label");
  assert.equal(
    ref,
    "recordType!{08e470c4-0802-4f4b-b3c2-407d7486d21a}ITSM Ticket.relationships.{b7a3f1c9-aaaa-bbbb-cccc-dddddddddddd}status.fields.{t2-aaaa-bbbb-cccc-dddddddddddd}label"
  );
});

test("relFieldRef returns null for unknown relationship", () => {
  assert.equal(relFieldRef(BINDINGS, "nonexistent", "label"), null);
});

test("relFieldRef returns null for unknown target field", () => {
  assert.equal(relFieldRef(BINDINGS, "status", "nonexistent"), null);
});

test("actionRef produces UUID-qualified action reference", () => {
  const ref = actionRef(BINDINGS, "editTicket");
  assert.equal(
    ref,
    "recordType!{08e470c4-0802-4f4b-b3c2-407d7486d21a}ITSM Ticket.actions.{a548020f-fe34-4556-a25e-efcab665b8a4}editTicket"
  );
});

test("filterRef produces filter reference", () => {
  const ref = filterRef(BINDINGS, "status");
  assert.equal(
    ref,
    "recordType!{08e470c4-0802-4f4b-b3c2-407d7486d21a}ITSM Ticket.filters.status"
  );
});

console.log("\nbind.js — Lookup resolution\n");

test("buildReverseLookup inverts ID→label to label→ID", () => {
  const reverse = buildReverseLookup(BINDINGS.lookups);
  assert.equal(reverse.statusId["New"], 1);
  assert.equal(reverse.statusId["In Progress"], 2);
  assert.equal(reverse.priorityId["Critical"], 4);
});

test("buildReverseLookup handles empty/missing lookups", () => {
  const reverse = buildReverseLookup(undefined);
  assert.deepEqual(reverse, {});
});

console.log("\nbind.js — resolveAlias\n");

test("resolves @rt", () => {
  const errors = [];
  const result = resolveAlias("@rt", BINDINGS, {}, errors);
  assert.equal(result.resolved, true);
  assert.equal(result.value, "recordType!{08e470c4-0802-4f4b-b3c2-407d7486d21a}ITSM Ticket");
  assert.equal(errors.length, 0);
});

test("resolves @typeRef", () => {
  const errors = [];
  const result = resolveAlias("@typeRef", BINDINGS, {}, errors);
  assert.equal(result.resolved, true);
  assert.equal(result.value, "{urn:com:appian:recordtype:datatype}08e470c4-0802-4f4b-b3c2-407d7486d21a");
  assert.equal(errors.length, 0);
});

test("resolves @field.title", () => {
  const errors = [];
  const result = resolveAlias("@field.title", BINDINGS, {}, errors);
  assert.equal(result.resolved, true);
  assert.ok(result.value.includes(".fields.{aa4d5e6f-5555-6666-7777-888888888888}title"));
  assert.equal(errors.length, 0);
});

test("errors on unknown @field", () => {
  const errors = [];
  resolveAlias("@field.unknown", BINDINGS, {}, errors);
  assert.equal(errors.length, 1);
  assert.ok(errors[0].includes("Unknown field alias"));
});

test("resolves @rel.status (relationship only)", () => {
  const errors = [];
  const result = resolveAlias("@rel.status", BINDINGS, {}, errors);
  assert.equal(result.resolved, true);
  assert.ok(result.value.includes(".relationships.{b7a3f1c9-aaaa-bbbb-cccc-dddddddddddd}status"));
  assert.ok(!result.value.includes(".fields."));
  assert.equal(errors.length, 0);
});

test("resolves @rel.status.label (relationship + target field)", () => {
  const errors = [];
  const result = resolveAlias("@rel.status.label", BINDINGS, {}, errors);
  assert.equal(result.resolved, true);
  assert.ok(result.value.includes(".relationships.{b7a3f1c9-aaaa-bbbb-cccc-dddddddddddd}status.fields.{t2-aaaa-bbbb-cccc-dddddddddddd}label"));
  assert.equal(errors.length, 0);
});

test("errors on unknown @rel", () => {
  const errors = [];
  resolveAlias("@rel.nonexistent", BINDINGS, {}, errors);
  assert.equal(errors.length, 1);
  assert.ok(errors[0].includes("Unknown relationship alias"));
});

test("errors on unknown @rel target field", () => {
  const errors = [];
  resolveAlias("@rel.status.nonexistent", BINDINGS, {}, errors);
  assert.equal(errors.length, 1);
  assert.ok(errors[0].includes("Unknown target field"));
});

test("resolves @action.editTicket", () => {
  const errors = [];
  const result = resolveAlias("@action.editTicket", BINDINGS, {}, errors);
  assert.equal(result.resolved, true);
  assert.ok(result.value.includes(".actions.{a548020f-fe34-4556-a25e-efcab665b8a4}editTicket"));
  assert.equal(errors.length, 0);
});

test("errors on unknown @action", () => {
  const errors = [];
  resolveAlias("@action.nonexistent", BINDINGS, {}, errors);
  assert.equal(errors.length, 1);
  assert.ok(errors[0].includes("Unknown action alias"));
});

test("resolves @filter.status", () => {
  const errors = [];
  const result = resolveAlias("@filter.status", BINDINGS, {}, errors);
  assert.equal(result.resolved, true);
  assert.ok(result.value.includes(".filters.status"));
  assert.equal(errors.length, 0);
});

test("resolves @lookup with multiple values", () => {
  const errors = [];
  const reverseLookups = buildReverseLookup(BINDINGS.lookups);
  const result = resolveAlias("@lookup.statusId[New, In Progress, On Hold]", BINDINGS, reverseLookups, errors);
  assert.equal(result.resolved, true);
  assert.deepEqual(result.value, [1, 2, 3]);
  assert.equal(errors.length, 0);
});

test("resolves @lookup with single value", () => {
  const errors = [];
  const reverseLookups = buildReverseLookup(BINDINGS.lookups);
  const result = resolveAlias("@lookup.priorityId[Critical]", BINDINGS, reverseLookups, errors);
  assert.equal(result.resolved, true);
  assert.deepEqual(result.value, [4]);
  assert.equal(errors.length, 0);
});

test("errors on unknown lookup field", () => {
  const errors = [];
  const reverseLookups = buildReverseLookup(BINDINGS.lookups);
  resolveAlias("@lookup.unknownField[Foo]", BINDINGS, reverseLookups, errors);
  assert.equal(errors.length, 1);
  assert.ok(errors[0].includes("Unknown lookup field"));
});

test("errors on unknown lookup value", () => {
  const errors = [];
  const reverseLookups = buildReverseLookup(BINDINGS.lookups);
  resolveAlias("@lookup.statusId[New, Bogus]", BINDINGS, reverseLookups, errors);
  assert.equal(errors.length, 1);
  assert.ok(errors[0].includes('no value "Bogus"'));
});

test("does not resolve non-@ strings", () => {
  const errors = [];
  const result = resolveAlias("plain string", BINDINGS, {}, errors);
  assert.equal(result.resolved, false);
  assert.equal(errors.length, 0);
});

test("errors on unrecognized @ pattern", () => {
  const errors = [];
  resolveAlias("@bogus", BINDINGS, {}, errors);
  assert.equal(errors.length, 1);
  assert.ok(errors[0].includes("Unrecognized alias pattern"));
});

console.log("\nbind.js — Full bind() integration\n");

test("resolves a complete live dashboard definition", () => {
  const definition = {
    type: "dashboard",
    title: "ITSM Team Dashboard",
    dataSource: {
      recordType: "@rt",
      fields: {
        id: "@field.id",
        statusId: "@field.statusId",
        statusLabel: "@rel.status.label",
        priorityLabel: "@rel.priority.label",
        assignedTo: "@field.assignedTo",
        createdDate: "@field.createdDate",
      },
    },
    sections: [
      {
        type: "kpis",
        items: [
          {
            label: "Open Tickets",
            sub: "New / In Progress / On Hold",
            icon: "open-tickets",
            query: {
              function: "COUNT",
              field: "id",
              filters: [
                { field: "statusId", operator: "in", value: "@lookup.statusId[New, In Progress, On Hold]" },
              ],
            },
          },
          {
            label: "Critical Priority",
            sub: "Needs immediate attention",
            icon: "warning",
            query: {
              function: "COUNT",
              field: "id",
              filters: [
                { field: "priorityId", operator: "in", value: "@lookup.priorityId[Critical]" },
              ],
            },
          },
        ],
      },
    ],
  };

  const result = bind(definition, BINDINGS);
  assert.equal(result.errors.length, 0, `Expected no errors, got: ${result.errors.join("; ")}`);

  // Verify dataSource resolved
  const ds = result.resolved.dataSource;
  assert.equal(ds.recordType, "recordType!{08e470c4-0802-4f4b-b3c2-407d7486d21a}ITSM Ticket");
  assert.ok(ds.fields.id.includes(".fields.{ff1a2b3c-1111-2222-3333-444444444444}id"));
  assert.ok(ds.fields.statusLabel.includes(".relationships.{b7a3f1c9-aaaa-bbbb-cccc-dddddddddddd}status.fields.{t2-aaaa-bbbb-cccc-dddddddddddd}label"));

  // Verify lookup resolution
  const filter = result.resolved.sections[0].items[0].query.filters[0];
  assert.deepEqual(filter.value, [1, 2, 3]);

  const critFilter = result.resolved.sections[0].items[1].query.filters[0];
  assert.deepEqual(critFilter.value, [4]);
});

test("preserves non-alias values unchanged", () => {
  const definition = {
    type: "dashboard",
    title: "My Dashboard",
    headerSubtitle: "Real-time metrics",
    sections: [
      {
        type: "kpis",
        items: [{ label: "Total", value: "42", sub: "all time", icon: "globe" }],
      },
    ],
  };

  const result = bind(definition, BINDINGS);
  assert.equal(result.errors.length, 0);
  assert.equal(result.resolved.title, "My Dashboard");
  assert.equal(result.resolved.headerSubtitle, "Real-time metrics");
  assert.equal(result.resolved.sections[0].items[0].value, "42");
});

test("returns errors for invalid bindings manifest", () => {
  const result = bind({ type: "dashboard" }, { fields: {} });
  assert.ok(result.errors.length > 0);
  assert.ok(result.errors[0].includes("recordType"));
});

test("collects multiple resolution errors", () => {
  const definition = {
    type: "dashboard",
    dataSource: {
      recordType: "@rt",
      fields: {
        bad1: "@field.nonexistent1",
        bad2: "@field.nonexistent2",
        badRel: "@rel.nope.field",
      },
    },
  };

  const result = bind(definition, BINDINGS);
  assert.ok(result.errors.length >= 3, `Expected ≥3 errors, got ${result.errors.length}`);
});

test("resolves @typeRef for interface input declarations", () => {
  const definition = {
    inputs: [{ name: "record", type: "@typeRef" }],
  };

  const result = bind(definition, BINDINGS);
  assert.equal(result.errors.length, 0);
  assert.equal(
    result.resolved.inputs[0].type,
    "{urn:com:appian:recordtype:datatype}08e470c4-0802-4f4b-b3c2-407d7486d21a"
  );
});

test("resolves action refs in recordActions array", () => {
  const definition = {
    recordActions: [
      { actionRef: "@action.editTicket", identifier: true },
      { actionRef: "@action.closeTicket" },
    ],
  };

  const result = bind(definition, BINDINGS);
  assert.equal(result.errors.length, 0);
  assert.ok(result.resolved.recordActions[0].actionRef.includes(".actions.{a548020f-fe34-4556-a25e-efcab665b8a4}editTicket"));
  assert.ok(result.resolved.recordActions[1].actionRef.includes(".actions.{c7d9e1f2-1234-5678-9abc-def012345678}closeTicket"));
});

test("resolves filter refs in userFilters array", () => {
  const definition = {
    userFilters: ["@filter.status", "@filter.priority"],
  };

  const result = bind(definition, BINDINGS);
  assert.equal(result.errors.length, 0);
  assert.ok(result.resolved.userFilters[0].includes(".filters.status"));
  assert.ok(result.resolved.userFilters[1].includes(".filters.priority"));
});

test("resolves @lookupRt.Status (lookup record type ref)", () => {
  const bindingsWithLookupRt = {
    ...BINDINGS,
    lookupRecordTypes: {
      Status: { uuid: "2ec7c8b5-cbfa-4b10-aab5-bdfa267b516d", name: "Customer Status", fields: { id: "5da7a4f8-aaaa", label: "0c17d4da-bbbb" } },
    },
  };
  const definition = { lookupRecordType: "@lookupRt.Status" };
  const result = bind(definition, bindingsWithLookupRt);
  assert.equal(result.errors.length, 0);
  assert.equal(result.resolved.lookupRecordType, "recordType!{2ec7c8b5-cbfa-4b10-aab5-bdfa267b516d}Customer Status");
});

test("resolves @lookupRt.Status.label (field on lookup RT)", () => {
  const bindingsWithLookupRt = {
    ...BINDINGS,
    lookupRecordTypes: {
      Status: { uuid: "2ec7c8b5-cbfa-4b10-aab5-bdfa267b516d", name: "Customer Status", fields: { id: "5da7a4f8-aaaa", label: "0c17d4da-bbbb" } },
    },
  };
  const definition = { labelField: "@lookupRt.Status.label" };
  const result = bind(definition, bindingsWithLookupRt);
  assert.equal(result.errors.length, 0);
  assert.equal(result.resolved.labelField, "recordType!{2ec7c8b5-cbfa-4b10-aab5-bdfa267b516d}Customer Status.fields.{0c17d4da-bbbb}label");
});

test("errors on unknown @lookupRt name", () => {
  const definition = { ref: "@lookupRt.Bogus" };
  const result = bind(definition, BINDINGS);
  assert.ok(result.errors.length > 0);
  assert.ok(result.errors[0].includes("Unknown lookup record type"));
});

test("errors on unknown @lookupRt field", () => {
  const bindingsWithLookupRt = {
    ...BINDINGS,
    lookupRecordTypes: {
      Status: { uuid: "2ec7c8b5-aaaa", name: "Status", fields: { id: "f1", label: "f2" } },
    },
  };
  const definition = { ref: "@lookupRt.Status.nonexistent" };
  const result = bind(definition, bindingsWithLookupRt);
  assert.ok(result.errors.length > 0);
  assert.ok(result.errors[0].includes("Unknown field on lookup RT"));
});

test("handles deeply nested structures", () => {
  const definition = {
    type: "dashboard",
    sections: [
      {
        type: "columns",
        items: [
          {
            type: "chart",
            chartType: "pie",
            label: "By Status",
            recordSource: {
              groupingField: "statusLabel",
              measureField: "id",
              measureFunction: "COUNT",
              filters: [
                { field: "priorityId", operator: "in", value: "@lookup.priorityId[High, Critical]" },
              ],
            },
          },
        ],
      },
    ],
    dataSource: {
      recordType: "@rt",
      fields: {
        id: "@field.id",
        statusLabel: "@rel.status.label",
        priorityId: "@field.priorityId",
      },
    },
  };

  const result = bind(definition, BINDINGS);
  assert.equal(result.errors.length, 0, `Errors: ${result.errors.join("; ")}`);
  const filter = result.resolved.sections[0].items[0].recordSource.filters[0];
  assert.deepEqual(filter.value, [3, 4]);
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n${"—".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
