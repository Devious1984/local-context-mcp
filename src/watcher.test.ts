import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChangeDebouncer } from './watcher.js';

describe('ChangeDebouncer', () => {
    let debouncer: ChangeDebouncer;
    let callback: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        callback = vi.fn();
        vi.useFakeTimers();
        debouncer = new ChangeDebouncer(1000, callback);
    });

    afterEach(() => {
        debouncer.dispose();
        vi.useRealTimers();
    });

    it('calls callback after debounce delay', () => {
        debouncer.onChange('src/file.ts');
        expect(callback).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1000);
        expect(callback).toHaveBeenCalledTimes(1);
    });

    it('batches multiple changes within debounce window', () => {
        debouncer.onChange('src/file1.ts');
        debouncer.onChange('src/file2.ts');
        debouncer.onChange('src/file1.ts');

        vi.advanceTimersByTime(1000);
        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith(
            expect.arrayContaining(['src/file1.ts', 'src/file2.ts'])
        );
    });

    it('resets debounce timer on new change', () => {
        debouncer.onChange('src/file.ts');
        vi.advanceTimersByTime(500);
        debouncer.onChange('src/file2.ts');
        vi.advanceTimersByTime(500);
        expect(callback).not.toHaveBeenCalled();

        vi.advanceTimersByTime(500);
        expect(callback).toHaveBeenCalledTimes(1);
    });

    it('deduplicates same file in batch', () => {
        debouncer.onChange('src/file.ts');
        debouncer.onChange('src/file.ts');
        debouncer.onChange('src/file.ts');

        vi.advanceTimersByTime(1000);
        expect(callback).toHaveBeenCalledTimes(1);
        const changedFiles = callback.mock.calls[0][0];
        const count = changedFiles.filter((f: string) => f === 'src/file.ts').length;
        expect(count).toBe(1);
    });
});
