# Local-Context MCP: Timeout, Watch Mode & Incremental Indexing

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Ollama embedding timeouts, add `--watch` mode for live indexing, enable incremental indexing via git diff, and update AGENTS.md with agent guidelines.

**Architecture:** Reduce Ollama batch size from 100→10 with per-batch timeout handling. Add `--watch` CLI mode using chokidar file watcher with debounce and incremental reindexing. Incremental mode removes stale chunks for changed files and re-embeds only what changed.

**Tech Stack:** TypeScript, Node.js, chokidar, usearch, Ollama, MCP SDK, git

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/context.ts` | Modify | Add `indexChangedFiles()` method, reduce batch size |
| `src/index.ts` | Modify | Add `--watch`/`-w` CLI flag, wire up watcher loop |
| `src/watcher.ts` | Create | File watcher with debounce, triggers incremental reindex |
| `src/git-diff.ts` | Create | Detect changed files via `git diff --name-status` |
| `src/embeddings/ollama-embedding.ts` | Modify | Add configurable timeout to Ollama client |
| `src/embeddings.ts` | Modify | Pass timeout from env to Ollama factory |
| `AGENTS.md` | Modify | Add "always reindex + search" guidelines |
| `src/watcher.test.ts` | Create | Tests for watcher debounce logic |
| `src/git-diff.test.ts` | Create | Tests for git diff parsing |
| `package.json` | Modify | Add chokidar dependency |

---

### Task 1: Add chokidar dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add chokidar to dependencies**

```bash
npm install chokidar
```

chokidar v4 ships its own types, so no `@types/chokidar` needed.

- [ ] **Step 2: Verify build still works**

```bash
npm run build
```

---

### Task 2: Add Ollama timeout configuration

**Files:**
- Modify: `src/embeddings/ollama-embedding.ts`
- Modify: `src/embeddings.ts`

- [ ] **Step 1: Add timeout to OllamaEmbedding config and constructor**

Current `src/embeddings/ollama-embedding.ts:4-22`:
```typescript
export interface OllamaEmbeddingConfig {
    model: string;
    host?: string;
}
```

Change to:
```typescript
export interface OllamaEmbeddingConfig {
    model: string;
    host?: string;
    timeout?: number;
}
```

And update the constructor at line 19:
```typescript
this.client = new Ollama({
    host: config.host || 'http://127.0.0.1:11434',
    timeout: config.timeout || 30000,
});
```

- [ ] **Step 2: Update factory to pass timeout from env**

In `src/embeddings.ts:13-18`, change:
```typescript
function createOllamaEmbedding(): Embedding {
    return new OllamaEmbedding({
        model: env('OLLAMA_MODEL') || 'nomic-embed-text',
        host: env('OLLAMA_BASE_URL') || 'http://127.0.0.1:11434',
        timeout: parseInt(env('OLLAMA_TIMEOUT') || '30000', 10),
    });
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

---

### Task 3: Reduce batch size and add incremental indexing to LocalContext

**Files:**
- Modify: `src/context.ts`

- [ ] **Step 1: Reduce batch size and file concurrency**

In `src/context.ts:145-147`, change:
```typescript
const EMBEDDING_BATCH_SIZE = 10;
const FILE_CONCURRENCY = 5;
```

- [ ] **Step 2: Add `indexChangedFiles` method to LocalContext class**

Add this method before the closing brace of the `LocalContext` class (before line 511):

```typescript
async indexChangedFiles(
    changedFiles: string[],
    progressCallback?: (progress: { phase: string; current: number; total: number; percentage: number }) => void
): Promise<{ indexedFiles: number; removedFiles: number; totalChunks: number }> {
    const collectionName = this.getCollectionName();
    const exists = await this.vectorDatabase.hasCollection(collectionName);

    if (!exists) {
        return this.indexCodebase(progressCallback, false);
    }

    let removedCount = 0;
    const existingDocs = await this.vectorDatabase.query(collectionName, '', ['id', 'relativePath']);

    for (const changedFile of changedFiles) {
        const relativePath = path.relative(this.rootPath, changedFile).replace(/\\/g, '/');
        const staleDocs = existingDocs.filter(d => d.relativePath === relativePath);
        if (staleDocs.length > 0) {
            await this.vectorDatabase.delete(collectionName, staleDocs.map(d => d.id));
            removedCount += staleDocs.length;
        }
    }

    progressCallback?.({ phase: 'Reading changed files...', current: 0, total: 100, percentage: 0 });

    const chunks: CodeChunk[] = [];
    for (let i = 0; i < changedFiles.length; i++) {
        const filePath = changedFiles[i];
        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            const language = this.getLanguageFromExtension(path.extname(filePath));
            const fileChunks = await this.codeSplitter.split(content, language, filePath);
            chunks.push(...fileChunks);
        } catch (error) {
            console.error(`[LocalContext] Skipping ${filePath}: ${error}`);
        }
        progressCallback?.({
            phase: `Reading files (${i + 1}/${changedFiles.length})...`,
            current: Math.round((i + 1) / changedFiles.length * 50),
            total: 100,
            percentage: Math.round((i + 1) / changedFiles.length * 50),
        });
    }

    progressCallback?.({ phase: 'Generating embeddings...', current: 50, total: 100, percentage: 50 });

    const EMBEDDING_BATCH_SIZE = 10;
    let totalChunks = 0;
    for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
        const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
        await this.processChunkBatch(batch);
        totalChunks += batch.length;

        progressCallback?.({
            phase: `Embedding chunks (${totalChunks}/${chunks.length})...`,
            current: 50 + Math.round((totalChunks / chunks.length) * 50),
            total: 100,
            percentage: 50 + Math.round((totalChunks / chunks.length) * 50),
        });
    }

    await this.vectorDatabase.flush(collectionName);
    console.error(`[LocalContext] Incremental: ${changedFiles.length} files, +${totalChunks} chunks, -${removedCount} stale`);

    return { indexedFiles: changedFiles.length, removedFiles: removedCount, totalChunks };
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

---

### Task 4: Create git-diff module

**Files:**
- Create: `src/git-diff.ts`
- Create: `src/git-diff.test.ts`

- [ ] **Step 1: Write tests for git-diff**

Create `src/git-diff.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { getChangedFiles, isGitRepo } from './git-diff.js';

describe('git-diff', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join('/tmp', 'git-diff-test-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    describe('isGitRepo', () => {
        it('returns false for non-git directory', async () => {
            const result = await isGitRepo(tmpDir);
            expect(result).toBe(false);
        });

        it('returns true for git repo', async () => {
            await fs.promises.mkdir(path.join(tmpDir, '.git'), { recursive: true });
            const result = await isGitRepo(tmpDir);
            expect(result).toBe(true);
        });
    });

    describe('getChangedFiles', () => {
        it('returns empty array when no changes', async () => {
            await fs.promises.mkdir(path.join(tmpDir, '.git'), { recursive: true });
            const result = await getChangedFiles(tmpDir, '');
            expect(result).toEqual([]);
        });

        it('parses git diff output correctly', async () => {
            await fs.promises.mkdir(path.join(tmpDir, '.git'), { recursive: true });
            const diffOutput = 'M\tsrc/file1.ts\nA\tsrc/file2.ts\nD\tsrc/file3.ts\n';

            const result = await getChangedFiles(tmpDir, diffOutput);
            expect(result).toEqual([
                path.join(tmpDir, 'src/file1.ts'),
                path.join(tmpDir, 'src/file2.ts'),
            ]);
        });

        it('filters out unsupported extensions', async () => {
            await fs.promises.mkdir(path.join(tmpDir, '.git'), { recursive: true });
            const diffOutput = 'M\tsrc/file1.ts\nM\tREADME.md\nM\tdata.json\n';

            const result = await getChangedFiles(tmpDir, diffOutput);
            expect(result).toContain(path.join(tmpDir, 'src/file1.ts'));
            expect(result).toContain(path.join(tmpDir, 'README.md'));
            expect(result).not.toContain(path.join(tmpDir, 'data.json'));
        });
    });
});
```

- [ ] **Step 2: Implement git-diff module**

Create `src/git-diff.ts`:

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const SUPPORTED_EXTENSIONS = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.cpp', '.c', '.h', '.hpp',
    '.cs', '.go', '.rs', '.php', '.rb', '.swift', '.kt', '.scala', '.m', '.mm',
    '.md', '.markdown', '.ipynb',
]);

export async function isGitRepo(rootPath: string): Promise<boolean> {
    try {
        await fs.promises.access(path.join(rootPath, '.git'));
        return true;
    } catch {
        return false;
    }
}

export async function getChangedFiles(
    rootPath: string,
    diffOutput?: string
): Promise<string[]> {
    const output = diffOutput ?? await runGitDiff(rootPath);

    if (!output.trim()) {
        return [];
    }

    const lines = output.split('\n').filter(line => line.trim());
    const files: string[] = [];

    for (const line of lines) {
        const parts = line.split('\t');
        if (parts.length < 2) continue;

        const status = parts[0];
        const filePath = parts[1];

        // Skip deleted files
        if (status === 'D') continue;

        // Filter to supported extensions
        const ext = path.extname(filePath);
        if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

        files.push(path.join(rootPath, filePath));
    }

    return files;
}

async function runGitDiff(rootPath: string): Promise<string> {
    const { stdout } = await execAsync('git diff --name-status HEAD', {
        cwd: rootPath,
        timeout: 10000,
    });
    return stdout;
}
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run src/git-diff.test.ts
```

