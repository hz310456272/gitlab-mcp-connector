import { describe, it, expect } from "vitest";
import { normalizePagination, DEFAULT_PER_PAGE, MAX_PER_PAGE } from "../src/gitlab/pagination.js";

describe("normalizePagination", () => {
  it("returns defaults when no params given", () => {
    const result = normalizePagination();
    expect(result).toEqual({ page: 1, per_page: DEFAULT_PER_PAGE });
  });

  it("uses provided page and perPage", () => {
    const result = normalizePagination({ page: 3, perPage: 50 });
    expect(result).toEqual({ page: 3, per_page: 50 });
  });

  it("clamps perPage to MAX_PER_PAGE", () => {
    const result = normalizePagination({ perPage: 200 });
    expect(result.per_page).toBe(MAX_PER_PAGE);
  });

  it("clamps perPage minimum to 1", () => {
    const result = normalizePagination({ perPage: 0 });
    expect(result.per_page).toBe(1);
  });

  it("clamps page minimum to 1", () => {
    const result = normalizePagination({ page: -5 });
    expect(result.page).toBe(1);
  });
});
