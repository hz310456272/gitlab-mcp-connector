import { z } from "zod";
import { encodeProjectPath } from "../gitlab/client.js";
import { getClient, toolResult, toolError } from "./helpers.js";
import { normalizeJob, normalizePipeline } from "./normalize.js";
import { withWriteSafety, dedupWindow } from "../write/middleware.js";
import type { WriteToolContext, WriteSafetyParams, AuditEntry } from "../write/types.js";
import { classifyRisk } from "../write/risk.js";
import { formatApiError } from "../errors.js";

// ---------- gitlab_retry_job ----------

const retryJobSchema = z.object({
  host: z.string().optional().describe("Host alias from config"),
  projectIdOrPath: z.string().describe("Project ID or URL-encoded path"),
  jobId: z.number().describe("Job ID to retry"),
  dryRun: z.boolean().optional().describe("Preview the operation without executing"),
  confirm: z.boolean().optional().describe("Set true to confirm a high-risk operation"),
});

export async function retryJob(params: z.infer<typeof retryJobSchema>) {
  const toolName = "gitlab_retry_job";
  const { host, projectIdOrPath, jobId, dryRun, confirm } = params;
  const path = `/projects/${encodeProjectPath(projectIdOrPath)}/jobs/${jobId}/retry`;

  const ctx: WriteToolContext = {
    method: "POST",
    path,
    body: {},
    riskLevel: classifyRisk(toolName),
  };

  const safetyParams: WriteSafetyParams = { dryRun, confirm };
  const audit = (entry: AuditEntry) => {
    process.stderr.write(JSON.stringify(entry) + "\n");
  };

  return withWriteSafety(toolName, ctx, async () => {
    try {
      const client = getClient(host);
      const raw = await client.post<Record<string, unknown>>(path, {});
      return toolResult(normalizeJob(raw));
    } catch (error) {
      return toolError(formatApiError(error));
    }
  }, safetyParams, audit);
}

export const retryJobTool = {
  name: "gitlab_retry_job",
  description: "Retry a failed or canceled CI job",
  schema: retryJobSchema,
  handler: retryJob,
};

// ---------- gitlab_cancel_pipeline ----------

const cancelPipelineSchema = z.object({
  host: z.string().optional().describe("Host alias from config"),
  projectIdOrPath: z.string().describe("Project ID or URL-encoded path"),
  pipelineId: z.number().describe("Pipeline ID to cancel"),
  dryRun: z.boolean().optional().describe("Preview the operation without executing"),
  confirm: z.boolean().optional().describe("Set true to confirm a high-risk operation"),
});

export async function cancelPipeline(params: z.infer<typeof cancelPipelineSchema>) {
  const toolName = "gitlab_cancel_pipeline";
  const { host, projectIdOrPath, pipelineId, dryRun, confirm } = params;
  const path = `/projects/${encodeProjectPath(projectIdOrPath)}/pipelines/${pipelineId}/cancel`;

  const ctx: WriteToolContext = {
    method: "POST",
    path,
    body: {},
    riskLevel: classifyRisk(toolName),
  };

  const safetyParams: WriteSafetyParams = { dryRun, confirm };
  const audit = (entry: AuditEntry) => {
    process.stderr.write(JSON.stringify(entry) + "\n");
  };

  return withWriteSafety(toolName, ctx, async () => {
    try {
      const client = getClient(host);
      const raw = await client.post<Record<string, unknown>>(path, {});
      // GitLab cancel pipeline may return empty body or a pipeline object
      if (!raw || !raw.id) {
        return toolResult({ id: pipelineId, status: "canceled" });
      }
      return toolResult(normalizePipeline(raw));
    } catch (error) {
      return toolError(formatApiError(error));
    }
  }, safetyParams, audit);
}

export const cancelPipelineTool = {
  name: "gitlab_cancel_pipeline",
  description: "Cancel a running CI pipeline",
  schema: cancelPipelineSchema,
  handler: cancelPipeline,
};

// ---------- gitlab_cancel_job ----------

const cancelJobSchema = z.object({
  host: z.string().optional().describe("Host alias from config"),
  projectIdOrPath: z.string().describe("Project ID or URL-encoded path"),
  jobId: z.number().describe("Job ID to cancel"),
  dryRun: z.boolean().optional().describe("Preview the operation without executing"),
  confirm: z.boolean().optional().describe("Set true to confirm a high-risk operation"),
});

export async function cancelJob(params: z.infer<typeof cancelJobSchema>) {
  const toolName = "gitlab_cancel_job";
  const { host, projectIdOrPath, jobId, dryRun, confirm } = params;
  const path = `/projects/${encodeProjectPath(projectIdOrPath)}/jobs/${jobId}/cancel`;

  const ctx: WriteToolContext = {
    method: "POST",
    path,
    body: {},
    riskLevel: classifyRisk(toolName),
  };

  const safetyParams: WriteSafetyParams = { dryRun, confirm };
  const audit = (entry: AuditEntry) => {
    process.stderr.write(JSON.stringify(entry) + "\n");
  };

  return withWriteSafety(toolName, ctx, async () => {
    try {
      const client = getClient(host);
      const raw = await client.post<Record<string, unknown>>(path, {});
      return toolResult(normalizeJob(raw));
    } catch (error) {
      return toolError(formatApiError(error));
    }
  }, safetyParams, audit);
}

export const cancelJobTool = {
  name: "gitlab_cancel_job",
  description: "Cancel a running CI job",
  schema: cancelJobSchema,
  handler: cancelJob,
};

/** Re-export dedupWindow for tests. */
export { dedupWindow };
