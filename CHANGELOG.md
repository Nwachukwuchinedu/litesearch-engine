# Changelog

## [Unreleased]

### Added
- Static `LiteSearch.import()` validates serialized config against provided config on restore, warning on mismatch
- `topKDocuments()` — bounded binary heap for top-k sort (O(n log k) instead of O(n log n))
- IDF caching in BM25 scorer with lazy invalidation
- Configurable input size limits: `maxQueryLength` (512), `maxTokenCount` (128), `maxDocumentSize` (1MB), `maxFieldValueSize` (10K)

### Changed
- **Highlighter:** Replaced per-token regex loop with a single combined alternation regex for O(1) regex passes
- **Suggestion engine:** Replaced recursive `_collectWords` DFS with iterative stack-based traversal to prevent stack overflow on deep tries
- **Inverted index:** `removeDoc()` no longer rebuilds term sets from scratch — uses per-doc term tracking for O(terms_in_doc) instead of O(all_terms)

### Security
- **Serializer:** `deserialize()` now validates payload size (max 500MB), document count (max 100K), and schema before processing; malformed entries are skipped with a warning

### Fixed
- **Suggestion engine:** `removeDoc()` now decrements `frequency` counters and prunes nodes when frequency reaches zero, preventing inflated rankings after add/remove/add cycles
- **Filter engine:** `evaluateFilter()` now throws when both `AND` and `OR` are specified in the same filter group (they are mutually exclusive), preventing silent data loss
- **Engine:** `flattenValue()` now handles circular references gracefully using a `Set` of visited objects, preventing stack overflow on self-referencing documents
- **Levenshtein:** Changed typed arrays from `Uint16Array` to `Uint32Array` to support strings longer than 65,535 characters without overflow
