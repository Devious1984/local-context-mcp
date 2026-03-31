# Design: Submodule Root Resolution

## Problem
When working inside a git submodule, the tool indexes only the submodule directory. Users want to search across the entire meta-repo (superproject) while still indexing submodule code.

## Solution
Detect when the resolved root path is inside a git submodule and automatically resolve to the superproject root. All code (including submodules) gets indexed naturally via directory traversal.

## Architecture

### New Module: `src/submodule-utils.ts`

Single exported function:

```typescript
export function detectSubmodule(cwd: string): {
  isSubmodule: boolean;
  superprojectRoot: string | null;
}
```

**Algorithm:**
1. Run `git rev-parse --show-superproject-working-tree` in `cwd`
2. If output is non-empty → we're in a submodule, return the superproject path
3. If output is empty or command fails → not a submodule, return `{ isSubmodule: false, superprojectRoot: null }`

**Error handling:**
- Not a git repo → graceful fallback (no error, just returns false)
- Git < 2.13 → command fails, graceful fallback
- Any exec error → caught and returns false

### Modified: `src/context.ts` Constructor

Current (line 90):
```typescript
this.rootPath = config.rootPath || process.env.LOCAL_CONTEXT_PATH || process.cwd();
```

Becomes:
```typescript
let resolvedPath = config.rootPath || process.env.LOCAL_CONTEXT_PATH || process.cwd();
resolvedPath = path.resolve(resolvedPath);

const info = detectSubmodule(resolvedPath);
if (info.isSubmodule && info.superprojectRoot) {
  console.error(`[LocalContext] Submodule detected → superproject: ${info.superprojectRoot}`);
  resolvedPath = info.superprojectRoot;
}

this.rootPath = resolvedPath;
```

### Tests: `src/submodule-utils.test.ts`

- `detectSubmodule` returns false when not in a git repo
- `detectSubmodule` returns false when in a normal repo (no superproject)
- `detectSubmodule` returns superproject root when in a submodule (mocked execSync)

## Trade-offs Considered

| Approach | Pros | Cons |
|----------|------|------|
| **Auto-detect and resolve** (chosen) | Zero config, works naturally | User might not realize root changed (mitigated by log) |
| **CLI flag `--superproject`** | Explicit control | Requires user to know they're in a submodule |
| **Always index from cwd** | Simple | Doesn't solve the problem |

## Impact
- ~30 lines of new code
- No breaking changes
- Existing behavior unchanged for non-submodule repos
- Watch mode automatically benefits (uses `getRootPath()`)
