import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { USearchVectorDatabase } from './usearch.js';

describe('USearchVectorDatabase', () => {
    const testDir = path.join(process.cwd(), '.test-usearch');
    let db: USearchVectorDatabase;

    beforeEach(async () => {
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true });
        }
        fs.mkdirSync(testDir, { recursive: true });
        db = new USearchVectorDatabase({ persistPath: testDir });
    });

    afterEach(async () => {
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true });
        }
    });

    describe('search()', () => {
        it('should return stored document vector, not query vector', async () => {
            const collectionName = 'test_collection';
            const storedVector = [0.1, 0.2, 0.3, 0.4, 0.5];
            const queryVector = [0.9, 0.8, 0.7, 0.6, 0.5];

            await db.createCollection(collectionName, storedVector.length, 'test');
            await db.insert(collectionName, [{
                id: 'doc1',
                vector: storedVector,
                content: 'test content',
                relativePath: 'test.ts',
                startLine: 1,
                endLine: 10,
                fileExtension: '.ts',
                metadata: {}
            }]);
            await db.flush(collectionName);

            const results = await db.search(collectionName, queryVector, { topK: 1 });

            expect(results).toHaveLength(1);
            expect(results[0].document.vector).toEqual(storedVector);
            expect(results[0].document.vector).not.toEqual(queryVector);
        });

        it('should return correct scores for cosine similarity', async () => {
            const collectionName = 'test_collection';
            const identicalVector = [1, 0, 0];
            const orthogonalVector = [0, 1, 0];

            await db.createCollection(collectionName, 3, 'test');
            await db.insert(collectionName, [
                {
                    id: 'doc1',
                    vector: identicalVector,
                    content: 'identical',
                    relativePath: 'a.ts',
                    startLine: 1,
                    endLine: 1,
                    fileExtension: '.ts',
                    metadata: {}
                },
                {
                    id: 'doc2',
                    vector: orthogonalVector,
                    content: 'orthogonal',
                    relativePath: 'b.ts',
                    startLine: 1,
                    endLine: 1,
                    fileExtension: '.ts',
                    metadata: {}
                }
            ]);
            await db.flush(collectionName);

            const results = await db.search(collectionName, identicalVector, { topK: 2 });

            expect(results).toHaveLength(2);
            expect(results[0].document.id).toBe('doc1');
            expect(results[0].score).toBeGreaterThan(0.99);
            expect(results[1].document.id).toBe('doc2');
            expect(results[1].score).toBeLessThan(0.1);
        });

        it('should return multiple results sorted by score', async () => {
            const collectionName = 'test_collection';
            const vectors = [
                [1, 0, 0, 0],
                [0.9, 0.1, 0, 0],
                [0.5, 0.5, 0, 0],
            ];
            const queryVector = [1, 0, 0, 0];

            await db.createCollection(collectionName, 4, 'test');
            await db.insert(collectionName, vectors.map((v, i) => ({
                id: `doc${i}`,
                vector: v,
                content: `content ${i}`,
                relativePath: `file${i}.ts`,
                startLine: 1,
                endLine: 1,
                fileExtension: '.ts',
                metadata: {}
            })));
            await db.flush(collectionName);

            const results = await db.search(collectionName, queryVector, { topK: 3 });

            expect(results).toHaveLength(3);
            expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
            expect(results[1].score).toBeGreaterThanOrEqual(results[2].score);
        });
    });

    describe('insert()', () => {
        it('should insert documents and return them via query', async () => {
            const collectionName = 'test_collection';
            const vector = [0.1, 0.2, 0.3];

            await db.createCollection(collectionName, 3, 'test');
            await db.insert(collectionName, [{
                id: 'test_doc',
                vector,
                content: 'test content',
                relativePath: 'test.ts',
                startLine: 5,
                endLine: 15,
                fileExtension: '.ts',
                metadata: { language: 'typescript' }
            }]);
            await db.flush(collectionName);

            const results = await db.search(collectionName, vector, { topK: 1 });

            expect(results).toHaveLength(1);
            expect(results[0].document.id).toBe('test_doc');
            expect(results[0].document.content).toBe('test content');
            expect(results[0].document.relativePath).toBe('test.ts');
            expect(results[0].document.startLine).toBe(5);
            expect(results[0].document.endLine).toBe(15);
            expect(results[0].document.metadata.language).toBe('typescript');
        });
    });

    describe('flush()', () => {
        it('should persist data after flush', async () => {
            const collectionName = 'test_collection';
            const vector = [0.1, 0.2, 0.3];

            await db.createCollection(collectionName, 3, 'test');
            await db.insert(collectionName, [{
                id: 'doc1',
                vector,
                content: 'content',
                relativePath: 'test.ts',
                startLine: 1,
                endLine: 1,
                fileExtension: '.ts',
                metadata: {}
            }]);
            await db.flush(collectionName);

            const db2 = new USearchVectorDatabase({ persistPath: testDir });
            const exists = await db2.hasCollection(collectionName);
            expect(exists).toBe(true);

            const results = await db2.search(collectionName, vector, { topK: 1 });
            expect(results).toHaveLength(1);
            expect(results[0].document.id).toBe('doc1');
        });
    });

    describe('hasCollection()', () => {
        it('should return false for non-existent collection', async () => {
            const exists = await db.hasCollection('nonexistent');
            expect(exists).toBe(false);
        });

        it('should return true for existing collection', async () => {
            await db.createCollection('test', 128, 'test');
            await db.flush('test');
            const exists = await db.hasCollection('test');
            expect(exists).toBe(true);
        });
    });

    describe('dropCollection()', () => {
        it('should delete collection and all data', async () => {
            const collectionName = 'test_collection';
            await db.createCollection(collectionName, 128, 'test');
            await db.insert(collectionName, [{
                id: 'doc1',
                vector: new Array(128).fill(0.1),
                content: 'content',
                relativePath: 'test.ts',
                startLine: 1,
                endLine: 1,
                fileExtension: '.ts',
                metadata: {}
            }]);
            await db.flush(collectionName);

            await db.dropCollection(collectionName);

            const exists = await db.hasCollection(collectionName);
            expect(exists).toBe(false);
        });
    });
});
