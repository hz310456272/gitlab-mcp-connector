export class GitLabApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: string,
  ) {
    super(`GitLab API error: ${status} ${statusText}`);
    this.name = "GitLabApiError";
  }
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function formatApiError(error: unknown): string {
  if (error instanceof GitLabApiError) {
    switch (error.status) {
      case 401:
        return "Authentication failed. Check your GitLab personal access token.";
      case 403:
        return "Access denied. Your token does not have permission for this resource.";
      case 404:
        return "Resource not found. Check the project path or ID.";
      case 429:
        return "Rate limited by GitLab API. Please wait and retry.";
      default:
        if (error.status >= 500) {
          return `GitLab server error (${error.status}). Try again later.`;
        }
        return `GitLab API error: ${error.status} ${error.statusText}`;
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
