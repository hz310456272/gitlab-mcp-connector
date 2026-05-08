#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { redact } from "./redaction.js";
import { listProjectsTool, getProjectTool } from "./tools/projects.js";
import { listBranchesTool, listTagsTool } from "./tools/repository.js";
import {
  listMergeRequestsTool,
  getMergeRequestTool,
  getMergeRequestDiffTool,
  getMergeRequestCommentsTool,
  listMergeRequestPipelinesTool,
} from "./tools/mergeRequests.js";
import { getPipelineJobsTool, getJobLogTool } from "./tools/pipelines.js";

const server = new McpServer({
  name: "gitlab-mcp-connector",
  version: "0.1.0",
});

try {
  loadConfig();
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`[gitlab-mcp-connector] Config error: ${redact(msg)}`);
}

server.tool(listProjectsTool.name, listProjectsTool.description, listProjectsTool.schema.shape, listProjectsTool.handler);
server.tool(getProjectTool.name, getProjectTool.description, getProjectTool.schema.shape, getProjectTool.handler);
server.tool(listBranchesTool.name, listBranchesTool.description, listBranchesTool.schema.shape, listBranchesTool.handler);
server.tool(listTagsTool.name, listTagsTool.description, listTagsTool.schema.shape, listTagsTool.handler);
server.tool(listMergeRequestsTool.name, listMergeRequestsTool.description, listMergeRequestsTool.schema.shape, listMergeRequestsTool.handler);
server.tool(getMergeRequestTool.name, getMergeRequestTool.description, getMergeRequestTool.schema.shape, getMergeRequestTool.handler);
server.tool(getMergeRequestDiffTool.name, getMergeRequestDiffTool.description, getMergeRequestDiffTool.schema.shape, getMergeRequestDiffTool.handler);
server.tool(getMergeRequestCommentsTool.name, getMergeRequestCommentsTool.description, getMergeRequestCommentsTool.schema.shape, getMergeRequestCommentsTool.handler);
server.tool(listMergeRequestPipelinesTool.name, listMergeRequestPipelinesTool.description, listMergeRequestPipelinesTool.schema.shape, listMergeRequestPipelinesTool.handler);
server.tool(getPipelineJobsTool.name, getPipelineJobsTool.description, getPipelineJobsTool.schema.shape, getPipelineJobsTool.handler);
server.tool(getJobLogTool.name, getJobLogTool.description, getJobLogTool.schema.shape, getJobLogTool.handler);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(redact(message));
  process.exit(1);
});

export { server };
