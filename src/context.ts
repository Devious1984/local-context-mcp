import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import {
    Splitter,
    CodeChunk,
} from './types.js';
import { AstCodeSplitter } from './ast-splitter.js';
import {
    Embedding,
    createEmbedding
} from './embeddings.js';
import {
    VectorDatabase,
    VectorDocument,
    VectorSearchResult,
    SemanticSearchResult,
    EmbeddingVector
} from './types.js';
import {
    USearchVectorDatabase
} from './usearch.js';

const DEFAULT_SUPPORTED_EXTENSIONS = [
    '.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.cpp', '.c', '.h', '.hpp',
    '.cs', '.go', '.rs', '.php', '.rb', '.swift', '.kt', '.scala', '.m', '.mm',
    '.md', '.markdown', '.ipynb',
];

const DEFAULT_IGNORE_PATTERNS = [
    'node_modules/**',
    'dist/**',
    'build/**',
    'out/**',
    'target/**',
    'coverage/**',
    '.nyc_output/**',
    '.vscode/**',
    '.idea/**',
    '*.swp',
    '*.swo',
    '.git/**',
    '.svn/**',
    '.hg/**',
    '.cache/**',
    '__pycache__/**',
    '.pytest_cache/**',
    'logs/**',
    'tmp/**',
    'temp/**',
    '*.log',
    '.env',
    '.env.*',
    '*.local',
    '*.min.js',
    '*.min.css',
    '*.min.map',
    '*.bundle.js',
    '*.bundle.css',
    '*.chunk.js',
    '*.vendor.js',
    '*.polyfills.js',
    '*.runtime.js',
    '*.map',
    'node_modules', '.git', '.svn', '.hg', 'build', 'dist', 'out',
    'target', '.vscode', '.idea', '__pycache__', '.pytest_cache',
    'coverage', '.nyc_output', 'logs', 'tmp', 'temp'
];

export interface LocalContextConfig {
    embedding?: Embedding;
    vectorDatabase?: VectorDatabase;
    supportedExtensions?: string[];
    ignorePatterns?: string[];
    rootPath?: string;
    indexDir?: string;
}

export class LocalContext {
    private embedding: Embedding;
    private vectorDatabase: VectorDatabase;
    private codeSplitter: Splitter;
    private supportedExtensions: string[];
    private ignorePatterns: string[];
    private rootPath: string;

    constructor(config: LocalContextConfig = {}) {
        this.embedding = config.embedding || createEmbedding();
        this.rootPath = config.rootPath || process.env.LOCAL_CONTEXT_PATH || process.cwd();
        
        this.vectorDatabase = config.vectorDatabase || new USearchVectorDatabase({
            persistPath: this.rootPath
        });
        this.codeSplitter = new AstCodeSplitter(2500, 300);
        this.supportedExtensions = [
            ...DEFAULT_SUPPORTED_EXTENSIONS,
            ...(config.supportedExtensions || [])
        ];
        this.ignorePatterns = [
            ...DEFAULT_IGNORE_PATTERNS,
            ...(config.ignorePatterns || [])
        ];

        console.error(`[LocalContext] Initialized at: ${this.rootPath}`);
        console.error(`[LocalContext] Embedding: ${this.embedding.getProvider()}`);
    }

    getRootPath(): string {
        return this.rootPath;
    }

