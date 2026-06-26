// ─────────────────────────────────────────────────────────────────────────────
// LiteSearch — Suggestion Engine (Autocomplete)
// ─────────────────────────────────────────────────────────────────────────────

import { levenshtein, adaptiveMaxDistance } from "../core/levenshtein.js";
import type { SuggestResult, SuggestionHit } from "../types/index.js";

// ── Internal trie types (not exported) ──────────────────────────────────────

interface TrieNode {
  children: Map<string, TrieNode>;
  docIds: Set<string>;
  frequency: number;
  isWord: boolean;
}

function createNode(): TrieNode {
  return {
    children: new Map(),
    docIds: new Set(),
    frequency: 0,
    isWord: false,
  };
}

interface TrieMatch {
  word: string;
  docIds: string[];
  frequency: number;
}

export class SuggestionEngine {
  private root: TrieNode = createNode();
  private _nodeCount = 0;
  private maxResults: number;

  constructor(maxResults = 10) {
    this.maxResults = maxResults;
  }

  /**
   * Index a word for a given document.
   */
  insert(word: string, docId: string): void {
    let node = this.root;

    for (const char of word) {
      if (!node.children.has(char)) {
        node.children.set(char, createNode());
        this._nodeCount++;
      }
      node = node.children.get(char)!;
      node.docIds.add(docId);
    }

    node.isWord = true;
    node.frequency++;
    node.docIds.add(docId);
  }

  /**
   * Remove all suggestions associated with a document.
   */
  removeDoc(docId: string): void {
    this._removeDocFromNode(this.root, docId);
  }

  private _removeDocFromNode(node: TrieNode, docId: string, parent?: TrieNode, char?: string): void {
    node.docIds.delete(docId);
    for (const [ch, child] of node.children) {
      this._removeDocFromNode(child, docId, node, ch);
    }
    if (parent && char && node.docIds.size === 0 && node.children.size === 0 && !node.isWord) {
      parent.children.delete(char);
      this._nodeCount--;
    }
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
    const prefixMatches = this._prefixSearch(q, this.maxResults * 2);

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
        const allWords = this._allWords();

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
    return this._nodeCount;
  }

  clear(): void {
    this.root = createNode();
    this._nodeCount = 0;
  }

  // ── Private trie helpers ──────────────────────────────────────────────────

  private _prefixSearch(prefix: string, maxResults: number): TrieMatch[] {
    let node = this.root;

    for (const char of prefix) {
      if (!node.children.has(char)) return [];
      node = node.children.get(char)!;
    }

    const results: TrieMatch[] = [];
    this._collectWords(node, prefix, results, maxResults);

    return results.sort((a, b) => b.frequency - a.frequency).slice(0, maxResults);
  }

  private _collectWords(
    node: TrieNode,
    current: string,
    results: TrieMatch[],
    maxResults: number
  ): void {
    if (results.length >= maxResults * 3) return;

    if (node.isWord && node.docIds.size > 0) {
      results.push({
        word: current,
        docIds: [...node.docIds],
        frequency: node.frequency,
      });
    }

    for (const [char, child] of node.children) {
      this._collectWords(child, current + char, results, maxResults);
    }
  }

  private _allWords(): TrieMatch[] {
    const results: TrieMatch[] = [];
    this._collectWords(this.root, "", results, Infinity as unknown as number);
    return results;
  }
}
