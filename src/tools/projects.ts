import { z } from "zod";
import { encodeProjectPath } from "../gitlab/client.js";
import { getClient, toolResult, toolError } from "./helpers.js";
import { normalizeProjectList, normalizeProject } from "./normalize.js";
import { formatApiError } from "../errors.js";

const listProjectsSchema = z.object({
  host: z.string().optional().describe("Host alias from config"),
  search: z.string().optional().describe("Search query for project name"),
  membership: z.boolean().optional().describe("Limit to projects where user is a member"),
  owned: z.boolean().optional().describe("Limit to projects owned by user"),
  archived: z.boolean().optional().describe("Limit to archived projects"),
  visibility: z.enum(["public", "internal", "private"]).optional().describe("Limit by visibility"),
  page: z.number().optional().describe("Page number (default 1)"),
  perPage: z.number().optional().describe("Results per page (default 20, max 100)"),
});

export async function listProjects(params: z.infer<typeof listProjectsSchema>) {
  try {
    const client = getClient(params.host);
    const { host: _, page, perPage, ...apiParams } = params;
    const raw = await client.request<unknown[]>("/projects", {
      params: apiParams as Record<string, string | number | boolean | undefined>,
      pagination: { page, perPage },
    });
    return toolResult(normalizeProjectList(raw as Record<string, unknown>[]));
  } catch (error) {
    return toolError(formatApiError(error));
  }
}

const getProjectSchema = z.object({
  host: z.string().optional().describe("Host alias from config"),
  projectIdOrPath: z.string().describe("Project ID or URL-encoded path (e.g. group/sub/project)"),
});

export async function getProject(params: z.infer<typeof getProjectSchema>) {
  try {
    const client = getClient(params.host);
    const path = `/projects/${encodeProjectPath(params.projectIdOrPath)}`;
    const raw = await client.request<Record<string, unknown>>(path);
    return toolResult(normalizeProject(raw));
  } catch (error) {
    return toolError(formatApiError(error));
  }
}

export const listProjectsTool = {
  name: "gitlab_list_projects",
  description: "List accessible GitLab projects",
  schema: listProjectsSchema,
  handler: listProjects,
};

export const getProjectTool = {
  name: "gitlab_get_project",
  description: "Get details of a specific GitLab project",
  schema: getProjectSchema,
  handler: getProject,
};
