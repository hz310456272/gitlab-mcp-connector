function byteLength(s: string): number {
  return Buffer.byteLength(s, "utf8");
}

interface GitLabProject {
  id?: number;
  name?: string;
  path_with_namespace?: string;
  default_branch?: string | null;
  visibility?: string;
  web_url?: string;
  ssh_url_to_repo?: string | null;
  http_url_to_repo?: string | null;
  namespace?: { name?: string; path?: string; full_path?: string; kind?: string };
  description?: string | null;
  [key: string]: unknown;
}

interface GitLabBranch {
  name?: string;
  merged?: boolean;
  protected?: boolean;
  default?: boolean;
  web_url?: string;
  commit?: { short_id?: string; title?: string; created_at?: string };
  [key: string]: unknown;
}

interface GitLabTag {
  name?: string;
  target?: string;
  message?: string | null;
  protected?: boolean;
  created_at?: string;
  commit?: { short_id?: string; title?: string; created_at?: string };
  [key: string]: unknown;
}

interface GitLabMergeRequest {
  id?: number;
  iid?: number;
  title?: string;
  description?: string | null;
  state?: string;
  web_url?: string;
  source_branch?: string;
  target_branch?: string;
  author?: { username?: string; name?: string };
  reviewers?: Array<{ username?: string; name?: string }>;
  created_at?: string;
  updated_at?: string;
  merged_at?: string | null;
  draft?: boolean;
  merge_status?: string;
  labels?: string[];
  [key: string]: unknown;
}

interface GitLabDiff {
  old_path?: string;
  new_path?: string;
  new_file?: boolean;
  deleted_file?: boolean;
  diff?: string;
  [key: string]: unknown;
}

interface GitLabNotePosition {
  old_path?: string;
  new_path?: string;
  old_line?: number | null;
  new_line?: number | null;
  line_range?: unknown;
  base_sha?: string;
  start_sha?: string;
  head_sha?: string;
  [key: string]: unknown;
}

interface GitLabDiscussionNote {
  id?: number;
  type?: string | null;
  author?: { username?: string; name?: string };
  body?: string;
  created_at?: string;
  system?: boolean;
  resolvable?: boolean;
  resolved?: boolean;
  position?: GitLabNotePosition;
  [key: string]: unknown;
}

interface GitLabDiscussion {
  id?: string;
  notes?: GitLabDiscussionNote[];
  [key: string]: unknown;
}

interface GitLabPipeline {
  id?: number;
  status?: string;
  ref?: string;
  sha?: string;
  created_at?: string;
  updated_at?: string;
  web_url?: string;
  [key: string]: unknown;
}

export function normalizeProject(p: GitLabProject) {
  return {
    id: p.id,
    name: p.name,
    path_with_namespace: p.path_with_namespace,
    description: p.description ?? null,
    default_branch: p.default_branch ?? null,
    visibility: p.visibility,
    web_url: p.web_url,
    ssh_url_to_repo: p.ssh_url_to_repo ?? null,
    http_url_to_repo: p.http_url_to_repo ?? null,
    namespace: p.namespace
      ? { name: p.namespace.name, path: p.namespace.path, full_path: p.namespace.full_path, kind: p.namespace.kind }
      : undefined,
  };
}

export function normalizeProjectList(projects: GitLabProject[]) {
  return projects.map(normalizeProject);
}

export function normalizeBranch(b: GitLabBranch) {
  return {
    name: b.name,
    merged: b.merged,
    protected: b.protected,
    default: b.default,
    web_url: b.web_url,
    commit: b.commit ? { short_id: b.commit.short_id, title: b.commit.title, created_at: b.commit.created_at } : undefined,
  };
}

export function normalizeBranchList(branches: GitLabBranch[]) {
  return branches.map(normalizeBranch);
}

export function normalizeTag(t: GitLabTag) {
  return {
    name: t.name,
    target: t.target,
    message: t.message ?? null,
    protected: t.protected,
    created_at: t.created_at,
    commit: t.commit ? { short_id: t.commit.short_id, title: t.commit.title, created_at: t.commit.created_at } : undefined,
  };
}

export function normalizeTagList(tags: GitLabTag[]) {
  return tags.map(normalizeTag);
}

function normalizeUser(u?: { username?: string; name?: string }) {
  return u ? { username: u.username, name: u.name } : undefined;
}

export function normalizeMergeRequest(mr: GitLabMergeRequest) {
  return {
    id: mr.id,
    iid: mr.iid,
    title: mr.title,
    description: mr.description ?? null,
    state: mr.state,
    web_url: mr.web_url,
    source_branch: mr.source_branch,
    target_branch: mr.target_branch,
    author: normalizeUser(mr.author),
    reviewers: mr.reviewers?.map(normalizeUser),
    created_at: mr.created_at,
    updated_at: mr.updated_at,
    merged_at: mr.merged_at ?? null,
    draft: mr.draft,
    merge_status: mr.merge_status,
    labels: mr.labels,
  };
}

