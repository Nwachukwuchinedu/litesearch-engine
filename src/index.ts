// ─────────────────────────────────────────────────────────────────────────────
// LiteSearch — Public API
// ─────────────────────────────────────────────────────────────────────────────

export { LiteSearch } from "./engine";
export { LiteSearchManager } from "./manager";

export { serialize, deserialize } from "./persistence/serializer";
export { saveToFile, loadFromFile } from "./persistence/file-store";

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
  BrowseOptions,
  BrowseHit,
  BrowseResult,
  FacetConfig,
  FacetResult,
} from "./types/index";