---

### Task 5: Create watcher module

**Files:**
- Create: `src/watcher.ts`
- Create: `src/watcher.test.ts`

- [ ] **Step 1: Write tests for watcher**

Create `src/watcher.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChangeDebouncer } from './watcher.js';

describe('ChangeDebouncer', () => {
    let debouncer: ChangeDebouncer;
    let callback: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        callback = vi.fn();
        vi.useFakeTimers();
        debouncer = new ChangeDebouncer(1000, callback);
    });

    afterEach(() => {
        debouncer.dispose();
        vi.useRealTimers();
    });

    it('calls callback after debounce delay', () => {
        debouncer.onChange('src/file.ts');
        expect(callback).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1000);
        expect(callback).toHaveBeenCalledTimes(1);
    });

    it('batches multiple changes within debounce window', () => {
        debouncer.onChange('src/file1.ts');
        debouncer.onChange('src/file2.ts');
        debouncer.onChange('src/file1.ts');

        vi.advanceTimersByTime(1000);
        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith(
            expect.arrayContaining(['src/file1.ts', 'src/file2.ts'])
        );
    });

    it('resets debounce timer on new change', () => {
        debouncer.onChange('src/file.ts');
        vi.advanceTimersByTime(500);
        debouncer.onChange('src/file2.ts');
        vi.advanceTimersByTime(500);
        expect(callback).not.toHaveBeenCalled();

        vi.advanceTimersByTime(500);
        expect(callback).toHaveBeenCalledTimes(1);
    });

    it('deduplicates same file in batch', () => {
        debouncer.onChange('src/file.ts');
        debouncer.onChange('src/file.ts');
        debouncer.onChange('src/file.ts');

        vi.advanceTimersByTime(1000);
        expect(callback).toHaveBeenCalledTimes(1);
        const changedFiles = callback.mock.calls[0][0];
        const count = changedFiles.filter((f: string) => f === 'src/file.ts').length;
        expect(count).toBe(1);
    });
});
```

