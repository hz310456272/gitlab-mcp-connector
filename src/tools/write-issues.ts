import { z } from "zod";
import { encodeProjectPath } from "../gitlab/client.js";
import { getClient, toolResult, toolError } from "./helpers.js";
import { normalizeCreatedIssue } from "./normalize.js";
import { formatApiError } from "../errors.js";
import { withWriteSafety, dedupWindow } from "../write/middleware.js";
import { RiskLevel } from "../write/types.js";

const createIssueSchema = z.object({
  host: z.string().optional().describe("Host alias from config"),
  projectIdOrPath: z.string().describe("Project ID or URL-encoded path"),
  title: z.string().min(1).max(255).describe("Issue title (required, max 255 chars)"),
  description: z.string().max(1000000).optional().describe("Issue description (max 1,000,000 chars)"),
  labels: z.array(z.string()).optional().describe("Label names as an array of strings"),
  assigneeIds: z.array(z.number()).optional().describe("Array of user IDs to assign"),
  milestoneId: z.number().optional().describe("Milestone ID to assign"),
  dryRun: z.boolean().optional().describe("Preview the operation without executing"),
  confirm: z.boolean().optional().describe("Confirm execution (required for HIGH risk, optional for LOW)"),
});

export async function createIssue(params: z.infer<typeof createIssueSchema>) {
  try {
    const client = getClient(params.host);
    const { host: _, projectIdOrPath, title, description, labels, assigneeIds, milestoneId, dryRun, confirm } = params;

    const apiPath = `/projects/${encodeProjectPath(projectIdOrPath)}/issues`;

    const postBody: Record<string, unknown> = { title };
    if (description !== undefined) postBody.description = description;
    if (labels !== undefined && labels.length > 0) postBody.labels = labels.join(",");
    if (assigneeIds !== undefined) postBody.assignee_ids = assigneeIds;
    if (milestoneId !== undefined) postBody.milestone_id = milestoneId;

    return withWriteSafety(
      "gitlab_create_issue",
      { method: "POST", path: apiPath, body: postBody, riskLevel: RiskLevel.LOW },
      async () => {
        const raw = await client.post<Record<string, unknown>>(apiPath, postBody);
        return toolResult(normalizeCreatedIssue(raw));
      },
      { dryRun, confirm },
      (entry) => console.error(JSON.stringify(entry)),
    );
  } catch (error) {
    return toolError(formatApiError(error));
  }
}

export const createIssueTool = {
  name: "gitlab_create_issue",
  description: "Create a new issue in a GitLab project. This is a low-risk append-only operation.",
  schema: createIssueSchema,
  handler: createIssue,
};

export { dedupWindow };
