# LiteSearch Codebase Review

## Goal
Handle **millions of documents at <15ms** search latency.

> Review date: 2026-06-30

---

## CRITICAL: Scalability Blockers

These issues prevent the engine from reaching the stated performance target.

### 1. `getFuzzy()` scans ALL terms — O(n) per fuzzy query

**File:** `src/indexing/inverted-index.ts:94-129`

Iterates every unique term in the field index and runs Levenshtein distance on each. At 1M documents with ~500K unique terms, every fuzzy query triggers 500K Levenshtein computations.

**Fix:** Use a BK-tree, n-gram index, or SymSpell for O(log n) fuzzy matching.

---

### 2. `getByPrefix()` iterates ALL terms — O(n) per prefix query

**File:** `src/indexing/inverted-index.ts:72-88`

No trie structure exists for prefix lookups. Every prefix query scans every term in the field.

**Fix:** Build a per-field trie for O(prefix length) lookups.

---

### 3. `_allWords()` traverses entire trie on fuzzy fallback

**File:** `src/suggest/suggestion-engine.ts:200`

Called on every fuzzy fallback, doing a full DFS + Levenshtein over all trie nodes. The 3-result minimum threshold doesn't help when scanning 500K items.

**Fix:** Integrate the BK-tree with the suggestion engine, or use fuzzy completion tries.

---

### 4. `_preFilterDocIds()` iterates ALL documents — O(n) per search

**File:** `src/engine.ts:467-478`

No filter-aware index exists. Every search does a full-document scan to evaluate filters, which alone exceeds 15ms at 1M docs.

**Fix:** Implement bitmap indexes or B-trees for common filter fields (category, date, price range).

---

### 5. Full original documents stored in memory

**File:** `src/indexing/document-store.ts`

Each document is stored as-is via `meta.doc`. At 1M documents averaging 1KB each, that's >1GB for raw docs alone. No option for lazy loading or disk-backed storage.

**Fix:** Provide a configurable option to not retain full documents, or use mmap-backed storage.

---

### 6. Inverted index uses nested `Map<string, Map<string, Map<string, number[]>>>`

**File:** `src/indexing/inverted-index.ts:13`

Each Map has ~72 bytes overhead in V8. For 500K terms across 50 fields, overhead alone is hundreds of MB. No compression, block-oriented storage, or skip lists.

**Fix:** Separate term dictionary from postings lists. Use typed arrays with delta-encoded positions and skip lists.

---

### 7. Tokenizer runs regex per document on indexing

**File:** `src/core/tokenizer.ts:49-51`

Regex `/[^\p{L}\p{N}']+/gu` is applied per field value. For 1M docs with 10 fields each, that's 10M regex executions.

**Fix:** Pre-compile the regex once (already done), but also consider bulk tokenization or a faster scanner for the hot path.

---

### 8. `addMany()` calls `add()` in a loop — no batching

**File:** `src/engine.ts:201-213`

Each call does individual Map inserts, tokenization, and suggestion trie updates. At 1M documents, this takes tens of minutes.

**Fix:** Batch index operations — bulk-update term frequencies, defer IDF recalculation, batch suggestion trie inserts.

---

## CORRECTNESS: Logic Bugs

### 9. Suggestion `frequency` never decremented on `removeDoc()`

**File:** `src/suggest/suggestion-engine.ts:57`

The `frequency` counter on TrieNode only ever increments. After add/remove/add cycles for the same word+doc, frequency is inflated, biasing ranking toward re-added words.

**Fix:** Decrement `frequency` on `removeDoc()` and prune nodes when frequency reaches zero.

---

### 10. AND/OR mixed filter silently ignores OR

**File:** `src/filters/filter-engine.ts:100-113`

`evaluateFilter` uses `if (AND)` first, `else if (OR)`, `else if (NOT)`. A filter like `{ AND: [...], OR: [...] }` only processes AND and silently drops OR. User gets wrong results with no warning.

**Fix:** Either validate mutually exclusive operators or support combining them explicitly.

---

### 11. `flattenValue()` can infinite loop on circular references

**File:** `src/engine.ts:59-64`

Calling `Object.values()` on an object with circular references (e.g., `doc.parent = doc`) causes stack overflow.

**Fix:** Add a `Set` of visited references to detect cycles.

---

### 12. `deserialize()` requires duplicate config with no validation

**File:** `src/engine.ts:450-455`

`idResolver` functions are lost during JSON serialization. `deserialize()` requires the full config to be passed again, but there's no validation that the config matches the original. If `idResolver` was used, imported documents fail on `add()` because IDs can't be extracted.

