// ─────────────────────────────────────────────────────────────────────────────
// LiteSearch — Filter Engine
// ─────────────────────────────────────────────────────────────────────────────

import type {
  AnyDocument,
  FilterClause,
  FilterGroup,
  FilterOperator,
} from "../types/index";

function getNestedValue(doc: AnyDocument, field: string): unknown {
  const parts = field.split(".");
  let current: unknown = doc;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function evaluateClause(doc: AnyDocument, clause: FilterClause): boolean {
  const value = getNestedValue(doc, clause.field);
  const v = clause.value;

  switch (clause.operator as FilterOperator) {
    case "eq":
      return value === v;

    case "neq":
      return value !== v;

    case "gt":
      return typeof value === "number" && typeof v === "number" && value > v;

    case "gte":
      return typeof value === "number" && typeof v === "number" && value >= v;

    case "lt":
      return typeof value === "number" && typeof v === "number" && value < v;

    case "lte":
      return typeof value === "number" && typeof v === "number" && value <= v;

    case "range": {
      if (!Array.isArray(v) || v.length !== 2) return false;
      const [min, max] = v as [number, number];
      return typeof value === "number" && value >= min && value <= max;
    }

    case "in":
      return Array.isArray(v) && v.includes(value);

    case "nin":
      return Array.isArray(v) && !v.includes(value);

    case "contains":
      return (
        typeof value === "string" &&
        typeof v === "string" &&
        value.toLowerCase().includes(v.toLowerCase())
      );

    case "startsWith":
      return (
        typeof value === "string" &&
        typeof v === "string" &&
        value.toLowerCase().startsWith(v.toLowerCase())
      );

    case "exists":
      return value !== undefined && value !== null;

    default:
      return false;
  }
}

function isFilterGroup(f: FilterClause | FilterGroup): f is FilterGroup {
  return "AND" in f || "OR" in f || "NOT" in f;
}

/**
 * Evaluates a filter (clause or group) against a document.
 * Supports arbitrarily nested AND / OR / NOT combinations.
 */
export function evaluateFilter(
  doc: AnyDocument,
  filter: FilterClause | FilterGroup
): boolean {
  if (typeof filter !== "object" || filter === null) return true;
  if (Object.keys(filter).length === 0) return true;

  if (!isFilterGroup(filter)) {
    return evaluateClause(doc, filter);
  }

  const group = filter as FilterGroup;

  if (group.AND && group.OR) {
    throw new Error("AND and OR are mutually exclusive — use a single logical operator per filter group");
  }

  if (group.AND) {
    return group.AND.every((f) => evaluateFilter(doc, f));
  }

  if (group.OR) {
    return group.OR.some((f) => evaluateFilter(doc, f));
  }

  if (group.NOT) {
    return !evaluateFilter(doc, group.NOT);
  }

  // Empty group = pass
  return true;
}

/**
 * Filter an array of documents using the filter DSL.
 */
export function filterDocuments<T extends AnyDocument>(
  docs: T[],
  filter: FilterClause | FilterGroup
): T[] {
  return docs.filter((doc) => evaluateFilter(doc, filter));
}
