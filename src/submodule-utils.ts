import { execSync } from 'child_process';
import * as path from 'path';

export interface SubmoduleDetection {
    isSubmodule: boolean;
    superprojectRoot: string | null;
}

export function detectSubmodule(cwd: string): SubmoduleDetection {
    try {
        const superproject = execSync(
            'git rev-parse --show-superproject-working-tree',
            { cwd, stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf-8' }
        ).trim();

        if (superproject) {
            return {
                isSubmodule: true,
                superprojectRoot: path.resolve(cwd, superproject),
            };
        }
    } catch {
        // Not a git repo, git < 2.13, or other error — not a submodule
    }

    return { isSubmodule: false, superprojectRoot: null };
}
