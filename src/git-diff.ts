import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const SUPPORTED_EXTENSIONS = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.cpp', '.c', '.h', '.hpp',
    '.cs', '.go', '.rs', '.php', '.rb', '.swift', '.kt', '.scala', '.m', '.mm',
    '.md', '.markdown', '.ipynb',
]);

export async function isGitRepo(rootPath: string): Promise<boolean> {
    try {
        await fs.promises.access(path.join(rootPath, '.git'));
        return true;
    } catch {
        return false;
    }
}

export async function getChangedFiles(
    rootPath: string,
    diffOutput?: string
): Promise<string[]> {
    const output = diffOutput ?? await runGitDiff(rootPath);

    if (!output.trim()) {
        return [];
    }

    const lines = output.split('\n').filter(line => line.trim());
    const files: string[] = [];

    for (const line of lines) {
        const parts = line.split('\t');
        if (parts.length < 2) continue;

        const status = parts[0];
        const filePath = parts[1];

        if (status === 'D') continue;

        const ext = path.extname(filePath);
        if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

        files.push(path.join(rootPath, filePath));
    }

    return files;
}

async function runGitDiff(rootPath: string): Promise<string> {
    const { stdout } = await execAsync('git diff --name-status HEAD', {
        cwd: rootPath,
        timeout: 10000,
    });
    return stdout;
}
