import { Embedding, EmbeddingVector } from '../types.js';
import { Ollama } from 'ollama';

export interface OllamaEmbeddingConfig {
    model: string;
    host?: string;
}

export class OllamaEmbedding extends Embedding {
    private client: Ollama;
    private config: OllamaEmbeddingConfig;
    private dimension: number = 768;
    private dimensionDetected: boolean = false;
    protected maxTokens: number = 8192;

    constructor(config: OllamaEmbeddingConfig) {
        super();
        this.config = config;
        this.client = new Ollama({
            host: config.host || 'http://127.0.0.1:11434',
        });
    }

    async detectDimension(testText: string = "test"): Promise<number> {
        if (this.dimensionDetected) {
            return this.dimension;
        }
        try {
            const response = await this.client.embed({
                model: this.config.model,
                input: this.preprocessText(testText),
            });
            this.dimension = response.embeddings[0].length;
            this.dimensionDetected = true;
            console.error(`[OllamaEmbedding] Detected dimension: ${this.dimension}`);
            return this.dimension;
        } catch (error) {
            console.error('[OllamaEmbedding] Failed to detect dimension:', error);
            return this.dimension;
        }
    }

    async embed(text: string): Promise<EmbeddingVector> {
        const processedText = this.preprocessText(text);

        const response = await this.client.embed({
            model: this.config.model,
            input: processedText,
        });

        if (!this.dimensionDetected) {
            this.dimension = response.embeddings[0].length;
            this.dimensionDetected = true;
            console.error(`[OllamaEmbedding] Detected dimension: ${this.dimension}`);
        }

        return {
            vector: response.embeddings[0],
            dimension: response.embeddings[0].length,
        };
    }

    async embedBatch(texts: string[]): Promise<EmbeddingVector[]> {
        const processedTexts = this.preprocessTexts(texts);

        const response = await this.client.embed({
            model: this.config.model,
            input: processedTexts,
        });

        if (!this.dimensionDetected && response.embeddings.length > 0) {
            this.dimension = response.embeddings[0].length;
            this.dimensionDetected = true;
            console.error(`[OllamaEmbedding] Detected dimension: ${this.dimension}`);
        }

        return response.embeddings.map((vector: number[]) => ({
            vector,
            dimension: vector.length,
        }));
    }

    getDimension(): number {
        return this.dimension;
    }

    getProvider(): string {
        return 'ollama';
    }
}
