import { describe, it, expect } from "vitest";
import {
  RiskLevel,
  type DryRunPreview,
  type AuditEntry,
  type WriteSafetyParams,
} from "../../src/write/types.js";

describe("RiskLevel enum", () => {
  it('LOW === "low"', () => {
    expect(RiskLevel.LOW).toBe("low");
  });

  it('HIGH === "high"', () => {
    expect(RiskLevel.HIGH).toBe("high");
  });

  it("has exactly 2 members", () => {
    const values = Object.values(RiskLevel);
    expect(values).toHaveLength(2);
    expect(values).toContain("low");
    expect(values).toContain("high");
  });
});

describe("DryRunPreview interface (runtime shape)", () => {
  it("accepts a valid DryRunPreview object", () => {
    const preview: DryRunPreview = {
      dry_run: true,
      method: "POST",
      path: "/api/v4/projects/1/issues",
      body: { title: "test" },
      risk_level: RiskLevel.LOW,
    };

    expect(preview.dry_run).toBe(true);
    expect(preview.method).toBe("POST");
    expect(preview.risk_level).toBe(RiskLevel.LOW);
  });

  it("can represent a HIGH risk preview", () => {
    const preview: DryRunPreview = {
      dry_run: true,
      method: "POST",
      path: "/api/v4/projects/1/pipelines/42/cancel",
      body: {},
      risk_level: RiskLevel.HIGH,
    };

    expect(preview.risk_level).toBe(RiskLevel.HIGH);
  });
});

describe("AuditEntry interface (runtime shape)", () => {
  const validStatuses: AuditEntry["status"][] = [
    "preview",
    "success",
    "error",
    "rejected",
  ];

  it.each(validStatuses)("accepts status=%s", (status) => {
    const entry: AuditEntry = {
      timestamp: new Date().toISOString(),
      tool: "gitlab_create_issue",
      method: "POST",
      path: "/api/v4/projects/1/issues",
      risk_level: RiskLevel.LOW,
      status,
    };

    expect(entry.status).toBe(status);
    expect(entry.error).toBeUndefined();
  });

  it("accepts an error field when status is error", () => {
    const entry: AuditEntry = {
      timestamp: new Date().toISOString(),
      tool: "gitlab_cancel_pipeline",
      method: "POST",
      path: "/api/v4/projects/1/pipelines/42/cancel",
      risk_level: RiskLevel.HIGH,
      status: "error",
      error: "Pipeline not found",
    };

    expect(entry.error).toBe("Pipeline not found");
  });
});

describe("WriteSafetyParams interface (runtime shape)", () => {
  it("allows both fields to be omitted", () => {
    const params: WriteSafetyParams = {};
    expect(params.dryRun).toBeUndefined();
    expect(params.confirm).toBeUndefined();
  });

  it("allows dryRun to be set", () => {
    const params: WriteSafetyParams = { dryRun: true };
    expect(params.dryRun).toBe(true);
  });

  it("allows confirm to be set", () => {
    const params: WriteSafetyParams = { confirm: true };
    expect(params.confirm).toBe(true);
  });
});
