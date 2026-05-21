import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { retryJob, cancelPipeline, cancelJob, dedupWindow } from "../../src/tools/write-ci.js";
import { resetConfigForTests } from "../../src/tools/helpers.js";

const BASE_URL = "https://gitlab.example.com";

const fullJobResponse = {
  id: 1001,
  name: "test",
  stage: "verify",
  status: "running",
  web_url: "https://gitlab.example.com/group/project/-/jobs/1001",
  started_at: "2025-06-01T10:10:00Z",
  finished_at: null,
  duration: null,
  // Extra fields that should be filtered by normalizeJob
  user: { username: "dev", name: "Developer" },
  runner: { id: 5, description: "shared-runner" },
  artifacts: [{ filename: "coverage.zip", size: 1024 }],
};

const fullPipelineResponse = {
  id: 501,
  status: "canceled",
  ref: "main",
  sha: "abc1234",
  created_at: "2025-06-01T10:00:00Z",
  updated_at: "2025-06-01T10:05:00Z",
  web_url: "https://gitlab.example.com/group/project/-/pipelines/501",
  // Extra fields
  user: { username: "dev", name: "Developer" },
};

describe("write-ci tools", () => {
  let mockAgent: MockAgent;

  beforeEach(() => {
    vi.stubEnv("GITLAB_BASE_URL", BASE_URL);
    vi.stubEnv("GITLAB_TOKEN", "test-token");
    resetConfigForTests();
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
    dedupWindow.clear();
  });

  afterEach(() => {
    mockAgent.close();
    vi.unstubAllEnvs();
  });

  // ===== gitlab_retry_job =====

  describe("gitlab_retry_job", () => {
    it("retries job and returns normalized result", async () => {
      mockAgent
        .get(BASE_URL)
        .intercept({
          path: "/api/v4/projects/123/jobs/1001/retry",
          method: "POST",
        })
        .reply(200, fullJobResponse);

      const result = await retryJob({
        projectIdOrPath: "123",
        jobId: 1001,
        confirm: true,
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.id).toBe(1001);
      expect(parsed.name).toBe("test");
      expect(parsed.stage).toBe("verify");
      expect(parsed.status).toBe("running");
      // Extra fields should not leak
      expect(parsed.user).toBeUndefined();
      expect(parsed.runner).toBeUndefined();
      expect(parsed.artifacts).toBeUndefined();
    });

    it("returns error when confirm is false (HIGH risk gate)", async () => {
      const result = await retryJob({
        projectIdOrPath: "123",
        jobId: 1001,
        confirm: false,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("confirm: true");
    });

    it("returns error when confirm is not provided (HIGH risk gate)", async () => {
      const result = await retryJob({
        projectIdOrPath: "123",
        jobId: 1001,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("confirm: true");
    });

    it("returns dry-run preview when dryRun=true", async () => {
      const result = await retryJob({
        projectIdOrPath: "123",
        jobId: 1001,
        dryRun: true,
      });

      expect(result.isError).toBeFalsy();
      const preview = result.structuredContent;
      expect(preview).toBeDefined();
      expect(preview!.dry_run).toBe(true);
      expect(preview!.method).toBe("POST");
      expect(preview!.path).toBe("/projects/123/jobs/1001/retry");
      expect(preview!.risk_level).toBe("high");
    });

    it("returns error on 404 (job not found)", async () => {
      mockAgent
        .get(BASE_URL)
        .intercept({
          path: "/api/v4/projects/123/jobs/9999/retry",
          method: "POST",
        })
        .reply(404, { message: "Not Found" });

      const result = await retryJob({
        projectIdOrPath: "123",
        jobId: 9999,
        confirm: true,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not found");
    });
  });

  // ===== gitlab_cancel_pipeline =====

  describe("gitlab_cancel_pipeline", () => {
    it("cancels pipeline and returns normalized result", async () => {
      mockAgent
        .get(BASE_URL)
        .intercept({
          path: "/api/v4/projects/123/pipelines/501/cancel",
          method: "POST",
        })
        .reply(200, fullPipelineResponse);

      const result = await cancelPipeline({
        projectIdOrPath: "123",
        pipelineId: 501,
        confirm: true,
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.id).toBe(501);
      expect(parsed.status).toBe("canceled");
      expect(parsed.ref).toBe("main");
      expect(parsed.sha).toBe("abc1234");
      expect(parsed.web_url).toBe("https://gitlab.example.com/group/project/-/pipelines/501");
      // Extra fields should not leak
      expect(parsed.user).toBeUndefined();
    });

    it("handles empty body response from GitLab", async () => {
      mockAgent
        .get(BASE_URL)
        .intercept({
          path: "/api/v4/projects/123/pipelines/501/cancel",
          method: "POST",
        })
        .reply(200, {});

      const result = await cancelPipeline({
        projectIdOrPath: "123",
        pipelineId: 501,
        confirm: true,
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.id).toBe(501);
      expect(parsed.status).toBe("canceled");
    });

    it("returns error when confirm is false (HIGH risk gate)", async () => {
      const result = await cancelPipeline({
        projectIdOrPath: "123",
        pipelineId: 501,
        confirm: false,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("confirm: true");
    });

    it("returns error when confirm is not provided (HIGH risk gate)", async () => {
      const result = await cancelPipeline({
        projectIdOrPath: "123",
        pipelineId: 501,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("confirm: true");
    });

    it("returns dry-run preview when dryRun=true", async () => {
      const result = await cancelPipeline({
        projectIdOrPath: "123",
        pipelineId: 501,
        dryRun: true,
      });

      expect(result.isError).toBeFalsy();
      const preview = result.structuredContent;
      expect(preview).toBeDefined();
      expect(preview!.dry_run).toBe(true);
      expect(preview!.method).toBe("POST");
      expect(preview!.path).toBe("/projects/123/pipelines/501/cancel");
      expect(preview!.risk_level).toBe("high");
    });

    it("returns error on 404 (pipeline not found)", async () => {
      mockAgent
        .get(BASE_URL)
        .intercept({
          path: "/api/v4/projects/123/pipelines/9999/cancel",
          method: "POST",
        })
        .reply(404, { message: "Not Found" });

      const result = await cancelPipeline({
        projectIdOrPath: "123",
        pipelineId: 9999,
        confirm: true,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not found");
    });
  });

  // ===== gitlab_cancel_job =====

  describe("gitlab_cancel_job", () => {
    it("cancels job and returns normalized result", async () => {
      const canceledJob = { ...fullJobResponse, status: "canceled", finished_at: "2025-06-01T10:11:00Z" };
      mockAgent
        .get(BASE_URL)
        .intercept({
          path: "/api/v4/projects/123/jobs/1001/cancel",
          method: "POST",
        })
        .reply(200, canceledJob);

      const result = await cancelJob({
        projectIdOrPath: "123",
        jobId: 1001,
        confirm: true,
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.id).toBe(1001);
      expect(parsed.name).toBe("test");
      expect(parsed.status).toBe("canceled");
      // Extra fields should not leak
      expect(parsed.user).toBeUndefined();
      expect(parsed.runner).toBeUndefined();
    });

    it("returns error when confirm is false (HIGH risk gate)", async () => {
      const result = await cancelJob({
        projectIdOrPath: "123",
        jobId: 1001,
        confirm: false,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("confirm: true");
    });

    it("returns error when confirm is not provided (HIGH risk gate)", async () => {
      const result = await cancelJob({
        projectIdOrPath: "123",
        jobId: 1001,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("confirm: true");
    });

    it("returns dry-run preview when dryRun=true", async () => {
      const result = await cancelJob({
        projectIdOrPath: "123",
        jobId: 1001,
        dryRun: true,
      });

      expect(result.isError).toBeFalsy();
      const preview = result.structuredContent;
      expect(preview).toBeDefined();
      expect(preview!.dry_run).toBe(true);
      expect(preview!.method).toBe("POST");
      expect(preview!.path).toBe("/projects/123/jobs/1001/cancel");
      expect(preview!.risk_level).toBe("high");
    });

    it("returns error on 404 (job not found)", async () => {
      mockAgent
        .get(BASE_URL)
        .intercept({
          path: "/api/v4/projects/123/jobs/9999/cancel",
          method: "POST",
        })
        .reply(404, { message: "Not Found" });

      const result = await cancelJob({
        projectIdOrPath: "123",
        jobId: 9999,
        confirm: true,
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("not found");
    });
  });
});
