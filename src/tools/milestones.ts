import { z } from "zod";
import { encodeProjectPath } from "../gitlab/client.js";
import { getClient, toolResult, toolError } from "./helpers.js";
import { normalizeMilestoneList } from "./normalize.js";
import { formatApiError } from "../errors.js";

const listMilestonesSchema = z.object({
  host: z.string().optional().describe("Host alias from config"),
  projectIdOrPath: z.string().describe("Project ID or URL-encoded path"),
  state: z.enum(["active", "closed", "all"]).optional().describe("Milestone state filter"),
  search: z.string().optional().describe("Search query"),
  page: z.number().optional().describe("Page number (default 1)"),
  perPage: z.number().optional().describe("Results per page (default 20, max 100)"),
});

export async function listMilestones(params: z.infer<typeof listMilestonesSchema>) {
  try {
    const client = getClient(params.host);
    const { host: _, projectIdOrPath, state, search, page, perPage } = params;
    const path = `/projects/${encodeProjectPath(projectIdOrPath)}/milestones`;
    const raw = await client.request<Record<string, unknown>[]>(path, {
      params: { state, search },
      pagination: { page, perPage },
    });
    return toolResult(normalizeMilestoneList(raw));
  } catch (error) {
    return toolError(formatApiError(error));
  }
}

export const listMilestonesTool = {
  name: "gitlab_list_milestones",
  description: "List milestones for a project",
  schema: listMilestonesSchema,
  handler: listMilestones,
};
