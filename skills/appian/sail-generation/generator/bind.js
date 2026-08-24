#!/usr/bin/env node
/**
 * bind.js — Deterministic alias-to-UUID resolution (inserted between define.js and scaffold.js)
 *
 * The definition agent writes JSON using logical aliases (@rt, @field.X, @rel.X.Y,
 * @lookup.X[values]). This script resolves those aliases to concrete Appian UUID-qualified
 * references using a bindings manifest written by the orchestrator.
 *
 * No LLM touches UUIDs — the orchestrator serializes MCP responses into the manifest,
 * and this script does a deterministic tree-walk + string replacement.
 *
 * =============================================================================
 * ALIAS SYNTAX
 * =============================================================================
 *
 * @rt
 *   → recordType!{uuid}Name
 *   The base record type reference.
 *
 * @field.<fieldName>
 *   → recordType!{rtUuid}RtName.fields.{fieldUuid}fieldName
 *   A field on the base record type.
 *
 * @rel.<relName>
 *   → recordType!{rtUuid}RtName.relationships.{relUuid}relName
 *   A relationship path prefix.
 *
 * @rel.<relName>.<targetFieldName>
 *   → recordType!{rtUuid}RtName.relationships.{relUuid}relName.fields.{targetFieldUuid}targetFieldName
 *   A field on a related record type, accessed through a relationship.
 *
 * @lookup.<fieldName>[value1, value2, ...]
 *   → [id1, id2, ...]
 *   Resolves human-readable lookup values to their numeric IDs.
 *   The fieldName identifies which lookup table to use.
 *
 * @action.<actionKey>
 *   → recordType!{rtUuid}RtName.actions.{actionUuid}actionKey
 *   A record action reference.
 *
 * @filter.<filterName>
 *   → recordType!{rtUuid}RtName.filters.{filterName}
 *   A user filter reference on the base record type.
 *
 * @typeRef
 *   → The typeReference string (for interface input declarations).
 *
 * =============================================================================
 * BINDINGS MANIFEST SCHEMA
 * =============================================================================
 *
 * {
 *   "recordType": {
 *     "uuid": "08e470c4-...",
 *     "name": "ITSM Ticket",
 *     "typeReference": "{urn:com:appian:recordtype:datatype}08e470c4-..."
 *   },
 *   "fields": {
 *     "id": "ff1a2b3c-...",
 *     "title": "aa4d5e6f-...",
 *     "statusId": "bb7g8h9i-..."
 *   },
 *   "relationships": {
 *     "status": {
 *       "uuid": "b7a3f1c9-...",
 *       "targetFields": { "id": "t1-uuid", "label": "t2-uuid" }
 *     }
 *   },
 *   "actions": {
 *     "editTicket": "a548020f-...",
 *     "closeTicket": "c7d9e1f2-..."
 *   },
 *   "lookups": {
 *     "statusId": { "1": "New", "2": "In Progress", "3": "On Hold" }
 *   }
 * }
 *
 * =============================================================================
 * USAGE
 * =============================================================================
 *
 *   node generator/bind.js <uuid> --bindings <path-to-bindings.json>
 *
 * Reads definition.json from the output directory, resolves all aliases in-place,
 * writes the resolved definition back. scaffold.js then runs unchanged.
 */

const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Bindings manifest loader
// ---------------------------------------------------------------------------

function loadBindings(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`Bindings manifest not found: ${filePath}`);
    process.exit(1);
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (e) {
    console.error(`Failed to parse bindings manifest: ${e.message}`);
    process.exit(1);
  }
}

function validateBindings(bindings) {
  const errors = [];
  if (!bindings.recordType || typeof bindings.recordType !== "object") {
    errors.push('"recordType" must be an object with uuid and name');
  } else {
    if (!bindings.recordType.uuid) errors.push('"recordType.uuid" is required');
    if (!bindings.recordType.name) errors.push('"recordType.name" is required');
  }
  if (!bindings.fields || typeof bindings.fields !== "object") {
    errors.push('"fields" must be an object mapping fieldName → uuid');
  }
  // relationships, actions, lookups are optional
  return errors;
}

// ---------------------------------------------------------------------------
// Reference builders
// ---------------------------------------------------------------------------

function rtRef(bindings) {
  const { uuid, name } = bindings.recordType;
  return `recordType!{${uuid}}${name}`;
}

