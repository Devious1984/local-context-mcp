import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { getChangedFiles, isGitRepo } from './git-diff.js';

describe('git-diff', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join('/tmp', 'git-diff-test-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    describe('isGitRepo', () => {
        it('returns false for non-git directory', async () => {
            const result = await isGitRepo(tmpDir);
            expect(result).toBe(false);
        });

        it('returns true for git repo', async () => {
            await fs.promises.mkdir(path.join(tmpDir, '.git'), { recursive: true });
            const result = await isGitRepo(tmpDir);
            expect(result).toBe(true);
        });
    });

    describe('getChangedFiles', () => {
        it('returns empty array when no changes', async () => {
            await fs.promises.mkdir(path.join(tmpDir, '.git'), { recursive: true });
            const result = await getChangedFiles(tmpDir, '');
            expect(result).toEqual([]);
        });

        it('parses git diff output correctly', async () => {
            await fs.promises.mkdir(path.join(tmpDir, '.git'), { recursive: true });
            const diffOutput = 'M\tsrc/file1.ts\nA\tsrc/file2.ts\nD\tsrc/file3.ts\n';

            const result = await getChangedFiles(tmpDir, diffOutput);
            expect(result).toEqual([
                path.join(tmpDir, 'src/file1.ts'),
                path.join(tmpDir, 'src/file2.ts'),
            ]);
        });

        it('filters out unsupported extensions', async () => {
            await fs.promises.mkdir(path.join(tmpDir, '.git'), { recursive: true });
            const diffOutput = 'M\tsrc/file1.ts\nM\tREADME.md\nM\tdata.json\n';

            const result = await getChangedFiles(tmpDir, diffOutput);
            expect(result).toContain(path.join(tmpDir, 'src/file1.ts'));
            expect(result).toContain(path.join(tmpDir, 'README.md'));
            expect(result).not.toContain(path.join(tmpDir, 'data.json'));
        });
    });
});
