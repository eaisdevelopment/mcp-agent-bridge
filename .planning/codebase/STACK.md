# Technology Stack

**Analysis Date:** 2026-02-09

## Languages

**Primary:**
- TypeScript 5.7.2 - All source code in `src/`
- Compiled to JavaScript ES2022 - Build output in `dist/`

**Secondary:**
- JSON - Configuration files (`package.json`, `tsconfig.json`, `.mcp.json`)

## Runtime

**Environment:**
- Node.js >=18 (current: v24.7.0)

**Package Manager:**
- npm
- Lockfile: present (`package-lock.json`)

## Frameworks

**Core:**
- @modelcontextprotocol/sdk ^1.6.1 - MCP protocol implementation
  - Uses stdio transport (`StdioServerTransport`)
  - Server implementation (`McpServer`)

**Testing:**
- Not detected

**Build/Dev:**
- TypeScript Compiler (tsc) 5.7.2 - Production builds
- tsx ^4.19.2 - Development mode with watch and auto-reload

## Key Dependencies

**Critical:**
- @modelcontextprotocol/sdk ^1.6.1 - Core MCP server framework, provides tool registration, stdio transport, and protocol handling
- zod ^3.23.8 - Runtime type validation for tool input schemas

**Infrastructure:**
- @types/node ^22.10.0 - TypeScript definitions for Node.js APIs

## Configuration

**Environment:**
- No `.env` files detected
- No environment variables required for basic operation
- Uses system PATH to locate `claude` CLI binary

**Build:**
- `tsconfig.json` - TypeScript configuration
  - Target: ES2022
  - Module: Node16 with Node16 resolution
  - Output: `dist/` directory with source maps and declarations
  - Strict mode enabled

## Platform Requirements

**Development:**
- Node.js >= 18
- Claude Code CLI (`claude` command) must be available on PATH
- TypeScript compiler for building

**Production:**
- Node.js >= 18
- Claude Code CLI (`claude` command) must be available on PATH
- Pre-built JavaScript in `dist/` directory
- Requires file system write access to `/tmp/` for shared state

---

*Stack analysis: 2026-02-09*