function fieldRef(bindings, fieldName) {
  const fieldUuid = bindings.fields[fieldName];
  if (!fieldUuid) return null;
  return `${rtRef(bindings)}.fields.{${fieldUuid}}${fieldName}`;
}

function relRef(bindings, relName) {
  const rel = (bindings.relationships || {})[relName];
  if (!rel) return null;
  return `${rtRef(bindings)}.relationships.{${rel.uuid}}${relName}`;
}

function relFieldRef(bindings, relName, targetFieldName) {
  const rel = (bindings.relationships || {})[relName];
  if (!rel) return null;
  const targetFieldUuid = (rel.targetFields || {})[targetFieldName];
  if (!targetFieldUuid) return null;
  return `${rtRef(bindings)}.relationships.{${rel.uuid}}${relName}.fields.{${targetFieldUuid}}${targetFieldName}`;
}

function actionRef(bindings, actionKey) {
  const actionUuid = (bindings.actions || {})[actionKey];
  if (!actionUuid) return null;
  return `${rtRef(bindings)}.actions.{${actionUuid}}${actionKey}`;
}

function filterRef(bindings, filterName) {
  return `${rtRef(bindings)}.filters.${filterName}`;
}

function lookupRtRef(bindings, lookupName) {
  const lrt = (bindings.lookupRecordTypes || {})[lookupName];
  if (!lrt) return null;
  return `recordType!{${lrt.uuid}}${lrt.name}`;
}

function lookupRtFieldRef(bindings, lookupName, fieldName) {
  const lrt = (bindings.lookupRecordTypes || {})[lookupName];
  if (!lrt) return null;
  const fieldUuid = (lrt.fields || {})[fieldName];
  if (!fieldUuid) return null;
  return `recordType!{${lrt.uuid}}${lrt.name}.fields.{${fieldUuid}}${fieldName}`;
}

// ---------------------------------------------------------------------------
// Lookup resolution
// ---------------------------------------------------------------------------

/**
 * Resolves "@lookup.statusId[New, In Progress, On Hold]" → [1, 2, 3]
 * The lookups manifest maps ID → label: { "1": "New", "2": "In Progress" }
 * We need the reverse: label → ID.
 */
function buildReverseLookup(lookups) {
  const reverse = {};
  for (const [fieldName, idToLabel] of Object.entries(lookups || {})) {
    reverse[fieldName] = {};
    for (const [id, label] of Object.entries(idToLabel)) {
      reverse[fieldName][label] = Number(id);
    }
  }
  return reverse;
}

