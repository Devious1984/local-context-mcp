import { Embedding, EmbeddingVector } from '../types.js';
import OpenAI from 'openai';

export interface OpenAIEmbeddingConfig {
    model: string;
    apiKey: string;
    baseURL?: string;
}

export class OpenAIEmbedding extends Embedding {
    private client: OpenAI;
    private config: OpenAIEmbeddingConfig;
    protected maxTokens: number = 8192;

    constructor(config: OpenAIEmbeddingConfig) {
        super();
        this.config = config;
        this.client = new OpenAI({
            apiKey: config.apiKey,
            baseURL: config.baseURL,
        });
    }

    async detectDimension(testText: string = "test"): Promise<number> {
        const knownModels: Record<string, number> = {
            'text-embedding-3-small': 1536,
            'text-embedding-3-large': 3072,
            'text-embedding-ada-002': 1536,
        };

        const model = this.config.model || 'text-embedding-3-small';
        if (knownModels[model]) {
            return knownModels[model];
        }

        try {
            const response = await this.client.embeddings.create({
                model: model,
                input: this.preprocessText(testText),
                encoding_format: 'float',
            });
            return response.data[0].embedding.length;
        } catch (error) {
            console.error('[OpenAIEmbedding] Failed to detect dimension:', error);
            return 1536;
        }
    }

    async embed(text: string): Promise<EmbeddingVector> {
        const processedText = this.preprocessText(text);
        const response = await this.client.embeddings.create({
            model: this.config.model,
            input: processedText,
            encoding_format: 'float',
        });
        return {
            vector: response.data[0].embedding,
            dimension: response.data[0].embedding.length,
        };
    }

    async embedBatch(texts: string[]): Promise<EmbeddingVector[]> {
        const processedTexts = this.preprocessTexts(texts);
        const response = await this.client.embeddings.create({
            model: this.config.model,
            input: processedTexts,
            encoding_format: 'float',
        });
        return response.data.map((item: any) => ({
            vector: item.embedding,
            dimension: item.embedding.length,
        }));
    }

    getDimension(): number {
        return 1536;
    }

    getProvider(): string {
        return 'openai';
    }
}
