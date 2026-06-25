// ─────────────────────────────────────────────────────────────────────────────
// LiteSearch — Inverted Index
// ─────────────────────────────────────────────────────────────────────────────

import type { InvertedIndex, Postings } from "../types/index.js";
import { levenshtein, adaptiveMaxDistance } from "../core/levenshtein.js";

export class InvertedIndexStore {
  /**
   * Per-field inverted indexes.
   * Structure: fieldName → term → docId → positions[]
   */
  private indexes: Map<string, InvertedIndex> = new Map();

  /** All unique terms per field — cached for fuzzy scan */
  private termSets: Map<string, Set<string>> = new Map();

  /**
   * Add a term-position entry for a document in a given field.
   */
  addPosting(field: string, term: string, docId: string, position: number): void {
    if (!this.indexes.has(field)) {
      this.indexes.set(field, new Map());
      this.termSets.set(field, new Set());
    }

    const fieldIndex = this.indexes.get(field)!;
    const termSet = this.termSets.get(field)!;

    if (!fieldIndex.has(term)) {
      fieldIndex.set(term, new Map());
    }

    const postings = fieldIndex.get(term)!;
    if (!postings.has(docId)) {
      postings.set(docId, []);
    }
    postings.get(docId)!.push(position);
    termSet.add(term);
  }

  /**
   * Remove all postings for a given document across all fields.
   */
  removeDoc(docId: string): void {
    for (const fieldIndex of this.indexes.values()) {
      for (const [term, postings] of fieldIndex) {
        postings.delete(docId);
        if (postings.size === 0) {
          fieldIndex.delete(term);
        }
      }
    }

    // Rebuild term sets
    for (const [field, fieldIndex] of this.indexes) {
      this.termSets.set(field, new Set(fieldIndex.keys()));
    }
  }

  /**
   * Exact lookup: get postings for a specific term in a field.
   */
  getExact(field: string, term: string): Postings | undefined {
    return this.indexes.get(field)?.get(term);
  }

  /**
   * Prefix lookup: get all postings for terms starting with `prefix` in a field.
   * Returns a merged Postings (docId → best positions).
   */
  getByPrefix(field: string, prefix: string): Map<string, { postings: Postings; term: string }[]> {
    const fieldIndex = this.indexes.get(field);
    if (!fieldIndex) return new Map();

    const results = new Map<string, { postings: Postings; term: string }[]>();

    for (const [term, postings] of fieldIndex) {
      if (term.startsWith(prefix) && postings.size > 0) {
        for (const docId of postings.keys()) {
          if (!results.has(docId)) results.set(docId, []);
          results.get(docId)!.push({ postings, term });
        }
      }
    }

    return results;
  }

  /**
   * Fuzzy lookup: find all terms within `maxDistance` edits of `query`.
   * Returns array of { term, postings, distance }.
   */
  getFuzzy(
    field: string,
    query: string,
    maxDistance: number
  ): Array<{ term: string; postings: Postings; distance: number }> {
    const termSet = this.termSets.get(field);
    const fieldIndex = this.indexes.get(field);
    if (!termSet || !fieldIndex) return [];

    const adaptive = adaptiveMaxDistance(query, maxDistance);
    if (adaptive === 0) {
      // No fuzzy — exact only
      const exact = fieldIndex.get(query);
      if (exact) return [{ term: query, postings: exact, distance: 0 }];
      return [];
    }

    const results: Array<{ term: string; postings: Postings; distance: number }> = [];

    for (const term of termSet) {
      // Quick length filter before expensive Levenshtein
      if (Math.abs(term.length - query.length) > adaptive) continue;

      const dist = levenshtein(query, term, adaptive);
      if (dist <= adaptive) {
        const postings = fieldIndex.get(term);
        if (postings && postings.size > 0) {
          results.push({ term, postings, distance: dist });
        }
      }
    }

    // Sort: exact first, then by distance, then alphabetical
    results.sort((a, b) => a.distance - b.distance || a.term.localeCompare(b.term));
    return results;
  }

  /**
   * Combined lookup: exact → prefix → fuzzy (in order of precision).
   */
  lookup(
    field: string,
    query: string,
    maxFuzzyDistance: number,
    prefixMatch: boolean
  ): Array<{ term: string; postings: Postings; matchType: "exact" | "prefix" | "fuzzy" }> {
    const results: Array<{ term: string; postings: Postings; matchType: "exact" | "prefix" | "fuzzy" }> = [];
    const seen = new Set<string>();

    // 1. Exact match
    const exact = this.getExact(field, query);
    if (exact && exact.size > 0) {
      results.push({ term: query, postings: exact, matchType: "exact" });
      seen.add(query);
    }

    // 2. Prefix match (for partial word search)
    if (prefixMatch && query.length >= 2) {
      const fieldIndex = this.indexes.get(field);
      if (fieldIndex) {
        for (const [term, postings] of fieldIndex) {
          if (!seen.has(term) && term.startsWith(query) && postings.size > 0) {
            results.push({ term, postings, matchType: "prefix" });
            seen.add(term);
          }
        }
      }
    }

    // 3. Fuzzy match
    if (maxFuzzyDistance > 0 && query.length >= 4) {
      const fuzzyMatches = this.getFuzzy(field, query, maxFuzzyDistance);
      for (const { term, postings, distance } of fuzzyMatches) {
        if (!seen.has(term)) {
          results.push({
            term,
            postings,
            matchType: distance === 0 ? "exact" : "fuzzy",
          });
          seen.add(term);
        }
      }
    }

    return results;
  }

  get fields(): string[] {
    return [...this.indexes.keys()];
  }

  termCount(field?: string): number {
    if (field) return this.termSets.get(field)?.size ?? 0;
    let total = 0;
    for (const ts of this.termSets.values()) total += ts.size;
    return total;
  }

  clear(): void {
    this.indexes.clear();
    this.termSets.clear();
  }
}