    async indexCodebase(
        progressCallback?: (progress: { phase: string; current: number; total: number; percentage: number }) => void,
        forceReindex: boolean = false
    ): Promise<{ indexedFiles: number; totalChunks: number; status: 'completed' | 'limit_reached' }> {
        const collectionName = this.getCollectionName();

        if (forceReindex) {
            const exists = await this.vectorDatabase.hasCollection(collectionName);
            if (exists) {
                console.error(`[LocalContext] Dropping existing collection for reindex...`);
                await this.vectorDatabase.dropCollection(collectionName);
            }
        }

        await this.loadIgnorePatterns();
        
        progressCallback?.({ phase: 'Preparing collection...', current: 0, total: 100, percentage: 0 });
        
        const dimension = await this.embedding.detectDimension();
        const exists = await this.vectorDatabase.hasCollection(collectionName);
        if (!exists) {
            await this.vectorDatabase.createCollection(collectionName, dimension, `root:${this.rootPath}`);
        }

        progressCallback?.({ phase: 'Scanning files...', current: 5, total: 100, percentage: 5 });
        const codeFiles = await this.getCodeFiles();
        console.error(`[LocalContext] Found ${codeFiles.length} code files`);

        if (codeFiles.length === 0) {
            return { indexedFiles: 0, totalChunks: 0, status: 'completed' };
        }

        const EMBEDDING_BATCH_SIZE = 100;
        const CHUNK_LIMIT = 450000;
        let chunkBuffer: CodeChunk[] = [];
        let processedFiles = 0;
        let totalChunks = 0;

        for (let i = 0; i < codeFiles.length; i++) {
            const filePath = codeFiles[i];

            try {
                const content = await fs.promises.readFile(filePath, 'utf-8');
                const language = this.getLanguageFromExtension(path.extname(filePath));
                const chunks = await this.codeSplitter.split(content, language, filePath);

                for (const chunk of chunks) {
                    chunkBuffer.push(chunk);
                    totalChunks++;

                    if (chunkBuffer.length >= EMBEDDING_BATCH_SIZE) {
                        await this.processChunkBatch(chunkBuffer);
                        chunkBuffer = [];
                    }

                    if (totalChunks >= CHUNK_LIMIT) {
                        console.error(`[LocalContext] Chunk limit reached`);
                        break;
                    }
                }

                processedFiles++;
                progressCallback?.({
                    phase: `Processing files (${processedFiles}/${codeFiles.length})...`,
                    current: processedFiles,
                    total: codeFiles.length,
                    percentage: Math.round((processedFiles / codeFiles.length) * 90) + 10
                });

            } catch (error) {
                console.error(`[LocalContext] Skipping ${filePath}: ${error}`);
            }
        }

        if (chunkBuffer.length > 0) {
            await this.processChunkBatch(chunkBuffer);
        }

        progressCallback?.({ phase: 'Indexing complete!', current: 100, total: 100, percentage: 100 });
        console.error(`[LocalContext] Indexed ${processedFiles} files, ${totalChunks} chunks`);

        return {
            indexedFiles: processedFiles,
            totalChunks,
            status: totalChunks >= CHUNK_LIMIT ? 'limit_reached' : 'completed'
        };
    }

    private async processChunkBatch(chunks: CodeChunk[]): Promise<void> {
        if (chunks.length === 0) return;

        const chunkContents = chunks.map(chunk => chunk.content);
        const embeddings = await this.embedding.embedBatch(chunkContents);

        const documents: VectorDocument[] = chunks.map((chunk, index) => {
            const filePath = chunk.metadata?.filePath || '';
            const startLine = chunk.metadata?.startLine || 1;
            const endLine = chunk.metadata?.endLine || 1;
            const language = chunk.metadata?.language || 'text';
            const relativePath = path.relative(this.rootPath, filePath);
            const chunkType = chunk.metadata?.chunkType;
            
            return {
                id: this.generateId(relativePath, startLine, endLine, chunk.content),
                content: chunk.content,
                vector: embeddings[index].vector,
                relativePath,
                startLine,
                endLine,
                fileExtension: path.extname(filePath),
                metadata: { language, chunkType }
            };
        });

        await this.vectorDatabase.insert(this.getCollectionName(), documents);
    }

