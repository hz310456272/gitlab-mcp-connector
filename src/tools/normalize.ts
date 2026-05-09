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

// --- Repository tree ---

interface GitLabTreeNode {
  id?: string;
  name?: string;
  type?: string;
  path?: string;
  mode?: string;
  [key: string]: unknown;
}

export function normalizeTreeNodeList(nodes: GitLabTreeNode[]) {
  return nodes.map((n) => ({
    id: n.id,
    name: n.name,
    type: n.type,
    path: n.path,
    mode: n.mode,
  }));
}

// --- Commits ---

interface GitLabCommit {
  id?: string;
  short_id?: string;
  title?: string;
  message?: string;
  author_name?: string;
  author_email?: string;
  authored_date?: string;
  committer_name?: string;
  committer_email?: string;
  committed_date?: string;
  parent_ids?: string[];
  web_url?: string;
  stats?: { additions?: number; deletions?: number; total_changes?: number };
  [key: string]: unknown;
}

export function normalizeCommit(c: GitLabCommit, includeDetail: boolean) {
  const base: Record<string, unknown> = {
    id: c.id,
    short_id: c.short_id,
    title: c.title,
    author_name: c.author_name,
    author_email: c.author_email,
    authored_date: c.authored_date,
    committer_name: c.committer_name,
    committer_email: c.committer_email,
    committed_date: c.committed_date,
    web_url: c.web_url,
    parent_ids: c.parent_ids,
  };
  if (includeDetail) {
    base.message = c.message;
    if (c.stats) {
      base.stats = c.stats;
    }
  }
  return base;
}

export function normalizeCommitList(commits: GitLabCommit[]) {
  return commits.map((c) => normalizeCommit(c, false));
}

// --- Issues ---

interface GitLabIssue {
  id?: number;
  iid?: number;
  title?: string;
  description?: string | null;
  state?: string;
  web_url?: string;
  author?: { username?: string; name?: string; [key: string]: unknown };
  assignees?: Array<{ username?: string; name?: string; [key: string]: unknown }>;
  labels?: string[];
  milestone?: { id?: number; title?: string; state?: string; [key: string]: unknown } | null;
  type?: string;
  confidential?: boolean;
  created_at?: string;
  updated_at?: string;
  closed_at?: string | null;
  due_date?: string | null;
  [key: string]: unknown;
}

export function normalizeIssue(
  i: GitLabIssue,
  options?: { descriptionMaxChars?: number },
) {
  const result: Record<string, unknown> = {
    id: i.id,
    iid: i.iid,
    title: i.title,
    description: i.description ?? null,
    state: i.state,
    web_url: i.web_url,
    author: normalizeUser(i.author),
    assignees: (i.assignees ?? []).map((a) => normalizeUser(a)),
    labels: i.labels ?? [],
    milestone: i.milestone
      ? { id: i.milestone.id, title: i.milestone.title, state: i.milestone.state }
      : null,
    confidential: i.confidential,
    created_at: i.created_at,
    updated_at: i.updated_at,
    closed_at: i.closed_at ?? null,
    due_date: i.due_date ?? null,
  };

  if (i.type) {
    result.type = i.type;
  }

  if (options?.descriptionMaxChars != null && typeof result.description === "string") {
    if (result.description.length > options.descriptionMaxChars) {
      result.description = result.description.slice(0, options.descriptionMaxChars);
      result.description_truncated = true;
    }
  }

  return result;
}

export function normalizeIssueList(
  issues: GitLabIssue[],
  options?: { descriptionMaxChars?: number },
) {
  return issues.map((i) => normalizeIssue(i, options));
}

// --- Labels ---

interface GitLabLabel {
  id?: number;
  name?: string;
  color?: string;
  text_color?: string;
  description?: string | null;
  [key: string]: unknown;
}

export function normalizeLabel(l: GitLabLabel) {
  return {
    id: l.id,
    name: l.name,
    color: l.color,
    text_color: l.text_color,
    description: l.description ?? null,
  };
}

export function normalizeLabelList(labels: GitLabLabel[]) {
  return labels.map(normalizeLabel);
}

// --- Milestones ---

interface GitLabMilestone {
  id?: number;
  iid?: number;
  title?: string;
  description?: string | null;
  state?: string;
  web_url?: string;
  created_at?: string;
  updated_at?: string;
  due_date?: string | null;
  start_date?: string | null;
  expired?: boolean;
  [key: string]: unknown;
}

export function normalizeMilestone(m: GitLabMilestone) {
  return {
    id: m.id,
    iid: m.iid,
    title: m.title,
    description: m.description ?? null,
    state: m.state,
    web_url: m.web_url,
    created_at: m.created_at,
    updated_at: m.updated_at,
    due_date: m.due_date ?? null,
    start_date: m.start_date ?? null,
    expired: m.expired,
  };
}

export function normalizeMilestoneList(milestones: GitLabMilestone[]) {
  return milestones.map(normalizeMilestone);
}

// --- Compare ---

interface GitLabCompareResult {
  commits?: GitLabCommit[];
  diffs?: GitLabDiff[];
  [key: string]: unknown;
}

export interface CompareOutput {
  commits: ReturnType<typeof normalizeCommitList>;
  diffs: ReturnType<typeof normalizeDiff>[];
  truncated: boolean;
  max_bytes?: number;
}

const MIN_COMPARE_MAX_BYTES = 100;

