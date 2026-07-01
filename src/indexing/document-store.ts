// ─────────────────────────────────────────────────────────────────────────────
// LiteSearch — Document Store
// ─────────────────────────────────────────────────────────────────────────────

import type { AnyDocument, DocMeta } from "../types/index";

export class DocumentStore {
  /** docId → DocMeta */
  private store: Map<string, DocMeta> = new Map();

  /** Per-field average lengths (used by BM25) */
  private fieldTotals: Map<string, number> = new Map();

  private storeDocuments: boolean;

  constructor(storeDocuments: boolean = true) {
    this.storeDocuments = storeDocuments;
  }

  add(meta: DocMeta): void {
    // If already exists, subtract old field lengths first
    const existing = this.store.get(meta.id);
    if (existing) {
      for (const [field, len] of Object.entries(existing.fieldLengths)) {
        this.fieldTotals.set(field, (this.fieldTotals.get(field) ?? 0) - len);
      }
    }

    this.store.set(meta.id, meta);

    for (const [field, len] of Object.entries(meta.fieldLengths)) {
      this.fieldTotals.set(field, (this.fieldTotals.get(field) ?? 0) + len);
    }
  }

  addMany(metas: DocMeta[]): void {
    for (const meta of metas) {
      const existing = this.store.get(meta.id);
      if (existing) {
        for (const [field, len] of Object.entries(existing.fieldLengths)) {
          this.fieldTotals.set(field, (this.fieldTotals.get(field) ?? 0) - len);
        }
      }
      this.store.set(meta.id, meta);
      for (const [field, len] of Object.entries(meta.fieldLengths)) {
        this.fieldTotals.set(field, (this.fieldTotals.get(field) ?? 0) + len);
      }
    }
  }

  remove(docId: string): boolean {
    const existing = this.store.get(docId);
    if (!existing) return false;

    for (const [field, len] of Object.entries(existing.fieldLengths)) {
      this.fieldTotals.set(field, Math.max(0, (this.fieldTotals.get(field) ?? 0) - len));
    }

    this.store.delete(docId);
    return true;
  }

  get(docId: string): DocMeta | undefined {
    return this.store.get(docId);
  }

  has(docId: string): boolean {
    return this.store.has(docId);
  }

  getMetaMap(): ReadonlyMap<string, DocMeta> {
    return this.store;
  }

  getAll(): DocMeta[] {
    return [...this.store.values()];
  }

  getAllDocs<T extends AnyDocument>(): T[] {
    if (!this.storeDocuments) return [];
    return [...this.store.values()].map((m) => m.doc as T);
  }

  avgFieldLength(field: string): number {
    const total = this.fieldTotals.get(field) ?? 0;
    const count = this.store.size;
    return count === 0 ? 1 : total / count;
  }

  get size(): number {
    return this.store.size;
  }

  /**
   * Estimate memory usage in bytes (rough approximation).
   */
  estimateMemory(): number {
    let bytes = 0;
    for (const meta of this.store.values()) {
      if (this.storeDocuments && meta.doc) {
        bytes += JSON.stringify(meta.doc).length * 2; // UTF-16
      }
      bytes += 200; // metadata overhead
    }
    return bytes;
  }

  clear(): void {
    this.store.clear();
    this.fieldTotals.clear();
  }
}
