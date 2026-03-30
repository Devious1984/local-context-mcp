# local-context-mcp

A fully local-first semantic code search engine exposed via MCP (Model Context Protocol).

## Features

- **Local-first**: Works entirely offline using USearch as the vector database
- **Zero-config**: Automatically targets the current working directory
- **MCP-based**: Integrates with Claude Code, OpenCode, and other MCP-compatible tools
- **Flexible embeddings**: Supports Ollama (default), OpenAI, Gemini, and VoyageAI
- **Fast**: In-memory vector search with optional persistence

## Quick Start

```bash
npx local-context-mcp
```

This indexes the current directory and starts the MCP server. First run may take a few minutes depending on codebase size.

## MCP Integration

### Claude Code

```bash
claude mcp add local-context -- npx local-context-mcp
```

### OpenCode

Add to your OpenCode config:

```json
{
  "tools": [
    {
      "type": "mcp",
      "command": "npx",
      "args": ["local-context-mcp"]
    }
  ]
}
```

## Tools

| Tool | Description |
|------|-------------|
| `reindex` | Index the current codebase for semantic search. Use after adding/changing files. |
| `search` | Search the indexed codebase using natural language queries. |
| `status` | Get current indexing status (file count, chunk count). |

### Search Example

```
> search: "how does the search function work"
```

Returns relevant code snippets with file paths and line numbers.

## How It Works

```
Files → AST Parser → Chunks → Embeddings → USearch → Retrieval
```

1. **File Discovery**: Scans directory for code files (respects `.gitignore` and `.contextignore`)
2. **Chunking**: Splits code into semantic chunks using tree-sitter AST parsing
3. **Embedding**: Generates vector embeddings for each chunk
4. **Indexing**: Stores vectors in USearch for fast similarity search
5. **Retrieval**: Finds most relevant chunks for your query

## Storage

Index files are created in the current working directory:

```
usearch_index_<collection>.usearch  # Vector index
usearch_meta_<collection>.json        # Document metadata
usearch_coll_<collection>.json       # Collection metadata
```

Collection name is derived from the directory path hash.

## Supported Languages

TypeScript, JavaScript, Python, Java, C/C++, C#, Go, Rust, PHP, Ruby, Swift, Kotlin, Scala, Objective-C, Markdown, Jupyter

## Environment Variables

### Embedding Provider Selection

Providers are checked in this order. Set any API key to use that provider:

| Variable | Provider | Default Model |
|----------|----------|---------------|
| `OLLAMA_BASE_URL` | Ollama | nomic-embed-text |
| `OPENAI_API_KEY` | OpenAI | text-embedding-3-small |
| `GEMINI_API_KEY` | Gemini | text-embedding-004 |
| `VOYAGE_API_KEY` | VoyageAI | voyage-3 |

### Ollama Configuration

```bash
OLLAMA_BASE_URL=http://localhost:11434    # Default: http://127.0.0.1:11434
OLLAMA_MODEL=nomic-embed-text              # Default: nomic-embed-text
```

### OpenAI Configuration

```bash
OPENAI_API_KEY=sk-...
OPENAI_EMBEDDING_MODEL=text-embedding-3-small  # Default
OPENAI_BASE_URL=https://api.openai.com/v1        # Optional: for proxies
```

### Gemini Configuration

```bash
GEMINI_API_KEY=...
GEMINI_EMBEDDING_MODEL=text-embedding-004  # Default
```

### VoyageAI Configuration

```bash
VOYAGE_API_KEY=...
VOYAGE_EMBEDDING_MODEL=voyage-3  # Default
```

## Ignore Patterns

Files matching these patterns are excluded from indexing:

- `node_modules/**`, `dist/**`, `build/**`, `out/**`
- `.git/**`, `.svn/**`, `.hg/**`
- `*.log`, `*.min.js`, `*.min.css`, `.env`
- `*.map`, `*.bundle.js`, `*.chunk.js`

Additionally respects `.gitignore` and `.contextignore` in the project root.

## Architecture

See [docs/architecture.md](docs/architecture.md) for system design details.

## MCP Protocol

See [docs/mcp.md](docs/mcp.md) for tool schemas and protocol details.

## Building from Source

```bash
npm install
npm run build
```

Run directly:

```bash
npx tsx src/index.ts
```

## License

MIT License. See [LICENSE](LICENSE) for details.

---

Based on [claude-context](https://github.com/zilliztech/claude-context) by Zilliz.