- [ ] **Step 2: Implement watcher module**

Create `src/watcher.ts`:

```typescript
import * as path from 'path';
import chokidar from 'chokidar';
import { LocalContext } from './context.js';

const DEFAULT_SUPPORTED_EXTENSIONS = [
    '.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.cpp', '.c', '.h', '.hpp',
    '.cs', '.go', '.rs', '.php', '.rb', '.swift', '.kt', '.scala', '.m', '.mm',
    '.md', '.markdown', '.ipynb',
];

const DEFAULT_IGNORE_PATTERNS = [
    'node_modules/**', 'dist/**', 'build/**', 'out/**', 'target/**',
    '.git/**', '.cache/**', '__pycache__/**', '**/*.log', '**/*.map',
];

export class ChangeDebouncer {
    private pendingFiles: Set<string> = new Set();
    private timer: ReturnType<typeof setTimeout> | null = null;
    private callback: (files: string[]) => void;
    private delayMs: number;

    constructor(delayMs: number, callback: (files: string[]) => void) {
        this.delayMs = delayMs;
        this.callback = callback;
    }

    onChange(filePath: string): void {
        this.pendingFiles.add(filePath);

        if (this.timer) {
            clearTimeout(this.timer);
        }

        this.timer = setTimeout(() => this.flush(), this.delayMs);
    }

    private flush(): void {
        const files = [...this.pendingFiles];
        this.pendingFiles.clear();
        this.timer = null;

        if (files.length > 0) {
            this.callback(files);
        }
    }

    dispose(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }
}

export async function startWatchMode(
    rootPath: string,
    context: LocalContext
): Promise<void> {
    console.error(`[Watcher] Starting watch mode for: ${rootPath}`);

    const debouncer = new ChangeDebouncer(2000, async (changedFiles) => {
        console.error(`[Watcher] ${changedFiles.length} file(s) changed, reindexing...`);
        try {
            await context.indexChangedFiles(changedFiles, (progress) => {
                console.error(`[Watcher] ${progress.phase} ${progress.percentage}%`);
            });
            console.error(`[Watcher] Incremental reindex complete`);
        } catch (error) {
            console.error(`[Watcher] Reindex failed:`, error);
        }
    });

    const watcher = chokidar.watch(rootPath, {
        ignored: DEFAULT_IGNORE_PATTERNS,
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: {
            stabilityThreshold: 500,
            pollInterval: 100,
        },
    });

    watcher.on('change', (filePath) => {
        const ext = path.extname(filePath);
        if (DEFAULT_SUPPORTED_EXTENSIONS.includes(ext)) {
            console.error(`[Watcher] Changed: ${path.relative(rootPath, filePath)}`);
            debouncer.onChange(filePath);
        }
    });

    watcher.on('add', (filePath) => {
        const ext = path.extname(filePath);
        if (DEFAULT_SUPPORTED_EXTENSIONS.includes(ext)) {
            console.error(`[Watcher] Added: ${path.relative(rootPath, filePath)}`);
            debouncer.onChange(filePath);
        }
    });

    watcher.on('unlink', (filePath) => {
        const ext = path.extname(filePath);
        if (DEFAULT_SUPPORTED_EXTENSIONS.includes(ext)) {
            console.error(`[Watcher] Deleted: ${path.relative(rootPath, filePath)}`);
            debouncer.onChange(filePath);
        }
    });

    watcher.on('error', (error) => {
        console.error(`[Watcher] Error:`, error);
    });

    console.error(`[Watcher] Watching for changes. Press Ctrl+C to stop.`);

    process.on('SIGINT', () => {
        console.error(`\n[Watcher] Stopping...`);
        debouncer.dispose();
        watcher.close();
        process.exit(0);
    });

    process.on('SIGTERM', () => {
        console.error(`\n[Watcher] Stopping...`);
        debouncer.dispose();
        watcher.close();
        process.exit(0);
    });

    await new Promise(() => {});
}
```

