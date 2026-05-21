import { z } from "zod";
import { encodeProjectPath } from "../gitlab/client.js";
import { getClient, toolResult, toolError } from "./helpers.js";
import { normalizeCreatedMergeRequest } from "./normalize.js";
import { formatApiError } from "../errors.js";
import { withWriteSafety } from "../write/middleware.js";
import { RiskLevel } from "../write/types.js";
import type { WriteToolContext, WriteSafetyParams, AuditEntry } from "../write/types.js";

const createMergeRequestSchema = z.object({
  host: z.string().optional().describe("Host alias from config"),
  projectIdOrPath: z.string().describe("Project ID or URL-encoded path"),
  sourceBranch: z.string().min(1).describe("Source branch name"),
  targetBranch: z.string().min(1).describe("Target branch name"),
  title: z.string().min(1).max(255).describe("Merge request title"),
  description: z.string().max(1000000).optional().describe("Merge request description"),
  labels: z.array(z.string()).optional().describe("Array of label names"),
  assigneeIds: z.array(z.number()).optional().describe("Array of assignee user IDs"),
  reviewerIds: z.array(z.number()).optional().describe("Array of reviewer user IDs"),
  milestoneId: z.number().optional().describe("Milestone ID"),
  dryRun: z.boolean().optional().describe("Preview the operation without executing"),
  confirm: z.boolean().optional().describe("Explicit confirmation for high-risk operations"),
});

export async function createMergeRequest(params: z.infer<typeof createMergeRequestSchema>) {
  const {
    host,
    projectIdOrPath,
    sourceBranch,
    targetBranch,
    title,
    description,
    labels,
    assigneeIds,
    reviewerIds,
    milestoneId,
    dryRun,
    confirm,
  } = params;

  const client = getClient(host);
  const path = `/projects/${encodeProjectPath(projectIdOrPath)}/merge_requests`;

  // Build POST body — only include non-undefined fields, using snake_case
  const body: Record<string, unknown> = {
    source_branch: sourceBranch,
    target_branch: targetBranch,
    title,
  };

  if (description !== undefined) body.description = description;
  if (labels !== undefined) body.labels = labels;
  if (assigneeIds !== undefined) body.assignee_ids = assigneeIds;
  if (reviewerIds !== undefined) body.reviewer_ids = reviewerIds;
  if (milestoneId !== undefined) body.milestone_id = milestoneId;

  const ctx: WriteToolContext = {
    method: "POST",
    path,
    body,
    riskLevel: RiskLevel.LOW,
  };

  const safetyParams: WriteSafetyParams = { dryRun, confirm };

  const audit = (entry: AuditEntry): void => {
    process.stderr.write(JSON.stringify(entry) + "\n");
  };

  return withWriteSafety(
    "gitlab_create_merge_request",
    ctx,
    async () => {
      try {
        const raw = await client.post<Record<string, unknown>>(path, body);
        return toolResult(normalizeCreatedMergeRequest(raw));
      } catch (error) {
        return toolError(formatApiError(error));
      }
    },
    safetyParams,
    audit,
  );
}

export const createMergeRequestTool = {
  name: "gitlab_create_merge_request",
  description: "Create a new merge request in a GitLab project",
  schema: createMergeRequestSchema,
  handler: createMergeRequest,
};
