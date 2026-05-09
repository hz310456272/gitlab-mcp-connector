import { z } from "zod";
import { encodeProjectPath } from "../gitlab/client.js";
import { getClient, toolResult, toolError } from "./helpers.js";
import { normalizeIssue, normalizeIssueList } from "./normalize.js";
import { formatApiError } from "../errors.js";

const LIST_DESCRIPTION_MAX_CHARS = 500;
const DEFAULT_ISSUE_MAX_BYTES = 200 * 1024;
const MIN_ISSUE_MAX_BYTES = 1024;

function byteLength(s: string): number {
  return Buffer.byteLength(s, "utf8");
}

const listIssuesSchema = z.object({
  host: z.string().optional().describe("Host alias from config"),
  projectIdOrPath: z.string().optional().describe("Project ID or path. Omit for instance-level issues."),
  state: z.enum(["opened", "closed", "all"]).optional().describe("Issue state filter"),
  labels: z.union([z.string(), z.array(z.string())]).optional().describe("Label names as comma-separated string or array"),
  milestone: z.string().optional().describe("Milestone title filter"),
  scope: z.enum(["created_by_me", "assigned_to_me", "all"]).optional().describe("Issue scope"),
  authorUsername: z.string().optional().describe("Filter by author username"),
  assigneeUsername: z.string().optional().describe("Filter by assignee username"),
  search: z.string().optional().describe("Search query"),
  createdAfter: z.string().optional().describe("Only issues created after this ISO 8601 date"),
  createdBefore: z.string().optional().describe("Only issues created before this ISO 8601 date"),
  updatedAfter: z.string().optional().describe("Only issues updated after this ISO 8601 date"),
  updatedBefore: z.string().optional().describe("Only issues updated before this ISO 8601 date"),
  page: z.number().optional().describe("Page number (default 1)"),
  perPage: z.number().optional().describe("Results per page (default 20, max 100)"),
});

function resolveLabels(labels?: string | string[]): string | undefined {
  if (labels == null) return undefined;
  if (Array.isArray(labels)) return labels.join(",");
  return labels;
}

export async function listIssues(params: z.infer<typeof listIssuesSchema>) {
  try {
    const client = getClient(params.host);
    const {
      host: _, projectIdOrPath, page, perPage,
      state, labels, milestone, scope,
      authorUsername, assigneeUsername, search,
      createdAfter, createdBefore, updatedAfter, updatedBefore,
    } = params;

    const apiParams: Record<string, string | number | boolean | undefined> = {
      state,
      labels: resolveLabels(labels),
      milestone,
      scope,
      author_username: authorUsername,
      assignee_username: assigneeUsername,
      search,
      created_after: createdAfter,
      created_before: createdBefore,
      updated_after: updatedAfter,
      updated_before: updatedBefore,
    };

    const path = projectIdOrPath
      ? `/projects/${encodeProjectPath(projectIdOrPath)}/issues`
      : "/issues";

    const raw = await client.request<Record<string, unknown>[]>(path, {
      params: apiParams,
      pagination: { page, perPage },
    });

    return toolResult(normalizeIssueList(raw, { descriptionMaxChars: LIST_DESCRIPTION_MAX_CHARS }));
  } catch (error) {
    return toolError(formatApiError(error));
  }
}

const getIssueSchema = z.object({
  host: z.string().optional().describe("Host alias from config"),
  projectIdOrPath: z.string().describe("Project ID or URL-encoded path"),
  issueIid: z.number().describe("Issue IID (not global ID)"),
  maxBytes: z.number().optional().describe("Max response size in UTF-8 bytes (default 200KB)"),
});

function resolveEffectiveLimit(
  basePayload: Record<string, unknown>,
  requestedLimit: number,
): number {
  let limit = requestedLimit;
  for (let i = 0; i < 5; i++) {
    const size = byteLength(JSON.stringify({ ...basePayload, max_bytes: limit }));
    if (size <= limit) return limit;
    limit = size;
  }
  return limit;
}

function truncateIssuePayload(
  issue: Record<string, unknown>,
  requestedLimit: number,
): Record<string, unknown> {
  const base = { ...issue, description: "", description_truncated: true };
  const effectiveLimit = resolveEffectiveLimit(base, requestedLimit);

  const output: Record<string, unknown> = { ...issue, max_bytes: effectiveLimit };

  if (byteLength(JSON.stringify(output)) <= effectiveLimit) return output;

  const desc = typeof output.description === "string" ? output.description : "";

  let lo = 0;
  let hi = desc.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = { ...output, description: desc.slice(0, mid), description_truncated: true };
    if (byteLength(JSON.stringify(candidate)) <= effectiveLimit) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }

  if (lo > 0) {
    return { ...output, description: desc.slice(0, lo), description_truncated: true };
  }

  return { ...base, max_bytes: effectiveLimit };
}

export async function getIssue(params: z.infer<typeof getIssueSchema>) {
  try {
    const client = getClient(params.host);
    const { host: _, projectIdOrPath, issueIid, maxBytes } = params;
    const path = `/projects/${encodeProjectPath(projectIdOrPath)}/issues/${issueIid}`;
    const raw = await client.request<Record<string, unknown>>(path);

    const limit = Math.max(maxBytes ?? DEFAULT_ISSUE_MAX_BYTES, MIN_ISSUE_MAX_BYTES);
    const normalized = truncateIssuePayload(normalizeIssue(raw), limit);

    return toolResult(normalized);
  } catch (error) {
    return toolError(formatApiError(error));
  }
}

export const listIssuesTool = {
  name: "gitlab_list_issues",
  description: "List issues. Omit projectIdOrPath for instance-level issues. Returns truncated descriptions in list view.",
  schema: listIssuesSchema,
  handler: listIssues,
};

export const getIssueTool = {
  name: "gitlab_get_issue",
  description: "Get details of a specific issue with full description",
  schema: getIssueSchema,
  handler: getIssue,
};
