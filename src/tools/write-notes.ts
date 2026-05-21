import { z } from "zod";
import { encodeProjectPath } from "../gitlab/client.js";
import { getClient, toolResult, toolError } from "./helpers.js";
import { normalizeCreatedNote } from "./normalize.js";
import { formatApiError } from "../errors.js";
import { withWriteSafety } from "../write/middleware.js";
import { RiskLevel } from "../write/types.js";
import type { AuditEntry, WriteSafetyParams } from "../write/types.js";

const noteBodySchema = z.string().max(1_000_000).describe("Note content (Markdown)");

const createMergeRequestNoteSchema = z.object({
  host: z.string().optional().describe("Host alias from config"),
  projectIdOrPath: z.string().describe("Project ID or URL-encoded path"),
  mergeRequestIid: z.number().describe("Merge request IID"),
  body: noteBodySchema,
  dryRun: z.boolean().optional().describe("Preview the operation without executing"),
  confirm: z.boolean().optional().describe("Explicit confirmation for the operation"),
});

const createIssueNoteSchema = z.object({
  host: z.string().optional().describe("Host alias from config"),
  projectIdOrPath: z.string().describe("Project ID or URL-encoded path"),
  issueIid: z.number().describe("Issue IID"),
  body: noteBodySchema,
  dryRun: z.boolean().optional().describe("Preview the operation without executing"),
  confirm: z.boolean().optional().describe("Explicit confirmation for the operation"),
});

function makeAuditLogger() {
  return (entry: AuditEntry) => {
    console.error(JSON.stringify(entry));
  };
}

export async function createMergeRequestNote(
  params: z.infer<typeof createMergeRequestNoteSchema>,
) {
  const client = getClient(params.host);
  const apiPath = `/projects/${encodeProjectPath(params.projectIdOrPath)}/merge_requests/${params.mergeRequestIid}/notes`;
  const postBody = { body: params.body };
  const audit = makeAuditLogger();

  return withWriteSafety(
    "gitlab_create_merge_request_note",
    {
      method: "POST",
      path: apiPath,
      body: postBody,
      riskLevel: RiskLevel.LOW,
    },
    async () => {
      try {
        const raw = await client.post<Record<string, unknown>>(apiPath, postBody);
        return toolResult(normalizeCreatedNote(raw));
      } catch (error) {
        return toolError(formatApiError(error));
      }
    },
    { dryRun: params.dryRun, confirm: params.confirm } as WriteSafetyParams,
    audit,
  );
}

export async function createIssueNote(
  params: z.infer<typeof createIssueNoteSchema>,
) {
  const client = getClient(params.host);
  const apiPath = `/projects/${encodeProjectPath(params.projectIdOrPath)}/issues/${params.issueIid}/notes`;
  const postBody = { body: params.body };
  const audit = makeAuditLogger();

  return withWriteSafety(
    "gitlab_create_issue_note",
    {
      method: "POST",
      path: apiPath,
      body: postBody,
      riskLevel: RiskLevel.LOW,
    },
    async () => {
      try {
        const raw = await client.post<Record<string, unknown>>(apiPath, postBody);
        return toolResult(normalizeCreatedNote(raw));
      } catch (error) {
        return toolError(formatApiError(error));
      }
    },
    { dryRun: params.dryRun, confirm: params.confirm } as WriteSafetyParams,
    audit,
  );
}

export const createMergeRequestNoteTool = {
  name: "gitlab_create_merge_request_note",
  description: "Create a note (comment) on a merge request. This is an append-only write operation.",
  schema: createMergeRequestNoteSchema,
  handler: createMergeRequestNote,
};

export const createIssueNoteTool = {
  name: "gitlab_create_issue_note",
  description: "Create a note (comment) on an issue. This is an append-only write operation.",
  schema: createIssueNoteSchema,
  handler: createIssueNote,
};
