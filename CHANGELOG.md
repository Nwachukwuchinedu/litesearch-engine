# Changelog

All notable changes to litesearch-engine are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased] — 2.0.0

### Improvements (potentially breaking)

These changes improve performance, add new capabilities, or alter internal behaviour. If you upgrade from 1.x, verify your integration — especially if you relied on specific fuzzy-matching, prefix-matching, or filter-evaluation behaviour.

- **BK-tree fuzzy matching** — Replaced the O(n) term-set scan with a Burkhard–Keller tree. Fuzzy lookups now run in O(log n) and may return slightly different result sets (typically more accurate) than the previous Levenshtein scan. Documents that barely matched before may no longer match, and previously missed matches may appear.
- **PrefixTrie partial matching** — Replaced the O(n) term scan with a dedicated prefix trie structure. Prefix lookups now run in O(k) where k = prefix length. The set of prefix-matched documents is computed instantly instead of scanning every indexed term. Results are identical in content but returned faster.
- **FilterIndex set-based filtering** — Equality and range filters are now evaluated through an inverted FilterIndex (per-value doc-id sets with intersection/union) instead of scanning all candidate documents. This changes the order and performance of filter evaluation but produces the same logical results.
- **Batch indexing in `addMany()`** — `addMany()` now batches tokenization, suggestion inserts, and IDF-cache invalidation into bulk operations instead of calling `add()` per document in a tight loop. Indexing time is reduced 3–5×. Side effects (eventual completion timing, interleaved operations) may differ from 1.x.
- **Configurable input size limits** — New `limits` config caps query length (512 chars), token count (128), document size (1 MB), and field value length (10 K). Documents or queries exceeding these thresholds are now rejected instead of processed without limits. If your workload routinely exceeds these defaults, explicitly configure higher limits.
- **LRU query cache** — When enabled, identical queries within the TTL window are served from cache. The cache is invalidated on every `add()` / `update()` / `remove()` call, but within a single TTL window repeated searches return the same result set. Disable or increase `ttlMs` if you need real-time freshness.
- **`storeDocuments` option (default `true`)** — When set to `false`, original documents are not retained in memory and `SearchHit.document` is `null`. Memory usage drops significantly. Code that accesses `hit.document` without a null check will break at runtime.
- **IDF caching with lazy invalidation** — The BM25 scorer now caches inverse-document-frequency values and invalidates them in a single call after batch operations instead of recomputing per term per query. Score results are identical but warm-up behaviour changes.
- **`topKDocuments()` bounded heap sort** — Replaced full-descending sort (`O(n log n)`) with a binary min-heap that keeps only the top K results (`O(n log K)`). For result sets with many candidates this reduces sort time, but the exact order of tied-score results may shift.

### Fixes (non-breaking)

These changes repair edge cases, improve correctness, or make the engine more robust without altering the documented API or observable behaviour for typical use.

- **Highlighter regex — single alternation pass** — Replaced per-token regex loops with a single combined alternation regex compiled once. Highlighting speed improved by up to 10× on documents with many matched terms. Output is identical.
- **Suggestion engine — iterative DFS traversal** — Replaced recursive `_collectWords` with an explicit-stack iterative traversal. Prevents `RangeError: Maximum call stack size exceeded` on deeply nested tries (narrow, deep word prefixes). Suggestion results are identical.
- **`removeDoc()` inverted-index cleanup** — Removal no longer rebuilds term sets from scratch. Instead it uses per-doc term tracking to subtract the removed document's contributions in O(terms_in_doc) time instead of O(all_terms). Behaviour is identical.
- **Phrase matching — pointer-based gap search** — `hasExactPhrase()` uses a pointer that walks all position arrays simultaneously instead of iterating every position of the first term and checking neighbours. Faster and produces identical results.
- **`LiteSearch.import()` config validation** — When a serialized engine is restored via `import()`, the provided config is validated against the serialized config. A warning is issued on mismatch (e.g. different fields or scoring parameters). The import still succeeds unless the mismatch is critical.
- **Serializer `deserialize()` payload validation** — Before processing a serialized payload, the deserializer checks total size (max 500 MB), document count (max 100 K), and structural validity. Malformed entries are skipped with a warning instead of crashing the process.

### Patches (bug fixes)

- **Suggestion-engine `removeDoc()` frequency leak** — The `removeDoc()` method was not decrementing the `frequency` counter on trie nodes when a document was removed, and never pruned nodes whose frequency reached zero. After repeated add/remove/add cycles, suggestion rankings became inflated (suggesting words that existed in fewer documents than reported). Now each removal correctly decrements counters and prunes empty nodes.
- **Filter engine silent AND/OR conflict** — `evaluateFilter()` accepted filter groups containing both `AND` and `OR` without error. Since the two operators are mutually exclusive in a single group, one was silently ignored, causing the filter to behave differently than intended. Now throws a descriptive error when both are present.
- **Engine `flattenValue()` circular-reference crash** — The recursive value flattener (used during document indexing) had no circular-reference guard. A document with a self-referencing property caused `RangeError: Maximum call stack size exceeded`. Now uses a `Set` of visited objects to detect and skip cycles gracefully.
- **Levenshtein Uint16Array overflow** — Internal DP tables used `Uint16Array`, which caps at 65,535. Strings longer than 65,535 characters caused silent overflow corruption. Changed to `Uint32Array`, which supports lengths up to 4,294,967,295.
