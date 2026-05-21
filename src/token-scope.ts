export interface TokenScopeResult {
  hasWriteAccess: boolean;
  reason?: string;
}

export async function checkTokenScope(
  baseUrl: string,
  token: string,
): Promise<TokenScopeResult> {
  try {
    const response = await fetch(`${baseUrl}/api/v4/user`, {
      headers: {
        "PRIVATE-TOKEN": token,
        "User-Agent": "gitlab-mcp-connector/token-scope-check",
      },
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      return { hasWriteAccess: true };
    }

    if (response.status === 401) {
      return { hasWriteAccess: false, reason: "Token authentication failed" };
    }

    if (response.status === 403) {
      return {
        hasWriteAccess: false,
        reason:
          "Token does not have sufficient permissions for write operations",
      };
    }

    return { hasWriteAccess: true };
  } catch {
    return { hasWriteAccess: true };
  }
}
