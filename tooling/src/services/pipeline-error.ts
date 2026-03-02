/**
 * Pipeline Errors
 *
 * Shared error types for the active markdown to Figma pipeline.
 */

export class PipelineError extends Error {
  readonly code: string;
  readonly phase: string;

  constructor(message: string, code: string, phase: string) {
    super(message);
    this.name = 'PipelineError';
    this.code = code;
    this.phase = phase;
  }
}

export class RuntimeError extends PipelineError {
  constructor(message: string, code: string) {
    super(message, code, 'runtime');
    this.name = 'RuntimeError';
  }
}
