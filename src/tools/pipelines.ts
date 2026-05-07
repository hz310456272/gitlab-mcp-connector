import { z } from "zod";
import { encodeProjectPath } from "../gitlab/client.js";
import { getClient, toolResult, toolError, jsonText } from "./helpers.js";
import { normalizeJobList } from "./normalize.js";
import { formatApiError } from "../errors.js";

const getPipelineJobsSchema = z.object({
  host: z.string().optional().describe("Host alias from config"),
  projectIdOrPath: z.string().describe("Project ID or URL-encoded path"),
  pipelineId: z.number().describe("Pipeline ID"),
  includeRetried: z.boolean().optional().describe("Include retried jobs"),
});

export async function getPipelineJobs(params: z.infer<typeof getPipelineJobsSchema>) {
  try {
    const client = getClient(params.host);
    const { host: _, projectIdOrPath, pipelineId, includeRetried } = params;
    const path = `/projects/${encodeProjectPath(projectIdOrPath)}/pipelines/${pipelineId}/jobs`;
    const raw = await client.request<Record<string, unknown>[]>(path, {
      params: { include_retried: includeRetried },
    });
    return toolResult(normalizeJobList(raw));
  } catch (error) {
    return toolError(formatApiError(error));
  }
}

const DEFAULT_JOB_LOG_MAX_BYTES = 200 * 1024;

const getJobLogSchema = z.object({
  host: z.string().optional().describe("Host alias from config"),
  projectIdOrPath: z.string().describe("Project ID or URL-encoded path"),
  jobId: z.number().describe("Job ID"),
  maxBytes: z.number().optional().describe("Max payload size in bytes (default 200KB)"),
});

function byteLen(s: string): number {
  return Buffer.byteLength(s, "utf8");
}

export async function getJobLog(params: z.infer<typeof getJobLogSchema>) {
  try {
    const client = getClient(params.host);
    const { host: _, projectIdOrPath, jobId, maxBytes } = params;
    const limit = maxBytes ?? DEFAULT_JOB_LOG_MAX_BYTES;
    const path = `/projects/${encodeProjectPath(projectIdOrPath)}/jobs/${jobId}/trace`;
    const rawTrace = await client.requestText(path);

    const wrapper = { job_id: jobId, trace: "", truncated: false, max_bytes: limit };
    const fixedOverhead = byteLen(JSON.stringify({ ...wrapper, trace: "" }));
    const traceBudget = limit - fixedOverhead;

    let trace: string;
    let truncated = false;

    if (byteLen(rawTrace) <= traceBudget) {
      trace = rawTrace;
    } else {
      // Binary search for max trace length that fits
      let lo = 0;
      let hi = rawTrace.length;
      const suffix = "\n... [truncated]";
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        const candidate = { ...wrapper, trace: rawTrace.slice(0, mid) + suffix };
        if (byteLen(JSON.stringify(candidate)) <= limit) {
          lo = mid;
        } else {
          hi = mid - 1;
        }
      }
      trace = lo > 0 ? rawTrace.slice(0, lo) + suffix : "";
      truncated = true;
    }

    const result = { job_id: jobId, trace, truncated, max_bytes: limit };

    // Final safety check
    if (byteLen(JSON.stringify(result)) > limit) {
      const excess = byteLen(JSON.stringify(result)) - limit;
      trace = trace.slice(0, Math.max(0, trace.length - excess - 10));
      truncated = true;
      const finalResult = { job_id: jobId, trace, truncated, max_bytes: limit };
      return {
        content: [{ type: "text" as const, text: jsonText(finalResult) }],
        structuredContent: finalResult as Record<string, unknown>,
        isError: false,
      };
    }

    return toolResult(result);
  } catch (error) {
    return toolError(formatApiError(error));
  }
}

export const getPipelineJobsTool = {
  name: "gitlab_get_pipeline_jobs",
  description: "List jobs in a pipeline",
  schema: getPipelineJobsSchema,
  handler: getPipelineJobs,
};

export const getJobLogTool = {
  name: "gitlab_get_job_log",
  description: "Get job log with size limits (default 200KB)",
  schema: getJobLogSchema,
  handler: getJobLog,
};
