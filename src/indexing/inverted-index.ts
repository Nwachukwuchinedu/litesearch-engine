// ─────────────────────────────────────────────────────────────────────────────
// LiteSearch — Inverted Index
// ─────────────────────────────────────────────────────────────────────────────

import type { InvertedIndex, Postings } from "../types/index";
import { adaptiveMaxDistance } from "../core/levenshtein";
import { BKTree } from "./bk-tree";

export class InvertedIndexStore {
  /**
   * Per-field inverted indexes.
   * Structure: fieldName → term → docId → positions[]
   */
  private indexes: Map<string, InvertedIndex> = new Map();

  /** All unique terms per field — cached for prefix scan */
  private termSets: Map<string, Set<string>> = new Map();

  /** BK-tree per field for O(log n) fuzzy term lookup */
  private bkTrees: Map<string, BKTree> = new Map();

  /** Per-document term tracking: docId → field → Set<term> */
  private docTerms: Map<string, Map<string, Set<string>>> = new Map();

  /**
   * Add a term-position entry for a document in a given field.
   */
  addPosting(field: string, term: string, docId: string, position: number): void {
    if (!this.indexes.has(field)) {
      this.indexes.set(field, new Map());
      this.termSets.set(field, new Set());
      this.bkTrees.set(field, new BKTree());
    }

    const fieldIndex = this.indexes.get(field)!;
    const termSet = this.termSets.get(field)!;
    const bkTree = this.bkTrees.get(field)!;

    const isNewTerm = !fieldIndex.has(term);
    if (isNewTerm) {
      fieldIndex.set(term, new Map());
      bkTree.insert(term);
    }

    const postings = fieldIndex.get(term)!;
    if (!postings.has(docId)) {
      postings.set(docId, []);
    }
    postings.get(docId)!.push(position);
    termSet.add(term);

    // Track per-doc terms
    if (!this.docTerms.has(docId)) {
      this.docTerms.set(docId, new Map());
    }
    const fieldTerms = this.docTerms.get(docId)!;
    if (!fieldTerms.has(field)) {
      fieldTerms.set(field, new Set());
    }
    fieldTerms.get(field)!.add(term);
  }

  /**
   * Remove all postings for a given document across all fields.
   */
  removeDoc(docId: string): void {
    const docTermEntries = this.docTerms.get(docId);
    if (docTermEntries) {
      for (const [field, terms] of docTermEntries) {
        const fieldIndex = this.indexes.get(field);
        const termSet = this.termSets.get(field);
        if (!fieldIndex || !termSet) continue;

        for (const term of terms) {
          const postings = fieldIndex.get(term);
          if (postings) {
            postings.delete(docId);
            if (postings.size === 0) {
              fieldIndex.delete(term);
              termSet.delete(term);
            }
          }
        }
      }
      this.docTerms.delete(docId);
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
    const bkTree = this.bkTrees.get(field);
    const fieldIndex = this.indexes.get(field);
    if (!bkTree || !fieldIndex) return [];

    const adaptive = adaptiveMaxDistance(query, maxDistance);
    if (adaptive === 0) {
      const exact = fieldIndex.get(query);
      if (exact) return [{ term: query, postings: exact, distance: 0 }];
      return [];
    }

    const bkResults = bkTree.search(query, adaptive);
    const results: Array<{ term: string; postings: Postings; distance: number }> = [];
    for (const { term, distance } of bkResults) {
      const postings = fieldIndex.get(term);
      if (postings && postings.size > 0) {
        results.push({ term, postings, distance });
      }
    }
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

  /**
   * Check whether the given terms appear as consecutive positions
   * for a document in a field (exact phrase match).
   */
  hasExactPhrase(field: string, terms: string[], docId: string): boolean {
    if (terms.length === 0) return false;

    const fieldIndex = this.indexes.get(field);
    if (!fieldIndex) return false;

    // Get positions for each term
    const allPositions: number[][] = [];
    for (const term of terms) {
      const postings = fieldIndex.get(term);
      if (!postings) return false;
      const positions = postings.get(docId);
      if (!positions || positions.length === 0) return false;
      allPositions.push(positions);
    }

    // Pointer-based consecutive check
    // Positions are sorted ascending within each array
    const ptrs = new Array(terms.length).fill(0);

    while (ptrs[0] < allPositions[0].length) {
      const start = allPositions[0][ptrs[0]];
      let match = true;

      for (let i = 1; i < terms.length; i++) {
        // Advance pointer i until we reach or pass start + i
        while (ptrs[i] < allPositions[i].length && allPositions[i][ptrs[i]] < start + i) {
          ptrs[i]++;
        }
        // If we've passed it or run out, not a match
        if (ptrs[i] >= allPositions[i].length || allPositions[i][ptrs[i]] !== start + i) {
          match = false;
          break;
        }
      }

      if (match) return true;
      ptrs[0]++; // try next position of first term
    }

    return false;
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
    this.bkTrees.clear();
    this.docTerms.clear();
  }
}