export function normalizeMergeRequestList(mrs: GitLabMergeRequest[]) {
  return mrs.map(normalizeMergeRequest);
}

export function normalizeDiff(d: GitLabDiff) {
  return {
    old_path: d.old_path,
    new_path: d.new_path,
    new_file: d.new_file,
    deleted_file: d.deleted_file,
    diff: d.diff,
  };
}

export interface NormalizedDiffResult {
  diffs: ReturnType<typeof normalizeDiff>[];
  truncated: boolean;
}

export function normalizeDiffList(
  rawDiffs: GitLabDiff[],
  maxFiles?: number,
  maxBytes?: number,
): NormalizedDiffResult {
  let diffs = rawDiffs.map(normalizeDiff);
  let truncated = false;

  if (maxFiles != null && diffs.length > maxFiles) {
    diffs = diffs.slice(0, maxFiles);
    truncated = true;
  }

  if (maxBytes != null) {
    const result: typeof diffs = [];
    const truncatedSuffix = "\n... [truncated]";

    for (const d of diffs) {
      const candidate = { diffs: [...result, d], truncated: false };
      const size = byteLength(JSON.stringify(candidate));

      if (size <= maxBytes) {
        result.push(d);
      } else if (result.length === 0) {
        const entryNoDiff = { ...d, diff: "" };
        const noDiffSize = byteLength(JSON.stringify({ diffs: [entryNoDiff], truncated: false }));
        const available = maxBytes - noDiffSize - byteLength(truncatedSuffix);
        if (available > 0 && d.diff) {
          // Binary search for the max cut length that fits
          let lo = 0;
          let hi = d.diff.length;
          while (lo < hi) {
            const mid = Math.ceil((lo + hi) / 2);
            const candidate2 = { diffs: [{ ...d, diff: d.diff.slice(0, mid) + truncatedSuffix }], truncated: false };
            if (byteLength(JSON.stringify(candidate2)) <= maxBytes) {
              lo = mid;
            } else {
              hi = mid - 1;
            }
          }
          if (lo > 0) {
            result.push({ ...d, diff: d.diff.slice(0, lo) + truncatedSuffix });
          }
        }
        truncated = true;
        break;
      } else {
        truncated = true;
        break;
      }
    }

    if (truncated) {
      const output = { diffs: result, truncated: true };
      let finalSize = byteLength(JSON.stringify(output));
      while (finalSize > maxBytes && result.length > 0 && result[result.length - 1].diff) {
        const last = result[result.length - 1];
        last.diff = last.diff!.slice(0, Math.max(0, last.diff!.length - 10));
        finalSize = byteLength(JSON.stringify(output));
      }
      if (finalSize > maxBytes && result.length > 0) {
        result.pop();
      }
    }

    diffs = result;
  }

  return { diffs, truncated };
}

function normalizePosition(pos?: GitLabNotePosition) {
  if (!pos) return undefined;
  return {
    old_path: pos.old_path,
    new_path: pos.new_path,
    old_line: pos.old_line ?? null,
    new_line: pos.new_line ?? null,
    line_range: pos.line_range ?? null,
  };
}

export function normalizeDiscussions(discussions: GitLabDiscussion[]) {
  const notes: Array<{
    discussion_id: string | undefined;
    note_id: number | undefined;
    type: "system" | "user";
    author: string | undefined;
    body: string | undefined;
    created_at: string | undefined;
    resolvable: boolean | undefined;
    resolved: boolean | undefined;
    position: ReturnType<typeof normalizePosition>;
  }> = [];

  for (const disc of discussions) {
    const discId = disc.id;
    for (const note of disc.notes ?? []) {
      notes.push({
        discussion_id: discId,
        note_id: note.id,
        type: note.system ? "system" : "user",
        author: note.author?.username,
        body: note.body,
        created_at: note.created_at,
        resolvable: note.resolvable,
        resolved: note.resolved,
        position: normalizePosition(note.position),
      });
    }
  }

  return notes;
}

export function normalizePipeline(p: GitLabPipeline) {
  return {
    id: p.id,
    status: p.status,
    ref: p.ref,
    sha: p.sha,
    created_at: p.created_at,
    updated_at: p.updated_at,
    web_url: p.web_url,
  };
}

export function normalizePipelineList(pipelines: GitLabPipeline[]) {
  return pipelines.map(normalizePipeline);
}

interface GitLabJob {
  id?: number;
  name?: string;
  stage?: string;
  status?: string;
  web_url?: string;
  started_at?: string | null;
  finished_at?: string | null;
  duration?: number | null;
  [key: string]: unknown;
}

export function normalizeJob(j: GitLabJob) {
  return {
    id: j.id,
    name: j.name,
    stage: j.stage,
    status: j.status,
    web_url: j.web_url,
    started_at: j.started_at ?? null,
    finished_at: j.finished_at ?? null,
    duration: j.duration ?? null,
  };
}

export function normalizeJobList(jobs: GitLabJob[]) {
  return jobs.map(normalizeJob);
}
