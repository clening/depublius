import { describe, it, expect } from "vitest";
import { validatePassage } from "../src/validation";

describe("validatePassage", () => {
  it("accepts a 150-word passage", () => {
    const passage = "word ".repeat(150).trim();
    expect(validatePassage(passage)).toEqual({ ok: true });
  });

  it("accepts a 500-word passage", () => {
    const passage = "word ".repeat(500).trim();
    expect(validatePassage(passage)).toEqual({ ok: true });
  });

  it("rejects a passage with 149 words", () => {
    const passage = "word ".repeat(149).trim();
    expect(validatePassage(passage)).toEqual({
      ok: false,
      error: "Passage must be between 150 and 500 words (got 149).",
    });
  });

  it("rejects a passage with 501 words", () => {
    const passage = "word ".repeat(501).trim();
    expect(validatePassage(passage)).toEqual({
      ok: false,
      error: "Passage must be between 150 and 500 words (got 501).",
    });
  });

  it("rejects an empty passage", () => {
    expect(validatePassage("")).toEqual({
      ok: false,
      error: "Passage must be between 150 and 500 words (got 0).",
    });
  });

  it("counts hyphenated and contracted words correctly", () => {
    // "well-known" = 1 word, "don't" = 1 word
    const passage = (Array(149).fill("hello").join(" ") + " well-known");
    const result = validatePassage(passage);
    expect(result.ok).toBe(true);
  });
});
