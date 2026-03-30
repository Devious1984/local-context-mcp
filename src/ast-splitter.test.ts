import { describe, it, expect, beforeEach } from 'vitest';
import { AstCodeSplitter } from './ast-splitter.js';

describe('AstCodeSplitter', () => {
    let splitter: AstCodeSplitter;

    beforeEach(() => {
        splitter = new AstCodeSplitter(2500, 300);
    });

    describe('isLanguageSupported()', () => {
        it('should return true for TypeScript', () => {
            expect(AstCodeSplitter.isLanguageSupported('typescript')).toBe(true);
            expect(AstCodeSplitter.isLanguageSupported('ts')).toBe(true);
        });

        it('should return true for JavaScript', () => {
            expect(AstCodeSplitter.isLanguageSupported('javascript')).toBe(true);
            expect(AstCodeSplitter.isLanguageSupported('js')).toBe(true);
        });

        it('should return true for Python', () => {
            expect(AstCodeSplitter.isLanguageSupported('python')).toBe(true);
            expect(AstCodeSplitter.isLanguageSupported('py')).toBe(true);
        });

        it('should return true for Java', () => {
            expect(AstCodeSplitter.isLanguageSupported('java')).toBe(true);
        });

        it('should return true for Go', () => {
            expect(AstCodeSplitter.isLanguageSupported('go')).toBe(true);
        });

        it('should return true for Rust', () => {
            expect(AstCodeSplitter.isLanguageSupported('rust')).toBe(true);
            expect(AstCodeSplitter.isLanguageSupported('rs')).toBe(true);
        });

        it('should return true for C/C++', () => {
            expect(AstCodeSplitter.isLanguageSupported('cpp')).toBe(true);
            expect(AstCodeSplitter.isLanguageSupported('c')).toBe(true);
        });

        it('should return true for C#', () => {
            expect(AstCodeSplitter.isLanguageSupported('csharp')).toBe(true);
            expect(AstCodeSplitter.isLanguageSupported('cs')).toBe(true);
        });

        it('should return true for Scala', () => {
            expect(AstCodeSplitter.isLanguageSupported('scala')).toBe(true);
        });

        it('should return false for unsupported languages', () => {
            expect(AstCodeSplitter.isLanguageSupported('php')).toBe(false);
            expect(AstCodeSplitter.isLanguageSupported('ruby')).toBe(false);
            expect(AstCodeSplitter.isLanguageSupported('swift')).toBe(false);
        });
    });

    describe('split()', () => {
        it('should split TypeScript function declarations', async () => {
            const code = `function add(a: number, b: number): number {
    return a + b;
}

function multiply(a: number, b: number): number {
    return a * b;
}`;

            const chunks = await splitter.split(code, 'typescript', 'test.ts');

            expect(chunks.length).toBeGreaterThanOrEqual(1);
            const firstChunk = chunks[0];
            expect(firstChunk.content).toContain('function');
            expect(firstChunk.metadata.language).toBe('typescript');
            expect(firstChunk.metadata.startLine).toBeDefined();
            expect(firstChunk.metadata.endLine).toBeDefined();
        });

        it('should split TypeScript class declarations', async () => {
            const code = `class Animal {
    name: string;
    
    constructor(name: string) {
        this.name = name;
    }
    
    speak(): void {
        console.log('Hello');
    }
}

class Dog extends Animal {
    breed: string;
    
    speak(): void {
        console.log('Woof');
    }
}`;

            const chunks = await splitter.split(code, 'typescript', 'test.ts');

            expect(chunks.length).toBeGreaterThanOrEqual(1);
            const classChunks = chunks.filter(c => c.metadata?.chunkType === 'class');
            expect(classChunks.length).toBeGreaterThanOrEqual(1);
        });

        it('should split TypeScript interface declarations', async () => {
            const code = `interface User {
    id: number;
    name: string;
    email: string;
}

interface Post {
    id: number;
    title: string;
    content: string;
}`;

            const chunks = await splitter.split(code, 'typescript', 'test.ts');

            expect(chunks.length).toBeGreaterThanOrEqual(1);
            const interfaceChunks = chunks.filter(c => c.metadata?.chunkType === 'interface');
            expect(interfaceChunks.length).toBe(2);
        });

        it('should set correct startLine and endLine metadata', async () => {
            const code = `// This is line 1
// This is line 2
// This is line 3
function test(): void {
    // This is line 5
}`;

            const chunks = await splitter.split(code, 'typescript', 'test.ts');

            expect(chunks.length).toBeGreaterThanOrEqual(1);
            const funcChunk = chunks[0];
            expect(funcChunk.metadata.startLine).toBe(4);
            expect(funcChunk.metadata.endLine).toBe(6);
        });

        it('should handle empty code', async () => {
            const chunks = await splitter.split('', 'typescript', 'test.ts');
            expect(chunks.length).toBe(1);
            expect(chunks[0].content).toBe('');
        });

        it('should handle code with only comments', async () => {
            const code = `// Comment 1
// Comment 2
// Comment 3`;

            const chunks = await splitter.split(code, 'typescript', 'test.ts');
            expect(chunks.length).toBe(1);
        });

        it('should preserve filePath in metadata', async () => {
            const code = `function test(): void {}`;

            const chunks = await splitter.split(code, 'typescript', 'src/utils/helper.ts');

            expect(chunks[0].metadata.filePath).toBe('src/utils/helper.ts');
        });

        it('should include chunkType in metadata', async () => {
            const code = `function myFunction(): void {}
class MyClass {}`;

            const chunks = await splitter.split(code, 'typescript', 'test.ts');

            const functionChunk = chunks.find(c => c.metadata?.chunkType === 'function');
            const classChunk = chunks.find(c => c.metadata?.chunkType === 'class');

            expect(functionChunk).toBeDefined();
            expect(classChunk).toBeDefined();
        });
    });

    describe('split() with Python', () => {
        it('should split Python function definitions', async () => {
            const code = `def add(a, b):
    return a + b

def multiply(a, b):
    return a * b`;

            const chunks = await splitter.split(code, 'python', 'test.py');

            expect(chunks.length).toBeGreaterThanOrEqual(2);
            const funcChunks = chunks.filter(c => c.metadata?.chunkType === 'function');
            expect(funcChunks.length).toBe(2);
        });

        it('should split Python class definitions', async () => {
            const code = `class Animal:
    def __init__(self, name):
        self.name = name
    
    def speak(self):
        pass

class Dog(Animal):
    def speak(self):
        return "Woof"`;

            const chunks = await splitter.split(code, 'python', 'test.py');

            expect(chunks.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe('split() with JavaScript', () => {
        it('should split JavaScript arrow functions', async () => {
            const code = `const add = (a, b) => a + b;
const multiply = (a, b) => a * b;`;

            const chunks = await splitter.split(code, 'javascript', 'test.js');

            expect(chunks.length).toBeGreaterThanOrEqual(1);
        });

        it('should split JavaScript class declarations', async () => {
            const code = `class MyClass {
    constructor() {
        this.value = 0;
    }
    
    getValue() {
        return this.value;
    }
}`;

            const chunks = await splitter.split(code, 'javascript', 'test.js');

            const classChunks = chunks.filter(c => c.metadata?.chunkType === 'class');
            expect(classChunks.length).toBe(1);
        });

        it('should split JavaScript export statements', async () => {
            const code = `export function exportedFunc() {}
export class ExportedClass {}`;

            const chunks = await splitter.split(code, 'javascript', 'test.js');

            expect(chunks.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe('split() with Go', () => {
        it('should split Go function declarations', async () => {
            const code = `package main

func add(a, b int) int {
    return a + b
}

func main() {
    println(add(1, 2))
}`;

            const chunks = await splitter.split(code, 'go', 'main.go');

            expect(chunks.length).toBeGreaterThanOrEqual(1);
            const funcChunks = chunks.filter(c => c.metadata?.chunkType === 'function');
            expect(funcChunks.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe('split() with Rust', () => {
        it('should split Rust function items', async () => {
            const code = `fn add(a: i32, b: i32) -> i32 {
    a + b
}

fn main() {
    let result = add(1, 2);
}`;

            const chunks = await splitter.split(code, 'rust', 'main.rs');

            expect(chunks.length).toBeGreaterThanOrEqual(1);
            const funcChunks = chunks.filter(c => c.metadata?.chunkType === 'function');
            expect(funcChunks.length).toBeGreaterThanOrEqual(1);
        });

        it('should split Rust struct and impl items', async () => {
            const code = `struct Rectangle {
    width: u32,
    height: u32,
}

impl Rectangle {
    fn new(width: u32, height: u32) -> Self {
        Rectangle { width, height }
    }
}`;

            const chunks = await splitter.split(code, 'rust', 'main.rs');

            expect(chunks.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe('split() with Java', () => {
        it('should split Java method declarations', async () => {
            const code = `public class Calculator {
    public int add(int a, int b) {
        return a + b;
    }
    
    public int multiply(int a, int b) {
        return a * b;
    }
}`;

            const chunks = await splitter.split(code, 'java', 'Calculator.java');

            expect(chunks.length).toBeGreaterThanOrEqual(1);
            const methodChunks = chunks.filter(c => c.metadata?.chunkType === 'method');
            expect(methodChunks.length).toBeGreaterThanOrEqual(1);
        });
    });

    describe('large chunk splitting', () => {
        it('should split large chunks that exceed chunkSize', async () => {
            const longFunction = 'function test() {\n    const x = 1;\n'.repeat(1000);
            const smallSplitter = new AstCodeSplitter(500, 50);

            const chunks = await smallSplitter.split(longFunction, 'typescript', 'test.ts');

            expect(chunks.length).toBeGreaterThan(1);
            for (const chunk of chunks) {
                expect(chunk.content.length).toBeLessThanOrEqual(600);
            }
        });
    });
});
