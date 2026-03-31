import { Embedding, EmbeddingVector } from '../types.js';
import { Ollama } from 'ollama';

export interface OllamaEmbeddingConfig {
    model: string;
    host?: string;
    timeoutMs?: number;
}

export class OllamaEmbedding extends Embedding {
    private client: Ollama;
    private config: OllamaEmbeddingConfig;
    private dimension: number = 768;
    private dimensionDetected: boolean = false;
    private timeoutMs: number;
    protected maxTokens: number = 8192;

    constructor(config: OllamaEmbeddingConfig) {
        super();
        this.config = config;
        this.timeoutMs = config.timeoutMs || 30000;
        this.client = new Ollama({
            host: config.host || 'http://127.0.0.1:11434',
        });
    }

    private async withTimeout<T>(promise: Promise<T>, operation: string): Promise<T> {
        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error(`${operation} timed out after ${this.timeoutMs}ms`)), this.timeoutMs);
        });
        return Promise.race([promise, timeoutPromise]);
    }

    async detectDimension(testText: string = "test"): Promise<number> {
        if (this.dimensionDetected) {
            return this.dimension;
        }
        try {
            const response = await this.withTimeout(
                this.client.embed({
                    model: this.config.model,
                    input: this.preprocessText(testText),
                }),
                'Dimension detection'
            );
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

        const response = await this.withTimeout(
            this.client.embed({
                model: this.config.model,
                input: processedText,
            }),
            'Embed'
        );

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

        const response = await this.withTimeout(
            this.client.embed({
                model: this.config.model,
                input: processedTexts,
            }),
            'EmbedBatch'
        );

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