export function normalizeCompareResult(
  raw: GitLabCompareResult,
  options?: { maxFiles?: number; maxBytes?: number },
): CompareOutput {
  const effectiveMaxBytes = options?.maxBytes != null ? Math.max(options.maxBytes, MIN_COMPARE_MAX_BYTES) : undefined;

  const commits = normalizeCommitList(raw.commits ?? []);
  let diffs = (raw.diffs ?? []).map(normalizeDiff);
  let truncated = false;

  if (options?.maxFiles != null && diffs.length > options.maxFiles) {
    diffs = diffs.slice(0, options.maxFiles);
    truncated = true;
  }

  if (effectiveMaxBytes != null) {
    const mb = effectiveMaxBytes;
    const result: typeof diffs = [];
    for (const d of diffs) {
      const candidate: CompareOutput = { commits, diffs: [...result, d], truncated: false, max_bytes: mb };
      if (byteLength(JSON.stringify(candidate)) <= mb) {
        result.push(d);
      } else if (result.length === 0) {
        const entryNoDiff = { ...d, diff: "" };
        if (byteLength(JSON.stringify({ commits, diffs: [entryNoDiff], truncated: true, max_bytes: mb } as CompareOutput)) <= mb) {
          if (d.diff) {
            let lo = 0;
            let hi = d.diff.length;
            const suffix = "\n... [truncated]";
            while (lo < hi) {
              const mid = Math.ceil((lo + hi) / 2);
              const trial: CompareOutput = { commits, diffs: [{ ...d, diff: d.diff.slice(0, mid) + suffix }], truncated: true, max_bytes: mb };
              if (byteLength(JSON.stringify(trial)) <= mb) {
                lo = mid;
              } else {
                hi = mid - 1;
              }
            }
            if (lo > 0) {
              result.push({ ...d, diff: d.diff.slice(0, lo) + suffix });
            } else {
              result.push(entryNoDiff);
            }
          } else {
            result.push(entryNoDiff);
          }
        }
        truncated = true;
        break;
      } else {
        truncated = true;
        break;
      }
    }

    diffs = result;

    const payload: CompareOutput = { commits, diffs, truncated: true, max_bytes: mb };
    if (byteLength(JSON.stringify(payload)) > mb) {
      const trimmed = [...commits];
      while (byteLength(JSON.stringify({ commits: trimmed, diffs: [], truncated: true, max_bytes: mb } as CompareOutput)) > mb && trimmed.length > 0) {
        trimmed.pop();
      }
      return { commits: trimmed, diffs: [], truncated: true, max_bytes: mb };
    }
  }

  const output: CompareOutput = { commits, diffs, truncated };
  if (effectiveMaxBytes != null) {
    output.max_bytes = effectiveMaxBytes;
  }
  return output;
}

// --- Releases ---

const RELEASE_DESCRIPTION_MAX_CHARS = 500;

interface GitLabRelease {
  tag_name?: string;
  name?: string;
  description?: string | null;
  created_at?: string;
  released_at?: string;
  author?: { username?: string; name?: string; [key: string]: unknown };
  commit?: { short_id?: string; title?: string; authored_date?: string; [key: string]: unknown } | null;
  milestones?: Array<{ id?: number; title?: string; state?: string; [key: string]: unknown }>;
  assets?: {
    count?: number;
    links?: Array<{ id?: number; name?: string; url?: string; external?: boolean; link_type?: string; [key: string]: unknown }>;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
}

export function normalizeRelease(
  r: GitLabRelease,
  options?: { descriptionMaxChars?: number },
) {
  const truncated = options?.descriptionMaxChars != null
    && typeof r.description === "string"
    && r.description.length > options.descriptionMaxChars;

  const description = truncated
    ? (r.description as string).slice(0, options!.descriptionMaxChars)
    : (r.description ?? null);

  return {
    tag_name: r.tag_name,
    name: r.name ?? null,
    description,
    description_truncated: !!truncated,
    created_at: r.created_at,
    released_at: r.released_at,
    author: r.author ? { username: r.author.username, name: r.author.name } : undefined,
    commit: r.commit ? { short_id: r.commit.short_id, title: r.commit.title, authored_date: r.commit.authored_date } : undefined,
    milestones: (r.milestones ?? []).map((m) => ({ id: m.id, title: m.title, state: m.state })),
    assets: {
      count: r.assets?.count ?? 0,
      links: (r.assets?.links ?? []).map((l) => ({
        id: l.id,
        name: l.name,
        url: l.url,
        external: l.external,
        link_type: l.link_type,
      })),
    },
  };
}

export function normalizeReleaseList(
  releases: GitLabRelease[],
) {
  return releases.map((r) => normalizeRelease(r, { descriptionMaxChars: RELEASE_DESCRIPTION_MAX_CHARS }));
}

// --- Groups ---

interface GitLabGroup {
  id?: number;
  name?: string;
  path?: string;
  full_path?: string;
  full_name?: string;
  description?: string | null;
  visibility?: string;
  web_url?: string;
  parent_id?: number | null;
  [key: string]: unknown;
}

export function normalizeGroup(g: GitLabGroup) {
  return {
    id: g.id,
    name: g.name,
    path: g.path,
    full_path: g.full_path,
    full_name: g.full_name,
    description: g.description ?? null,
    visibility: g.visibility,
    web_url: g.web_url,
    parent_id: g.parent_id ?? null,
  };
}

export function normalizeGroupList(groups: GitLabGroup[]) {
  return groups.map(normalizeGroup);
}
