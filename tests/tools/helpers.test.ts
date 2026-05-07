import { describe, expect, it } from "vitest";
import { toolResult } from "../../src/tools/helpers.js";

describe("toolResult", () => {
  it("wraps arrays in structuredContent.items", () => {
    const result = toolResult([{ id: 1 }, { id: 2 }]);

    expect(result.structuredContent).toEqual({
      items: [{ id: 1 }, { id: 2 }],
    });
  });

  it("keeps object payloads as structuredContent", () => {
    const result = toolResult({ id: 1, name: "project" });

    expect(result.structuredContent).toEqual({ id: 1, name: "project" });
  });

  it("wraps primitive payloads in structuredContent.value", () => {
    const result = toolResult("ok");

    expect(result.structuredContent).toEqual({ value: "ok" });
  });
});
