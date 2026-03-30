import { Embedding, EmbeddingVector } from './types.js';
import { OllamaEmbedding } from './embeddings/ollama-embedding.js';
import { OpenAIEmbedding } from './embeddings/openai-embedding.js';
import { GeminiEmbedding } from './embeddings/gemini-embedding.js';
import { VoyageAIEmbedding } from './embeddings/voyageai-embedding.js';

export type { Embedding, EmbeddingVector };

function env(key: string): string | undefined {
    return process.env[key];
}

function createOllamaEmbedding(): Embedding {
    return new OllamaEmbedding({
        model: env('OLLAMA_MODEL') || 'nomic-embed-text',
        host: env('OLLAMA_BASE_URL') || 'http://127.0.0.1:11434',
    });
}

function createOpenAIEmbedding(): Embedding {
    return new OpenAIEmbedding({
        apiKey: env('OPENAI_API_KEY')!,
        model: env('OPENAI_EMBEDDING_MODEL') || 'text-embedding-3-small',
        baseURL: env('OPENAI_BASE_URL'),
    });
}

function createGeminiEmbedding(): Embedding {
    return new GeminiEmbedding({
        apiKey: env('GEMINI_API_KEY')!,
        model: env('GEMINI_EMBEDDING_MODEL') || 'text-embedding-004',
    });
}

function createVoyageAIEmbedding(): Embedding {
    const { VoyageAIClient } = require('voyageai');
    return new VoyageAIEmbedding({
        client: new VoyageAIClient({ apiKey: env('VOYAGE_API_KEY')! }),
        model: env('VOYAGE_EMBEDDING_MODEL') || 'voyage-3',
    });
}

export function createEmbedding(): Embedding {
    if (env('OLLAMA_BASE_URL')) {
        console.error('[Embedding] Using Ollama embeddings');
        return createOllamaEmbedding();
    }
    if (env('OPENAI_API_KEY')) {
        console.error('[Embedding] Using OpenAI embeddings');
        return createOpenAIEmbedding();
    }
    if (env('GEMINI_API_KEY')) {
        console.error('[Embedding] Using Gemini embeddings');
        return createGeminiEmbedding();
    }
    if (env('VOYAGE_API_KEY')) {
        console.error('[Embedding] Using VoyageAI embeddings');
        return createVoyageAIEmbedding();
    }
    console.error('[Embedding] No API keys found, defaulting to Ollama');
    return createOllamaEmbedding();
}
