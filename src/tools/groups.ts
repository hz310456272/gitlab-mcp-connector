import { z } from "zod";
import { encodeProjectPath } from "../gitlab/client.js";
import { getClient, toolResult, toolError } from "./helpers.js";
import { normalizeGroup, normalizeGroupList, normalizeProjectList } from "./normalize.js";
import { formatApiError } from "../errors.js";

const listGroupsSchema = z.object({
  host: z.string().optional().describe("Host alias from config"),
  search: z.string().optional().describe("Search group name or path"),
  topLevelOnly: z.boolean().optional().describe("Limit to top-level groups"),
  orderBy: z.enum(["name", "path", "id"]).optional().describe("Order by field (default name)"),
  sort: z.enum(["asc", "desc"]).optional().describe("Sort direction (default asc)"),
  page: z.number().optional().describe("Page number (default 1)"),
  perPage: z.number().optional().describe("Results per page (default 20, max 100)"),
});

export async function listGroups(params: z.infer<typeof listGroupsSchema>) {
  try {
    const client = getClient(params.host);
    const { host: _, topLevelOnly, orderBy, sort, search, page, perPage } = params;
    const raw = await client.request<Record<string, unknown>[]>("/groups", {
      params: {
        search,
        top_level_only: topLevelOnly,
        order_by: orderBy,
        sort,
      },
      pagination: { page, perPage },
    });
    return toolResult(normalizeGroupList(raw));
  } catch (error) {
    return toolError(formatApiError(error));
  }
}

const getGroupSchema = z.object({
  host: z.string().optional().describe("Host alias from config"),
  groupIdOrPath: z.string().describe("Group ID or URL-encoded path (e.g. group/subgroup)"),
});

export async function getGroup(params: z.infer<typeof getGroupSchema>) {
  try {
    const client = getClient(params.host);
    const { host: _, groupIdOrPath } = params;
    const path = `/groups/${encodeProjectPath(groupIdOrPath)}`;
    const raw = await client.request<Record<string, unknown>>(path);
    return toolResult(normalizeGroup(raw));
  } catch (error) {
    return toolError(formatApiError(error));
  }
}

const listGroupProjectsSchema = z.object({
  host: z.string().optional().describe("Host alias from config"),
  groupIdOrPath: z.string().describe("Group ID or URL-encoded path"),
  search: z.string().optional().describe("Search project name"),
  archived: z.boolean().optional().describe("Limit to archived projects"),
  visibility: z.enum(["public", "internal", "private"]).optional().describe("Limit by visibility"),
  includeSubgroups: z.boolean().optional().describe("Include projects from subgroups"),
  orderBy: z.enum(["name", "path", "id", "created_at", "updated_at"]).optional().describe("Order by field"),
  sort: z.enum(["asc", "desc"]).optional().describe("Sort direction"),
  page: z.number().optional().describe("Page number (default 1)"),
  perPage: z.number().optional().describe("Results per page (default 20, max 100)"),
});

export async function listGroupProjects(params: z.infer<typeof listGroupProjectsSchema>) {
  try {
    const client = getClient(params.host);
    const { host: _, groupIdOrPath, includeSubgroups, archived, visibility, orderBy, sort, search, page, perPage } = params;
    const path = `/groups/${encodeProjectPath(groupIdOrPath)}/projects`;
    const raw = await client.request<Record<string, unknown>[]>(path, {
      params: {
        search,
        archived,
        visibility,
        include_subgroups: includeSubgroups,
        order_by: orderBy,
        sort,
      },
      pagination: { page, perPage },
    });
    return toolResult(normalizeProjectList(raw));
  } catch (error) {
    return toolError(formatApiError(error));
  }
}

export const listGroupsTool = {
  name: "gitlab_list_groups",
  description: "List accessible GitLab groups",
  schema: listGroupsSchema,
  handler: listGroups,
};

export const getGroupTool = {
  name: "gitlab_get_group",
  description: "Get details of a specific GitLab group",
  schema: getGroupSchema,
  handler: getGroup,
};

export const listGroupProjectsTool = {
  name: "gitlab_list_group_projects",
  description: "List projects in a GitLab group",
  schema: listGroupProjectsSchema,
  handler: listGroupProjects,
};
