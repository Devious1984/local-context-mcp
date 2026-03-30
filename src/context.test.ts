import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { LocalContext, createLocalContext } from './context.js';
import { Embedding, EmbeddingVector, VectorDatabase } from './types.js';

class MockEmbedding extends Embedding {
    protected maxTokens = 8192;

    async detectDimension(): Promise<number> {
        return 128;
    }

    async embed(text: string): Promise<EmbeddingVector> {
        return {
            vector: new Array(128).fill(0).map(() => Math.random()),
            dimension: 128
        };
    }

    async embedBatch(texts: string[]): Promise<EmbeddingVector[]> {
        return Promise.all(texts.map(t => this.embed(t)));
    }

    getDimension(): number {
        return 128;
    }

    getProvider(): string {
        return 'mock';
    }
}

class MockVectorDatabase implements VectorDatabase {
    private collections: Map<string, any[]> = new Map();

    async createCollection(name: string, dimension: number, description?: string): Promise<void> {
        this.collections.set(name, []);
    }

    async createHybridCollection(name: string, dimension: number, description?: string): Promise<void> {
        await this.createCollection(name, dimension, description);
    }

    async dropCollection(name: string): Promise<void> {
        this.collections.delete(name);
    }

    async hasCollection(name: string): Promise<boolean> {
        return this.collections.has(name);
    }

    async listCollections(): Promise<string[]> {
        return Array.from(this.collections.keys());
    }

    async insert(name: string, documents: any[]): Promise<void> {
        const existing = this.collections.get(name) || [];
        this.collections.set(name, [...existing, ...documents]);
    }

    async insertHybrid(name: string, documents: any[]): Promise<void> {
        return this.insert(name, documents);
    }

    async search(name: string, queryVector: number[], options?: any): Promise<any[]> {
        const docs = this.collections.get(name) || [];
        return docs.map((doc, i) => ({
            document: doc,
            score: 1 - (i * 0.1)
        }));
    }

    async hybridSearch(name: string, requests: any[], options?: any): Promise<any[]> {
        return this.search(name, [], options);
    }

    async delete(name: string, ids: string[]): Promise<void> {
        const docs = this.collections.get(name) || [];
        this.collections.set(name, docs.filter(d => !ids.includes(d.id)));
    }

    async query(name: string, filter: string, fields: string[], limit?: number): Promise<any[]> {
        return (this.collections.get(name) || []).slice(0, limit);
    }

    async getCollectionDescription(name: string): Promise<string> {
        return '';
    }

    async checkCollectionLimit(): Promise<boolean> {
        return true;
    }

    async flush(name: string): Promise<void> {}
}

describe('LocalContext', () => {
    const testDir = path.join(process.cwd(), '.test-temp');
    let context: LocalContext;

    beforeEach(() => {
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }
        context = createLocalContext({
            embedding: new MockEmbedding(),
            vectorDatabase: new MockVectorDatabase(),
            rootPath: testDir,
        });
    });

    afterEach(() => {
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true });
        }
    });

    describe('search()', () => {
        it('should return results with correct structure', async () => {
            const results = await context.search('test query', 5);
            expect(results).toBeDefined();
            expect(Array.isArray(results)).toBe(true);
        });

        it('should return empty array when no index exists', async () => {
            const results = await context.search('test query', 10);
            expect(results).toEqual([]);
        });
    });

    describe('indexCodebase()', () => {
        it('should handle empty codebase', async () => {
            const result = await context.indexCodebase(undefined, true);
            expect(result).toBeDefined();
            expect(result.status).toBe('completed');
        });
    });

    describe('getStatus()', () => {
        it('should return indexed: false when no collection exists', async () => {
            const status = await context.getStatus();
            expect(status.indexed).toBe(false);
        });
    });
});

