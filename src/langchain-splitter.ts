import { Splitter, CodeChunk } from './types.js';

export class LangChainCodeSplitter implements Splitter {
    private chunkSize: number = 2500;
    private chunkOverlap: number = 300;

    constructor(chunkSize?: number, chunkOverlap?: number) {
        if (chunkSize) this.chunkSize = chunkSize;
        if (chunkOverlap) this.chunkOverlap = chunkOverlap;
    }

    async split(code: string, language: string, filePath?: string): Promise<CodeChunk[]> {
        const lines = code.split('\n');
        const chunks: CodeChunk[] = [];
        let currentChunk = '';
        let currentStartLine = 1;
        let lineCount = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineWithNewline = i < lines.length - 1 ? line + '\n' : line;

            if (currentChunk.length + lineWithNewline.length > this.chunkSize && currentChunk.length > 0) {
                chunks.push({
                    content: currentChunk.trim(),
                    metadata: {
                        startLine: currentStartLine,
                        endLine: currentStartLine + lineCount - 1,
                        language,
                        filePath,
                    }
                });

                const overlapLines = this.getLastNLines(currentChunk, Math.floor(this.chunkOverlap / 50));
                currentChunk = overlapLines;
                currentStartLine = currentStartLine + lineCount - this.getLineCount(overlapLines);
                lineCount = this.getLineCount(overlapLines);
            }

            currentChunk += lineWithNewline;
            lineCount++;
        }

        if (currentChunk.trim().length > 0) {
            chunks.push({
                content: currentChunk.trim(),
                metadata: {
                    startLine: currentStartLine,
                    endLine: currentStartLine + lineCount - 1,
                    language,
                    filePath,
                }
            });
        }

        return chunks;
    }

    setChunkSize(chunkSize: number): void {
        this.chunkSize = chunkSize;
    }

    setChunkOverlap(chunkOverlap: number): void {
        this.chunkOverlap = chunkOverlap;
    }

    private getLastNLines(text: string, n: number): string {
        const lines = text.split('\n');
        return lines.slice(-n).join('\n');
    }

    private getLineCount(text: string): number {
        return text.split('\n').length;
    }
}
