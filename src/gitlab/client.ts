import { GitLabApiError } from "../errors.js";
import { redact } from "../redaction.js";
import { normalizePagination, type PaginationParams } from "./pagination.js";

const VERSION = "0.1.0";
const USER_AGENT = `gitlab-mcp-connector/${VERSION}`;

export interface RequestOptions {
  params?: Record<string, string | number | boolean | undefined>;
  pagination?: PaginationParams;
}

export class GitLabClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  buildUrl(path: string, options?: RequestOptions): string {
    const url = new URL(`/api/v4${path}`, this.baseUrl);

    if (options?.params) {
      for (const [key, value] of Object.entries(options.params)) {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    if (options?.pagination) {
      const { page, per_page } = normalizePagination(options.pagination);
      url.searchParams.set("page", String(page));
      url.searchParams.set("per_page", String(per_page));
    }

    return url.toString();
  }

  getToken(): string {
    return this.token;
  }

  async request<T>(path: string, options?: RequestOptions): Promise<T> {
    const response = await fetch(this.buildUrl(path, options), {
      headers: {
        "PRIVATE-TOKEN": this.token,
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const body = redact(await response.text().catch(() => ""));
      throw new GitLabApiError(response.status, response.statusText, body);
    }

    return (await response.json()) as T;
  }

  async requestText(path: string, options?: RequestOptions): Promise<string> {
    const response = await fetch(this.buildUrl(path, options), {
      headers: {
        "PRIVATE-TOKEN": this.token,
        "User-Agent": USER_AGENT,
        Accept: "text/plain",
      },
    });

    if (!response.ok) {
      const body = redact(await response.text().catch(() => ""));
      throw new GitLabApiError(response.status, response.statusText, body);
    }

    return response.text();
  }

  async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(this.buildUrl(path), {
      method: "POST",
      headers: {
        "PRIVATE-TOKEN": this.token,
        "User-Agent": USER_AGENT,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const responseBody = redact(await response.text().catch(() => ""));
      throw new GitLabApiError(response.status, response.statusText, responseBody);
    }

    return (await response.json()) as T;
  }
}

export function encodeProjectPath(path: string): string {
  return encodeURIComponent(path);
}
