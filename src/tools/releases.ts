import { z } from "zod";
import { encodeProjectPath } from "../gitlab/client.js";
import { getClient, toolResult, toolError } from "./helpers.js";
import { normalizeRelease, normalizeReleaseList } from "./normalize.js";
import { formatApiError } from "../errors.js";

const listReleasesSchema = z.object({
  host: z.string().optional().describe("Host alias from config"),
  projectIdOrPath: z.string().describe("Project ID or URL-encoded path"),
  tagName: z.string().optional().describe("Filter by tag name"),
  search: z.string().optional().describe("Search by name or tag"),
  orderBy: z.enum(["released_at", "version"]).optional().describe("Order by field (default released_at)"),
  sort: z.enum(["asc", "desc"]).optional().describe("Sort direction (default desc)"),
  page: z.number().optional().describe("Page number (default 1)"),
  perPage: z.number().optional().describe("Results per page (default 20, max 100)"),
});

export async function listReleases(params: z.infer<typeof listReleasesSchema>) {
  try {
    const client = getClient(params.host);
    const { host: _, projectIdOrPath, tagName, search, orderBy, sort, page, perPage } = params;
    const path = `/projects/${encodeProjectPath(projectIdOrPath)}/releases`;
    const raw = await client.request<Record<string, unknown>[]>(path, {
      params: {
        tag_name: tagName,
        search,
        order_by: orderBy,
        sort,
      },
      pagination: { page, perPage },
    });
    return toolResult(normalizeReleaseList(raw));
  } catch (error) {
    return toolError(formatApiError(error));
  }
}

const getReleaseSchema = z.object({
  host: z.string().optional().describe("Host alias from config"),
  projectIdOrPath: z.string().describe("Project ID or URL-encoded path"),
  tagName: z.string().describe("Tag name of the release"),
});

export async function getRelease(params: z.infer<typeof getReleaseSchema>) {
  try {
    const client = getClient(params.host);
    const { host: _, projectIdOrPath, tagName } = params;
    const path = `/projects/${encodeProjectPath(projectIdOrPath)}/releases/${encodeURIComponent(tagName)}`;
    const raw = await client.request<Record<string, unknown>>(path);
    return toolResult(normalizeRelease(raw));
  } catch (error) {
    return toolError(formatApiError(error));
  }
}

export const listReleasesTool = {
  name: "gitlab_list_releases",
  description: "List releases for a project",
  schema: listReleasesSchema,
  handler: listReleases,
};

export const getReleaseTool = {
  name: "gitlab_get_release",
  description: "Get details of a specific release by tag name",
  schema: getReleaseSchema,
  handler: getRelease,
};
