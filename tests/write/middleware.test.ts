import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { RiskLevel } from "../../src/write/types.js";
import type {
  WriteToolContext,
  WriteSafetyParams,
  AuditEntry,
} from "../../src/write/types.js";
import {
  withWriteSafety,
  dedupWindow,
} from "../../src/write/middleware.js";
import { toolResult, toolError } from "../../src/tools/helpers.js";
import type { ToolOutput } from "../../src/tools/helpers.js";

function lowCtx(body: Record<string, unknown> = {}): WriteToolContext {
  return {
    method: "POST",
    path: "/api/v4/projects/1/issues",
    body,
    riskLevel: RiskLevel.LOW,
  };
}

function highCtx(body: Record<string, unknown> = {}): WriteToolContext {
  return {
    method: "POST",
    path: "/api/v4/projects/1/pipelines/42/cancel",
    body,
    riskLevel: RiskLevel.HIGH,
  };
}

describe("withWriteSafety", () => {
  let auditCalls: AuditEntry[];

  beforeEach(() => {
    dedupWindow.clear();
    auditCalls = [];
  });

  function audit(entry: AuditEntry): void {
    auditCalls.push(entry);
  }

  const successHandler = vi.fn(async (): Promise<ToolOutput> => {
    return toolResult({ id: 1, title: "created" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---- dryRun gate ----

  describe("dryRun gate", () => {
    it("returns DryRunPreview when dryRun=true", async () => {
      const ctx = lowCtx({ title: "bug" });
      const result = await withWriteSafety(
        "gitlab_create_issue",
        ctx,
        successHandler,
        { dryRun: true },
        audit,
      );

      expect(result.isError).toBeFalsy();
      // Parse the preview from structuredContent
      const preview = result.structuredContent;
      expect(preview).toBeDefined();
      expect(preview!.dry_run).toBe(true);
      expect(preview!.method).toBe("POST");
      expect(preview!.path).toBe("/api/v4/projects/1/issues");
      expect(preview!.risk_level).toBe(RiskLevel.LOW);
    });

    it("does not call handler when dryRun=true", async () => {
      await withWriteSafety("gitlab_create_issue", lowCtx(), successHandler, {
        dryRun: true,
      }, audit);
      expect(successHandler).not.toHaveBeenCalled();
    });

    it("records audit with status=preview", async () => {
      await withWriteSafety("gitlab_create_issue", lowCtx(), successHandler, {
        dryRun: true,
      }, audit);
      expect(auditCalls).toHaveLength(1);
      expect(auditCalls[0].status).toBe("preview");
      expect(auditCalls[0].tool).toBe("gitlab_create_issue");
    });
  });

  // ---- confirm gate ----

  describe("confirm gate", () => {
    it("LOW risk + confirm=false executes handler", async () => {
      const handler = vi.fn(async () => toolResult({ ok: true }));
      const result = await withWriteSafety(
        "gitlab_create_issue",
        lowCtx(),
        handler,
        { confirm: false },
        audit,
      );
      expect(handler).toHaveBeenCalledOnce();
      expect(result.isError).toBeFalsy();
    });

    it("LOW risk without confirm param executes handler", async () => {
      const handler = vi.fn(async () => toolResult({ ok: true }));
      const result = await withWriteSafety(
        "gitlab_create_issue",
        lowCtx(),
        handler,
        {},
        audit,
      );
      expect(handler).toHaveBeenCalledOnce();
      expect(result.isError).toBeFalsy();
    });

    it("HIGH risk + confirm=false returns error without executing handler", async () => {
      const handler = vi.fn(async () => toolResult({ ok: true }));
      const result = await withWriteSafety(
        "gitlab_cancel_pipeline",
        highCtx(),
        handler,
        { confirm: false },
        audit,
      );
      expect(handler).not.toHaveBeenCalled();
      expect(result.isError).toBe(true);
    });

    it("HIGH risk + confirm=false error mentions confirm: true", async () => {
      const result = await withWriteSafety(
        "gitlab_cancel_pipeline",
        highCtx(),
        successHandler,
        {},
        audit,
      );
      const text = result.content[0].text;
      expect(text).toContain("confirm: true");
    });

    it("HIGH risk + confirm=false records audit with status=rejected", async () => {
      await withWriteSafety(
        "gitlab_cancel_pipeline",
        highCtx(),
        successHandler,
        {},
        audit,
      );
      expect(auditCalls).toHaveLength(1);
      expect(auditCalls[0].status).toBe("rejected");
      expect(auditCalls[0].error).toBeDefined();
    });

    it("HIGH risk + confirm=true executes handler", async () => {
      const handler = vi.fn(async () => toolResult({ ok: true }));
      const result = await withWriteSafety(
        "gitlab_cancel_pipeline",
        highCtx(),
        handler,
        { confirm: true },
        audit,
      );
      expect(handler).toHaveBeenCalledOnce();
      expect(result.isError).toBeFalsy();
    });
  });

  // ---- dedup ----

  describe("dedup check", () => {
    it("returns cached result on second call with same parameters", async () => {
      const handler = vi.fn(async () => toolResult({ id: 42 }));
      const ctx = lowCtx({ title: "dedup-test" });
      const params: WriteSafetyParams = {};

      const r1 = await withWriteSafety("gitlab_create_issue", ctx, handler, params, audit);
      expect(handler).toHaveBeenCalledOnce();

      const r2 = await withWriteSafety("gitlab_create_issue", ctx, handler, params, audit);
      // Handler NOT called again — cached result returned
      expect(handler).toHaveBeenCalledOnce();
      expect(r2).toBe(r1);
    });

    it("executes handler for different parameters", async () => {
      const handler = vi.fn(async () => toolResult({ id: 1 }));
      const ctx1 = lowCtx({ title: "first" });
      const ctx2 = lowCtx({ title: "second" });

      await withWriteSafety("gitlab_create_issue", ctx1, handler, {}, audit);
      await withWriteSafety("gitlab_create_issue", ctx2, handler, {}, audit);
      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  // ---- handler execution + audit ----

  describe("handler success", () => {
    it("records audit with status=success", async () => {
      const handler = vi.fn(async () => toolResult({ id: 1 }));
      await withWriteSafety("gitlab_create_issue", lowCtx(), handler, {}, audit);
      const successAudits = auditCalls.filter((e) => e.status === "success");
      expect(successAudits).toHaveLength(1);
      expect(successAudits[0].tool).toBe("gitlab_create_issue");
    });
  });

  describe("handler returns error (isError=true)", () => {
    it("does not cache the error result", async () => {
      const handler = vi.fn(async () => toolError("fail"));
      const ctx = lowCtx({ title: "err-test" });

      await withWriteSafety("gitlab_create_issue", ctx, handler, {}, audit);
      // Second call with same params should call handler again (not cached)
      await withWriteSafety("gitlab_create_issue", ctx, handler, {}, audit);
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it("records audit with status=error", async () => {
      const handler = vi.fn(async () => toolError("fail"));
      await withWriteSafety("gitlab_create_issue", lowCtx(), handler, {}, audit);
      const errorAudits = auditCalls.filter((e) => e.status === "error");
      expect(errorAudits).toHaveLength(1);
    });
  });

  describe("handler throws exception", () => {
    it("returns toolError and does not cache", async () => {
      const handler = vi.fn(async () => {
        throw new Error("Network timeout");
      });
      const ctx = lowCtx({ title: "throw-test" });

      const result = await withWriteSafety(
        "gitlab_create_issue",
        ctx,
        handler,
        {},
        audit,
      );
      expect(result.isError).toBe(true);

      // Second call should still invoke handler (not cached)
      await withWriteSafety("gitlab_create_issue", ctx, handler, {}, audit);
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it("records audit with status=error and error message", async () => {
      const handler = vi.fn(async () => {
        throw new Error("Network timeout");
      });
      await withWriteSafety("gitlab_create_issue", lowCtx(), handler, {}, audit);
      const errorAudits = auditCalls.filter((e) => e.status === "error");
      expect(errorAudits).toHaveLength(1);
      expect(errorAudits[0].error).toBe("Network timeout");
    });
  });

  // ---- dedupWindow export ----

  describe("dedupWindow global instance", () => {
    it("is exported and has clear()", () => {
      expect(dedupWindow).toBeDefined();
      expect(typeof dedupWindow.clear).toBe("function");
    });
  });
});
