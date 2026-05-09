import { z } from "zod";
import { encodeProjectPath } from "../gitlab/client.js";
import { getClient, toolResult, toolError } from "./helpers.js";
import { normalizeCiLintIncludes, normalizeCiLintJobs } from "./normalize.js";
import { formatApiError } from "../errors.js";

const DEFAULT_FILE_PATH = ".gitlab-ci.yml";
const DEFAULT_FILE_MAX_BYTES = 200 * 1024;

function byteLength(s: string): number {
  return Buffer.byteLength(s, "utf8");
}

function computeEffectiveMaxBytes(
  stablePayload: Record<string, unknown>,
  requested: number | undefined,
): number {
  const base = requested ?? DEFAULT_FILE_MAX_BYTES;
  const stableSize = byteLength(JSON.stringify(stablePayload)) + 512;
  return Math.max(base, stableSize);
}

function truncateField(text: string, availableBytes: number): { value: string; truncated: boolean } {
  if (byteLength(text) <= availableBytes) {
    return { value: text, truncated: false };
  }
  const suffix = "\n... [truncated]";
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (byteLength(text.slice(0, mid) + suffix) <= availableBytes) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  if (lo > 0) {
    return { value: text.slice(0, lo) + suffix, truncated: true };
  }
  return { value: "", truncated: true };
}

const ciConfigSchema = z.object({
  host: z.string().optional().describe("Host alias from config"),
  projectIdOrPath: z.string().describe("Project ID or URL-encoded path"),
  ref: z.string().optional().describe("Branch or tag to read CI config from (default: HEAD)"),
  filePath: z.string().optional().describe("CI config file path (default: .gitlab-ci.yml)"),
  maxBytes: z.number().optional().describe("Max response payload size in UTF-8 bytes (default 200KB)"),
});

type CiConfigParams = z.infer<typeof ciConfigSchema>;

interface FileResponse {
  content?: string;
  encoding?: string;
  file_name?: string;
  file_path?: string;
  size?: number;
  ref?: string;
  blob_id?: string;
  content_sha256?: string;
  commit_id?: string;
  last_commit_id?: string;
  [key: string]: unknown;
}

interface LintResponse {
  valid?: boolean;
  errors?: string[];
  warnings?: string[];
  merged_yaml?: string;
  includes?: Array<{
    type?: string;
    location?: string;
    blob?: string;
    raw?: string;
    extra?: Record<string, unknown>;
    context_project?: string;
    context_sha?: string;
    [key: string]: unknown;
  }>;
  jobs?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export async function getCiConfig(params: CiConfigParams) {
  try {
    const client = getClient(params.host);
    const { host: _, projectIdOrPath, ref, filePath, maxBytes } = params;
    const effectiveFilePath = filePath || DEFAULT_FILE_PATH;
    const encodedPath = encodeURIComponent(effectiveFilePath);

    const fileApiPath = `/projects/${encodeProjectPath(projectIdOrPath)}/repository/files/${encodedPath}`;
    const fileRaw = await client.request<FileResponse>(fileApiPath, {
      params: { ref },
    });

    let content: string | null = null;
    let contentEncoding: string | null = null;
    if (fileRaw.encoding === "base64" && fileRaw.content) {
      content = Buffer.from(fileRaw.content, "base64").toString("utf-8");
      contentEncoding = "utf-8";
    } else if (fileRaw.content) {
      content = fileRaw.content;
      contentEncoding = fileRaw.encoding ?? null;
    }

    let lintResult: LintResponse | null = null;
    let lintFailed = false;
    try {
      const lintApiPath = `/projects/${encodeProjectPath(projectIdOrPath)}/ci/lint`;
      lintResult = await client.request<LintResponse>(lintApiPath, {
        params: { content_ref: ref, include_jobs: true },
      });
    } catch {
      lintFailed = true;
    }

    if (lintFailed) {
      return toolError("Failed to retrieve CI lint results for the project");
    }

    const includes = normalizeCiLintIncludes(lintResult?.includes ?? []);
    const jobs = normalizeCiLintJobs(lintResult?.jobs ?? []);

    const isDefaultPath = effectiveFilePath === DEFAULT_FILE_PATH;

    const stablePayload: Record<string, unknown> = {
      project_id: (fileRaw as Record<string, unknown>).project_id ?? undefined,
      file_path: fileRaw.file_path ?? effectiveFilePath,
      ref: ref ?? null,
      content: null,
      content_truncated: false,
      content_encoding: contentEncoding,
      valid: lintResult?.valid ?? null,
      errors: lintResult?.errors ?? [],
      warnings: lintResult?.warnings ?? [],
      merged_yaml: null,
      merged_yaml_truncated: false,
      includes,
      jobs,
      truncated: false,
      max_bytes: 0,
    };

    if (!isDefaultPath) {
      stablePayload.lint_source = "project_default_ci_config";
    }

    const effectiveMaxBytes = computeEffectiveMaxBytes(stablePayload, maxBytes);

    let overallTruncated = false;
    const mergedYaml = lintResult?.merged_yaml ?? null;
    let mergedYamlTruncated = false;
    let contentTruncated = false;

    if (mergedYaml !== null) {
      const budgetAfterStable = effectiveMaxBytes - byteLength(JSON.stringify({ ...stablePayload, merged_yaml: null, content: null, max_bytes: effectiveMaxBytes }));
      const result = truncateField(mergedYaml, budgetAfterStable);
      stablePayload.merged_yaml = result.value;
      mergedYamlTruncated = result.truncated;
      if (result.truncated) overallTruncated = true;
    }

    if (content !== null) {
      const payloadWithoutContent = { ...stablePayload, content: null, max_bytes: effectiveMaxBytes };
      const budgetForContent = effectiveMaxBytes - byteLength(JSON.stringify(payloadWithoutContent));
      const result = truncateField(content, budgetForContent);
      stablePayload.content = result.value;
      contentTruncated = result.truncated;
      if (result.truncated) overallTruncated = true;
    }

    stablePayload.content_truncated = contentTruncated;
    stablePayload.merged_yaml_truncated = mergedYamlTruncated;
    stablePayload.truncated = overallTruncated;
    stablePayload.max_bytes = effectiveMaxBytes;

    return toolResult(stablePayload);
  } catch (error) {
    return toolError(formatApiError(error));
  }
}

export const ciConfigTool = {
  name: "gitlab_get_ci_config",
  description: "Read project CI configuration including raw file content and GitLab CI lint results (merged YAML, includes, jobs, validation errors)",
  schema: ciConfigSchema,
  handler: getCiConfig,
};
