import { z } from "zod";
import { encodeProjectPath } from "../gitlab/client.js";
import { getClient, toolResult, toolError } from "./helpers.js";
import { normalizeBranchList, normalizeTagList, normalizeTreeNodeList } from "./normalize.js";
import { isBinary, byteLength } from "./binary.js";
import { formatApiError } from "../errors.js";

const listBranchesSchema = z.object({
  host: z.string().optional().describe("Host alias from config"),
  projectIdOrPath: z.string().describe("Project ID or URL-encoded path"),
  search: z.string().optional().describe("Search query for branch name"),
  regex: z.string().optional().describe("Regex pattern to filter branches"),
  page: z.number().optional().describe("Page number (default 1)"),
  perPage: z.number().optional().describe("Results per page (default 20, max 100)"),
});

export async function listBranches(params: z.infer<typeof listBranchesSchema>) {
  try {
    const client = getClient(params.host);
    const { host: _, projectIdOrPath, search, regex, page, perPage } = params;
    const path = `/projects/${encodeProjectPath(projectIdOrPath)}/repository/branches`;
    const raw = await client.request<Record<string, unknown>[]>(path, {
      params: { search, regex },
      pagination: { page, perPage },
    });
    return toolResult(normalizeBranchList(raw));
  } catch (error) {
    return toolError(formatApiError(error));
  }
}

const listTagsSchema = z.object({
  host: z.string().optional().describe("Host alias from config"),
  projectIdOrPath: z.string().describe("Project ID or URL-encoded path"),
  search: z.string().optional().describe("Search query for tag name"),
  orderBy: z.enum(["name", "updated", "version"]).optional().describe("Sort field"),
  sort: z.enum(["asc", "desc"]).optional().describe("Sort direction"),
  page: z.number().optional().describe("Page number (default 1)"),
  perPage: z.number().optional().describe("Results per page (default 20, max 100)"),
});

export async function listTags(params: z.infer<typeof listTagsSchema>) {
  try {
    const client = getClient(params.host);
    const { host: _, projectIdOrPath, search, orderBy, sort, page, perPage } = params;
    const path = `/projects/${encodeProjectPath(projectIdOrPath)}/repository/tags`;
    const raw = await client.request<Record<string, unknown>[]>(path, {
      params: { search, order_by: orderBy, sort },
      pagination: { page, perPage },
    });
    return toolResult(normalizeTagList(raw));
  } catch (error) {
    return toolError(formatApiError(error));
  }
}

export const listBranchesTool = {
  name: "gitlab_list_branches",
  description: "List repository branches for a project",
  schema: listBranchesSchema,
  handler: listBranches,
};

export const listTagsTool = {
  name: "gitlab_list_tags",
  description: "List repository tags for a project",
  schema: listTagsSchema,
  handler: listTags,
};

const listRepositoryTreeSchema = z.object({
  host: z.string().optional().describe("Host alias from config"),
  projectIdOrPath: z.string().describe("Project ID or URL-encoded path"),
  path: z.string().optional().describe("Subdirectory path inside the repository"),
  ref: z.string().optional().describe("Branch name, tag, or commit SHA"),
  recursive: z.boolean().optional().describe("Include entries from subdirectories"),
  page: z.number().optional().describe("Page number (default 1)"),
  perPage: z.number().optional().describe("Results per page (default 20, max 100)"),
});

export async function listRepositoryTree(params: z.infer<typeof listRepositoryTreeSchema>) {
  try {
    const client = getClient(params.host);
    const { host: _, projectIdOrPath, path, ref, recursive, page, perPage } = params;
    const apiPath = `/projects/${encodeProjectPath(projectIdOrPath)}/repository/tree`;
    const raw = await client.request<Record<string, unknown>[]>(apiPath, {
      params: { path, ref, recursive },
      pagination: { page, perPage },
    });
    return toolResult(normalizeTreeNodeList(raw));
  } catch (error) {
    return toolError(formatApiError(error));
  }
}

