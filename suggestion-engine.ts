// ─────────────────────────────────────────────────────────────────────────────
// LiteSearch — Suggestion Engine (Autocomplete)
// ─────────────────────────────────────────────────────────────────────────────

import { Trie } from "../core/trie.js";
import { levenshtein, adaptiveMaxDistance } from "../core/levenshtein.js";
import type { SuggestResult, SuggestionHit } from "../types/index.js";

export class SuggestionEngine {
  private trie: Trie = new Trie();
  private maxResults: number;

  constructor(maxResults = 10) {
    this.maxResults = maxResults;
  }

  /**
   * Index a word for a given document.
   */
  insert(word: string, docId: string): void {
    this.trie.insert(word, docId);
  }

  /**
   * Remove all suggestions associated with a document.
   */
  removeDoc(docId: string): void {
    this.trie.removeDoc(docId);
  }

  /**
   * Get autocomplete suggestions for a query prefix.
   * Strategy:
   *   1. Exact prefix match via trie (very fast)
   *   2. Fuzzy fallback if prefix yields < 3 results
   */
  suggest(query: string, maxFuzzyDistance = 2): SuggestResult {
    const start = Date.now();
    const q = query.toLowerCase().trim();

    if (!q || q.length < 1) {
      return { suggestions: [], took: 0, query };
    }

    const hits: SuggestionHit[] = [];
    const seen = new Set<string>();

    // ── 1. Prefix matches via Trie ──────────────────────────────────────────
    const prefixMatches = this.trie.prefixSearch(q, this.maxResults * 2);

    for (const match of prefixMatches) {
      if (seen.has(match.word)) continue;
      seen.add(match.word);

      hits.push({
        text: match.word,
        documentIds: match.docIds,
        frequency: match.frequency,
        matchType: match.word === q ? "exact" : "prefix",
        distance: match.word === q ? 0 : 0,
      });
    }

    // ── 2. Fuzzy fallback if not enough prefix results ──────────────────────
    if (hits.length < 3 && q.length >= 4) {
      const adaptive = adaptiveMaxDistance(q, maxFuzzyDistance);
      if (adaptive > 0) {
        const allWords = this.trie.allWords();

        for (const match of allWords) {
          if (seen.has(match.word)) continue;
          if (Math.abs(match.word.length - q.length) > adaptive) continue;

          const dist = levenshtein(q, match.word, adaptive);
          if (dist <= adaptive) {
            seen.add(match.word);
            hits.push({
              text: match.word,
              documentIds: match.docIds,
              frequency: match.frequency,
              matchType: "fuzzy",
              distance: dist,
            });
          }
        }
      }
    }

    // ── 3. Rank: exact > prefix > fuzzy, then by frequency ─────────────────
    const ranked = hits
      .sort((a, b) => {
        const typePriority = { exact: 0, prefix: 1, fuzzy: 2 };
        const tp = typePriority[a.matchType] - typePriority[b.matchType];
        if (tp !== 0) return tp;
        return b.frequency - a.frequency;
      })
      .slice(0, this.maxResults);

    return {
      suggestions: ranked,
      took: Date.now() - start,
      query,
    };
  }

  get nodeCount(): number {
    return this.trie.nodeCount;
  }

  clear(): void {
    this.trie.clear();
  }
}
