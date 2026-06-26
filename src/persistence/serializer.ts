// ─────────────────────────────────────────────────────────────────────────────
// LiteSearch — Serializer
// ─────────────────────────────────────────────────────────────────────────────

import { LiteSearch } from "../engine";
import type { AnyDocument, LiteSearchConfig } from "../types/index";

export interface SerializedIndex {
  version: number;
  createdAt: string;
  config: Record<string, unknown>;
  documents: AnyDocument[];
}

export function serialize(engine: LiteSearch<AnyDocument>): string {
  const exported = engine.export();
  const data: SerializedIndex = {
    version: 1,
    createdAt: new Date().toISOString(),
    config: exported.config,
    documents: exported.documents,
  };
  return JSON.stringify(data, null, 2);
}

export function deserialize<T extends AnyDocument = AnyDocument>(
  json: string,
  config: LiteSearchConfig<T>
): LiteSearch<T> {
  const data: SerializedIndex = JSON.parse(json);
  if (data.version === undefined) {
    throw new Error("Invalid serialized index: missing version field");
  }
  const engine = new LiteSearch<T>(config);
  engine.addMany(data.documents as T[]);
  return engine;
}