**Fix:** Warn or throw when custom `idResolver` cannot be validated against serialized data.

---

### 13. `Uint16Array` overflow for long strings

**File:** `src/core/levenshtein.ts:26-27`

If either string exceeds 65535 characters, `curr[lb]` and `prev[lb]` overflow silently (Uint16 max is 65535).

**Fix:** Use `Uint32Array` or a plain `Array` for the distance matrix.

---

## SECURITY Issues

### 14. `JSON.parse()` without schema validation

**File:** `src/persistence/serializer.ts:30`

A crafted payload with billions of documents could cause OOM. Only checks `version` exists before passing `data.documents` to `addMany()`.

**Fix:** Validate payload size and schema before processing. Cap the number of documents accepted in one call.

---

### 15. No input size limits

**File:** `src/engine.ts:138-195`

No maximum query length, document size, or field value size. A 1MB query string with 100K tokens runs Levenshtein on each against all indexed terms.

**Fix:** Add configurable limits for query length, token count per query, and document/field size. Reject oversized inputs early.

---

### 16. RegExp construction per highlight token (low risk)

**File:** `src/search/highlighter.ts:59-62`

Multiple regexes created and matched per token. `escapeRegex()` does prevent injection, but many tokens means many regex executions.

**Fix:** Pre-compile a single combined regex for all query tokens.

---

## PERFORMANCE: Hot-Path Inefficiencies

### 17. `hasExactPhrase()` iterates all positions of the first term

**File:** `src/indexing/inverted-index.ts:185-219`

For a high-frequency term with thousands of positions per document, this loop is wasteful. No early exit using positional index gaps.

**Fix:** Use skip lists or gap-based position search for phrase matching.

---

### 18. IDF recomputed per query term

**File:** `src/core/bm25.ts:54`

`log((N - df + 0.5) / (df + 0.5) + 1)` is computed for every `scoreField()` call. N and df are constant for a given term between index mutations.

**Fix:** Cache IDF values, update lazily on index changes.

---

### 19. `_collectWords` uses recursion for DFS on trie

**File:** `src/suggest/suggestion-engine.ts:179-198`

Recursion depth could reach hundreds of levels (length of longest word). Risk of stack overflow with 500K nodes. The early-exit check `results.length >= maxResults * 3` still traverses large portions.

**Fix:** Use iterative traversal with explicit stack. Consider a more aggressive early-exit strategy.

---

### 20. `removeDoc()` rebuilds term sets from scratch

**File:** `src/indexing/inverted-index.ts:45-58`

Iterates every term across every field to recreate `termSets`. O(all terms × fields) per document removal.

**Fix:** Track per-document term sets separately and use set difference rather than full rebuild.

---

### 21. Sorting is O(n log n) on candidate set

**File:** `src/search/sorter.ts:18-50`

All candidates are sorted even if user only wants limit=10. A bounded priority queue (heap) of size `limit + offset` would be O(n log k) vs O(n log n).

**Fix:** Use a binary heap of size `limit + offset` instead of full sort.

---

### 22. Entire search pipeline is synchronous

**File:** `src/engine.ts:256-321`

Blocks the Node.js event loop for the duration of every search. At 1M docs with 15ms per query, max throughput is ~66 queries/sec on a single thread.

**Fix:** Consider worker threads for query processing, or async iteration for large result sets. At minimum, document that the library blocks the event loop.

---

## ARCHITECTURAL: Design Limitations for Scale

| # | Concern | Details |
|---|---------|---------|
| A | **No disk-based index** | Everything in-memory. RAM for 1M docs with full inverted index + original docs would be 2-5GB+. No memory-mapped files or tiered storage. |
| B | **No index sharding/partitioning** | Single index cannot be distributed. No horizontal scaling. |
| C | **No read-write isolation** | Indexing blocks searches and vice versa. No MVCC or lock-free reads. |
| D | **No query caching** | Identical queries within short time windows are recomputed from scratch. |
| E | **No term-dictionary separation** | Terms stored as raw Map keys. No separation from postings lists, preventing efficient compression. |
| F | **No skip lists / frame of reference** | Positions stored as raw number arrays. No delta encoding or skip lists. |
| G | **Single-threaded only** | No Web Worker or worker_threads usage for parallel indexing or query processing. |
| H | **No incremental TF updates** | Adding a document changes IDF values for existing terms, but scores computed at query time from current state. Combined with O(n) scans, this compounds latency. |

---

## PRIORITIZED RECOMMENDATIONS

### Immediate (for correctness and basic performance)