    async search(query: string, topK: number = 10): Promise<SemanticSearchResult[]> {
        const collectionName = this.getCollectionName();
        const exists = await this.vectorDatabase.hasCollection(collectionName);

        if (!exists) {
            console.error(`[LocalContext] No index found. Run 'reindex' first.`);
            return [];
        }

        const queryEmbedding: EmbeddingVector = await this.embedding.embed(query);
        const results: VectorSearchResult[] = await this.vectorDatabase.search(
            collectionName,
            queryEmbedding.vector,
            { topK: topK * 3 }
        );

        const queryKeywords = this.extractKeywords(query);
        const boostedResults = results.map(result => {
            const doc = result.document;
            const metadata = doc.metadata || {};
            
            const semanticScore = result.score;
            const keywordScore = this.calculateKeywordScore(doc.content, queryKeywords);
            const fileTypeScore = this.getFileTypeScore(doc.relativePath);
            const chunkTypeScore = this.getChunkTypeScore(metadata.chunkType);
            
            const finalScore = (
                semanticScore * 0.5 +
                keywordScore * 0.25 +
                fileTypeScore * 0.15 +
                chunkTypeScore * 0.10
            );

            return {
                content: doc.content,
                relativePath: doc.relativePath,
                startLine: doc.startLine,
                endLine: doc.endLine,
                language: metadata.language || 'unknown',
                score: finalScore,
                _semanticScore: semanticScore,
                _keywordScore: keywordScore,
                _fileTypeScore: fileTypeScore,
                _chunkTypeScore: chunkTypeScore,
            };
        });

        boostedResults.sort((a, b) => b.score - a.score);

        return boostedResults.slice(0, topK).map(r => ({
            content: r.content,
            relativePath: r.relativePath,
            startLine: r.startLine,
            endLine: r.endLine,
            language: r.language,
            score: r.score
        }));
    }

    private extractKeywords(query: string): string[] {
        const camelCaseWords = query.split(/(?=[A-Z])|[-_\s]/).filter(w => w.length > 1);
        const identifierPattern = /[a-zA-Z_][a-zA-Z0-9_]*/g;
        const identifiers = query.match(identifierPattern) || [];
        
        const all = [...camelCaseWords, ...identifiers];
        const unique = [...new Set(all.map(w => w.toLowerCase()))];
        return unique.filter(w => w.length > 2 && !this.isCommonWord(w)).slice(0, 10);
    }

