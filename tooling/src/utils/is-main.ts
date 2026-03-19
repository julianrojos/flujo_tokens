import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/**
 * Check if the current module is the main entry point.
 * 
 * @param metaUrl The import.meta.url of the calling module.
 * @returns True if the module is the main entry point.
 */
export function isMain(metaUrl: string): boolean {
    if (!metaUrl || !process.argv[1]) return false;

    try {
        const modulePath = fileURLToPath(metaUrl);
        const mainPath = resolve(process.argv[1]);
        return mainPath === modulePath;
    } catch {
        return false;
    }
}
