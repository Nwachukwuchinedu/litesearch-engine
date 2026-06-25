// ─────────────────────────────────────────────────────────────────────────────
// LiteSearch — Public API
// ─────────────────────────────────────────────────────────────────────────────

export { LiteSearch } from "./engine";

export type {
  AnyDocument,
  FieldConfig,
  LiteSearchConfig,
  FilterOperator,
  FilterClause,
  FilterGroup,
  SearchOptions,
  HighlightResult,
  SearchHit,
  SearchResult,
  SuggestionHit,
  SuggestResult,
  IndexStats,
} from "./types/index";
