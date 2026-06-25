// ─────────────────────────────────────────────────────────────────────────────
// LiteSearch — Trie (Prefix Tree) for Autocomplete
// ─────────────────────────────────────────────────────────────────────────────

interface TrieNode {
  children: Map<string, TrieNode>;
  /** document IDs that contain this complete token */
  docIds: Set<string>;
  /** frequency (how many times inserted) */
  frequency: number;
  /** is this a complete word endpoint? */
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

export interface TrieMatch {
  word: string;
  docIds: string[];
  frequency: number;
}

export class Trie {
  private root: TrieNode = createNode();
  private _nodeCount = 0;

  /**
   * Insert a word associated with a document ID.
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
   * Remove all entries for a given document ID.
   * Walks all paths and strips the docId.
   */
  removeDoc(docId: string): void {
    this._removeDocFromNode(this.root, docId);
  }

  private _removeDocFromNode(node: TrieNode, docId: string): void {
    node.docIds.delete(docId);
    for (const child of node.children.values()) {
      this._removeDocFromNode(child, docId);
    }
  }

  /**
   * Get all words that start with `prefix`.
   * Returns sorted by frequency DESC.
   */
  prefixSearch(prefix: string, maxResults = 10): TrieMatch[] {
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
    if (results.length >= maxResults * 3) return; // over-collect then sort

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

  /**
   * Exact lookup: does this word exist?
   */
  has(word: string): boolean {
    let node = this.root;
    for (const char of word) {
      if (!node.children.has(char)) return false;
      node = node.children.get(char)!;
    }
    return node.isWord;
  }

  /**
   * Get all unique words stored in the trie (for fuzzy suggestion lookup).
   * Lazily collected.
   */
  allWords(): TrieMatch[] {
    const results: TrieMatch[] = [];
    this._collectWords(this.root, "", results, Infinity as unknown as number);
    return results;
  }

  get nodeCount(): number {
    return this._nodeCount;
  }

  clear(): void {
    this.root = createNode();
    this._nodeCount = 0;
  }
}
