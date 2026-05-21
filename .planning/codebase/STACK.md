# Technology Stack

**Analysis Date:** 2026-05-21

## Languages

**Primary:**
- TypeScript [5.7+] - Entire codebase (`src/`, `tests/`), strict mode enabled, ESM modules (`"type": "module"`)

**Secondary:**
- Bash - Wrapper script (`examples/claude-code/run-gitlab-mcp.sh`), sensitive info scanner (`scripts/scan-sensitive.sh`)
- Dockerfile - Multi-stage build for containerized distribution

## Runtime

**Environment:**
- Node.js [>=18.0.0, tested on 20 and 22 via CI matrix]
- ESM module system (`"type": "module"`, `NodeNext` module resolution)

**Package Manager:**
- npm (lockfile: `package-lock.json` present)
- `npm ci` in CI; `npm install` for local development

## Frameworks

**Core:**
- `@modelcontextprotocol/sdk` [1.29.0] - MCP protocol server and stdio transport
- `zod` [^3.24.0] - Runtime schema validation for tool parameters

**Testing:**
- `vitest` [^3.0.0] - Test runner with native TypeScript support
- `@modelcontextprotocol/sdk` client modules - Used in MCP integration/smoke tests

**Build/Dev:**
- `typescript` [^5.7.0] - Compiler (`tsc`)
- `tsx` [^4.21.0] - TypeScript execution for dev-time smoke tests (`npx tsx src/server.ts`)
- `eslint` [^9.0.0] + `typescript-eslint` [^8.0.0] - Linting (flat config at `eslint.config.js`)

## Key Dependencies

**Critical:**
- `@modelcontextprotocol/sdk` [1.29.0] - MCP server class, stdio transport, tool registration. The entire project is an MCP server.
- `zod` [^3.24.0] - Schema definitions for all 29 tool parameter sets. Every tool uses `z.object({...})` for input validation.

**Infrastructure:**
- Node.js built-in `fetch` - HTTP client for GitLab REST API (no external HTTP library)
- `node:fs`, `node:path` - Config file loading, file system operations
- `undici` [^6.25.0] - Dev dependency, provides Node.js fetch polyfill if needed

**Type Definitions:**
- `@types/node` [^22.0.0] - Node.js type definitions

## Configuration

**Environment:**
- `src/config.ts` - Dual-mode configuration:
  - **Simple mode**: `GITLAB_TOKEN` (required), `GITLAB_BASE_URL` (optional, defaults to `https://gitlab.com`)
  - **Multi-host mode**: `GITLAB_MCP_CONFIG` pointing to a JSON file mapping host aliases to `{ baseUrl, tokenEnv }`
- Config is loaded once and cached in `src/tools/helpers.ts` (`cachedConfig` module-level variable)

**Build:**
- `tsconfig.json` - Root config (ES2022 target, NodeNext module, strict, declaration + sourceMap)
- `tsconfig.build.json` - Build config (outDir: `dist/`, rootDir: `src/`, excludes `tests/`)
- Entry point: `dist/server.js` (compiled from `src/server.ts`)

**Linting:**
- `eslint.config.js` - Flat ESLint config, typescript-eslint recommended, `@typescript-eslint/no-unused-vars` warn with `_` prefix ignore

**Testing:**
- `vitest.config.ts` - Vitest config, includes `tests/**/*.test.ts`

## Platform Requirements

**Development:**
- Node.js >= 18.0.0 (tested: 20, 22)
- npm
- A GitLab personal access token for live testing

**Production:**
- Node.js >= 18.0.0 runtime
- Docker image: `node:22-slim` base, multi-stage build (see `Dockerfile`)
- Transport: stdio only (designed to be spawned as a child process by MCP clients)
- No persistent storage, no database, no network listeners

## Output Distribution

**npm package:**
- Built via `npm run build` (or `npm pack` which triggers `prepack`)
- Published files: `dist/`, `docs/`, `examples/`, `README.md`, `README.en.md`, `LICENSE`
- Binary: `gitlab-mcp-connector` entry point maps to `dist/server.js`

**Docker:**
- Multi-stage build: builder stage compiles TypeScript, runtime stage copies only `dist/` + docs + licenses
- Entrypoint: `node dist/server.js`

---

*Stack analysis: 2026-05-21*