function resolveLookupAlias(str, reverseLookups, errors) {
  // Parse: @lookup.statusId[New, In Progress, On Hold]
  const match = str.match(/^@lookup\.([a-zA-Z][a-zA-Z0-9]*)\[(.+)\]$/);
  if (!match) {
    errors.push(`Invalid lookup alias syntax: "${str}"`);
    return str;
  }
  const [, fieldName, valuesStr] = match;
  const lookupMap = reverseLookups[fieldName];
  if (!lookupMap) {
    errors.push(`Unknown lookup field: "${fieldName}" (available: ${Object.keys(reverseLookups).join(", ") || "none"})`);
    return str;
  }
  // Split on comma, trim each value
  const labels = valuesStr.split(",").map((s) => s.trim());
  const ids = [];
  for (const label of labels) {
    const id = lookupMap[label];
    if (id === undefined) {
      errors.push(
        `Lookup "${fieldName}" has no value "${label}" (available: ${Object.keys(lookupMap).join(", ")})`
      );
    } else {
      ids.push(id);
    }
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Alias resolution — string-level
// ---------------------------------------------------------------------------

/**
 * Resolves a single string value that may be an alias.
 * Returns the resolved value (string or array for lookups), or null if not an alias.
 * Pushes to errors[] on unresolvable aliases.
 */
function resolveAlias(value, bindings, reverseLookups, errors) {
  if (typeof value !== "string" || !value.startsWith("@")) return { resolved: false };

  // @rt
  if (value === "@rt") {
    return { resolved: true, value: rtRef(bindings) };
  }

  // @typeRef
  if (value === "@typeRef") {
    const typeReference = bindings.recordType.typeReference;
    if (!typeReference) {
      errors.push('@typeRef used but bindings.recordType.typeReference is not set');
      return { resolved: true, value };
    }
    return { resolved: true, value: typeReference };
  }

  // @field.<name>
  const fieldMatch = value.match(/^@field\.([a-zA-Z][a-zA-Z0-9]*)$/);
  if (fieldMatch) {
    const ref = fieldRef(bindings, fieldMatch[1]);
    if (!ref) {
      errors.push(`Unknown field alias: "@field.${fieldMatch[1]}" (available: ${Object.keys(bindings.fields || {}).join(", ")})`);
      return { resolved: true, value };
    }
    return { resolved: true, value: ref };
  }

  // @rel.<name>.<targetField> OR @rel.<name>
  const relFieldMatch = value.match(/^@rel\.([a-zA-Z][a-zA-Z0-9]*)\.([a-zA-Z][a-zA-Z0-9]*)$/);
  if (relFieldMatch) {
    const ref = relFieldRef(bindings, relFieldMatch[1], relFieldMatch[2]);
    if (!ref) {
      const rel = (bindings.relationships || {})[relFieldMatch[1]];
      if (!rel) {
        errors.push(`Unknown relationship alias: "@rel.${relFieldMatch[1]}" (available: ${Object.keys(bindings.relationships || {}).join(", ")})`);
      } else {
        errors.push(`Unknown target field: "@rel.${relFieldMatch[1]}.${relFieldMatch[2]}" (available on ${relFieldMatch[1]}: ${Object.keys(rel.targetFields || {}).join(", ")})`);
      }
      return { resolved: true, value };
    }
    return { resolved: true, value: ref };
  }

  const relMatch = value.match(/^@rel\.([a-zA-Z][a-zA-Z0-9]*)$/);
  if (relMatch) {
    const ref = relRef(bindings, relMatch[1]);
    if (!ref) {
      errors.push(`Unknown relationship alias: "@rel.${relMatch[1]}" (available: ${Object.keys(bindings.relationships || {}).join(", ")})`);
      return { resolved: true, value };
    }
    return { resolved: true, value: ref };
  }

  // @action.<key>
  const actionMatch = value.match(/^@action\.([a-zA-Z][a-zA-Z0-9]*)$/);
  if (actionMatch) {
    const ref = actionRef(bindings, actionMatch[1]);
    if (!ref) {
      errors.push(`Unknown action alias: "@action.${actionMatch[1]}" (available: ${Object.keys(bindings.actions || {}).join(", ")})`);
      return { resolved: true, value };
    }
    return { resolved: true, value: ref };
  }

  // @filter.<name>
  const filterMatch = value.match(/^@filter\.([a-zA-Z][a-zA-Z0-9_]*)$/);
  if (filterMatch) {
    return { resolved: true, value: filterRef(bindings, filterMatch[1]) };
  }

  // @lookup.<field>[values]
  if (value.startsWith("@lookup.")) {
    const resolved = resolveLookupAlias(value, reverseLookups, errors);
    return { resolved: true, value: resolved };
  }

  // @lookupRt.<name>.<fieldName> — field on a lookup record type
  const lookupRtFieldMatch = value.match(/^@lookupRt\.([a-zA-Z][a-zA-Z0-9]*)\.([a-zA-Z][a-zA-Z0-9]*)$/);
  if (lookupRtFieldMatch) {
    const ref = lookupRtFieldRef(bindings, lookupRtFieldMatch[1], lookupRtFieldMatch[2]);
    if (!ref) {
      const lrt = (bindings.lookupRecordTypes || {})[lookupRtFieldMatch[1]];
      if (!lrt) {
        errors.push(`Unknown lookup record type: "@lookupRt.${lookupRtFieldMatch[1]}" (available: ${Object.keys(bindings.lookupRecordTypes || {}).join(", ")})`);
      } else {
        errors.push(`Unknown field on lookup RT "${lookupRtFieldMatch[1]}": "${lookupRtFieldMatch[2]}" (available: ${Object.keys(lrt.fields || {}).join(", ")})`);
      }
      return { resolved: true, value };
    }
    return { resolved: true, value: ref };
  }

  // @lookupRt.<name> — lookup record type reference
  const lookupRtMatch = value.match(/^@lookupRt\.([a-zA-Z][a-zA-Z0-9]*)$/);
  if (lookupRtMatch) {
    const ref = lookupRtRef(bindings, lookupRtMatch[1]);
    if (!ref) {
      errors.push(`Unknown lookup record type: "@lookupRt.${lookupRtMatch[1]}" (available: ${Object.keys(bindings.lookupRecordTypes || {}).join(", ")})`);
      return { resolved: true, value };
    }
    return { resolved: true, value: ref };
  }

  // Unrecognized @ alias
  errors.push(`Unrecognized alias pattern: "${value}"`);
  return { resolved: true, value };
}

// ---------------------------------------------------------------------------
// Deep tree-walk resolution
// ---------------------------------------------------------------------------

/**
 * Recursively walks the definition JSON tree. Resolves any string value that
 * starts with "@". For lookup aliases that resolve to arrays, replaces the
 * value in-place (the parent object's key gets an array instead of a string).
 */
function resolveTree(node, bindings, reverseLookups, errors, path = "") {
  if (node === null || node === undefined) return node;

  if (typeof node === "string") {
    if (!node.startsWith("@")) return node;
    const result = resolveAlias(node, bindings, reverseLookups, errors);
    return result.resolved ? result.value : node;
  }

  if (Array.isArray(node)) {
    return node.map((item, i) => resolveTree(item, bindings, reverseLookups, errors, `${path}[${i}]`));
  }

  if (typeof node === "object") {
    const resolved = {};
    for (const [key, val] of Object.entries(node)) {
      resolved[key] = resolveTree(val, bindings, reverseLookups, errors, `${path}.${key}`);
    }
    return resolved;
  }

  // numbers, booleans — pass through
  return node;
}

// ---------------------------------------------------------------------------
// Main bind function (exported for testing)
// ---------------------------------------------------------------------------

function bind(definition, bindings) {
  const bindingErrors = validateBindings(bindings);
  if (bindingErrors.length > 0) {
    return { errors: bindingErrors, resolved: null };
  }

  const reverseLookups = buildReverseLookup(bindings.lookups);
  const errors = [];
  const resolved = resolveTree(definition, bindings, reverseLookups, errors);

  if (errors.length > 0) {
    return { errors, resolved: null };
  }
  return { errors: [], resolved };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function cli() {
  const args = process.argv.slice(2);

  // Parse --output-dir if provided
  let filteredArgs = [...args];
  const outputDirIdx = filteredArgs.indexOf("--output-dir");
  if (outputDirIdx !== -1 && filteredArgs[outputDirIdx + 1]) {
    const { setOutputRoot } = require("./output-dir");
    setOutputRoot(filteredArgs[outputDirIdx + 1]);
    filteredArgs.splice(outputDirIdx, 2);
  }

  const uuid = filteredArgs[0];
  const bindingsIdx = filteredArgs.indexOf("--bindings");
  const bindingsPath = bindingsIdx !== -1 ? filteredArgs[bindingsIdx + 1] : null;

  if (!uuid || !bindingsPath) {
    console.error("Usage: node generator/bind.js <uuid> --bindings <path-to-bindings.json>");
    console.error("");
    console.error("Resolves @-prefixed aliases in definition.json to concrete UUID references");
    console.error("using the bindings manifest written by the orchestrator.");
    process.exit(1);
  }

  // Load definition
  const { definitionPath } = require("./define");
  const defPath = definitionPath(uuid);
  if (!fs.existsSync(defPath)) {
    console.error(`Definition not found at: ${defPath}`);
    console.error(`Run define.js --write first.`);
    process.exit(1);
  }

  let definition;
  try {
    definition = JSON.parse(fs.readFileSync(defPath, "utf-8"));
  } catch (e) {
    console.error(`Failed to parse definition: ${e.message}`);
    process.exit(1);
  }

  // Load bindings
  const bindings = loadBindings(bindingsPath);

  // Resolve
  const result = bind(definition, bindings);

  if (result.errors.length > 0) {
    console.error("❌ Binding resolution failed:");
    result.errors.forEach((e) => console.error(`   • ${e}`));
    process.exit(1);
  }

  // Write resolved definition back in-place
  fs.writeFileSync(defPath, JSON.stringify(result.resolved, null, 2), "utf-8");
  console.log(JSON.stringify({ ok: true, uuid, path: defPath, aliasesResolved: true }));
}

// ---------------------------------------------------------------------------
// Exports + CLI dispatch
// ---------------------------------------------------------------------------

module.exports = {
  bind,
  resolveAlias,
  resolveTree,
  buildReverseLookup,
  validateBindings,
  // Reference builders (useful for orchestrator-side manifest writing)
  rtRef,
  fieldRef,
  relRef,
  relFieldRef,
  actionRef,
  filterRef,
  lookupRtRef,
  lookupRtFieldRef,
};

if (require.main === module) {
  cli();
}
