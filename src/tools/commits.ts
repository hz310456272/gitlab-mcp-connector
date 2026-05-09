import { z } from "zod";
import { encodeProjectPath } from "../gitlab/client.js";
import { getClient, toolResult, toolError } from "./helpers.js";
import { normalizeCommit, normalizeCommitList, normalizeCompareResult } from "./normalize.js";
import { formatApiError } from "../errors.js";

const listCommitsSchema = z.object({
  host: z.string().optional().describe("Host alias from config"),
  projectIdOrPath: z.string().describe("Project ID or URL-encoded path"),
  ref: z.string().optional().describe("Branch name, tag, or commit SHA"),
  path: z.string().optional().describe("Filter commits by file path"),
  since: z.string().optional().describe("Only commits after this ISO 8601 date"),
  until: z.string().optional().describe("Only commits before this ISO 8601 date"),
  page: z.number().optional().describe("Page number (default 1)"),
  perPage: z.number().optional().describe("Results per page (default 20, max 100)"),
});

export async function listCommits(params: z.infer<typeof listCommitsSchema>) {
  try {
    const client = getClient(params.host);
    const { host: _, projectIdOrPath, ref, path, since, until, page, perPage } = params;
    const apiPath = `/projects/${encodeProjectPath(projectIdOrPath)}/repository/commits`;
    const raw = await client.request<Record<string, unknown>[]>(apiPath, {
      params: { ref_name: ref, path, since, until },
      pagination: { page, perPage },
    });
    return toolResult(normalizeCommitList(raw));
  } catch (error) {
    return toolError(formatApiError(error));
  }
}

const getCommitSchema = z.object({
  host: z.string().optional().describe("Host alias from config"),
  projectIdOrPath: z.string().describe("Project ID or URL-encoded path"),
  sha: z.string().describe("Commit SHA or shortened SHA"),
});

export async function getCommit(params: z.infer<typeof getCommitSchema>) {
  try {
    const client = getClient(params.host);
    const { host: _, projectIdOrPath, sha } = params;
    const apiPath = `/projects/${encodeProjectPath(projectIdOrPath)}/repository/commits/${encodeURIComponent(sha)}`;
    const raw = await client.request<Record<string, unknown>>(apiPath);
    return toolResult(normalizeCommit(raw, true));
  } catch (error) {
    return toolError(formatApiError(error));
  }
}

const compareRefsSchema = z.object({
  host: z.string().optional().describe("Host alias from config"),
  projectIdOrPath: z.string().describe("Project ID or URL-encoded path"),
  from: z.string().describe("Source branch name, tag, or commit SHA (base)"),
  to: z.string().describe("Target branch name, tag, or commit SHA (head)"),
  straight: z.boolean().optional().describe("Compare without merge base (straight diff)"),
  maxFiles: z.number().optional().describe("Max number of diff files to return"),
  maxBytes: z.number().optional().describe("Max response size in UTF-8 bytes"),
});

export async function compareRefs(params: z.infer<typeof compareRefsSchema>) {
  try {
    const client = getClient(params.host);
    const { host: _, projectIdOrPath, from, to, straight, maxFiles, maxBytes } = params;
    const apiPath = `/projects/${encodeProjectPath(projectIdOrPath)}/repository/compare`;
    const raw = await client.request<Record<string, unknown>>(apiPath, {
      params: { from, to, straight },
    });
    return toolResult(normalizeCompareResult(raw, { maxFiles, maxBytes }));
  } catch (error) {
    return toolError(formatApiError(error));
  }
}

export const listCommitsTool = {
  name: "gitlab_list_commits",
  description: "List repository commits for a project",
  schema: listCommitsSchema,
  handler: listCommits,
};

export const getCommitTool = {
  name: "gitlab_get_commit",
  description: "Get details of a specific commit including the full message",
  schema: getCommitSchema,
  handler: getCommit,
};

export const compareRefsTool = {
  name: "gitlab_compare_refs",
  description: "Compare two branches, tags, or commits — returns commits and diffs between them",
  schema: compareRefsSchema,
  handler: compareRefs,
};
