import { Embedding, EmbeddingVector } from '../types.js';
import { VoyageAIClient } from 'voyageai';

export interface VoyageAIEmbeddingConfig {
    client: VoyageAIClient;
    model?: string;
}

export class VoyageAIEmbedding extends Embedding {
    private config: VoyageAIEmbeddingConfig;
    protected maxTokens: number = 8192;

    constructor(config: VoyageAIEmbeddingConfig) {
        super();
        this.config = config;
    }

    async detectDimension(testText: string = "test"): Promise<number> {
        return 1024;
    }

    async embed(text: string): Promise<EmbeddingVector> {
        const processedText = this.preprocessText(text);
        const response = await this.config.client.embed({
            model: this.config.model || 'voyage-3',
            input: processedText,
        });
        const data = response.data;
        if (!data || data.length === 0 || !data[0]) {
            throw new Error('No embedding data returned from VoyageAI');
        }
        const embedding = data[0].embedding;
        if (!embedding) {
            throw new Error('Embedding is undefined');
        }
        return {
            vector: embedding,
            dimension: embedding.length,
        };
    }

    async embedBatch(texts: string[]): Promise<EmbeddingVector[]> {
        const processedTexts = this.preprocessTexts(texts);
        const response = await this.config.client.embed({
            model: this.config.model || 'voyage-3',
            input: processedTexts,
        });
        const data = response.data;
        if (!data) {
            throw new Error('No embedding data returned from VoyageAI');
        }
        return data.map((item: any) => ({
            vector: item.embedding,
            dimension: item.embedding.length,
        }));
    }

    getDimension(): number {
        return 1024;
    }

    getProvider(): string {
        return 'voyageai';
    }
}
