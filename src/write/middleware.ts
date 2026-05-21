import { RiskLevel } from "./types.js";
import type {
  WriteToolContext,
  DryRunPreview,
  AuditEntry,
  WriteSafetyParams,
} from "./types.js";
import { toolResult, toolError } from "../tools/helpers.js";
import type { ToolOutput } from "../tools/helpers.js";
import { DedupWindow } from "./dedup.js";

/** Global dedup window instance (exported for test reset). */
export const dedupWindow = new DedupWindow();

/**
 * Write-safety middleware — the single choke-point every write tool
 * must pass through.
 *
 * Pipeline order (strict):
 *  1. dryRun gate   → return DryRunPreview, no execution
 *  2. confirm gate  → HIGH risk + no confirm → reject
 *  3. dedup check   → cached result returned, no re-execution
 *  4. execute       → run the actual handler
 *  5. audit         → record outcome via callback
 */
export async function withWriteSafety(
  toolName: string,
  ctx: WriteToolContext,
  handler: () => Promise<ToolOutput>,
  params: WriteSafetyParams,
  audit: (entry: AuditEntry) => void,
): Promise<ToolOutput> {
  const timestamp = new Date().toISOString();
  const baseAudit: Omit<AuditEntry, "status"> = {
    timestamp,
    tool: toolName,
    method: ctx.method,
    path: ctx.path,
    risk_level: ctx.riskLevel,
  };

  // Step 1: dryRun gate
  if (params.dryRun) {
    const preview: DryRunPreview = {
      dry_run: true,
      method: ctx.method,
      path: ctx.path,
      body: ctx.body,
      risk_level: ctx.riskLevel,
    };
    audit({ ...baseAudit, status: "preview" });
    return toolResult(preview);
  }

  // Step 2: confirm gate for high-risk operations
  if (ctx.riskLevel === RiskLevel.HIGH && !params.confirm) {
    const message =
      `High-risk operation requires confirmation. Set confirm: true to proceed, ` +
      `or use dryRun: true to preview first. Operation: ${ctx.method} ${ctx.path}`;
    audit({ ...baseAudit, status: "rejected", error: message });
    return toolError(message);
  }

  // Step 3: dedup check
  const dedupKey = dedupWindow.generateKey(toolName, ctx.path, ctx.body);
  const cached = dedupWindow.get(dedupKey);
  if (cached) {
    return cached;
  }

  // Step 4 & 5: execute handler + audit
  try {
    const result = await handler();
    if (!result.isError) {
      dedupWindow.set(dedupKey, result);
      audit({ ...baseAudit, status: "success" });
    } else {
      audit({ ...baseAudit, status: "error", error: "Handler returned error" });
    }
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    audit({ ...baseAudit, status: "error", error: message });
    return toolError(message);
  }
}
