import { z } from "zod";
import { encodeProjectPath } from "../gitlab/client.js";
import { getClient, toolResult, toolError } from "./helpers.js";
import { isBinary, byteLength } from "./binary.js";
import { formatApiError } from "../errors.js";

// --- list_job_artifacts ---

const listJobArtifactsSchema = z.object({
  host: z.string().optional().describe("Host alias from config"),
  projectIdOrPath: z.string().describe("Project ID or URL-encoded path"),
  jobId: z.number().describe("Job ID"),
});

interface GitLabJobResponse {
  id?: number;
  name?: string;
  stage?: string;
  status?: string;
  web_url?: string;
  started_at?: string | null;
  finished_at?: string | null;
  duration?: number | null;
  artifacts_expire_at?: string | null;
  artifacts?: Array<{
    file_type?: string;
    filename?: string;
    size?: number;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

export async function listJobArtifacts(params: z.infer<typeof listJobArtifactsSchema>) {
  try {
    const client = getClient(params.host);
    const { host: _, projectIdOrPath, jobId } = params;
    const apiPath = `/projects/${encodeProjectPath(projectIdOrPath)}/jobs/${jobId}`;
    const raw = await client.request<GitLabJobResponse>(apiPath);

    const artifacts = (raw.artifacts ?? []).map((a) => ({
      file_type: a.file_type,
      filename: a.filename,
      size: a.size,
    }));

    return toolResult({
      job_id: raw.id,
      job_name: raw.name,
      stage: raw.stage,
      status: raw.status,
      web_url: raw.web_url,
      started_at: raw.started_at ?? null,
      finished_at: raw.finished_at ?? null,
      duration: raw.duration ?? null,
      artifacts_expire_at: raw.artifacts_expire_at ?? null,
      artifacts,
    });
  } catch (error) {
    return toolError(formatApiError(error));
  }
}

export const listJobArtifactsTool = {
  name: "gitlab_list_job_artifacts",
  description: "List artifacts metadata for a job",
  schema: listJobArtifactsSchema,
  handler: listJobArtifacts,
};

// --- get_job_artifact_file ---

const DEFAULT_ARTIFACT_MAX_BYTES = 200 * 1024;
const MIN_PAYLOAD_MAX_BYTES = 150;

function validateArtifactPath(p: string): string | null {
  if (!p) return "artifactPath must not be empty";
  if (p.startsWith("/")) return "artifactPath must not start with /";
  const segments = p.split("/");
  for (const seg of segments) {
    if (seg === "" || seg === "." || seg === "..") {
      return `artifactPath contains invalid segment: "${seg}"`;
    }
  }
  return null;
}

function encodeArtifactPath(p: string): string {
  return p
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
}

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

const getJobArtifactFileSchema = z.object({
  host: z.string().optional().describe("Host alias from config"),
  projectIdOrPath: z.string().describe("Project ID or URL-encoded path"),
  jobId: z.number().describe("Job ID"),
  artifactPath: z.string().describe("Path of the artifact file within the archive (e.g. reports/junit.xml)"),
  maxBytes: z.number().optional().describe("Max response payload size in UTF-8 bytes (default 200KB)"),
});

export async function getJobArtifactFile(params: z.infer<typeof getJobArtifactFileSchema>) {
  try {
    const { host, projectIdOrPath, jobId, artifactPath, maxBytes } = params;

    const validationError = validateArtifactPath(artifactPath);
    if (validationError) {
      return toolError(validationError);
    }

    const client = getClient(host);
    const encodedPath = encodeArtifactPath(artifactPath);
    const apiPath = `/projects/${encodeProjectPath(projectIdOrPath)}/jobs/${jobId}/artifacts/${encodedPath}`;

    const response = await fetch(client.buildUrl(apiPath), {
      headers: {
        "PRIVATE-TOKEN": client.getToken(),
        "User-Agent": `gitlab-mcp-connector/0.1.0`,
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return toolError(`GitLab API ${response.status}: ${body.slice(0, 200)}`);
    }

    const contentLengthHeader = response.headers.get("content-length");
    const arrayBuf = await response.arrayBuffer();
    const buf = Buffer.from(arrayBuf);

    const size = contentLengthHeader != null
      ? Number(contentLengthHeader)
      : buf.byteLength;

    const limit = Math.max(maxBytes ?? DEFAULT_ARTIFACT_MAX_BYTES, MIN_PAYLOAD_MAX_BYTES);
    const binary = isBinary(buf);

    if (binary) {
      const b64 = buf.toString("base64");
      const payload: Record<string, unknown> = {
        artifact_path: artifactPath,
        job_id: jobId,
        size,
        binary: true,
        encoding: "base64",
        content: b64,
        truncated: false,
        max_bytes: limit,
      };
      if (byteLength(JSON.stringify(payload)) > limit) {
        truncateContentInPayload(payload, limit);
      }
      return toolResult(payload);
    }

    const text = buf.toString("utf-8");
    const payload: Record<string, unknown> = {
      artifact_path: artifactPath,
      job_id: jobId,
      size,
      binary: false,
      content: text,
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

export const getJobArtifactFileTool = {
  name: "gitlab_get_job_artifact_file",
  description: "Read a single artifact file from a job's artifacts archive",
  schema: getJobArtifactFileSchema,
  handler: getJobArtifactFile,
};