describe('LocalContext keyword scoring', () => {
    const context = new LocalContext({
        rootPath: '/test',
    });

    const extractKeywords = (query: string): string[] => {
        const camelCaseWords = query.split(/(?=[A-Z])|[-_\s]/).filter((w: string) => w.length > 1);
        const identifierPattern = /[a-zA-Z_][a-zA-Z0-9_]*/g;
        const identifiers = query.match(identifierPattern) || [];
        const all = [...camelCaseWords, ...identifiers];
        const unique = [...new Set(all.map((w: string) => w.toLowerCase()))];
        const common = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'has', 'have', 'been', 'would', 'could', 'there', 'their', 'what', 'about', 'which', 'when', 'make', 'like', 'time', 'just', 'know', 'take', 'into', 'year', 'your', 'some', 'them', 'than', 'then', 'look', 'only', 'come', 'over', 'such', 'also', 'back', 'after', 'with', 'this', 'that', 'from', 'they', 'will', 'more', 'how', 'does', 'what', 'does', 'work', 'using', 'file', 'code', 'function', 'class', 'method']);
        return unique.filter((w: string) => w.length > 2 && !common.has(w)).slice(0, 10);
    };

    const calculateKeywordScore = (content: string, keywords: string[]): number => {
        if (keywords.length === 0) return 0;
        const contentLower = content.toLowerCase();
        let matches = 0;
        for (const keyword of keywords) {
            if (contentLower.includes(keyword)) {
                matches++;
            }
        }
        return matches / keywords.length;
    };

    const getFileTypeScore = (relativePath: string): number => {
        const ext = relativePath.split('.').pop()?.toLowerCase() || '';
        const codeExtensions = ['ts', 'tsx', 'js', 'jsx', 'py', 'java', 'cpp', 'c', 'go', 'rs', 'cs', 'rb', 'php', 'swift', 'kt', 'scala'];
        const docExtensions = ['md', 'txt', 'rst', 'adoc'];
        if (codeExtensions.includes(ext)) return 1.0;
        if (docExtensions.includes(ext)) return 0.3;
        return 0.5;
    };

    const getChunkTypeScore = (chunkType?: string): number => {
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
    };

    describe('extractKeywords()', () => {
        it('should extract camelCase words', () => {
            const keywords = extractKeywords('getUserByName');
            expect(keywords).toContain('get');
            expect(keywords).toContain('user');
            expect(keywords).toContain('name');
        });

        it('should extract underscores and hyphens', () => {
            const keywords = extractKeywords('get_user_by_id');
            expect(keywords).toContain('get');
            expect(keywords).toContain('user');
        });

        it('should filter common words', () => {
            const keywords = extractKeywords('the and for are but not');
            expect(keywords).toEqual([]);
        });

        it('should filter short words', () => {
            const keywords = extractKeywords('a b c test');
            expect(keywords).not.toContain('a');
            expect(keywords).not.toContain('b');
            expect(keywords).not.toContain('c');
        });
    });

    describe('calculateKeywordScore()', () => {
        it('should return 1.0 when all keywords match', () => {
            const score = calculateKeywordScore('function test() { return true; }', ['function', 'test']);
            expect(score).toBe(1.0);
        });

        it('should return 0.0 for no matches', () => {
            const score = calculateKeywordScore('function test() { return true; }', ['class', 'unknown']);
            expect(score).toBe(0.0);
        });

        it('should return partial score for some matches', () => {
            const score = calculateKeywordScore('function test() { return true; }', ['function', 'class', 'unknown']);
            expect(score).toBeCloseTo(0.333, 2);
        });
    });

    describe('getFileTypeScore()', () => {
        it('should return 1.0 for TypeScript files', () => {
            expect(getFileTypeScore('test.ts')).toBe(1.0);
            expect(getFileTypeScore('test.tsx')).toBe(1.0);
        });

        it('should return 1.0 for JavaScript files', () => {
            expect(getFileTypeScore('test.js')).toBe(1.0);
            expect(getFileTypeScore('test.jsx')).toBe(1.0);
        });

        it('should return 1.0 for Python files', () => {
            expect(getFileTypeScore('test.py')).toBe(1.0);
        });

        it('should return 0.3 for documentation files', () => {
            expect(getFileTypeScore('README.md')).toBe(0.3);
        });

        it('should return 0.5 for other files', () => {
            expect(getFileTypeScore('test.json')).toBe(0.5);
        });
    });

    describe('getChunkTypeScore()', () => {
        it('should return 1.0 for functions', () => {
            expect(getChunkTypeScore('function')).toBe(1.0);
        });

        it('should return 1.0 for methods', () => {
            expect(getChunkTypeScore('method')).toBe(1.0);
        });

        it('should return 0.9 for classes', () => {
            expect(getChunkTypeScore('class')).toBe(0.9);
        });

        it('should return 0.5 for unknown chunk types', () => {
            expect(getChunkTypeScore('code')).toBe(0.5);
        });

        it('should return 0.5 for undefined chunk type', () => {
            expect(getChunkTypeScore(undefined)).toBe(0.5);
        });
    });
});