1. Fix circular reference crash in `flattenValue()` — add cycle detection.
2. Fix AND/OR filter silent drop — validate or combine operators.
3. Fix `Uint16Array` overflow — change to `Uint32Array`.
4. Decrement suggestion frequency on doc removal.
5. Defer IDF recomputation and cache values.

### Short-term (for 100K+ docs at <50ms)

6. Replace prefix scan with a per-field trie.
7. Implement a bounded priority heap for top-k results.
8. Batch index operations in `addMany()`.
9. Add input size limits (query length, doc size).

### Medium-term (for 500K+ docs at <15ms)

10. Replace fuzzy term scan with BK-tree or n-gram index.
11. Implement filter-aware indexes (bitmaps / B-trees).
12. Separate term dictionary from postings; use typed arrays and delta encoding.
13. Add optional disk-backed storage (mmap).
14. Use worker threads for parallel query processing.

### Long-term (for 1M+ docs at <15ms)

15. Shard index across multiple cores/machines.
16. Implement read-write isolation with MVCC.
17. Add query result caching with TTL.
18. Consider WebAssembly or native addon for hot-path loops (Levenshtein, BM25).

---

## FULL IMPLEMENTATION PLAN: 100K Products + 10K Concurrent Users

### Layer 1 — Engine Performance Fixes (100K products at <15ms latency)

| # | Fix | File(s) | Effort | Impact |
|---|-----|---------|--------|--------|
| L1.1 | **BK-tree** for fuzzy matching — replace O(n) Levenshtein scan with O(log n) | `inverted-index.ts`, new `src/indexing/bk-tree.ts` | Medium | ~95% of fuzzy latency eliminated |
| L1.2 | **Per-field trie** for prefix lookups — O(prefix length) instead of O(all terms) | `inverted-index.ts`, new `src/indexing/prefix-trie.ts` | Medium | Prefix queries become instant |
| L1.3 | **Bitmap indexes** for filter fields — O(1) filter evaluation instead of O(n) doc scan | `engine.ts`, `filter-engine.ts`, new `src/indexing/bitmap-index.ts` | Medium | Filter latency drops from ms to µs |
| L1.4 | **Configurable doc retention** + mmap-backed storage — first-class `storeDocuments` option, mmap for index data | `document-store.ts`, new `src/storage/mmap-store.ts` | High | RAM drops from GB to MB for doc storage |
| L1.5 | **Term dictionary + typed array postings** — separate term dict from postings; delta-encoded positions; typed arrays with skip lists | `inverted-index.ts` | High | 3-5x memory reduction, faster iteration |
| L1.6 | **Bounded heap** for top-k sort — O(n log k) instead of O(n log n) | `sorter.ts` | Low | Sort of 500K candidates for top-10 drops from ~10M ops to ~500K ops |
| L1.7 | **Cached IDF** — compute on index mutation, not per query | `bm25.ts` | Low | ~20% query latency reduction |
| L1.8 | **Batch addMany** — bulk term frequency updates, deferred IDF, batch trie inserts | `engine.ts` | Medium | Bulk indexing 10-100x faster |
| L1.9 | **Input size limits** — configurable max query length, token count, doc size, field value size | `engine.ts` | Low | Prevents abuse/OOM |
| L1.10 | **Combined highlight regex** — single pre-compiled regex for all query tokens | `highlighter.ts` | Low | Highlight loop O(tokens) -> O(1) regex passes |
| L1.11 | **Iterative trie traversal** — replace recursion with explicit stack in `_collectWords` | `suggestion-engine.ts` | Low | No stack overflow risk at 500K nodes |
| L1.12 | **Per-doc term tracking** — set difference instead of full rebuild on `removeDoc()` | `inverted-index.ts` | Low | Doc removal O(terms_in_doc) instead of O(all_terms) |
| L1.13 | **Gap-based position search** — skip lists for phrase matching | `inverted-index.ts` | Medium | Phrase match O(log positions) instead of O(all positions) |
| L1.14 | **Lazy loaded/phased serialization** — validate payload size and schema before processing; cap documents per call | `serializer.ts` | Low | Prevents OOM from crafted payloads |

### Layer 2 — Concurrency & Caching (10K concurrent users throughput)

