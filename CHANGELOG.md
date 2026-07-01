# Changelog

## [Unreleased]

### Added
- Static `LiteSearch.import()` validates serialized config against provided config on restore, warning on mismatch

### Fixed
- **Suggestion engine:** `removeDoc()` now decrements `frequency` counters and prunes nodes when frequency reaches zero, preventing inflated rankings after add/remove/add cycles
- **Filter engine:** `evaluateFilter()` now throws when both `AND` and `OR` are specified in the same filter group (they are mutually exclusive), preventing silent data loss
- **Engine:** `flattenValue()` now handles circular references gracefully using a `Set` of visited objects, preventing stack overflow on self-referencing documents
- **Levenshtein:** Changed typed arrays from `Uint16Array` to `Uint32Array` to support strings longer than 65,535 characters without overflow
