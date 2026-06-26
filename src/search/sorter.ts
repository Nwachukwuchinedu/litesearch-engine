import type { AnyDocument, SortOption } from "../types/index";

function getFieldValue(doc: AnyDocument, field: string): unknown {
  const parts = field.split(".");
  let val: unknown = doc;
  for (const part of parts) {
    if (val === null || val === undefined) return undefined;
    val = (val as Record<string, unknown>)[part];
  }
  return val;
}

export function sortDocuments<T extends AnyDocument>(
  docs: T[],
  sort: SortOption
): T[] {
  const { field, direction, type } = sort;
  return [...docs].sort((a, b) => {
    const valA = getFieldValue(a, field);
    const valB = getFieldValue(b, field);

    if (type === "date") {
      const aTime = new Date(valA as any).getTime();
      const bTime = new Date(valB as any).getTime();
      return direction === "asc" ? aTime - bTime : bTime - aTime;
    }

    if (type === "number") {
      const nA = Number(valA);
      const nB = Number(valB);
      return direction === "asc" ? nA - nB : nB - nA;
    }

    if (type === "string") {
      const sA = String(valA ?? "");
      const sB = String(valB ?? "");
      return direction === "asc" ? sA.localeCompare(sB) : sB.localeCompare(sA);
    }

    // Auto-detect: try number, fall back to string
    const nA = Number(valA);
    const nB = Number(valB);
    if (!isNaN(nA) && !isNaN(nB)) {
      return direction === "asc" ? nA - nB : nB - nA;
    }

    const sA = String(valA ?? "");
    const sB = String(valB ?? "");
    return direction === "asc" ? sA.localeCompare(sB) : sB.localeCompare(sA);
  });
}
