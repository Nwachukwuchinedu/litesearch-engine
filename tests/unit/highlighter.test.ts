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

  it("returns null-style result for empty field value", () => {
    const result = highlight("", ["hello"], "title");
    expect(result.field).toBe("title");
    expect(result.matchedTokens).toEqual([]);
  });
});
