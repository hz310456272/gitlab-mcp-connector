/**
 * Write safety middleware - shared type definitions.
 *
 * These types form the contract between write tools and the
 * withWriteSafety() middleware that will be implemented in
 * a subsequent plan.
 */

/** Risk classification for write operations. */
export enum RiskLevel {
  /** Reversible or append-only operations (create, comment). */
  LOW = "low",
  /** State-changing operations that cannot be trivially undone (cancel, retry). */
  HIGH = "high",
}

/** Context passed to withWriteSafety() for every write tool invocation. */
export interface WriteToolContext {
  /** HTTP method (e.g. "POST"). */
  method: string;
  /** API path relative to the GitLab base URL (e.g. "/api/v4/projects/:id/issues"). */
  path: string;
  /** JSON request body. */
  body: Record<string, unknown>;
  /** Pre-classified risk level for this operation. */
  riskLevel: RiskLevel;
}

/** Shape of a dry-run response returned to the client. */
export interface DryRunPreview {
  dry_run: true;
  method: string;
  path: string;
  body: Record<string, unknown>;
  risk_level: RiskLevel;
}

/** Audit log entry for a write operation. */
export interface AuditEntry {
  /** ISO 8601 timestamp. */
  timestamp: string;
  /** Tool name that triggered the operation. */
  tool: string;
  /** HTTP method. */
  method: string;
  /** API path. */
  path: string;
  /** Classified risk level. */
  risk_level: RiskLevel;
  /** Lifecycle status of the operation. */
  status: "preview" | "success" | "error" | "rejected";
  /** Error message when status is "error" or "rejected". */
  error?: string;
}

/** Parameters that control write-safety behaviour. */
export interface WriteSafetyParams {
  /** When true, return a DryRunPreview instead of executing. */
  dryRun?: boolean;
  /** When true, require explicit user confirmation before executing. */
  confirm?: boolean;
}
