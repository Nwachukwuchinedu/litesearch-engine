import { levenshtein } from "../core/levenshtein";

interface BKNode {
  term: string;
  children: Map<number, BKNode>;
}

export class BKTree {
  private root: BKNode | null = null;
  private _size: number = 0;

  insert(term: string): void {
    if (!this.root) {
      this.root = { term, children: new Map() };
      this._size = 1;
      return;
    }

    let node = this.root;
    while (true) {
      const dist = levenshtein(term, node.term, Infinity);
      if (node.children.has(dist)) {
        node = node.children.get(dist)!;
      } else {
        node.children.set(dist, { term, children: new Map() });
        this._size++;
        return;
      }
    }
  }

  search(
    query: string,
    maxDistance: number
  ): Array<{ term: string; distance: number }> {
    const results: Array<{ term: string; distance: number }> = [];
    if (!this.root) return results;

    const stack: BKNode[] = [this.root];

    while (stack.length > 0) {
      const node = stack.pop()!;
      const dist = levenshtein(query, node.term, Infinity);

      if (dist <= maxDistance) {
        results.push({ term: node.term, distance: dist });
      }

      const minDist = dist - maxDistance;
      const maxDist = dist + maxDistance;

      for (const [childDist, child] of node.children) {
        if (childDist >= minDist && childDist <= maxDist) {
          stack.push(child);
        }
      }
    }

    results.sort((a, b) => a.distance - b.distance || a.term.localeCompare(b.term));
    return results;
  }

  get size(): number {
    return this._size;
  }

  clear(): void {
    this.root = null;
    this._size = 0;
  }
}
