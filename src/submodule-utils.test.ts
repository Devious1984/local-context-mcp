import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as child_process from 'child_process';
import { detectSubmodule } from './submodule-utils.js';

vi.mock('child_process', () => ({
    execSync: vi.fn(),
}));

describe('submodule-utils', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('detectSubmodule', () => {
        it('returns isSubmodule: false when not in a submodule', () => {
            vi.spyOn(child_process, 'execSync').mockReturnValue('');

            const result = detectSubmodule('/some/path');

            expect(result).toEqual({ isSubmodule: false, superprojectRoot: null });
        });

        it('returns superproject root when in a submodule', () => {
            vi.spyOn(child_process, 'execSync').mockReturnValue('/meta/repo\n');

            const result = detectSubmodule('/meta/repo/submodule');

            expect(result.isSubmodule).toBe(true);
            expect(result.superprojectRoot).toBe('/meta/repo');
        });

        it('resolves superproject path to absolute', () => {
            vi.spyOn(child_process, 'execSync').mockReturnValue('..\n');

            const result = detectSubmodule('/meta/repo/submodule');

            expect(result.isSubmodule).toBe(true);
            expect(result.superprojectRoot).toBe('/meta/repo');
        });

        it('handles execSync errors gracefully', () => {
            vi.spyOn(child_process, 'execSync').mockImplementation(() => {
                throw new Error('not a git repo');
            });

            const result = detectSubmodule('/not/git');

            expect(result).toEqual({ isSubmodule: false, superprojectRoot: null });
        });

        it('handles git < 2.13 where command may not exist', () => {
            vi.spyOn(child_process, 'execSync').mockImplementation(() => {
                throw new Error('unknown option: --show-superproject-working-tree');
            });

            const result = detectSubmodule('/some/path');

            expect(result).toEqual({ isSubmodule: false, superprojectRoot: null });
        });
    });
});
