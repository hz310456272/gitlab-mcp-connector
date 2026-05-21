import { RiskLevel } from "./types.js";

/** Tool names whose operations are classified as HIGH risk. */
export const HIGH_RISK_TOOLS: ReadonlySet<string> = new Set([
  "gitlab_cancel_pipeline",
  "gitlab_cancel_job",
  "gitlab_retry_job",
]);

const LOW_RISK_TOOLS: ReadonlySet<string> = new Set([
  "gitlab_create_issue",
  "gitlab_create_issue_note",
  "gitlab_create_merge_request",
  "gitlab_create_merge_request_note",
]);

/**
 * Classify the risk level of a write tool by its name.
 *
 * Unknown tool names cause a fail-fast error -- every write tool
 * MUST be explicitly registered in either HIGH_RISK_TOOLS or
 * LOW_RISK_TOOLS so that no operation accidentally defaults to
 * a lower risk level than it deserves.
 */
export function classifyRisk(toolName: string): RiskLevel {
  if (HIGH_RISK_TOOLS.has(toolName)) {
    return RiskLevel.HIGH;
  }
  if (LOW_RISK_TOOLS.has(toolName)) {
    return RiskLevel.LOW;
  }
  throw new Error(`Unknown write tool: "${toolName}". Cannot classify risk level.`);
}
