/**
 * USearchVectorDatabase.ts
 * Local USearch backend for local-context-mcp
 *
 * This file uses the usearch library which is licensed under Apache-2.0.
 * See: https://github.com/unum-cloud/usearch/blob/main/LICENSE
 *
 * The rest of local-context-mcp remains under MIT.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Index, MetricKind, ScalarKind } from 'usearch';
import {
    VectorDocument,
    SearchOptions,
    VectorSearchResult,
    VectorDatabase,
    HybridSearchRequest,
    HybridSearchOptions,
    HybridSearchResult,
} from './types.js';

export interface USearchConfig {
    persistPath?: string;
}

interface DocumentMetadata {
    id: string;
    vector: number[];
    content: string;
    relativePath: string;
    startLine: number;
    endLine: number;
    fileExtension: string;
    metadata: Record<string, any>;
}

interface CollectionMetadata {
    dimension: number;
    description?: string;
}

export class USearchVectorDatabase implements VectorDatabase {
    private config: USearchConfig;
    private collections: Map<string, Index> = new Map();
    private metadata: Map<string, DocumentMetadata[]> = new Map();
    private persistPath: string;
    private dirtyFlags: Map<string, boolean> = new Map();

    constructor(config: USearchConfig = {}) {
        this.config = config;
        this.persistPath = config.persistPath || process.cwd();
    }

    async initialize(): Promise<void> {
        if (!fs.existsSync(this.persistPath)) {
            await fs.promises.mkdir(this.persistPath, { recursive: true });
        }
    }

    private getIndexPath(collectionName: string): string {
        return path.join(this.persistPath, `usearch_index_${collectionName}.usearch`);
    }

    private getMetadataPath(collectionName: string): string {
        return path.join(this.persistPath, `usearch_meta_${collectionName}.json`);
    }

    private getCollectionMetaPath(collectionName: string): string {
        return path.join(this.persistPath, `usearch_coll_${collectionName}.json`);
    }

    private async pathExists(filePath: string): Promise<boolean> {
        try {
            await fs.promises.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    private async loadCollectionIfNeeded(collectionName: string): Promise<void> {
        if (this.collections.has(collectionName)) {
            return;
        }

        const indexPath = this.getIndexPath(collectionName);
        const metadataPath = this.getMetadataPath(collectionName);

        const indexExists = await this.pathExists(indexPath);
        const metadataExists = await this.pathExists(metadataPath);

        if (indexExists && metadataExists) {
            try {
                const metaData = await fs.promises.readFile(metadataPath, 'utf-8');
                const docs: DocumentMetadata[] = JSON.parse(metaData);
                this.metadata.set(collectionName, docs);

                const collMetaPath = this.getCollectionMetaPath(collectionName);
                let dimension = 1536;
                if (await this.pathExists(collMetaPath)) {
                    const collMeta: CollectionMetadata = JSON.parse(await fs.promises.readFile(collMetaPath, 'utf-8'));
                    dimension = collMeta.dimension;
                }

                const index = new Index({ 
                    dimensions: dimension, 
                    metric: MetricKind.Cos, 
                    quantization: ScalarKind.F32,
                    connectivity: 24,
                    expansion_add: 128,
                    expansion_search: 64,
                    multi: false
                });
                index.load(indexPath);
                this.collections.set(collectionName, index);
                
                console.error(`[USearchDB] Loaded collection '${collectionName}' with ${index.size()} vectors`);
            } catch (error) {
                console.error(`[USearchDB] Failed to load collection '${collectionName}':`, error);
                throw error;
            }
        }
    }

    private async saveCollectionMetadata(collectionName: string): Promise<void> {
        const metadataPath = this.getMetadataPath(collectionName);
        const docs = this.metadata.get(collectionName) || [];
        await fs.promises.writeFile(metadataPath, JSON.stringify(docs, null, 2));
    }

    private async saveCollectionMeta(collectionName: string): Promise<void> {
        const index = this.collections.get(collectionName);
        if (!index) return;

        const metaPath = this.getCollectionMetaPath(collectionName);
        const collMetaPath = this.getCollectionMetaPath(collectionName);
        if (await this.pathExists(collMetaPath)) {
            const existingMeta: CollectionMetadata = JSON.parse(await fs.promises.readFile(collMetaPath, 'utf-8'));
            const docs = this.metadata.get(collectionName) || [];
            const actualDimension = docs.length > 0 ? docs[0].vector.length : existingMeta.dimension;
            existingMeta.dimension = index.size() > 0 ? actualDimension : existingMeta.dimension;
            await fs.promises.writeFile(metaPath, JSON.stringify(existingMeta, null, 2));
        }
    }

    private async saveIndex(collectionName: string): Promise<void> {
        const index = this.collections.get(collectionName);
        if (!index) return;

        const indexPath = this.getIndexPath(collectionName);
        index.save(indexPath);
        await this.saveCollectionMetadata(collectionName);
    }

    async createCollection(collectionName: string, dimension: number, description?: string): Promise<void> {
        console.error(`[USearchDB] Creating collection '${collectionName}' with dimension ${dimension}`);

        const indexPath = this.getIndexPath(collectionName);
        if (await this.pathExists(indexPath)) {
            console.error(`[USearchDB] Collection '${collectionName}' already exists, loading...`);
            await this.loadCollectionIfNeeded(collectionName);
            return;
        }

        const index = new Index({ 
            dimensions: dimension, 
            metric: MetricKind.Cos, 
            quantization: ScalarKind.F32,
            connectivity: 24,
            expansion_add: 128,
            expansion_search: 64,
            multi: false
        });
        this.collections.set(collectionName, index);
        this.metadata.set(collectionName, []);

        const meta: CollectionMetadata = { dimension, description };
        await fs.promises.writeFile(this.getCollectionMetaPath(collectionName), JSON.stringify(meta, null, 2));
        await fs.promises.writeFile(this.getMetadataPath(collectionName), '[]');
        index.save(indexPath);

        console.error(`[USearchDB] Created collection '${collectionName}'`);
    }

    async createHybridCollection(collectionName: string, dimension: number, description?: string): Promise<void> {
        return this.createCollection(collectionName, dimension, description);
    }

    async dropCollection(collectionName: string): Promise<void> {
        console.error(`[USearchDB] Dropping collection '${collectionName}'`);

        const indexPath = this.getIndexPath(collectionName);
        const metadataPath = this.getMetadataPath(collectionName);
        const collMetaPath = this.getCollectionMetaPath(collectionName);

        if (await this.pathExists(indexPath)) await fs.promises.unlink(indexPath);
        if (await this.pathExists(metadataPath)) await fs.promises.unlink(metadataPath);
        if (await this.pathExists(collMetaPath)) await fs.promises.unlink(collMetaPath);

        this.collections.delete(collectionName);
        this.metadata.delete(collectionName);

        console.error(`[USearchDB] Dropped collection '${collectionName}'`);
    }

    async hasCollection(collectionName: string): Promise<boolean> {
        const indexPath = this.getIndexPath(collectionName);
        const metadataPath = this.getMetadataPath(collectionName);
        const indexExists = await this.pathExists(indexPath);
        const metadataExists = await this.pathExists(metadataPath);
        return indexExists && metadataExists;
    }

    async listCollections(): Promise<string[]> {
        const files = await fs.promises.readdir(this.persistPath);
        const collections = new Set<string>();

        for (const file of files) {
            if (file.startsWith('usearch_index_') && file.endsWith('.usearch')) {
                const name = file.replace('usearch_index_', '').replace('.usearch', '');
                collections.add(name);
            }
        }

        return Array.from(collections);
    }

    async insert(collectionName: string, documents: VectorDocument[]): Promise<void> {
        await this.loadCollectionIfNeeded(collectionName);

        let index = this.collections.get(collectionName);
        const docs = this.metadata.get(collectionName) || [];

        if (!index) {
            const dimension = documents.length > 0 ? documents[0].vector.length : 1536;
            index = new Index({ 
                dimensions: dimension, 
                metric: MetricKind.Cos, 
                quantization: ScalarKind.F32,
                connectivity: 24,
                expansion_add: 128,
                expansion_search: 64,
                multi: false
            });
            this.collections.set(collectionName, index);
        }

        for (const doc of documents) {
            const numericId = docs.length;
            index.add(BigInt(numericId), new Float32Array(doc.vector));
            docs.push({
                id: doc.id,
                vector: doc.vector,
                content: doc.content,
                relativePath: doc.relativePath,
                startLine: doc.startLine,
                endLine: doc.endLine,
                fileExtension: doc.fileExtension,
                metadata: doc.metadata,
            });
        }

        this.metadata.set(collectionName, docs);
        this.dirtyFlags.set(collectionName, true);
        console.error(`[USearchDB] Inserted ${documents.length} documents into '${collectionName}'`);
    }

    async flush(collectionName: string): Promise<void> {
        if (this.dirtyFlags.get(collectionName)) {
            this.saveIndex(collectionName);
            this.dirtyFlags.set(collectionName, false);
            console.error(`[USearchDB] Flushed collection '${collectionName}' to disk`);
        }
    }

    async insertHybrid(collectionName: string, documents: VectorDocument[]): Promise<void> {
        return this.insert(collectionName, documents);
    }

    async search(collectionName: string, queryVector: number[], options?: SearchOptions): Promise<VectorSearchResult[]> {
        await this.loadCollectionIfNeeded(collectionName);

        const index = this.collections.get(collectionName);
        const docs = this.metadata.get(collectionName) || [];

        if (!index) {
            throw new Error(`Collection '${collectionName}' not found`);
        }

        const topK = options?.topK || 10;
        const results = index.search(new Float32Array(queryVector), topK, 0);

        const searchResults: VectorSearchResult[] = [];
        const keys = [...results.keys];
        const distances = [...results.distances];

        for (let i = 0; i < keys.length; i++) {
            const numericId = Number(keys[i]);
            if (numericId >= 0 && numericId < docs.length) {
                const doc = docs[numericId];
                searchResults.push({
                    document: {
                        id: doc.id,
                        vector: doc.vector,
                        content: doc.content,
                        relativePath: doc.relativePath,
                        startLine: doc.startLine,
                        endLine: doc.endLine,
                        fileExtension: doc.fileExtension,
                        metadata: doc.metadata,
                    },
                    score: 1 - distances[i],
                });
            }
        }

        return searchResults;
    }

    async hybridSearch(collectionName: string, searchRequests: HybridSearchRequest[], options?: HybridSearchOptions): Promise<HybridSearchResult[]> {
        if (searchRequests.length === 0) {
            return [];
        }

        const queryVector = Array.isArray(searchRequests[0].data) 
            ? searchRequests[0].data as number[]
            : [];

        const searchResults = await this.search(collectionName, queryVector, {
            topK: options?.limit || 10,
        });

        return searchResults.map(result => ({
            document: result.document,
            score: result.score,
        }));
    }

    async delete(collectionName: string, ids: string[]): Promise<void> {
        await this.loadCollectionIfNeeded(collectionName);

        const docs = this.metadata.get(collectionName);
        if (!docs) {
            throw new Error(`Collection '${collectionName}' not found`);
        }

        const idSet = new Set(ids);
        const remainingDocs: DocumentMetadata[] = [];

        for (const doc of docs) {
            if (!idSet.has(doc.id)) {
                remainingDocs.push(doc);
            }
        }

        if (remainingDocs.length < docs.length) {
            const index = this.collections.get(collectionName);
            if (index) {
                const dimension = index.size() > 0 && docs.length > 0 ? docs[0].vector.length : 1536;
                const newIndex = new Index({ 
                    dimensions: dimension, 
                    metric: MetricKind.Cos, 
                    quantization: ScalarKind.F32,
                    connectivity: 24,
                    expansion_add: 128,
                    expansion_search: 64,
                    multi: false
                });
                
                for (let i = 0; i < remainingDocs.length; i++) {
                    newIndex.add(BigInt(i), new Float32Array(remainingDocs[i].vector));
                }
                
                this.collections.set(collectionName, newIndex);
                this.metadata.set(collectionName, remainingDocs);
                this.saveIndex(collectionName);
                console.error(`[USearchDB] Deleted ${docs.length - remainingDocs.length} documents from '${collectionName}'`);
            }
        }
    }

    async query(collectionName: string, filter: string, outputFields: string[], limit?: number): Promise<Record<string, any>[]> {
        await this.loadCollectionIfNeeded(collectionName);

        const docs = this.metadata.get(collectionName) || [];
        let results = docs;

        if (filter && filter.trim() !== '') {
            const match = filter.match(/relativePath\s*==\s*"([^"]+)"/);
            if (match) {
                const relativePath = match[1];
                results = docs.filter(doc => doc.relativePath === relativePath);
            }
        }

        if (limit && limit > 0) {
            results = results.slice(0, limit);
        }

        return results.map(doc => {
            const result: Record<string, any> = {};
            for (const field of outputFields) {
                if (field === 'id') result.id = doc.id;
                else if (field === 'content') result.content = doc.content;
                else if (field === 'relativePath') result.relativePath = doc.relativePath;
                else if (field === 'startLine') result.startLine = doc.startLine;
                else if (field === 'endLine') result.endLine = doc.endLine;
                else if (field === 'fileExtension') result.fileExtension = doc.fileExtension;
                else if (field === 'metadata') result.metadata = doc.metadata;
            }
            return result;
        });
    }

    async getCollectionDescription(collectionName: string): Promise<string> {
        const collMetaPath = this.getCollectionMetaPath(collectionName);
        if (await this.pathExists(collMetaPath)) {
            const meta: CollectionMetadata = JSON.parse(await fs.promises.readFile(collMetaPath, 'utf-8'));
            return meta.description || '';
        }
        return '';
    }

    async checkCollectionLimit(): Promise<boolean> {
        return true;
    }
}

export function createVectorDatabase(config?: USearchConfig): VectorDatabase {
    return new USearchVectorDatabase(config);
}
