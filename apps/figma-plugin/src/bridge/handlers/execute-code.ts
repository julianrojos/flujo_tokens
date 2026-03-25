/**
 * EXECUTE_CODE Handler
 *
 * Executes arbitrary code in the plugin context with timeout control.
 * Uses AsyncFunction instead of eval for safer dynamic execution.
 */

import {
  ExecuteCodeParams,
  ExecuteCodeResult,
  createBridgeError,
  ERROR_CODES,
} from '../protocol';

export async function handleExecuteCode(
  params: ExecuteCodeParams
): Promise<ExecuteCodeResult> {
  const timeoutMs = params.timeout || 5000;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  try {
    console.log('[Bridge] Executing code, length:', params.code.length);

    // Execute with timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(
          createBridgeError(
            ERROR_CODES.TIMEOUT,
            `Execution timed out after ${timeoutMs}ms`
          )
        );
      }, timeoutMs);
    });

    let result: unknown;
    try {
      const AsyncFunction = Object.getPrototypeOf(async function () {
        // noop
      }).constructor as new (...args: string[]) => (...fnArgs: unknown[]) => Promise<unknown>;
      const executeDynamicCode = new AsyncFunction(params.code);
      result = executeDynamicCode();
    } catch (syntaxError) {
      const syntaxErrorMsg =
        syntaxError instanceof Error ? syntaxError.message : String(syntaxError);
      console.error('[Bridge] Syntax error in code:', syntaxErrorMsg);
      throw createBridgeError(ERROR_CODES.INVALID_PARAMETER, `Syntax error: ${syntaxErrorMsg}`);
    }

    const codePromise = Promise.resolve(result);
    const executedResult = await Promise.race([codePromise, timeoutPromise]);

    // Analyze result for potential silent failures
    const resultAnalysis = analyzeResult(executedResult);

    if (resultAnalysis?.warning) {
      console.warn('[Bridge] Result warning:', resultAnalysis.warning);
    }

    return {
      success: true,
      result: executedResult,
      resultAnalysis,
      fileContext: {
        fileName: figma.root.name,
        fileKey: figma.fileKey || null,
      },
    };
  } catch (error) {
    // Handle timeout and bridge errors (already BridgeError)
    if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
      throw error;
    }

    // Handle regular errors
    const errorName = error instanceof Error ? error.name : 'Error';
    const errorMsg = error instanceof Error ? error.message : String(error);

    console.error('[Bridge] Code execution error:', `[${errorName}] ${errorMsg}`);

    return {
      success: false,
      error: `${errorName}: ${errorMsg}`,
      resultAnalysis: {
        type: typeof error,
        isNull: false,
        isUndefined: false,
        isEmpty: false,
        warning: null,
      },
      fileContext: {
        fileName: figma.root.name,
        fileKey: figma.fileKey || null,
      },
    };
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

/**
 * Analyze execution result for potential issues.
 */
function analyzeResult(result: unknown): ExecuteCodeResult['resultAnalysis'] {
  const analysis: ExecuteCodeResult['resultAnalysis'] = {
    type: typeof result,
    isNull: result === null,
    isUndefined: result === undefined,
    isEmpty: false,
    warning: null,
  };

  // Check for empty arrays
  if (Array.isArray(result)) {
    analysis.isEmpty = result.length === 0;
    if (analysis.isEmpty) {
      analysis.warning = 'Code returned an empty array. If you were searching for nodes, none were found.';
    }
  } else if (result !== null && typeof result === 'object') {
    const keys = Object.keys(result);
    analysis.isEmpty = keys.length === 0;
    if (analysis.isEmpty) {
      analysis.warning = 'Code returned an empty object. The operation may not have found what it was looking for.';
    }

    // Check for common "found nothing" patterns
    const obj = result as Record<string, unknown>;
    if (
      obj.length === 0 ||
      obj.count === 0 ||
      obj.foundCount === 0 ||
      (obj.nodes && Array.isArray(obj.nodes) && obj.nodes.length === 0)
    ) {
      analysis.warning = 'Code returned a result indicating nothing was found (count/length is 0).';
    }
  } else if (result === null) {
    analysis.warning = 'Code returned null. The requested node or resource may not exist.';
  } else if (result === undefined) {
    analysis.warning = 'Code returned undefined. Make sure your code has a return statement.';
  }

  return analysis;
}
