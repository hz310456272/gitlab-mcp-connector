import { describe, it, expect } from "vitest";
import { redact } from "../src/redaction.js";

describe("redact", () => {
  it("redacts PRIVATE-TOKEN header", () => {
    expect(redact("PRIVATE-TOKEN: glpat-abc123")).toBe("PRIVATE-TOKEN: [REDACTED]");
  });

  it("redacts Authorization Bearer header", () => {
    expect(redact("Authorization: Bearer my-secret-token")).toBe(
      "Authorization: Bearer [REDACTED]",
    );
  });

  it("redacts private_token query param", () => {
    expect(redact("url?private_token=glpat-abc")).toBe("url?private_token=[REDACTED]");
  });

  it("redacts access_token query param", () => {
    expect(redact("url?access_token=abc123")).toBe("url?access_token=[REDACTED]");
  });

  it("preserves subsequent query params after private_token", () => {
    expect(redact("url?private_token=glpat-abc&page=1")).toBe(
      "url?private_token=[REDACTED]&page=1",
    );
  });

  it("preserves subsequent query params after access_token", () => {
    expect(redact("url?access_token=abc123&per_page=20")).toBe(
      "url?access_token=[REDACTED]&per_page=20",
    );
  });

  it("stops at whitespace after token value", () => {
    expect(redact("private_token=abc123 next text")).toBe(
      "private_token=[REDACTED] next text",
    );
  });

  it("stops at quote after token value", () => {
    expect(redact('url="url?access_token=abc123"')).toBe(
      'url="url?access_token=[REDACTED]"',
    );
  });

  it("redacts private_token JSON field", () => {
    expect(redact('{"private_token":"secret"}')).toBe('{"private_token":"[REDACTED]"}');
  });

  it("redacts access_token JSON field", () => {
    expect(redact('{"access_token":"secret"}')).toBe('{"access_token":"[REDACTED]"}');
  });

  it("redacts token JSON field", () => {
    expect(redact('{"token":"secret"}')).toBe('{"token":"[REDACTED]"}');
  });

  it("redacts email addresses", () => {
    expect(redact("Contact user@example.com for details")).toBe(
      "Contact [EMAIL REDACTED] for details",
    );
  });

  it("redacts multiple patterns in one string", () => {
    const input = 'PRIVATE-TOKEN: abc user@test.com "token":"xyz"';
    const result = redact(input);
    expect(result).toContain("[REDACTED]");
    expect(result).toContain("[EMAIL REDACTED]");
    expect(result).not.toContain("abc");
    expect(result).not.toContain("xyz");
    expect(result).not.toContain("user@test.com");
  });

  it("returns unchanged text when nothing to redact", () => {
    expect(redact("hello world")).toBe("hello world");
  });
});
