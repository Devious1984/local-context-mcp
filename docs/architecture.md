# Architecture

## Overview

local-context-mcp is a semantic code search engine that indexes your codebase and provides fast similarity search via MCP (Model Context Protocol).

## Components

```
┌─────────────────────────────────────────────────────────────┐
│                     MCP Server (index.ts)                    │
│  - Handles MCP protocol communication                        │
│  - Exposes tools: reindex, search, status                   │
└─────────────────────┬───────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────────────┐
│                   LocalContext (context.ts)                   │
│  - Orchestrates indexing and search                          │
│  - Manages file discovery and ignore patterns                │
│  - Coordinates between components                            │
└──────┬─────────────────┬──────────────────────┬─────────────┘
       │                 │                      │
┌──────▼──────┐  ┌──────▼──────┐  ┌────────────▼─────────────┐
│   Splitter   │  │  Embedding  │  │   VectorDatabase         │
│              │  │             │  │                          │
│ ast-splitter │  │  ollama    │  │   USearchVectorDatabase   │
│              │  │  openai    │  │                          │
│ langchain    │  │  gemini    │  │   - In-memory index       │
│ -splitter   │  │  voyageai  │  │   - Persistent storage    │
└─────────────┘  └─────────────┘  └──────────────────────────┘
```

## Data Flow

### Indexing Pipeline

```
1. getCodeFiles()
   └── Scans directory recursively
   └── Filters by extension and ignore patterns
   └── Respects .gitignore and .contextignore

2. codeSplitter.split(content, language, filePath)
   └── Parses code using tree-sitter (AST-based)
   └── Splits into semantic chunks (~2500 chars)
   └── Preserves language context

3. embedding.embedBatch(chunks)
   └── Converts chunks to vector embeddings
   └── Uses configured provider (Ollama by default)

4. vectorDatabase.insert(collection, documents)
   └── Stores vectors in USearch index
   └── Persists metadata alongside
```

### Search Pipeline

```
1. embedding.embed(query)
   └── Converts query text to vector

2. vectorDatabase.search(collection, queryVector, { topK })
   └── Performs cosine similarity search
   └── Returns top-K most similar chunks

3. Map results to SemanticSearchResult[]
   └── Includes content, path, lines, score
```

## Storage

Index files stored in current working directory:

| File | Purpose |
|------|---------|
| `usearch_index_<hash>.usearch` | USearch binary index |
| `usearch_meta_<hash>.json` | Document metadata (content, paths) |
| `usearch_coll_<hash>.json` | Collection metadata (dimension, description) |

Collection name is `code_chunks_<md5_hash>` where hash is first 8 chars of MD5 of the absolute path.

## Chunking Strategy

Uses tree-sitter AST parsing for language-aware splitting:

- **Primary**: AST-based splitting (ast-splitter.ts)
  - Respects code structure (functions, classes)
  - Preserves semantic boundaries
  - Falls back to character-based if AST unavailable

- **Fallback**: Simple character splitting (langchain-splitter.ts)
  - Splits at ~2500 character boundaries
  - Maintains word integrity

## Embedding Providers

Priority order (first found wins):

1. **Ollama** (default) - Local, no API key needed
2. **OpenAI** - `OPENAI_API_KEY` required
3. **Gemini** - `GEMINI_API_KEY` required
4. **VoyageAI** - `VOYAGE_API_KEY` required

Each provider detected via corresponding API key environment variable.

## File Structure

```
src/
├── index.ts              # MCP server entry point
├── context.ts            # Core orchestration
├── usearch.ts            # Vector database implementation
├── embeddings.ts         # Embedding factory
├── types.ts              # TypeScript interfaces
├── ast-splitter.ts       # AST-based code chunking
├── langchain-splitter.ts # Fallback text splitter
└── embeddings/
    ├── ollama-embedding.ts
    ├── openai-embedding.ts
    ├── gemini-embedding.ts
    └── voyageai-embedding.ts
```
