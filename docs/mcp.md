# MCP Protocol

local-context-mcp implements the Model Context Protocol for tool invocation.

## Server Info

```json
{
  "name": "local-context-mcp",
  "version": "0.1.0"
}
```

## Tools

### reindex

Index or reindex the current codebase directory.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "model": {
      "type": "string",
      "description": "Ollama embedding model to use (defaults to nomic-embed-text)",
      "default": "nomic-embed-text"
    }
  },
  "required": []
}
```

**Output:**
```json
{
  "indexedFiles": 84,
  "totalChunks": 362,
  "status": "completed"
}
```

**Notes:**
- `forceReindex: true` - Drops existing collection before reindexing
- Progress sent to stderr: `[Phase] XX%`
- Returns count of indexed files and total chunks

---

### search

Search the indexed codebase using natural language queries.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {
    "query": {
      "type": "string",
      "description": "Natural language query to search for"
    },
    "limit": {
      "type": "number",
      "description": "Maximum number of results to return",
      "default": 10,
      "maximum": 50
    }
  },
  "required": ["query"]
}
```

**Output:**
```
[1] src/index.ts:117-122
async search(query: string, topK: number = 10): Promise<SemanticSearchResult[]> {
    const collectionName = this.getCollectionName();
    ...
}
---
[2] packages/mcp/src/handlers.ts:263-270
const results = await this.context.search(query, limit);
...
---
```

**Notes:**
- Returns empty if no index exists
- Results sorted by relevance score
- Includes file path, line range, and content

---

### status

Get the current indexing status of the codebase.

**Input Schema:**
```json
{
  "type": "object",
  "properties": {},
  "required": []
}
```

**Output:**
```json
{
  "indexed": true,
  "fileCount": 84,
  "chunkCount": 362
}
```

**Notes:**
- `indexed: false` if no collection exists
- `fileCount` is unique files
- `chunkCount` is total indexed chunks

## Protocol Flow

```
Client                          Server
  │                               │
  ├──── initialize ──────────────►│
  │◄─── capabilities ─────────────┤
  │                               │
  ├──── tools/list ──────────────►│
  │◄─── tool definitions ─────────┤
  │                               │
  ├──── tools/call (reindex) ────►│
  │◄─── indexing result ──────────┤
  │                               │
  ├──── tools/call (search) ─────►│
  │◄─── search results ───────────┤
  │                               │
  ├──── tools/call (status) ─────►│
  │◄─── status object ───────────┤
```

## Error Handling

Errors returned with `isError: true`:

```json
{
  "content": [
    {
      "type": "text",
      "text": "Error: Collection 'code_chunks_abc123' not found"
    }
  ],
  "isError": true
}
```

## Stderr Output

Progress and debug info written to stderr:

```
[Embedding] No API keys found, defaulting to Ollama
[LocalContext] Initialized at: /path/to/project
[LocalContext] Embedding: ollama
[OllamaEmbedding] Detected dimension: 768
[USearchDB] Loaded collection 'code_chunks_abc123' with 362 vectors
[LocalContext] Found 84 code files
```
