import { Embedding, EmbeddingVector } from '../types.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface GeminiEmbeddingConfig {
    apiKey: string;
    model?: string;
}

export class GeminiEmbedding extends Embedding {
    private client: GoogleGenerativeAI;
    private config: GeminiEmbeddingConfig;
    protected maxTokens: number = 2048;

    constructor(config: GeminiEmbeddingConfig) {
        super();
        this.config = config;
        this.client = new GoogleGenerativeAI(config.apiKey);
    }

    async detectDimension(testText: string = "test"): Promise<number> {
        return 768;
    }

    async embed(text: string): Promise<EmbeddingVector> {
        const processedText = this.preprocessText(text);
        const model = this.client.getGenerativeModel({ model: this.config.model || 'text-embedding-004' });
        const result = await model.embedContent(processedText);
        const vector = result.embedding.values;
        return {
            vector,
            dimension: vector.length,
        };
    }

    async embedBatch(texts: string[]): Promise<EmbeddingVector[]> {
        const processedTexts = this.preprocessTexts(texts);
        return Promise.all(processedTexts.map((text: string) => this.embed(text)));
    }

    getDimension(): number {
        return 768;
    }

    getProvider(): string {
        return 'gemini';
    }
}
