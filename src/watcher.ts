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

    // Don't block — let caller continue (e.g. start MCP server)
    // chokidar keeps the event loop alive via its persistent watcher
}
