import { LiteSearch } from "./engine";
import type {
  AnyDocument,
  LiteSearchConfig,
  SearchOptions,
  SearchResult,
  SearchAllOptions,
  SearchAllResult,
  SearchHit,
  SuggestResult,
  IndexStats,
  BrowseOptions,
  BrowseResult,
} from "./types/index";

export class LiteSearchManager {
  private indexes = new Map<string, LiteSearch<AnyDocument>>();

  createIndex(name: string, config: LiteSearchConfig<AnyDocument>): void {
    if (!name || name.trim() === "") {
      throw new Error("Index name must be a non-empty string");
    }
    if (this.indexes.has(name)) {
      throw new Error(`Index "${name}" already exists`);
    }
    this.indexes.set(name, new LiteSearch(config));
  }

  private _getIndex(name: string): LiteSearch<AnyDocument> {
    const idx = this.indexes.get(name);
    if (!idx) {
      throw new Error(`Index "${name}" not found`);
    }
    return idx;
  }

  add(name: string, doc: AnyDocument): void {
    this._getIndex(name).add(doc);
  }

  addMany(name: string, docs: AnyDocument[]): void {
    this._getIndex(name).addMany(docs);
  }

  remove(name: string, id: string): void {
    this._getIndex(name).remove(id);
  }

  search(name: string, query: string, options?: SearchOptions): SearchResult<AnyDocument> {
    return this._getIndex(name).search(query, options);
  }

  suggest(name: string, prefix: string): SuggestResult {
    return this._getIndex(name).suggest(prefix);
  }

  stats(name: string): IndexStats {
    return this._getIndex(name).stats();
  }

  browse(name: string, options?: BrowseOptions): BrowseResult<AnyDocument> {
    return this._getIndex(name).browse(options);
  }

  getIndex(name: string): LiteSearch<AnyDocument> | undefined {
    return this.indexes.get(name);
  }

  removeIndex(name: string): void {
    this.indexes.delete(name);
  }

  searchAll(query: string, options?: SearchAllOptions): SearchAllResult {
    const start = Date.now();

    // Resolve which indexes to search and their score weight multipliers
    let resolved: Array<{ name: string; weight: number }>;

    if (!options?.indexes) {
      resolved = Array.from(this.indexes.keys()).map((name) => ({ name, weight: 1 }));
    } else if (Array.isArray(options.indexes)) {
      resolved = options.indexes.map((name) => ({ name, weight: 1 }));
    } else {
      resolved = Object.entries(options.indexes).map(([name, weight]) => ({ name, weight }));
    }

    // Verify all referenced indexes exist
    for (const { name } of resolved) {
      if (!this.indexes.has(name)) {
        throw new Error(`Index "${name}" not found`);
      }
    }

    const perIndex: Record<string, { total: number; took: number }> = {};
    const collected: Array<{
      hit: SearchHit<AnyDocument & { _index: string }>;
      weightedScore: number;
    }> = [];

    for (const { name, weight } of resolved) {
      const index = this.indexes.get(name)!;
      const result = index.search(query, {
        limit: Number.MAX_SAFE_INTEGER,
        offset: 0,
        filter: options?.filter,
        highlight: options?.highlight,
      });

      perIndex[name] = { total: result.total, took: result.took };

      for (const hit of result.hits) {
        const taggedDoc = { ...hit.document, _index: name } as AnyDocument & { _index: string };
        const weightedScore = hit.score * weight;
        collected.push({
          hit: { ...hit, document: taggedDoc, score: weightedScore },
          weightedScore,
        });
      }
    }

    // Cross-normalise scores to [0,1] relative to global max
    let globalMax = 1;
    for (const { weightedScore } of collected) {
      if (weightedScore > globalMax) {
        globalMax = weightedScore;
      }
    }

    for (const entry of collected) {
      entry.hit.score = entry.weightedScore / globalMax;
    }

    // Sort by score descending
    collected.sort((a, b) => b.hit.score - a.hit.score);

    const total = collected.length;
    const limit = options?.limit ?? 10;
    const offset = options?.offset ?? 0;
    const paginated = collected.slice(offset, offset + limit);
    const hits = paginated.map((entry) => entry.hit);

    return {
      hits,
      total,
      took: Date.now() - start,
      perIndex,
      query,
      pagination: { limit, offset, hasMore: offset + limit < total },
    };
  }
}
