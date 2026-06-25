import { describe, it, expect } from "vitest";
import { DocumentStore } from "../../src/indexing/document-store";
import type { DocMeta } from "../../src/types/index";

function createMeta(overrides: Partial<DocMeta> & { id: string }): DocMeta {
  return {
    fieldLengths: {},
    doc: { id: overrides.id },
    ...overrides,
  };
}

describe("DocumentStore", () => {
  describe("add and get", () => {
    it("stores and retrieves document metadata", () => {
      const store = new DocumentStore();
      const meta = createMeta({
        id: "doc1",
        fieldLengths: { title: 10 },
      });
      store.add(meta);
      const retrieved = store.get("doc1");
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe("doc1");
      expect(retrieved!.fieldLengths).toEqual({ title: 10 });
    });
  });

  describe("has", () => {
    it("returns true for existing document", () => {
      const store = new DocumentStore();
      store.add(createMeta({ id: "doc1" }));
      expect(store.has("doc1")).toBe(true);
    });

    it("returns false for non-existent document", () => {
      const store = new DocumentStore();
      expect(store.has("nonexistent")).toBe(false);
    });
  });

  describe("remove", () => {
    it("removes document and returns true", () => {
      const store = new DocumentStore();
      store.add(createMeta({ id: "doc1" }));
      expect(store.remove("doc1")).toBe(true);
      expect(store.has("doc1")).toBe(false);
    });

    it("returns false for non-existent document", () => {
      const store = new DocumentStore();
      expect(store.remove("nonexistent")).toBe(false);
    });
  });

  describe("getAll", () => {
    it("returns all stored document metadata", () => {
      const store = new DocumentStore();
      store.add(createMeta({ id: "doc1" }));
      store.add(createMeta({ id: "doc2" }));
      const all = store.getAll();
      expect(all.length).toBe(2);
      expect(all.map((m) => m.id).sort()).toEqual(["doc1", "doc2"]);
    });
  });

  describe("avgFieldLength", () => {
    it("returns correct average for a field", () => {
      const store = new DocumentStore();
      store.add(
        createMeta({ id: "doc1", fieldLengths: { title: 10 } })
      );
      store.add(
        createMeta({ id: "doc2", fieldLengths: { title: 20 } })
      );
      expect(store.avgFieldLength("title")).toBe(15);
    });

    it("returns 1 when no documents exist for a field", () => {
      const store = new DocumentStore();
      expect(store.avgFieldLength("title")).toBe(1);
    });
  });

  describe("estimateMemory", () => {
    it("returns a number greater than 0", () => {
      const store = new DocumentStore();
      store.add(
        createMeta({
          id: "doc1",
          doc: { id: "doc1", title: "hello world" },
          fieldLengths: { title: 2 },
        })
      );
      expect(store.estimateMemory()).toBeGreaterThan(0);
    });
  });

  describe("clear", () => {
    it("removes all documents", () => {
      const store = new DocumentStore();
      store.add(createMeta({ id: "doc1" }));
      store.add(createMeta({ id: "doc2" }));
      store.clear();
      expect(store.size).toBe(0);
      expect(store.getAll()).toEqual([]);
    });

    it("resets field totals", () => {
      const store = new DocumentStore();
      store.add(
        createMeta({ id: "doc1", fieldLengths: { title: 10 } })
      );
      store.clear();
      expect(store.avgFieldLength("title")).toBe(1);
    });
  });
});
