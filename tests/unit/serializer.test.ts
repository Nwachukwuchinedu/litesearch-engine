import { describe, it, expect, vi } from "vitest";
import { LiteSearch } from "../../src/engine";
import {
  serialize,
  deserialize,
  MAX_DOCUMENTS,
  MAX_PAYLOAD_BYTES,
} from "../../src/persistence/serializer";
import type { AnyDocument } from "../../src/types/index";

interface TestDoc extends AnyDocument {
  id: string;
  title: string;
}

function createEngine() {
  const engine = new LiteSearch<TestDoc>({
    idField: "id",
    fields: { title: { weight: 1 } },
  });
  engine.add({ id: "1", title: "hello world" });
  engine.add({ id: "2", title: "foo bar" });
  return engine;
}

describe("serialize", () => {
  it("produces valid JSON with expected fields", () => {
    const engine = createEngine();
    const json = serialize(engine);
    const parsed = JSON.parse(json);
    expect(parsed.version).toBe(1);
    expect(parsed.createdAt).toBeDefined();
    expect(parsed.config).toBeDefined();
    expect(Array.isArray(parsed.documents)).toBe(true);
    expect(parsed.documents.length).toBe(2);
  });
});

describe("deserialize", () => {
  it("restores a valid serialized index", () => {
    const engine = createEngine();
    const json = serialize(engine);
    const restored = deserialize(json, {
      idField: "id",
      fields: { title: { weight: 1 } },
    });
    const results = restored.search("hello");
    expect(results.hits.length).toBeGreaterThanOrEqual(1);
  });

  it("throws when version field is missing", () => {
    const payload = JSON.stringify({
      documents: [],
      config: {},
    });
    expect(() =>
      deserialize(payload, { idField: "id", fields: ["title"] })
    ).toThrow("missing or invalid version");
  });

  it("throws when version field is not a number", () => {
    const payload = JSON.stringify({
      version: "1",
      documents: [],
      config: {},
    });
    expect(() =>
      deserialize(payload, { idField: "id", fields: ["title"] })
    ).toThrow("missing or invalid version");
  });

  it("throws when documents field is missing", () => {
    const payload = JSON.stringify({
      version: 1,
      config: {},
    });
    expect(() =>
      deserialize(payload, { idField: "id", fields: ["title"] })
    ).toThrow("missing or invalid documents");
  });

  it("throws when documents field is not an array", () => {
    const payload = JSON.stringify({
      version: 1,
      documents: "not-an-array",
      config: {},
    });
    expect(() =>
      deserialize(payload, { idField: "id", fields: ["title"] })
    ).toThrow("missing or invalid documents");
  });

  it("throws when config field is missing", () => {
    const payload = JSON.stringify({
      version: 1,
      documents: [],
    });
    expect(() =>
      deserialize(payload, { idField: "id", fields: ["title"] })
    ).toThrow("missing or invalid config");
  });

  it("throws when config field is null", () => {
    const payload = JSON.stringify({
      version: 1,
      config: null,
      documents: [],
    });
    expect(() =>
      deserialize(payload, { idField: "id", fields: ["title"] })
    ).toThrow("missing or invalid config");
  });

  it("throws when payload exceeds MAX_PAYLOAD_BYTES", () => {
    const oversized = "x".repeat(MAX_PAYLOAD_BYTES + 1);
    expect(() =>
      deserialize(oversized, { idField: "id", fields: ["title"] })
    ).toThrow("maximum is");
  });

  it("throws when document array exceeds MAX_DOCUMENTS", () => {
    const docs = Array.from({ length: MAX_DOCUMENTS + 1 }, (_, i) => ({
      id: String(i),
    }));
    const payload = JSON.stringify({
      version: 1,
      config: {},
      documents: docs,
    });
    expect(() =>
      deserialize(payload, { idField: "id", fields: ["title"] })
    ).toThrow(`maximum is ${MAX_DOCUMENTS}`);
  });

  it("skips null documents with a warning", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const docs = [
      { id: "1", title: "valid" },
      null,
      { id: "2", title: "also valid" },
    ];
    const payload = JSON.stringify({
      version: 1,
      config: { idField: "id", fields: { title: { weight: 1 } } },
      documents: docs,
    });
    const restored = deserialize(payload, {
      idField: "id",
      fields: { title: { weight: 1 } },
    });
    const results = restored.search("valid");
    expect(results.hits.length).toBe(2);
    expect(restored.search("also").hits.length).toBe(1);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("skips non-object documents with a warning", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const docs = [
      { id: "1", title: "hello" },
      "string-doc",
      42,
      { id: "2", title: "world" },
    ];
    const payload = JSON.stringify({
      version: 1,
      config: { idField: "id", fields: { title: { weight: 1 } } },
      documents: docs,
    });
    const restored = deserialize(payload, {
      idField: "id",
      fields: { title: { weight: 1 } },
    });
    expect(restored.search("hello").hits.length).toBe(1);
    expect(restored.search("world").hits.length).toBe(1);
    expect(warnSpy).toHaveBeenCalledTimes(2);
    warnSpy.mockRestore();
  });

  it("throws when parsed data is an array instead of object", () => {
    expect(() =>
      deserialize("[]", { idField: "id", fields: ["title"] })
    ).toThrow("expected an object");
  });

  it("throws when parsed data is null", () => {
    expect(() =>
      deserialize("null", { idField: "id", fields: ["title"] })
    ).toThrow("expected an object");
  });
});