| # | Feature | What It Does | Effort |
|---|---------|-------------|--------|
| L2.1 | **Worker thread pool** | Pool of Node.js worker threads (one per core). Each thread gets its own read-only index snapshot. Search dispatched to pool, returning `Promise<SearchResult>`. Write ops update all threads or use single-writer + broadcast. | High |
| L2.2 | **Non-blocking async API** | `search()` returns `Promise<SearchResult>` via worker pool. Backward-compatible: sync mode for small datasets, async mode for scale. | Medium |
| L2.3 | **LRU query cache** | Cache key = hash(query + filters + sort + offset + limit + facets). Configurable TTL and max entries (e.g., 10K entries, 30s TTL). Per-worker-thread to avoid locking. | Medium |
| L2.4 | **Read-write isolation (snapshot swap)** | Writes go to a *pending* buffer. Readers always see a consistent snapshot. On write commit, snapshot atomically swapped. No locks during reads. | Medium |

### Layer 3 — Distributed Infrastructure (application-level)

```
                         ┌──────────────┐
                         │  Load        │
                         │  Balancer    │
                         │ (nginx/HA)   │
                         └──────┬───────┘
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                 │
       ┌──────┴──────┐  ┌──────┴──────┐  ┌──────┴──────┐
       │ Process 1   │  │ Process 2   │  │ Process N   │
       │ 8 workers   │  │ 8 workers   │  │ 8 workers   │
       │ Query Cache │  │ Query Cache │  │ Query Cache │
       └──────┬──────┘  └──────┬──────┘  └──────┬──────┘
              │                 │                 │
       ┌──────┴──────┐  ┌──────┴──────┐  ┌──────┴──────┐
       │ Index Copy  │  │ Index Copy  │  │ Index Copy  │
       │ (mmap)      │  │ (mmap)      │  │ (mmap)      │
       └─────────────┘  └─────────────┘  └─────────────┘
```

| # | Component | Responsibility | Notes |
|---|-----------|---------------|-------|
| L3.1 | **`LiteSearchServer` class** | Built-in HTTP server wrapping engine with worker pool, cache, and clustering support | New file: `src/server.ts`. Uses Node.js `http` module (zero extra deps). REST API: `GET /search`, `POST /add`, `POST /addMany`, `POST /remove`, `GET /suggest`, `GET /stats`. |
| L3.2 | **Node.js cluster mode** | `LiteSearchServer` starts with `--cluster N` flag, spawning N child processes sharing port. Each process has its own worker pool + cache. | Uses built-in `cluster` module. OS-level load balancing. |
| L3.3 | **Index replication / sync** | Write arriving at any process broadcast to all peers (HTTP broadcast or Redis pub/sub). Each process applies write locally and swaps snapshots. | Configurable sync strategy: `local` (single process, no sync), `broadcast` (HTTP fan-out), `redis` (pub/sub channels). |
| L3.4 | **Health checks & metrics** | `GET /health` endpoint, Prometheus-format metrics (query latency p50/p95/p99, cache hit rate, worker pool saturation, memory usage). | New file: `src/metrics.ts`. |

### Execution Phases & Timeline

| Phase | What | Items | Estimated Effort |
|-------|------|-------|-----------------|
| **Phase 1** | Correctness + quick wins | L1.6, L1.7, L1.9, L1.10, L1.11, L1.12, L1.14 + existing items 9-13 | **1-2 days** |
| **Phase 2** | Performance foundations | L1.8 (batch addMany), L2.3 (LRU cache), L1.13 (gap position search) | **2-3 days** |
| **Phase 3** | Index structures overhaul | L1.1 (BK-tree), L1.2 (prefix trie), L1.3 (bitmap indexes) | **5-7 days** |
| **Phase 4** | Memory overhaul | L1.4 (mmap + configurable doc retention), L1.5 (term dict + typed arrays) | **5-7 days** |
| **Phase 5** | Concurrency | L2.1 (worker pool), L2.2 (async API), L2.4 (snapshot isolation) | **3-5 days** |
| **Phase 6** | Server + distributed | L3.1 (`LiteSearchServer`), L3.2 (cluster mode), L3.3 (index sync), L3.4 (metrics) | **3-5 days** |

**Total: ~3-4 weeks** for a complete production-ready solution capable of 100K products at <15ms latency and 10K concurrent users with appropriate infrastructure.

### Target Architecture Summary

```
Client -> Load Balancer -> LiteSearchServer (cluster of N processes)
                                   |
                          +--------+--------+
                          |  Worker Pool    |
                          |  (8 threads)    |
                          |  + LRU Cache    |
                          +--------+--------+
                                   |
                          +--------+--------+
                          |  Index Snapshot  |
                          |  (mmap, RO)      |
                          +-----------------+
                                   |
                          Write Ops -> Broadcast -> Peers
```

Each component is independently deployable:
- **Single-process mode** (default): backward-compatible, no infra needed
- **Multi-core mode**: one machine, cluster of workers, shared port
- **Multi-machine mode**: load balancer + N servers + Redis sync
