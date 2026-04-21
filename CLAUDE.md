# local-context-mcp — AI Assistant Context

> **Universal rules (behavioral guidelines, commit policy, testing rules) are in the root `CLAUDE.md`.** This file contains local-context-mcp-specific context only.

A fully local-first semantic code search engine exposed via MCP (Model Context Protocol).

## Project Overview

Indexes codebases using AST-based chunking and vector embeddings, enabling natural language search over code. Works entirely offline using Ollama embeddings and USearch vector database.

## Commands

### Build
```bash
npm run build        # Compile TypeScript → dist/
npm run dev          # Watch mode (tsc --watch)
npm run clean        # Remove dist/
```

### Test (Vitest)
```bash
npm test             # Run all tests once
npm run test:watch   # Watch mode (interactive)

# Run a single test file
npx vitest run src/ast-splitter.test.ts

# Run tests matching a name pattern
npx vitest run -t "TypeScript"
npx vitest run -t "should split"

# Run with verbose output
npx vitest run --reporter=verbose
```

### CI
CI uses **pnpm** (not npm):
```bash
pnpm install --frozen-lockfile
pnpm build
pnpm test
```

## Code Style

### Imports
- Use `.js` extensions in all imports (ESM style): `import { Foo } from './bar.js'`
- Prefer named imports over default imports
- Group order: stdlib → third-party → local
- Use `import type` for type-only imports: `import type { Splitter } from './types.js'`

### Formatting
- **4-space indentation** (no tabs)
- Opening braces on same line
- Trailing commas in multi-line literals
- Semicolons required
- Max line length ~120 chars

### Naming Conventions
- Classes/Interfaces: `PascalCase` (`LocalContext`, `USearchVectorDatabase`)
- Functions/Methods: `camelCase` (`indexCodebase`, `getCodeFiles`)
- Constants: `UPPER_SNAKE_CASE` (`DEFAULT_SUPPORTED_EXTENSIONS`, `EMBEDDING_BATCH_SIZE`)
- Config interfaces: `PascalCase` with `Config` suffix (`OllamaEmbeddingConfig`)
- No underscore prefix for private members (use `private` keyword)

### Types
- **Strict mode** enabled (`tsconfig.json`: `"strict": true`)
- All function params and return types explicitly typed
- Abstract base class `Embedding` with concrete implementations
- Factory functions: `createEmbedding()`, `createLocalContext()`, `createVectorDatabase()`
- Avoid `any`; use `Record<string, any>` only for flexible metadata

### Error Handling
- Try/catch with `console.error` logging (not re-throwing in most cases)
- Graceful degradation: AST splitter falls back to LangChain splitter on failure
- MCP tools return `{ isError: true }` with error message text
- Silent failure for non-critical ops (e.g., `loadIgnorePatterns` ignores errors)
- Fatal errors at top-level: `main().catch((e) => { console.error("Fatal error:", e); process.exit(1); })`

### Logging
- All logging goes to **stderr** via `console.error()`
- Bracketed prefixes: `[LocalContext]`, `[USearchDB]`, `[Embedding]`, `[OllamaEmbedding]`, `[ASTSplitter]`
- Progress format: `[Phase] XX%`
- `console.log`/`console.warn` redirected to stderr in `index.ts` to keep stdout clean for MCP

## TypeScript Config

```
target: ES2022 | module: NodeNext | moduleResolution: NodeNext | strict: true
outDir: ./dist | rootDir: ./src | declaration + sourceMap: true
Test files (*.test.ts) excluded from compilation
```

## Test Conventions

- Framework: **Vitest** (globals enabled — `describe`/`it`/`expect`/`vi` available without import)
- Pattern: `src/**/*.test.ts`
- Environment: `node`
- Mock classes extend abstract bases or implement interfaces
- `beforeEach`/`afterEach` for temp dir setup/teardown

## Architecture

| File | Purpose |
|------|---------|
| `src/index.ts` | MCP server entry point (CLI) |
| `src/context.ts` | Core orchestration (`LocalContext` class) |
| `src/types.ts` | TypeScript interfaces & abstract classes |
| `src/usearch.ts` | USearch vector database implementation |
| `src/embeddings.ts` | Embedding provider factory |
| `src/ast-splitter.ts` | AST-based code chunking (tree-sitter) |
| `src/langchain-splitter.ts` | Fallback character-based splitter |
| `src/embeddings/*.ts` | Embedding providers (Ollama, OpenAI, Gemini, VoyageAI) |

## Notes

- No ESLint or Prettier configured — follow existing code patterns
- Node.js requirement: `>=20.0.0`
- Package manager: npm (CI uses pnpm)

## Git Workflow

> **Universal git rules (commit policy, multi-repo coordination, PR creation) are in the root `CLAUDE.md`.** This section contains local-context-mcp-specific git context only.

- **Default branch:** `master` (not `main`)
- **Remote:** `origin` (git@github.com:Devious1984/local-context-mcp.git)
- **PR tool:** `gh` (GitHub CLI) — this is the only GitHub repo in the workspace
- **Worktree directory:** `.worktrees/`
- **No direct pushes to `master`:** All changes go through feature branches + PR

---

## Documentation & Research

> **Universal documentation rules (spec creation, research protocol, implementation detail elicitation) are in the root `CLAUDE.md`.**

This repo already has comprehensive documentation. When adding new features, follow the spec format in `docs/` and perform internet research on MCP protocol changes if implementing new tools.

---

## Agent Guidelines

### Always Reindex Before Searching
When working on a codebase, **always reindex** before running semantic searches:

1. Run `local-context_reindex` to ensure the index is current
2. Then run `local-context_search` with your query
3. If reindex times out, the batch size may be too large — check `src/context.ts` for `EMBEDDING_BATCH_SIZE`

### Watch Mode for Active Development
For active development sessions, start the MCP server in watch mode:

```bash
local-context-mcp --watch
```

This automatically reindexes changed files within 2 seconds of each save. No manual reindex needed.

### Incremental vs Full Reindex
- **Full reindex** (`reindex` tool): Rebuilds entire index from scratch. Use when switching branches or after large refactors.
- **Incremental reindex** (watch mode): Only reindexes changed files. Fast, but may miss deletions or renames.
- When in doubt, do a full reindex.
