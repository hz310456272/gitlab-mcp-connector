import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MockAgent, setGlobalDispatcher } from "undici";
import { listBranches, listTags, listRepositoryTree, getRepositoryFile } from "../../src/tools/repository.js";
import { resetConfigForTests } from "../../src/tools/helpers.js";

describe("repository tools", () => {
  let mockAgent: MockAgent;

  beforeEach(() => {
    vi.stubEnv("GITLAB_BASE_URL", "https://gitlab.example.com");
    vi.stubEnv("GITLAB_TOKEN", "test-token");
    resetConfigForTests();
    mockAgent = new MockAgent();
    mockAgent.disableNetConnect();
    setGlobalDispatcher(mockAgent);
  });

  afterEach(() => {
    mockAgent.close();
    vi.unstubAllEnvs();
  });

  describe("listBranches", () => {
    it("returns normalized branches without extra fields", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/123\/repository\/branches/, method: "GET" })
        .reply(200, [
          {
            name: "main",
            merged: false,
            protected: true,
            default: true,
            web_url: "https://gitlab.example.com/group/project/-/tree/main",
            commit: { short_id: "abc1234", title: "init", created_at: "2025-01-01T00:00:00Z" },
            developers_can_push: true,
            developers_can_merge: false,
          },
        ]);

      const result = await listBranches({ projectIdOrPath: "123" });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveLength(1);

      const branch = parsed[0];
      expect(branch.name).toBe("main");
      expect(branch.merged).toBe(false);
      expect(branch.protected).toBe(true);
      expect(branch.default).toBe(true);
      expect(branch.commit.short_id).toBe("abc1234");

      expect(branch.developers_can_push).toBeUndefined();
      expect(branch.developers_can_merge).toBeUndefined();
    });

    it("URL-encodes project path", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/group%2Fproject\/repository\/branches/, method: "GET" })
        .reply(200, []);

      const result = await listBranches({ projectIdOrPath: "group/project" });
      expect(result.isError).toBe(false);
    });

    it("returns error on API failure", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/.*/, method: "GET" })
        .reply(403, { message: "Forbidden" });

      const result = await listBranches({ projectIdOrPath: "123" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Access denied");
    });
  });

  describe("listTags", () => {
    it("returns normalized tags without extra fields", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/123\/repository\/tags/, method: "GET" })
        .reply(200, [
          {
            name: "v1.0.0",
            target: "abc1234def",
            message: "Release v1.0.0",
            protected: false,
            created_at: "2025-01-15T10:00:00Z",
            commit: { short_id: "abc1234", title: "tag commit", created_at: "2025-01-15T09:00:00Z" },
            release: { tag_name: "v1.0.0", description: "Release notes" },
            signatures: [{ gpg_key_id: 42 }],
          },
        ]);

      const result = await listTags({ projectIdOrPath: "123" });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveLength(1);

      const tag = parsed[0];
      expect(tag.name).toBe("v1.0.0");
      expect(tag.target).toBe("abc1234def");
      expect(tag.message).toBe("Release v1.0.0");
      expect(tag.protected).toBe(false);
      expect(tag.created_at).toBe("2025-01-15T10:00:00Z");
      expect(tag.commit.short_id).toBe("abc1234");

      expect(tag.release).toBeUndefined();
      expect(tag.signatures).toBeUndefined();
    });

    it("passes order_by and sort params", async () => {
      const pool = mockAgent.get("https://gitlab.example.com");
      pool
        .intercept({
          path: (p: string) => {
            expect(p).toContain("order_by=updated");
            expect(p).toContain("sort=desc");
            return p.includes("/api/v4/projects");
          },
          method: "GET",
        })
        .reply(200, []);

      await listTags({
        projectIdOrPath: "123",
        orderBy: "updated",
        sort: "desc",
      });
    });

    it("returns error on API failure", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/.*/, method: "GET" })
        .reply(404, { message: "Not Found" });

      const result = await listTags({ projectIdOrPath: "nonexistent/project" });
      expect(result.isError).toBe(true);
    });
  });

  describe("listRepositoryTree", () => {
    it("returns normalized tree nodes", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/123\/repository\/tree/, method: "GET" })
        .reply(200, [
          {
            id: "abc123",
            name: "src",
            type: "tree",
            path: "src",
            mode: "040000",
          },
          {
            id: "def456",
            name: "README.md",
            type: "blob",
            path: "README.md",
            mode: "100644",
          },
        ]);

      const result = await listRepositoryTree({ projectIdOrPath: "123" });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveLength(2);
      expect(parsed[0]).toEqual({
        id: "abc123",
        name: "src",
        type: "tree",
        path: "src",
        mode: "040000",
      });
    });

    it("passes path, ref, and recursive params", async () => {
      const pool = mockAgent.get("https://gitlab.example.com");
      pool
        .intercept({
          path: (p: string) => {
            expect(p).toContain("path=src");
            expect(p).toContain("ref=main");
            expect(p).toContain("recursive=true");
            return p.includes("/api/v4/projects");
          },
          method: "GET",
        })
        .reply(200, []);

      await listRepositoryTree({
        projectIdOrPath: "123",
        path: "src",
        ref: "main",
        recursive: true,
      });
    });

    it("URL-encodes project path with nested groups in real request", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({
          path: (p: string) => {
            expect(p).toContain("/projects/group%2Fsub%2Fproject/repository/tree");
            return true;
          },
          method: "GET",
        })
        .reply(200, []);

      const result = await listRepositoryTree({ projectIdOrPath: "group/sub/project" });
      expect(result.isError).toBe(false);
    });

    it("encodes ref with slashes as query param in real request", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({
          path: (p: string) => {
            expect(p).toContain("ref=feat%2Fagent");
            return p.includes("/repository/tree");
          },
          method: "GET",
        })
        .reply(200, []);

      await listRepositoryTree({ projectIdOrPath: "123", ref: "feat/agent" });
    });

    it("returns error on API failure", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/.*/, method: "GET" })
        .reply(404, { message: "Not Found" });

      const result = await listRepositoryTree({ projectIdOrPath: "999" });
      expect(result.isError).toBe(true);
    });
  });

  describe("getRepositoryFile", () => {
    function encodeFilePath(fp: string): string {
      return encodeURIComponent(fp);
    }

    it("returns decoded text file content", async () => {
      const content = Buffer.from("hello world").toString("base64");
      const filePath = "README.md";
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({
          path: `/api/v4/projects/123/repository/files/${encodeFilePath(filePath)}?ref=main`,
          method: "GET",
        })
        .reply(200, {
          file_name: "README.md",
          file_path: "README.md",
          content,
          encoding: "base64",
          size: 11,
          ref: "main",
          blob_id: "abc",
          commit_id: "def",
          last_commit_id: "ghi",
        });

      const result = await getRepositoryFile({
        projectIdOrPath: "123",
        filePath: "README.md",
        ref: "main",
      });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.file_name).toBe("README.md");
      expect(parsed.file_path).toBe("README.md");
      expect(parsed.content).toBe("hello world");
      expect(parsed.size).toBe(11);
      expect(parsed.ref).toBe("main");
      expect(parsed.binary).toBe(false);
      expect(parsed.truncated).toBe(false);
      expect(parsed.max_bytes).toBe(200 * 1024);
      expect(parsed).not.toHaveProperty("blob_id");
      expect(parsed).not.toHaveProperty("commit_id");
    });

    it("defaults ref to HEAD when not provided", async () => {
      const content = Buffer.from("data").toString("base64");
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({
          path: (p: string) => {
            expect(p).toContain("ref=HEAD");
            return p.includes("/repository/files/");
          },
          method: "GET",
        })
        .reply(200, {
          file_name: "f.txt",
          file_path: "f.txt",
          content,
          encoding: "base64",
          size: 4,
          ref: "HEAD",
        });

      const result = await getRepositoryFile({
        projectIdOrPath: "123",
        filePath: "f.txt",
      });
      expect(result.isError).toBe(false);
    });

    it("detects binary content and returns base64", async () => {
      const binaryBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00]);
      const content = binaryBuf.toString("base64");
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({
          path: (p: string) => p.includes("/repository/files/") && p.includes("ref=main"),
          method: "GET",
        })
        .reply(200, {
          file_name: "image.png",
          file_path: "image.png",
          content,
          encoding: "base64",
          size: 5,
          ref: "main",
        });

      const result = await getRepositoryFile({
        projectIdOrPath: "123",
        filePath: "image.png",
        ref: "main",
      });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.binary).toBe(true);
      expect(parsed.content).toBe(content);
      expect(parsed.max_bytes).toBe(200 * 1024);
    });

    it("truncates text so final JSON payload fits within maxBytes", async () => {
      const bigContent = "a".repeat(5000);
      const content = Buffer.from(bigContent).toString("base64");
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({
          path: (p: string) => p.includes("/repository/files/"),
          method: "GET",
        })
        .reply(200, {
          file_name: "big.txt",
          file_path: "big.txt",
          content,
          encoding: "base64",
          size: 5000,
          ref: "main",
        });

      const maxBytes = 1000;
      const result = await getRepositoryFile({
        projectIdOrPath: "123",
        filePath: "big.txt",
        ref: "main",
        maxBytes,
      });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.truncated).toBe(true);
      expect(parsed.max_bytes).toBe(maxBytes);
      const payloadSize = Buffer.byteLength(JSON.stringify(parsed), "utf8");
      expect(payloadSize).toBeLessThanOrEqual(maxBytes);
    });

    it("CJK content truncation fits within maxBytes", async () => {
      const cjkContent = "你好世界".repeat(500);
      const content = Buffer.from(cjkContent).toString("base64");
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({
          path: (p: string) => p.includes("/repository/files/"),
          method: "GET",
        })
        .reply(200, {
          file_name: "cjk.txt",
          file_path: "cjk.txt",
          content,
          encoding: "base64",
          size: Buffer.byteLength(cjkContent, "utf8"),
          ref: "main",
        });

      const maxBytes = 500;
      const result = await getRepositoryFile({
        projectIdOrPath: "123",
        filePath: "cjk.txt",
        ref: "main",
        maxBytes,
      });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);

      expect(parsed.truncated).toBe(true);
      const payloadSize = Buffer.byteLength(JSON.stringify(parsed), "utf8");
      expect(payloadSize).toBeLessThanOrEqual(maxBytes);
    });

    it("tiny maxBytes is clamped to minimum floor (150), output structure is stable", async () => {
      const bigContent = "x".repeat(1000);
      const content = Buffer.from(bigContent).toString("base64");
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({
          path: (p: string) => p.includes("/repository/files/"),
          method: "GET",
        })
        .reply(200, {
          file_name: "tiny.txt",
          file_path: "tiny.txt",
          content,
          encoding: "base64",
          size: 1000,
          ref: "main",
        });

      const result = await getRepositoryFile({
        projectIdOrPath: "123",
        filePath: "tiny.txt",
        ref: "main",
        maxBytes: 50,
      });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);

      // maxBytes clamped to 150
      expect(parsed.max_bytes).toBe(150);
      // Stable structure fields always present
      expect(parsed).toHaveProperty("file_name");
      expect(parsed).toHaveProperty("file_path");
      expect(parsed).toHaveProperty("size");
      expect(parsed).toHaveProperty("ref");
      expect(parsed).toHaveProperty("binary");
      expect(parsed).toHaveProperty("content");
      expect(parsed).toHaveProperty("truncated");
      expect(parsed).toHaveProperty("max_bytes");
      expect(parsed.truncated).toBe(true);
      // Final payload fits within clamped limit
      const payloadSize = Buffer.byteLength(JSON.stringify(parsed), "utf8");
      expect(payloadSize).toBeLessThanOrEqual(150);
    });

    it("URL-encodes file path with slashes in real request", async () => {
      const filePath = "src/utils/helpers.ts";
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({
          path: (p: string) => {
            expect(p).toContain(`/repository/files/${encodeFilePath(filePath)}`);
            return true;
          },
          method: "GET",
        })
        .reply(200, {
          file_name: "helpers.ts",
          file_path: filePath,
          content: Buffer.from("code").toString("base64"),
          encoding: "base64",
          size: 4,
          ref: "main",
        });

      const result = await getRepositoryFile({
        projectIdOrPath: "123",
        filePath,
        ref: "main",
      });
      expect(result.isError).toBe(false);
    });

    it("URL-encodes unicode file path in real request", async () => {
      const filePath = "目录/文件.ts";
      const encoded = encodeFilePath(filePath);
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({
          path: (p: string) => {
            expect(p).toContain(`/repository/files/${encoded}`);
            // Must not contain raw slash inside the path segment
            const fileSegment = p.split("/repository/files/")[1]?.split("?")[0];
            expect(fileSegment).not.toContain("/");
            return true;
          },
          method: "GET",
        })
        .reply(200, {
          file_name: "文件.ts",
          file_path: filePath,
          content: Buffer.from("code").toString("base64"),
          encoding: "base64",
          size: 4,
          ref: "main",
        });

      const result = await getRepositoryFile({
        projectIdOrPath: "123",
        filePath,
        ref: "main",
      });
      expect(result.isError).toBe(false);
    });

    it("returns error on API failure", async () => {
      mockAgent
        .get("https://gitlab.example.com")
        .intercept({ path: /\/api\/v4\/projects\/.*/, method: "GET" })
        .reply(404, { message: "Not Found" });

      const result = await getRepositoryFile({
        projectIdOrPath: "123",
        filePath: "nonexistent.txt",
        ref: "main",
      });
      expect(result.isError).toBe(true);
    });
  });
});
