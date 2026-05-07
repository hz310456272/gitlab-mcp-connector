import { z } from "zod";
import { encodeProjectPath } from "../gitlab/client.js";
import { getClient, toolResult, toolError } from "./helpers.js";
import { normalizeBranchList, normalizeTagList } from "./normalize.js";
import { formatApiError } from "../errors.js";

const listBranchesSchema = z.object({
  host: z.string().optional().describe("Host alias from config"),
  projectIdOrPath: z.string().describe("Project ID or URL-encoded path"),
  search: z.string().optional().describe("Search query for branch name"),
  regex: z.string().optional().describe("Regex pattern to filter branches"),
  page: z.number().optional().describe("Page number (default 1)"),
  perPage: z.number().optional().describe("Results per page (default 20, max 100)"),
});

export async function listBranches(params: z.infer<typeof listBranchesSchema>) {
  try {
    const client = getClient(params.host);
    const { host: _, projectIdOrPath, search, regex, page, perPage } = params;
    const path = `/projects/${encodeProjectPath(projectIdOrPath)}/repository/branches`;
    const raw = await client.request<Record<string, unknown>[]>(path, {
      params: { search, regex },
      pagination: { page, perPage },
    });
    return toolResult(normalizeBranchList(raw));
  } catch (error) {
    return toolError(formatApiError(error));
  }
}

const listTagsSchema = z.object({
  host: z.string().optional().describe("Host alias from config"),
  projectIdOrPath: z.string().describe("Project ID or URL-encoded path"),
  search: z.string().optional().describe("Search query for tag name"),
  orderBy: z.enum(["name", "updated", "version"]).optional().describe("Sort field"),
  sort: z.enum(["asc", "desc"]).optional().describe("Sort direction"),
  page: z.number().optional().describe("Page number (default 1)"),
  perPage: z.number().optional().describe("Results per page (default 20, max 100)"),
});

export async function listTags(params: z.infer<typeof listTagsSchema>) {
  try {
    const client = getClient(params.host);
    const { host: _, projectIdOrPath, search, orderBy, sort, page, perPage } = params;
    const path = `/projects/${encodeProjectPath(projectIdOrPath)}/repository/tags`;
    const raw = await client.request<Record<string, unknown>[]>(path, {
      params: { search, order_by: orderBy, sort },
      pagination: { page, perPage },
    });
    return toolResult(normalizeTagList(raw));
  } catch (error) {
    return toolError(formatApiError(error));
  }
}

export const listBranchesTool = {
  name: "gitlab_list_branches",
  description: "List repository branches for a project",
  schema: listBranchesSchema,
  handler: listBranches,
};

export const listTagsTool = {
  name: "gitlab_list_tags",
  description: "List repository tags for a project",
  schema: listTagsSchema,
  handler: listTags,
};
