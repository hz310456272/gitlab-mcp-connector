import { describe, it, expect } from "vitest";
import { resolveToolsets, isWriteEnabled } from "../src/toolset.js";

describe("resolveToolsets", () => {
  it("returns default config for undefined input", () => {
    const result = resolveToolsets(undefined);
    expect(result.isWriteEnabled).toBe(false);
    expect(result.enabledToolsets).toEqual(new Set());
  });

  it("returns default config for empty string", () => {
    const result = resolveToolsets("");
    expect(result.isWriteEnabled).toBe(false);
    expect(result.enabledToolsets).toEqual(new Set());
  });

  it('returns isWriteEnabled true for "write"', () => {
    const result = resolveToolsets("write");
    expect(result.isWriteEnabled).toBe(true);
    expect(result.enabledToolsets).toEqual(new Set(["write"]));
  });

  it('returns both toolsets for "write,ci"', () => {
    const result = resolveToolsets("write,ci");
    expect(result.isWriteEnabled).toBe(true);
    expect(result.enabledToolsets).toEqual(new Set(["write", "ci"]));
  });

  it('returns isWriteEnabled false for "read"', () => {
    const result = resolveToolsets("read");
    expect(result.isWriteEnabled).toBe(false);
    expect(result.enabledToolsets).toEqual(new Set(["read"]));
  });

  it("trims whitespace from input", () => {
    const result = resolveToolsets("  write  ");
    expect(result.isWriteEnabled).toBe(true);
    expect(result.enabledToolsets).toEqual(new Set(["write"]));
  });

  it("deduplicates repeated entries", () => {
    const result = resolveToolsets("write,write");
    expect(result.isWriteEnabled).toBe(true);
    expect(result.enabledToolsets.size).toBe(1);
    expect(result.enabledToolsets.has("write")).toBe(true);
  });

  it("filters out empty strings from trailing comma", () => {
    const result = resolveToolsets("write,");
    expect(result.isWriteEnabled).toBe(true);
    expect(result.enabledToolsets).toEqual(new Set(["write"]));
  });

  it("handles multiple commas gracefully", () => {
    const result = resolveToolsets("write,,ci,  ,read");
    expect(result.enabledToolsets).toEqual(new Set(["write", "ci", "read"]));
    expect(result.isWriteEnabled).toBe(true);
  });
});

describe("isWriteEnabled", () => {
  it("returns true when isWriteEnabled is true in config", () => {
    const config = resolveToolsets("write");
    expect(isWriteEnabled(config)).toBe(true);
  });

  it("returns false when isWriteEnabled is false in config", () => {
    const config = resolveToolsets(undefined);
    expect(isWriteEnabled(config)).toBe(false);
  });

  it("returns false for read-only toolset", () => {
    const config = resolveToolsets("read");
    expect(isWriteEnabled(config)).toBe(false);
  });
});
