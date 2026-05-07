import { z } from "zod";
import { encodeProjectPath } from "../gitlab/client.js";
import { getClient, toolResult, toolError } from "./helpers.js";
import {
  normalizeMergeRequestList,
  normalizeMergeRequest,
  normalizeDiffList,
  normalizeDiscussions,
  normalizePipelineList,
} from "./normalize.js";
import { formatApiError } from "../errors.js";

const listMergeRequestsSchema = z.object({
  host: z.string().optional().describe("Host alias from config"),
  projectIdOrPath: z.string().optional().describe("Project ID or path. Omit for instance-level MRs."),
  state: z.enum(["opened", "closed", "locked", "merged", "all"]).optional().describe("MR state filter"),
  scope: z.enum(["created_by_me", "assigned_to_me", "all"]).optional().describe("MR scope"),
  authorUsername: z.string().optional().describe("Filter by author username"),
  reviewerUsername: z.string().optional().describe("Filter by reviewer username"),
  targetBranch: z.string().optional().describe("Filter by target branch"),
  sourceBranch: z.string().optional().describe("Filter by source branch"),
  search: z.string().optional().describe("Search query"),
  page: z.number().optional().describe("Page number (default 1)"),
  perPage: z.number().optional().describe("Results per page (default 20, max 100)"),
});

export async function listMergeRequests(params: z.infer<typeof listMergeRequestsSchema>) {
  try {
    const client = getClient(params.host);
    const {
      host: _, projectIdOrPath, page, perPage,
      state, scope, authorUsername, reviewerUsername,
      targetBranch, sourceBranch, search,
    } = params;

    const apiParams: Record<string, string | number | boolean | undefined> = {
      state, scope, author_username: authorUsername,
      reviewer_username: reviewerUsername,
      target_branch: targetBranch, source_branch: sourceBranch, search,
    };

    let path: string;
    if (projectIdOrPath) {
      path = `/projects/${encodeProjectPath(projectIdOrPath)}/merge_requests`;
    } else {
      path = "/merge_requests";
    }

    const raw = await client.request<Record<string, unknown>[]>(path, {
      params: apiParams,
      pagination: { page, perPage },
    });
    return toolResult(normalizeMergeRequestList(raw));
  } catch (error) {
    return toolError(formatApiError(error));
  }
}

const getMergeRequestSchema = z.object({
  host: z.string().optional().describe("Host alias from config"),
  projectIdOrPath: z.string().describe("Project ID or URL-encoded path"),
  mergeRequestIid: z.number().describe("MR IID (not global ID)"),
});

export async function getMergeRequest(params: z.infer<typeof getMergeRequestSchema>) {
  try {
    const client = getClient(params.host);
    const { host: _, projectIdOrPath, mergeRequestIid } = params;
    const path = `/projects/${encodeProjectPath(projectIdOrPath)}/merge_requests/${mergeRequestIid}`;
    const raw = await client.request<Record<string, unknown>>(path);
    return toolResult(normalizeMergeRequest(raw));
  } catch (error) {
    return toolError(formatApiError(error));
  }
}

const getMergeRequestDiffSchema = z.object({
  host: z.string().optional().describe("Host alias from config"),
  projectIdOrPath: z.string().describe("Project ID or URL-encoded path"),
  mergeRequestIid: z.number().describe("MR IID"),
  maxFiles: z.number().optional().describe("Max number of diff files to return"),
  maxBytes: z.number().optional().describe("Max payload size in bytes"),
});

export async function getMergeRequestDiff(params: z.infer<typeof getMergeRequestDiffSchema>) {
  try {
    const client = getClient(params.host);
    const { host: _, projectIdOrPath, mergeRequestIid, maxFiles, maxBytes } = params;
    const path = `/projects/${encodeProjectPath(projectIdOrPath)}/merge_requests/${mergeRequestIid}/diffs`;
    const raw = await client.request<Record<string, unknown>[]>(path);
    const result = normalizeDiffList(raw, maxFiles, maxBytes);
    return toolResult(result);
  } catch (error) {
    return toolError(formatApiError(error));
  }
}

const getMergeRequestCommentsSchema = z.object({
  host: z.string().optional().describe("Host alias from config"),
  projectIdOrPath: z.string().describe("Project ID or URL-encoded path"),
  mergeRequestIid: z.number().describe("MR IID"),
});

export async function getMergeRequestComments(params: z.infer<typeof getMergeRequestCommentsSchema>) {
  try {
    const client = getClient(params.host);
    const { host: _, projectIdOrPath, mergeRequestIid } = params;
    const path = `/projects/${encodeProjectPath(projectIdOrPath)}/merge_requests/${mergeRequestIid}/discussions`;
    const raw = await client.request<Record<string, unknown>[]>(path);
    return toolResult(normalizeDiscussions(raw));
  } catch (error) {
    return toolError(formatApiError(error));
  }
}

const listMergeRequestPipelinesSchema = z.object({
  host: z.string().optional().describe("Host alias from config"),
  projectIdOrPath: z.string().describe("Project ID or URL-encoded path"),
  mergeRequestIid: z.number().describe("MR IID"),
});

export async function listMergeRequestPipelines(params: z.infer<typeof listMergeRequestPipelinesSchema>) {
  try {
    const client = getClient(params.host);
    const { host: _, projectIdOrPath, mergeRequestIid } = params;
    const path = `/projects/${encodeProjectPath(projectIdOrPath)}/merge_requests/${mergeRequestIid}/pipelines`;
    const raw = await client.request<Record<string, unknown>[]>(path);
    return toolResult(normalizePipelineList(raw));
  } catch (error) {
    return toolError(formatApiError(error));
  }
}

export const listMergeRequestsTool = {
  name: "gitlab_list_merge_requests",
  description: "List merge requests. Omit projectIdOrPath for instance-level MRs.",
  schema: listMergeRequestsSchema,
  handler: listMergeRequests,
};

export const getMergeRequestTool = {
  name: "gitlab_get_merge_request",
  description: "Get details of a specific merge request",
  schema: getMergeRequestSchema,
  handler: getMergeRequest,
};

export const getMergeRequestDiffTool = {
  name: "gitlab_get_merge_request_diff",
  description: "Get diff of a merge request with optional size limits",
  schema: getMergeRequestDiffSchema,
  handler: getMergeRequestDiff,
};

export const getMergeRequestCommentsTool = {
  name: "gitlab_get_merge_request_comments",
  description: "Get comments and discussions of a merge request",
  schema: getMergeRequestCommentsSchema,
  handler: getMergeRequestComments,
};

export const listMergeRequestPipelinesTool = {
  name: "gitlab_list_merge_request_pipelines",
  description: "List pipelines for a merge request",
  schema: listMergeRequestPipelinesSchema,
  handler: listMergeRequestPipelines,
};
