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

export function topKDocuments<T extends AnyDocument>(
  docs: T[],
  sort: SortOption,
  k: number
): T[] {
  if (k <= 0) return [];
  if (k >= docs.length) return sortDocuments(docs, sort);

  const { field, direction, type } = sort;

  // Build a compare function that matches sortDocuments() semantics
  // In a min-heap parent ≤ children. The root is the "worst" item (the one we pop).
  // For descending (keep k largest): worst = smallest → compare returns negative when a < b
  // For ascending (keep k smallest): worst = largest → compare returns negative when a > b
  function heapCompare(a: T, b: T): number {
    const valA = getFieldValue(a, field);
    const valB = getFieldValue(b, field);

    if (type === "date") {
      const aTime = new Date(valA as any).getTime();
      const bTime = new Date(valB as any).getTime();
      return direction === "asc" ? bTime - aTime : aTime - bTime;
    }

    if (type === "number") {
      const nA = Number(valA);
      const nB = Number(valB);
      return direction === "asc" ? nB - nA : nA - nB;
    }

    if (type === "string") {
      const sA = String(valA ?? "");
      const sB = String(valB ?? "");
      return direction === "asc" ? sB.localeCompare(sA) : sA.localeCompare(sB);
    }

    // Auto-detect: try number, fall back to string
    const nA = Number(valA);
    const nB = Number(valB);
    if (!isNaN(nA) && !isNaN(nB)) {
      return direction === "asc" ? nB - nA : nA - nB;
    }

    const sA = String(valA ?? "");
    const sB = String(valB ?? "");
    return direction === "asc" ? sB.localeCompare(sA) : sA.localeCompare(sB);
  }

  // Binary min-heap: keeps the k best items per direction
  const heap: T[] = [];

  function heapPush(item: T): void {
    heap.push(item);
    let idx = heap.length - 1;
    while (idx > 0) {
      const parent = (idx - 1) >> 1;
      if (heapCompare(heap[idx], heap[parent]) >= 0) break;
      [heap[idx], heap[parent]] = [heap[parent], heap[idx]];
      idx = parent;
    }
  }

  function heapPop(): T {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length > 0) {
      heap[0] = last;
      let idx = 0;
      const size = heap.length;
      while (true) {
        let smallest = idx;
        const left = (idx << 1) + 1;
        const right = (idx << 1) + 2;
        if (left < size && heapCompare(heap[left], heap[smallest]) < 0) smallest = left;
        if (right < size && heapCompare(heap[right], heap[smallest]) < 0) smallest = right;
        if (smallest === idx) break;
        [heap[idx], heap[smallest]] = [heap[smallest], heap[idx]];
        idx = smallest;
      }
    }
    return top;
  }

  for (const doc of docs) {
    heapPush(doc);
    if (heap.length > k) heapPop();
  }

  // Extract from heap: extraction gives items in worst-first order.
  // Reverse to get best-first order (asc = smallest first, desc = largest first).
  const result: T[] = [];
  while (heap.length > 0) {
    result.push(heapPop());
  }

  return result.reverse();
}
