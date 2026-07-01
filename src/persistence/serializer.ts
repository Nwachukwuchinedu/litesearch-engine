// ─────────────────────────────────────────────────────────────────────────────
// LiteSearch — Serializer
// ─────────────────────────────────────────────────────────────────────────────

import { LiteSearch } from "../engine";
import type { AnyDocument, LiteSearchConfig } from "../types/index";

export const MAX_DOCUMENTS = 100000;
export const MAX_PAYLOAD_BYTES = 500 * 1024 * 1024;

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
  if (json.length > MAX_PAYLOAD_BYTES) {
    throw new Error(
      `Serialized payload is ${json.length} bytes, maximum is ${MAX_PAYLOAD_BYTES}`
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("Invalid serialized index: invalid JSON");
  }

  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Invalid serialized index: expected an object");
  }

  const obj = data as Record<string, unknown>;

  if (obj.version === undefined || typeof obj.version !== "number") {
    throw new Error("Invalid serialized index: missing or invalid version field");
  }

  if (obj.config === undefined || obj.config === null || typeof obj.config !== "object" || Array.isArray(obj.config)) {
    throw new Error("Invalid serialized index: missing or invalid config field");
  }

  if (obj.documents === undefined || !Array.isArray(obj.documents)) {
    throw new Error("Invalid serialized index: missing or invalid documents field");
  }

  const docs = obj.documents as unknown[];

  if (docs.length > MAX_DOCUMENTS) {
    throw new Error(
      `Serialized index contains ${docs.length} documents, maximum is ${MAX_DOCUMENTS}`
    );
  }

  const validDocs: AnyDocument[] = [];
  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
      console.warn(
        `Skipping document at index ${i}: expected a non-null object, got ${typeof doc}`
      );
      continue;
    }
    validDocs.push(doc as AnyDocument);
  }

  const engine = new LiteSearch<T>(config);
  engine.addMany(validDocs as T[]);
  return engine;
}