    private isCommonWord(word: string): boolean {
        const common = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'has', 'have', 'been', 'would', 'could', 'there', 'their', 'what', 'about', 'which', 'when', 'make', 'like', 'time', 'just', 'know', 'take', 'into', 'year', 'your', 'some', 'them', 'than', 'then', 'look', 'only', 'come', 'over', 'such', 'also', 'back', 'after', 'with', 'this', 'that', 'from', 'they', 'will', 'more', 'how', 'does', 'what', 'does', 'work', 'using', 'file', 'code', 'function', 'class', 'method']);
        return common.has(word.toLowerCase());
    }

    private calculateKeywordScore(content: string, keywords: string[]): number {
        if (keywords.length === 0) return 0;
        
        const contentLower = content.toLowerCase();
        let matches = 0;
        
        for (const keyword of keywords) {
            if (contentLower.includes(keyword)) {
                matches++;
            }
        }
        
        return matches / keywords.length;
    }

    private getFileTypeScore(relativePath: string): number {
        const ext = path.extname(relativePath).toLowerCase();
        const codeExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.cpp', '.c', '.go', '.rs', '.cs', '.rb', '.php', '.swift', '.kt', '.scala'];
        const docExtensions = ['.md', '.txt', '.rst', '.adoc'];
        
        if (codeExtensions.includes(ext)) return 1.0;
        if (docExtensions.includes(ext)) return 0.3;
        return 0.5;
    }

    private getChunkTypeScore(chunkType?: string): number {
        if (!chunkType) return 0.5;
        
        const scores: Record<string, number> = {
            'function': 1.0,
            'method': 1.0,
            'class': 0.9,
            'interface': 0.8,
            'struct': 0.8,
            'enum': 0.7,
            'import': 0.6,
            'export': 0.6,
            'declaration': 0.5,
            'variable': 0.5,
            'constant': 0.5,
            'code': 0.5,
        };
        
        return scores[chunkType] ?? 0.4;
    }

    async clearIndex(): Promise<void> {
        const collectionName = this.getCollectionName();
        const exists = await this.vectorDatabase.hasCollection(collectionName);
        if (exists) {
            await this.vectorDatabase.dropCollection(collectionName);
        }
        console.error(`[LocalContext] Index cleared`);
    }

    async getStatus(): Promise<{ indexed: boolean; fileCount: number; chunkCount: number }> {
        const collectionName = this.getCollectionName();
        const exists = await this.vectorDatabase.hasCollection(collectionName);

        if (!exists) {
            return { indexed: false, fileCount: 0, chunkCount: 0 };
        }

        const docs = await this.vectorDatabase.query(collectionName, '', ['id', 'relativePath']);
        const uniqueFiles = new Set(docs.map(d => d.relativePath));

        return {
            indexed: true,
            fileCount: uniqueFiles.size,
            chunkCount: docs.length
        };
    }

    private getCollectionName(): string {
        const normalizedPath = path.resolve(this.rootPath);
        const hash = crypto.createHash('md5').update(normalizedPath).digest('hex');
        return `code_chunks_${hash.substring(0, 8)}`;
    }

    private async getCodeFiles(): Promise<string[]> {
        const files: string[] = [];

        const traverseDirectory = async (currentPath: string) => {
            const entries = await fs.promises.readdir(currentPath, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(currentPath, entry.name);

                if (this.matchesIgnorePattern(fullPath)) {
                    continue;
                }

                if (entry.isDirectory()) {
                    await traverseDirectory(fullPath);
                } else if (entry.isFile()) {
                    const ext = path.extname(entry.name);
                    if (this.supportedExtensions.includes(ext)) {
                        files.push(fullPath);
                    }
                }
            }
        };

        await traverseDirectory(this.rootPath);
        return files;
    }

    private async loadIgnorePatterns(): Promise<void> {
        try {
            const ignoreFiles = ['.gitignore', '.contextignore'];
            for (const ignoreFile of ignoreFiles) {
                const ignorePath = path.join(this.rootPath, ignoreFile);
                if (fs.existsSync(ignorePath)) {
                    const content = await fs.promises.readFile(ignorePath, 'utf-8');
                    const patterns = content
                        .split('\n')
                        .map(line => line.trim())
                        .filter(line => line && !line.startsWith('#'));
                    
                    const normalizedPatterns = patterns.map(p => 
                        p.startsWith('/') ? p.substring(1) : p
                    );
                    this.ignorePatterns.push(...normalizedPatterns);
                }
            }
        } catch (error) {
            // Ignore errors, use default patterns
        }
    }

    private matchesIgnorePattern(filePath: string): boolean {
        const relativePath = path.relative(this.rootPath, filePath).replace(/\\/g, '/');
        const normalizedPath = relativePath;

        for (const pattern of this.ignorePatterns) {
            if (this.isPatternMatch(normalizedPath, pattern)) {
                return true;
            }
        }
        return false;
    }

    private isPatternMatch(filePath: string, pattern: string): boolean {
        if (pattern.endsWith('/')) {
            const dirPattern = pattern.slice(0, -1);
            return filePath.split('/').some(part => this.simpleGlobMatch(part, dirPattern));
        }

        if (pattern.includes('/')) {
            return this.simpleGlobMatch(filePath, pattern);
        } else {
            const fileName = path.basename(filePath);
            return this.simpleGlobMatch(fileName, pattern);
        }
    }

    private simpleGlobMatch(text: string, pattern: string): boolean {
        const regexPattern = pattern
            .replace(/[.+^${}()|[\]\\]/g, '\\$&')
            .replace(/\*/g, '.*');
        return new RegExp(`^${regexPattern}$`).test(text);
    }

    private getLanguageFromExtension(ext: string): string {
        const languageMap: Record<string, string> = {
            '.ts': 'typescript', '.tsx': 'typescript',
            '.js': 'javascript', '.jsx': 'javascript',
            '.py': 'python', '.java': 'java',
            '.cpp': 'cpp', '.c': 'c', '.h': 'c', '.hpp': 'cpp',
            '.cs': 'csharp', '.go': 'go', '.rs': 'rust',
            '.php': 'php', '.rb': 'ruby', '.swift': 'swift',
            '.kt': 'kotlin', '.scala': 'scala',
            '.m': 'objective-c', '.mm': 'objective-c',
            '.ipynb': 'jupyter', '.md': 'markdown'
        };
        return languageMap[ext] || 'text';
    }

    private generateId(relativePath: string, startLine: number, endLine: number, content: string): string {
        const combinedString = `${relativePath}:${startLine}:${endLine}:${content}`;
        const hash = crypto.createHash('sha256').update(combinedString, 'utf-8').digest('hex');
        return `chunk_${hash.substring(0, 16)}`;
    }
}

export function createLocalContext(config?: LocalContextConfig): LocalContext {
    return new LocalContext(config);
}