export const listRepositoryTreeTool = {
  name: "gitlab_list_repository_tree",
  description: "List repository tree (files and directories) for a project",
  schema: listRepositoryTreeSchema,
  handler: listRepositoryTree,
};

const DEFAULT_FILE_MAX_BYTES = 200 * 1024;
const MIN_PAYLOAD_MAX_BYTES = 150;

function truncateContentInPayload(payload: Record<string, unknown>, limit: number): void {
  const content = payload.content as string;
  if (content == null) return;

  const text = content;
  const suffix = "\n... [truncated]";

  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    payload.content = text.slice(0, mid) + suffix;
    payload.truncated = true;
    if (byteLength(JSON.stringify(payload)) <= limit) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }

  if (lo > 0) {
    payload.content = text.slice(0, lo) + suffix;
  } else {
    payload.content = "";
    payload.truncated = true;
  }
}

const getRepositoryFileSchema = z.object({
  host: z.string().optional().describe("Host alias from config"),
  projectIdOrPath: z.string().describe("Project ID or URL-encoded path"),
  filePath: z.string().describe("Path to the file within the repository"),
  ref: z.string().optional().describe("Branch name, tag, or commit SHA (default: HEAD)"),
  maxBytes: z.number().optional().describe("Max response payload size in UTF-8 bytes (default 200KB)"),
});

export async function getRepositoryFile(params: z.infer<typeof getRepositoryFileSchema>) {
  try {
    const client = getClient(params.host);
    const { host: _, projectIdOrPath, filePath, ref, maxBytes } = params;
    const effectiveRef = ref ?? "HEAD";
    const encodedPath = encodeURIComponent(filePath);
    const apiPath = `/projects/${encodeProjectPath(projectIdOrPath)}/repository/files/${encodedPath}`;
    const raw = await client.request<Record<string, unknown>>(apiPath, { params: { ref: effectiveRef } });

    const limit = Math.max(maxBytes ?? DEFAULT_FILE_MAX_BYTES, MIN_PAYLOAD_MAX_BYTES);
    const size = raw.size as number | undefined;

    const contentB64 = raw.content as string | undefined;
    const encoding = raw.encoding as string | undefined;

    if (!contentB64 || encoding !== "base64") {
      const payload: Record<string, unknown> = {
        file_name: raw.file_name,
        file_path: raw.file_path,
        size,
        ref: raw.ref,
        binary: false,
        content: contentB64 ?? "",
        truncated: false,
        max_bytes: limit,
      };
      if (byteLength(JSON.stringify(payload)) > limit) {
        truncateContentInPayload(payload, limit);
      }
      return toolResult(payload);
    }

    const buf = Buffer.from(contentB64, "base64");
    const binary = isBinary(buf);

    if (binary) {
      const payload: Record<string, unknown> = {
        file_name: raw.file_name,
        file_path: raw.file_path,
        size,
        ref: raw.ref,
        binary: true,
        content: contentB64,
        encoding: "base64",
        truncated: false,
        max_bytes: limit,
      };
      if (byteLength(JSON.stringify(payload)) > limit) {
        truncateContentInPayload(payload, limit);
      }
      return toolResult(payload);
    }

    const payload: Record<string, unknown> = {
      file_name: raw.file_name,
      file_path: raw.file_path,
      size,
      ref: raw.ref,
      binary: false,
      content: buf.toString("utf-8"),
      truncated: false,
      max_bytes: limit,
    };

    if (byteLength(JSON.stringify(payload)) > limit) {
      truncateContentInPayload(payload, limit);
    }
    return toolResult(payload);
  } catch (error) {
    return toolError(formatApiError(error));
  }
}

export const getRepositoryFileTool = {
  name: "gitlab_get_repository_file",
  description: "Get the content of a file from the repository",
  schema: getRepositoryFileSchema,
  handler: getRepositoryFile,
};
