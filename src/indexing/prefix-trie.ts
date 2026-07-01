interface PrefixTrieNode {
  children: Map<string, PrefixTrieNode>;
  terms: Set<string>;
  isTerminal: boolean;
}

export class PrefixTrie {
  private root: PrefixTrieNode;
  private _size: number = 0;

  constructor() {
    this.root = this.createNode();
  }

  private createNode(): PrefixTrieNode {
    return {
      children: new Map(),
      terms: new Set(),
      isTerminal: false,
    };
  }

  insert(term: string): void {
    if (this.has(term)) return;

    let node = this.root;
    for (const char of term) {
      if (!node.children.has(char)) {
        node.children.set(char, this.createNode());
      }
      node = node.children.get(char)!;
      node.terms.add(term);
    }
    node.isTerminal = true;
    this._size++;
  }

  search(prefix: string): string[] {
    let node = this.root;
    for (const char of prefix) {
      if (!node.children.has(char)) return [];
      node = node.children.get(char)!;
    }
    return [...node.terms];
  }

  delete(term: string): boolean {
    if (!this.has(term)) return false;

    let node = this.root;
    for (const char of term) {
      if (!node.children.has(char)) return false;
      node = node.children.get(char)!;
      node.terms.delete(term);
    }
    node.isTerminal = false;
    this._size--;
    return true;
  }

  has(term: string): boolean {
    let node = this.root;
    for (const char of term) {
      if (!node.children.has(char)) return false;
      node = node.children.get(char)!;
    }
    return node.isTerminal;
  }

  get size(): number {
    return this._size;
  }

  clear(): void {
    this.root = this.createNode();
    this._size = 0;
  }
}
