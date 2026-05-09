import { z } from "zod";
import { encodeProjectPath } from "../gitlab/client.js";
import { getClient, toolResult, toolError } from "./helpers.js";
import { normalizeLabelList } from "./normalize.js";
import { formatApiError } from "../errors.js";

const listLabelsSchema = z.object({
  host: z.string().optional().describe("Host alias from config"),
  projectIdOrPath: z.string().describe("Project ID or URL-encoded path"),
  search: z.string().optional().describe("Search query for label name"),
  page: z.number().optional().describe("Page number (default 1)"),
  perPage: z.number().optional().describe("Results per page (default 20, max 100)"),
});

export async function listLabels(params: z.infer<typeof listLabelsSchema>) {
  try {
    const client = getClient(params.host);
    const { host: _, projectIdOrPath, search, page, perPage } = params;
    const path = `/projects/${encodeProjectPath(projectIdOrPath)}/labels`;
    const raw = await client.request<Record<string, unknown>[]>(path, {
      params: { search },
      pagination: { page, perPage },
    });
    return toolResult(normalizeLabelList(raw));
  } catch (error) {
    return toolError(formatApiError(error));
  }
}

export const listLabelsTool = {
  name: "gitlab_list_labels",
  description: "List labels for a project",
  schema: listLabelsSchema,
  handler: listLabels,
};
