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
import { startWatchMode } from './watcher.js';

class LocalContextMcpServer {
    private server: Server;
    private context: LocalContext;

    constructor(context: LocalContext) {
        this.context = context;
        this.server = new Server(
            {
                name: "local-context-mcp",
                version: "0.1.3"
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

interface CliArgs {
    path?: string;
    indexDir?: string;
    watch?: boolean;
    help?: boolean;
}

function parseArgs(): CliArgs {
    const args: CliArgs = {};
    const argv = process.argv.slice(2);
    
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        switch (arg) {
            case '--path':
            case '-p':
                args.path = argv[++i];
                break;
            case '--index-dir':
            case '-i':
                args.indexDir = argv[++i];
                break;
            case '--watch':
            case '-w':
                args.watch = true;
                break;
            case '--help':
            case '-h':
                args.help = true;
                break;
        }
    }
    
    return args;
}

function printHelp() {
    console.error(`Usage: local-context-mcp [options]
Options:
  --path, -p <dir>      Directory to index (default: current directory)
  --index-dir, -i <dir> Directory for index storage (default: .usearch)
  --watch, -w           Watch mode: auto-reindex on file changes
  --help, -h            Show this help message`);
}

async function main() {
    const args = parseArgs();

    if (args.help) {
        printHelp();
        process.exit(0);
    }

    const context = createLocalContext({
        rootPath: args.path,
        indexDir: args.indexDir
    });

    if (args.watch) {
        console.error('[CLI] Starting in watch mode...');

        // Start watcher and server first, index in background
        startWatchMode(context.getRootPath(), context).catch((error) => {
            console.error(`[CLI] Watch mode error:`, error);
        });

        const server = new LocalContextMcpServer(context);
        await server.start();

        // Index in background after server is ready
        const status = await context.getStatus();
        if (!status.indexed || status.fileCount === 0) {
            console.error('[CLI] No index found, running initial index in background...');
            context.indexCodebase(
                (progress) => {
                    console.error(`[CLI] ${progress.phase} ${progress.percentage}%`);
                },
                true
            ).catch((error) => {
                console.error(`[CLI] Initial index failed:`, error);
            });
        }
    } else {
        const server = new LocalContextMcpServer(context);
        await server.start();
    }
}

main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
