export interface VectorDocument {
    id: string;
    vector: number[];
    content: string;
    relativePath: string;
    startLine: number;
    endLine: number;
    fileExtension: string;
    metadata: Record<string, any>;
}

export interface SearchOptions {
    topK?: number;
    filter?: Record<string, any>;
    threshold?: number;
    filterExpr?: string;
}

export interface HybridSearchRequest {
    data: number[] | string;
    anns_field: string;
    param: Record<string, any>;
    limit: number;
}

export interface HybridSearchOptions {
    rerank?: RerankStrategy;
    limit?: number;
    filterExpr?: string;
}

export interface RerankStrategy {
    strategy: 'rrf' | 'weighted';
    params?: Record<string, any>;
}

export interface VectorSearchResult {
    document: VectorDocument;
    score: number;
}

export interface HybridSearchResult {
    document: VectorDocument;
    score: number;
}

export interface VectorDatabase {
    createCollection(collectionName: string, dimension: number, description?: string): Promise<void>;
    createHybridCollection(collectionName: string, dimension: number, description?: string): Promise<void>;
    dropCollection(collectionName: string): Promise<void>;
    hasCollection(collectionName: string): Promise<boolean>;
    listCollections(): Promise<string[]>;
    insert(collectionName: string, documents: VectorDocument[]): Promise<void>;
    insertHybrid(collectionName: string, documents: VectorDocument[]): Promise<void>;
    search(collectionName: string, queryVector: number[], options?: SearchOptions): Promise<VectorSearchResult[]>;
    hybridSearch(collectionName: string, searchRequests: HybridSearchRequest[], options?: HybridSearchOptions): Promise<HybridSearchResult[]>;
    delete(collectionName: string, ids: string[]): Promise<void>;
    query(collectionName: string, filter: string, outputFields: string[], limit?: number): Promise<Record<string, any>[]>;
    getCollectionDescription(collectionName: string): Promise<string>;
    checkCollectionLimit(): Promise<boolean>;
    flush(collectionName: string): Promise<void>;
}

export interface EmbeddingVector {
    vector: number[];
    dimension: number;
}

export abstract class Embedding {
    protected abstract maxTokens: number;

    protected preprocessText(text: string): string {
        if (text === '') {
            return ' ';
        }
        const maxChars = this.maxTokens * 4;
        if (text.length > maxChars) {
            return text.substring(0, maxChars);
        }
        return text;
    }

    protected preprocessTexts(texts: string[]): string[] {
        return texts.map(text => this.preprocessText(text));
    }

    abstract detectDimension(testText?: string): Promise<number>;
    abstract embed(text: string): Promise<EmbeddingVector>;
    abstract embedBatch(texts: string[]): Promise<EmbeddingVector[]>;
    abstract getDimension(): number;
    abstract getProvider(): string;
}

export interface CodeChunk {
    content: string;
    metadata: {
        startLine: number;
        endLine: number;
        language?: string;
        filePath?: string;
        [key: string]: any;
    };
}

export interface Splitter {
    split(content: string, language: string, filePath: string): Promise<CodeChunk[]>;
}

export interface SemanticSearchResult {
    content: string;
    relativePath: string;
    startLine: number;
    endLine: number;
    language: string;
    score: number;
}
