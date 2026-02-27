/**
 * Type definitions for capture batch runner module.
 */

/**
 * Function type for running scripts with JSON output.
 */
export interface RunScriptJsonFn {
  (options: {
    repoRoot: string;
    scriptPath: string;
    scriptArgs: string[];
  }): {
    proofFilePath?: string;
    screenshotUrl?: string;
    localImagePath?: string;
    variantsCount?: number;
  };
}