- [ ] **Step 3: Run tests**

```bash
npx vitest run src/watcher.test.ts
```

---

### Task 6: Wire up --watch CLI flag

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Add import and update interface**

Add at top of `src/index.ts` (after existing imports):
```typescript
import { startWatchMode } from './watcher.js';
```

Update `CliArgs` interface:
```typescript
interface CliArgs {
    path?: string;
    indexDir?: string;
    watch?: boolean;
    help?: boolean;
}
```

- [ ] **Step 2: Add --watch to argument parsing**

In `parseArgs()`, add case:
```typescript
case '--watch':
case '-w':
    args.watch = true;
    break;
```

- [ ] **Step 3: Update help text**

```typescript
function printHelp() {
    console.error(`Usage: local-context-mcp [options]
Options:
  --path, -p <dir>      Directory to index (default: current directory)
  --index-dir, -i <dir> Directory for index storage (default: .usearch)
  --watch, -w           Watch mode: auto-reindex on file changes
  --help, -h            Show this help message`);
}
```

- [ ] **Step 4: Wire up watch mode in main()**

Replace the `main()` function:

```typescript
async function main() {
    const args = parseArgs();

    if (args.help) {
        printHelp();
        process.exit(0);
    }

    const context = createLocalContext({
        rootPath: args.path,
        indexDir: args.indexDir
    });

    if (args.watch) {
        console.error('[CLI] Starting in watch mode...');

        const status = await context.getStatus();
        if (!status.indexed || status.fileCount === 0) {
            console.error('[CLI] No index found, running initial index...');
            await context.indexCodebase(
                (progress) => {
                    console.error(`[CLI] ${progress.phase} ${progress.percentage}%`);
                },
                true
            );
        }

        await startWatchMode(context.getRootPath(), context);
        return;
    }

    const server = new LocalContextMcpServer(context);
    await server.start();
}
```

- [ ] **Step 5: Verify build**

```bash
npm run build
```

---

### Task 7: Update AGENTS.md

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Append agent guidelines**

Append to end of `AGENTS.md`:

```markdown
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
```

---

### Task 8: Run all tests and verify

**Files:**
- All test files

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

- [ ] **Step 2: Build and verify**

```bash
npm run build
```

- [ ] **Step 3: Verify CLI help shows --watch**

```bash
node dist/index.js --help
```

Expected output should include `--watch, -w` option.

---

## Self-Review

### 1. Spec Coverage Checklist
| Requirement | Task | Status |
|------------|------|--------|
| Fix Ollama timeout | Task 2 (timeout config), Task 3 (batch size 100→10) | ✅ |
| Auto-reindex on changes | Task 5 (watcher), Task 6 (--watch CLI) | ✅ |
| --watch mode behavior | Task 5 (startWatchMode), Task 6 (CLI wiring) | ✅ |
| Incremental indexing | Task 3 (indexChangedFiles), Task 4 (git-diff) | ✅ |
| Update AGENTS.md | Task 7 | ✅ |

### 2. Placeholder Scan
No TBD, TODO, or placeholder patterns found. All code blocks contain complete implementations.

### 3. Type Consistency
- `LocalContext.indexChangedFiles()` accepts `string[]` of absolute file paths — consistent with `getCodeFiles()` return type
- `ChangeDebouncer` callback signature matches usage in `startWatchMode`
- `getChangedFiles` returns absolute paths matching `rootPath` join pattern used throughout `context.ts`
- All imports use `.js` extensions per project convention
