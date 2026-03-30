#!/usr/bin/env node

const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;

console.log = (...args: any[]) => {
    process.stderr.write('[LOG] ' + args.join(' ') + '\n');
};

console.warn = (...args: any[]) => {
    process.stderr.write('[WARN] ' + args.join(' ') + '\n');
};

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    ListToolsRequestSchema,
    CallToolRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { LocalContext, createLocalContext } from './context.js';

class LocalContextMcpServer {
    private server: Server;
    private context: LocalContext;

    constructor(context: LocalContext) {
        this.context = context;
        this.server = new Server(
            {
                name: "local-context-mcp",
                version: "0.1.0"
            },
            {
                capabilities: {
                    tools: {}
                }
            }
        );
        this.setupTools();
    }

    private setupTools() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: "reindex",
                        description: "Index the current codebase directory for semantic search. Use this when the codebase hasn't been indexed yet or when you want to rebuild the index.",
                        inputSchema: {
                            type: "object",
                            properties: {
                                model: {
                                    type: "string",
                                    description: "Ollama embedding model to use (defaults to nomic-embed-text)",
                                    default: "nomic-embed-text"
                                }
                            },
                            required: []
                        }
                    },
                    {
                        name: "search",
                        description: "Search the indexed codebase using natural language queries. Returns relevant code snippets with context.",
                        inputSchema: {
                            type: "object",
                            properties: {
                                query: {
                                    type: "string",
                                    description: "Natural language query to search for"
                                },
                                limit: {
                                    type: "number",
                                    description: "Maximum number of results to return",
                                    default: 10,
                                    maximum: 50
                                }
                            },
                            required: ["query"]
                        }
                    },
                    {
                        name: "status",
                        description: "Get the current indexing status of the codebase.",
                        inputSchema: {
                            type: "object",
                            properties: {},
                            required: []
                        }
                    }
                ]
            };
        });

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;

            try {
                switch (name) {
                    case "reindex": {
                        const result = await this.context.indexCodebase(
                            (progress) => {
                                console.log(`[${progress.phase}] ${progress.percentage}%`);
                            },
                            true
                        );
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: JSON.stringify(result, null, 2)
                                }
                            ]
                        };
                    }
                    case "search": {
                        const results = await this.context.search(
                            (args as { query?: string }).query || '',
                            (args as { limit?: number }).limit || 10
                        );
                        if (results.length === 0) {
                            return {
                                content: [
                                    {
                                        type: "text",
                                        text: "No results found. The codebase may not be indexed yet. Try running 'reindex' first."
                                    }
                                ]
                            };
                        }
                        const text = results
                            .map((r, i) => `[${i + 1}] ${r.relativePath}:${r.startLine}-${r.endLine}\n${r.content}\n---`)
                            .join('\n');
                        return {
                            content: [
                                {
                                    type: "text",
                                    text
                                }
                            ]
                        };
                    }
                    case "status": {
                        const status = await this.context.getStatus();
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: JSON.stringify(status, null, 2)
                                }
                            ]
                        };
                    }
                    default:
                        throw new Error(`Unknown tool: ${name}`);
                }
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error: ${error instanceof Error ? error.message : String(error)}`
                        }
                    ],
                    isError: true
                };
            }
        });
    }

    async start() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
    }
}

async function main() {
    const context = createLocalContext();
    const server = new LocalContextMcpServer(context);
    await server.start();
}

main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
