import { describe, it, expect } from "vitest";
import { highlight } from "../../src/search/highlighter";

describe("highlight", () => {
  it("wraps matched tokens in <mark> tags", () => {
    const result = highlight(
      "The quick brown fox jumps over the lazy dog",
      ["quick", "fox"],
      "title"
    );
    expect(result.snippet).toContain("<mark>quick</mark>");
    expect(result.snippet).toContain("<mark>fox</mark>");
  });

  it("returns matched tokens that were found", () => {
    const result = highlight(
      "The quick brown fox jumps",
      ["quick", "nonexistent"],
      "title"
    );
    expect(result.matchedTokens).toEqual(["quick"]);
  });

  it("no matches returns empty matchedTokens", () => {
    const result = highlight("hello world", ["nonexistent"], "title");
    expect(result.matchedTokens).toEqual([]);
    expect(result.snippet).toBe("hello world");
  });

  it("empty input returns empty result", () => {
    const result = highlight("", ["hello"], "title");
    expect(result.snippet).toBe("");
    expect(result.matchedTokens).toEqual([]);
  });

  it("context window includes ~30 chars before match with ellipsis", () => {
    const text = "A".repeat(50) + "target" + "B".repeat(50);
    const result = highlight(text, ["target"], "title");
    expect(result.snippet).toContain("<mark>target</mark>");
    expect(result.snippet).toMatch(/^…/);
  });

  it("snippet is limited to default max length", () => {
    const text = "hello world " + "very long text ".repeat(20);
    const result = highlight(text, ["hello"], "title");
    const stripped = result.snippet.replace(/<[^>]+>/g, "");
    expect(stripped.length).toBeLessThanOrEqual(165);
  });

  it("escapes regex special characters in tokens", () => {
    const result = highlight("price: $10.99", ["$10.99"], "title");
    expect(result.snippet).toContain("<mark>$10.99</mark>");
    expect(result.matchedTokens).toContain("$10.99");
  });
});
