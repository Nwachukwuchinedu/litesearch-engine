import { describe, it, expect } from "vitest";
import { LRUCache } from "../../src/cache/lru-cache";

describe("LRUCache", () => {
  it("basic get/set works", () => {
    const cache = new LRUCache<string, number>(5, 60000);
    cache.set("a", 1);
    expect(cache.get("a")).toBe(1);
  });

  it("returns undefined for missing key", () => {
    const cache = new LRUCache<string, number>(5, 60000);
    expect(cache.get("nonexistent")).toBeUndefined();
  });

  it("evicts oldest entry when over capacity", () => {
    const cache = new LRUCache<string, number>(3, 60000);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    cache.set("d", 4); // should evict "a"

    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
    expect(cache.get("c")).toBe(3);
    expect(cache.get("d")).toBe(4);
  });

  it("evicts least recently used entry", () => {
    const cache = new LRUCache<string, number>(3, 60000);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    // Access "a" to make it recently used
    cache.get("a");
    cache.set("d", 4); // should evict "b" (least recently used)

    expect(cache.get("a")).toBe(1);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("c")).toBe(3);
    expect(cache.get("d")).toBe(4);
  });

  it("respects TTL expiration", async () => {
    const cache = new LRUCache<string, number>(5, 50); // 50ms TTL
    cache.set("a", 1);
    expect(cache.get("a")).toBe(1);

    // Wait for TTL to expire
    await new Promise((r) => setTimeout(r, 60));
    expect(cache.get("a")).toBeUndefined();
  });

  it("delete removes entry", () => {
    const cache = new LRUCache<string, number>(5, 60000);
    cache.set("a", 1);
    expect(cache.delete("a")).toBe(true);
    expect(cache.get("a")).toBeUndefined();
  });

  it("delete returns false for missing key", () => {
    const cache = new LRUCache<string, number>(5, 60000);
    expect(cache.delete("nonexistent")).toBe(false);
  });

  it("clear empties the cache", () => {
    const cache = new LRUCache<string, number>(5, 60000);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it("size reflects entry count", () => {
    const cache = new LRUCache<string, number>(5, 60000);
    expect(cache.size).toBe(0);
    cache.set("a", 1);
    expect(cache.size).toBe(1);
    cache.set("b", 2);
    expect(cache.size).toBe(2);
  });

  it("has returns correct boolean", () => {
    const cache = new LRUCache<string, number>(5, 60000);
    cache.set("a", 1);
    expect(cache.has("a")).toBe(true);
    expect(cache.has("b")).toBe(false);
  });

  it("works with object keys and values", () => {
    const cache = new LRUCache<string, { name: string }>(5, 60000);
    cache.set("key1", { name: "test" });
    const val = cache.get("key1");
    expect(val).toEqual({ name: "test" });
  });
});
