import Parser from 'tree-sitter';
import type { Splitter, CodeChunk } from './types.js';
import { LangChainCodeSplitter } from './langchain-splitter.js';

type Language = any;
type SyntaxNode = Parser.SyntaxNode;

interface LanguageConfig {
    name: string;
    getParser(): Promise<Language>;
    nodeTypes: string[];
}

const languageConfigs: Record<string, LanguageConfig> = {
    javascript: {
        name: 'JavaScript',
        getParser: () => import('tree-sitter-javascript').then(m => m.default),
        nodeTypes: ['function_declaration', 'arrow_function', 'class_declaration', 'method_definition', 'export_statement']
    },
    js: {
        name: 'JavaScript',
        getParser: () => import('tree-sitter-javascript').then(m => m.default),
        nodeTypes: ['function_declaration', 'arrow_function', 'class_declaration', 'method_definition', 'export_statement']
    },
    typescript: {
        name: 'TypeScript',
        getParser: () => import('tree-sitter-typescript').then(m => m.typescript),
        nodeTypes: ['function_declaration', 'arrow_function', 'class_declaration', 'method_definition', 'export_statement', 'interface_declaration', 'type_alias_declaration']
    },
    ts: {
        name: 'TypeScript',
        getParser: () => import('tree-sitter-typescript').then(m => m.typescript),
        nodeTypes: ['function_declaration', 'arrow_function', 'class_declaration', 'method_definition', 'export_statement', 'interface_declaration', 'type_alias_declaration']
    },
    python: {
        name: 'Python',
        getParser: () => import('tree-sitter-python').then(m => m.default),
        nodeTypes: ['function_definition', 'class_definition', 'decorated_definition', 'async_function_definition']
    },
    py: {
        name: 'Python',
        getParser: () => import('tree-sitter-python').then(m => m.default),
        nodeTypes: ['function_definition', 'class_definition', 'decorated_definition', 'async_function_definition']
    },
    java: {
        name: 'Java',
        getParser: () => import('tree-sitter-java').then(m => m.default),
        nodeTypes: ['method_declaration', 'class_declaration', 'interface_declaration', 'constructor_declaration']
    },
    cpp: {
        name: 'C++',
        getParser: () => import('tree-sitter-cpp').then(m => m.default),
        nodeTypes: ['function_definition', 'class_specifier', 'namespace_definition', 'declaration']
    },
    'c++': {
        name: 'C++',
        getParser: () => import('tree-sitter-cpp').then(m => m.default),
        nodeTypes: ['function_definition', 'class_specifier', 'namespace_definition', 'declaration']
    },
    c: {
        name: 'C',
        getParser: () => import('tree-sitter-cpp').then(m => m.default),
        nodeTypes: ['function_definition', 'class_specifier', 'namespace_definition', 'declaration']
    },
    go: {
        name: 'Go',
        getParser: () => import('tree-sitter-go').then(m => m.default),
        nodeTypes: ['function_declaration', 'method_declaration', 'type_declaration', 'var_declaration', 'const_declaration']
    },
    rust: {
        name: 'Rust',
        getParser: () => import('tree-sitter-rust').then(m => m.default),
        nodeTypes: ['function_item', 'impl_item', 'struct_item', 'enum_item', 'trait_item', 'mod_item']
    },
    rs: {
        name: 'Rust',
        getParser: () => import('tree-sitter-rust').then(m => m.default),
        nodeTypes: ['function_item', 'impl_item', 'struct_item', 'enum_item', 'trait_item', 'mod_item']
    },
    csharp: {
        name: 'C#',
        getParser: () => import('tree-sitter-c-sharp').then(m => m.default),
        nodeTypes: ['method_declaration', 'class_declaration', 'interface_declaration', 'struct_declaration', 'enum_declaration']
    },
    cs: {
        name: 'C#',
        getParser: () => import('tree-sitter-c-sharp').then(m => m.default),
        nodeTypes: ['method_declaration', 'class_declaration', 'interface_declaration', 'struct_declaration', 'enum_declaration']
    },
    scala: {
        name: 'Scala',
        getParser: () => import('tree-sitter-scala').then(m => m.default),
        nodeTypes: ['method_declaration', 'class_declaration', 'interface_declaration', 'constructor_declaration']
    }
};

