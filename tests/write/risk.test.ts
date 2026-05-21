import { describe, it, expect } from "vitest";
import { classifyRisk, HIGH_RISK_TOOLS } from "../../src/write/risk.js";
import { RiskLevel } from "../../src/write/types.js";

const LOW_RISK_TOOLS = [
  "gitlab_create_issue",
  "gitlab_create_issue_note",
  "gitlab_create_merge_request",
  "gitlab_create_merge_request_note",
] as const;

describe("classifyRisk", () => {
  describe("low-risk tools", () => {
    it.each(LOW_RISK_TOOLS as unknown as string[])(
      "classifies %s as LOW",
      (toolName) => {
        expect(classifyRisk(toolName)).toBe(RiskLevel.LOW);
      },
    );
  });

  describe("high-risk tools", () => {
    it("classifies gitlab_cancel_pipeline as HIGH", () => {
      expect(classifyRisk("gitlab_cancel_pipeline")).toBe(RiskLevel.HIGH);
    });

    it("classifies gitlab_cancel_job as HIGH", () => {
      expect(classifyRisk("gitlab_cancel_job")).toBe(RiskLevel.HIGH);
    });

    it("classifies gitlab_retry_job as HIGH", () => {
      expect(classifyRisk("gitlab_retry_job")).toBe(RiskLevel.HIGH);
    });
  });

  describe("unknown tool names", () => {
    it("throws on an unknown tool name", () => {
      expect(() => classifyRisk("gitlab_delete_issue")).toThrow(
        'Unknown write tool: "gitlab_delete_issue". Cannot classify risk level.',
      );
    });

    it("throws on an empty string", () => {
      expect(() => classifyRisk("")).toThrow(
        'Unknown write tool: "". Cannot classify risk level.',
      );
    });
  });
});

describe("HIGH_RISK_TOOLS constant", () => {
  it("contains exactly 3 tools", () => {
    expect(HIGH_RISK_TOOLS.size).toBe(3);
  });

  it("contains gitlab_cancel_pipeline", () => {
    expect(HIGH_RISK_TOOLS.has("gitlab_cancel_pipeline")).toBe(true);
  });

  it("contains gitlab_cancel_job", () => {
    expect(HIGH_RISK_TOOLS.has("gitlab_cancel_job")).toBe(true);
  });

  it("contains gitlab_retry_job", () => {
    expect(HIGH_RISK_TOOLS.has("gitlab_retry_job")).toBe(true);
  });

  it("does not contain a low-risk tool", () => {
    expect(HIGH_RISK_TOOLS.has("gitlab_create_issue")).toBe(false);
  });
});
