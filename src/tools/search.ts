import { z } from "zod";
import { encodeProjectPath } from "../gitlab/client.js";
import { getClient, toolResult, toolError } from "./helpers.js";
import {
  normalizeSearchProject,
  normalizeSearchIssue,
  normalizeSearchMergeRequest,
  normalizeSearchMilestone,
  normalizeSearchCommit,
  normalizeSearchBlob,
  normalizeSearchNote,
  normalizeSearchWikiBlob,
  normalizeSearchUser,
} from "./normalize.js";
import { formatApiError } from "../errors.js";

const SEARCH_SCOPES = [
  "projects", "issues", "merge_requests", "milestones",
  "commits", "blobs", "notes", "wiki_blobs", "users",
] as const;

const searchSchema = z.object({
  host: z.string().optional().describe("Host alias from config"),
  scope: z.enum(SEARCH_SCOPES).describe("Search scope"),
  search: z.string().min(1).describe("Search query string"),
  projectIdOrPath: z.string().optional().describe("Project ID or path for project-level search"),
  groupIdOrPath: z.string().optional().describe("Group ID or path for group-level search"),
  ref: z.string().optional().describe("Branch or tag (blobs/commits/wiki_blobs, project level only)"),
  searchType: z.enum(["basic", "advanced", "zoekt"]).optional().describe("Search type"),
  page: z.number().optional().describe("Page number (default 1)"),
  perPage: z.number().optional().describe("Results per page (default 20, max 100)"),
});

type SearchScope = (typeof SEARCH_SCOPES)[number];

type SearchParams = z.infer<typeof searchSchema>;

function determineLevel(params: SearchParams): "instance" | "group" | "project" {
  if (params.projectIdOrPath) return "project";
  if (params.groupIdOrPath) return "group";
  return "instance";
}

function buildSearchPath(params: SearchParams): string {
  if (params.projectIdOrPath) {
    return `/projects/${encodeProjectPath(params.projectIdOrPath)}/search`;
  }
  if (params.groupIdOrPath) {
    return `/groups/${encodeProjectPath(params.groupIdOrPath)}/search`;
  }
  return "/search";
}

function normalizeSearchResults(scope: SearchScope, raw: Record<string, unknown>[]) {
  switch (scope) {
    case "projects": return raw.map(normalizeSearchProject);
    case "issues": return raw.map(normalizeSearchIssue);
    case "merge_requests": return raw.map(normalizeSearchMergeRequest);
    case "milestones": return raw.map(normalizeSearchMilestone);
    case "commits": return raw.map(normalizeSearchCommit);
    case "blobs": return raw.map(normalizeSearchBlob);
    case "notes": return raw.map(normalizeSearchNote);
    case "wiki_blobs": return raw.map(normalizeSearchWikiBlob);
    case "users": return raw.map(normalizeSearchUser);
  }
}

export async function search(params: SearchParams) {
  try {
    if (params.projectIdOrPath && params.groupIdOrPath) {
      return toolError("projectIdOrPath and groupIdOrPath cannot both be set");
    }
    if (params.projectIdOrPath && params.scope === "projects") {
      return toolError("scope 'projects' is not valid with projectIdOrPath; use gitlab_list_projects or gitlab_get_project instead");
    }

    const client = getClient(params.host);
    const { host: _, scope, search: query, ref, searchType, page, perPage } = params;
    const level = determineLevel(params);
    const path = buildSearchPath(params);

    const raw = await client.request<Record<string, unknown>[]>(path, {
      params: {
        scope,
        search: query,
        ref,
        search_type: searchType,
      },
      pagination: { page, perPage },
    });

    const results = normalizeSearchResults(scope, raw);
    return toolResult({ level, scope, results });
  } catch (error) {
    return toolError(formatApiError(error));
  }
}

export const searchTool = {
  name: "gitlab_search",
  description: "Search GitLab across projects, issues, merge requests, commits, code, and more",
  schema: searchSchema,
  handler: search,
};