const parserCache: Map<string, Language> = new Map();

export class AstCodeSplitter implements Splitter {
    private chunkSize: number = 2500;
    private chunkOverlap: number = 300;
    private parser: Parser;
    private langchainFallback: LangChainCodeSplitter;

    constructor(chunkSize?: number, chunkOverlap?: number) {
        if (chunkSize) this.chunkSize = chunkSize;
        if (chunkOverlap) this.chunkOverlap = chunkOverlap;
        this.parser = new Parser();
        this.langchainFallback = new LangChainCodeSplitter(chunkSize, chunkOverlap);
    }

    private async getLanguageParser(language: string): Promise<Language | null> {
        const langKey = language.toLowerCase();
        const config = languageConfigs[langKey];
        if (!config) return null;
        
        if (parserCache.has(langKey)) {
            return parserCache.get(langKey)!;
        }
        
        try {
            const lang = await config.getParser();
            parserCache.set(langKey, lang);
            return lang;
        } catch (error) {
            console.warn(`[ASTSplitter] Failed to load ${language} parser:`, error);
            return null;
        }
    }

    async split(code: string, language: string, filePath?: string): Promise<CodeChunk[]> {
        const langKey = language.toLowerCase();
        const config = languageConfigs[langKey];
        
        if (!config) {
            console.log(`📝 Language ${language} not supported by AST, using LangChain splitter for: ${filePath || 'unknown'}`);
            return await this.langchainFallback.split(code, language, filePath);
        }

        try {
            console.log(`🌳 Using AST splitter for ${language} file: ${filePath || 'unknown'}`);
            const lang = await this.getLanguageParser(language);
            
            if (!lang) {
                return await this.langchainFallback.split(code, language, filePath);
            }

            this.parser.setLanguage(lang);
            const tree = this.parser.parse(code);

            if (!tree.rootNode) {
                console.warn(`[ASTSplitter] ⚠️  Failed to parse AST for ${language}, falling back to LangChain: ${filePath || 'unknown'}`);
                return await this.langchainFallback.split(code, language, filePath);
            }

            const chunks = this.extractChunks(tree.rootNode, code, config.nodeTypes, language, filePath);
            const refinedChunks = this.refineChunks(chunks, code);
            return refinedChunks;
        } catch (error) {
            console.warn(`[ASTSplitter] ⚠️  AST splitter failed for ${language}, falling back to LangChain: ${error}`);
            return await this.langchainFallback.split(code, language, filePath);
        }
    }

    setChunkSize(chunkSize: number): void {
        this.chunkSize = chunkSize;
        this.langchainFallback.setChunkSize(chunkSize);
    }

    setChunkOverlap(chunkOverlap: number): void {
        this.chunkOverlap = chunkOverlap;
        this.langchainFallback.setChunkOverlap(chunkOverlap);
    }

    private getChunkType(nodeType: string): string {
        const typeMap: Record<string, string> = {
            'function_definition': 'function',
            'function_declaration': 'function',
            'method_declaration': 'method',
            'function_item': 'function',
            'class_specifier': 'class',
            'class_declaration': 'class',
            'interface_declaration': 'interface',
            'struct_declaration': 'struct',
            'enum_item': 'enum',
            'declaration': 'declaration',
            'namespace_definition': 'namespace',
            'module_definition': 'module',
            'import_statement': 'import',
            'export_statement': 'export',
            'variable_declaration': 'variable',
            'const_declaration': 'constant',
        };
        return typeMap[nodeType] || 'code';
    }

    private extractChunks(
        node: SyntaxNode,
        code: string,
        splittableTypes: string[],
        language: string,
        filePath?: string
    ): CodeChunk[] {
        const chunks: CodeChunk[] = [];
        const codeLines = code.split('\n');

        const traverse = (currentNode: SyntaxNode) => {
            if (splittableTypes.includes(currentNode.type)) {
                const startLine = currentNode.startPosition.row + 1;
                const endLine = currentNode.endPosition.row + 1;
                const nodeText = code.slice(currentNode.startIndex, currentNode.endIndex);

                if (nodeText.trim().length > 0) {
                    chunks.push({
                        content: nodeText,
                        metadata: {
                            startLine,
                            endLine,
                            language,
                            filePath,
                            chunkType: this.getChunkType(currentNode.type),
                            nodeType: currentNode.type,
                        }
                    });
                }
            }

            for (const child of currentNode.children) {
                traverse(child);
            }
        };

        traverse(node);

        if (chunks.length === 0) {
            chunks.push({
                content: code,
                metadata: {
                    startLine: 1,
                    endLine: codeLines.length,
                    language,
                    filePath,
                }
            });
        }

        return chunks;
    }

    private refineChunks(chunks: CodeChunk[], originalCode: string): CodeChunk[] {
        const refinedChunks: CodeChunk[] = [];

        for (const chunk of chunks) {
            if (chunk.content.length <= this.chunkSize) {
                refinedChunks.push(chunk);
            } else {
                const subChunks = this.splitLargeChunk(chunk, originalCode);
                refinedChunks.push(...subChunks);
            }
        }

        return this.addOverlap(refinedChunks);
    }

    private splitLargeChunk(chunk: CodeChunk, originalCode: string): CodeChunk[] {
        const lines = chunk.content.split('\n');
        const subChunks: CodeChunk[] = [];
        let currentChunk = '';
        const chunkStartLine = chunk.metadata?.startLine ?? 1;
        let currentStartLine = chunkStartLine;
        let currentLineCount = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineWithNewline = i === lines.length - 1 ? line : line + '\n';

            if (currentChunk.length + lineWithNewline.length > this.chunkSize && currentChunk.length > 0) {
                subChunks.push({
                    content: currentChunk.trim(),
                    metadata: {
                        startLine: currentStartLine,
                        endLine: currentStartLine + currentLineCount - 1,
                        language: chunk.metadata?.language,
                        filePath: chunk.metadata?.filePath,
                    }
                });

                currentChunk = lineWithNewline;
                currentStartLine = chunkStartLine + i;
                currentLineCount = 1;
            } else {
                currentChunk += lineWithNewline;
                currentLineCount++;
            }
        }

        if (currentChunk.trim().length > 0) {
            subChunks.push({
                content: currentChunk.trim(),
                metadata: {
                    startLine: currentStartLine,
                    endLine: currentStartLine + currentLineCount - 1,
                    language: chunk.metadata?.language,
                    filePath: chunk.metadata?.filePath,
                }
            });
        }

        return subChunks;
    }

    private addOverlap(chunks: CodeChunk[]): CodeChunk[] {
        if (chunks.length <= 1 || this.chunkOverlap <= 0) {
            return chunks;
        }

        const overlappedChunks: CodeChunk[] = [];

        for (let i = 0; i < chunks.length; i++) {
            let content = chunks[i].content;
            const metadata = { ...chunks[i].metadata };

            if (i > 0 && this.chunkOverlap > 0) {
                const prevChunk = chunks[i - 1];
                const overlapText = prevChunk.content.slice(-this.chunkOverlap);
                content = overlapText + '\n' + content;
                metadata.startLine = Math.max(1, metadata.startLine - this.getLineCount(overlapText));
            }

            overlappedChunks.push({
                content,
                metadata
            });
        }

        return overlappedChunks;
    }

    private getLineCount(text: string): number {
        return text.split('\n').length;
    }

    static isLanguageSupported(language: string): boolean {
        const supportedLanguages = [
            'javascript', 'js', 'typescript', 'ts', 'python', 'py',
            'java', 'cpp', 'c++', 'c', 'go', 'rust', 'rs', 'cs', 'csharp', 'scala'
        ];
        return supportedLanguages.includes(language.toLowerCase());
    }
}
