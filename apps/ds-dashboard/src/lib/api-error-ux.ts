import { ApiError } from "@/lib/api";
import {
  API_ERROR_CODES,
  getApiErrorMeta,
} from "@/lib/api-errors";

export interface ApiErrorDisplay {
  title: string;
  message: string;
  action: string | null;
  code: string | null;
  requestId: string | null;
  retryable: boolean;
}

interface BuildApiErrorDisplayOptions {
  fallbackTitle: string;
  fallbackMessage: string;
}

function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function resolveTitle(code: string, status: number, fallbackTitle: string) {
  switch (code) {
    case API_ERROR_CODES.SYSTEM_INVALID_OR_MISSING:
      return "System selection required";
    case API_ERROR_CODES.FILE_NOT_FOUND:
      return "File not found";
    case API_ERROR_CODES.FILE_QUERY_NOT_FOUND:
      return "Match not found";
    case API_ERROR_CODES.FILE_INVALID_PATH:
      return "Invalid file path";
    case API_ERROR_CODES.DESIGN_SYSTEM_ALREADY_EXISTS:
      return "System already exists";
    case API_ERROR_CODES.DESIGN_SYSTEM_NOT_FOUND:
      return "System not found";
    case API_ERROR_CODES.DESIGN_SYSTEM_LAST_SYSTEM_PROTECTED:
      return "Delete blocked";
    case API_ERROR_CODES.QUEUE_JOB_NOT_FOUND:
      return "Job not found";
    case API_ERROR_CODES.QUEUE_JOB_FAILED_OR_CANCELLED:
      return "Job failed or cancelled";
    case API_ERROR_CODES.QUEUE_JOB_NOT_CANCELABLE:
      return "Job cannot be canceled";
    case API_ERROR_CODES.QUEUE_STREAM_TIMEOUT:
      return "Connection timed out";
    default:
      break;
  }

  if (code.startsWith("validation.")) return "Invalid request";
  if (code.startsWith("design_system.")) return "Design system error";
  if (code.startsWith("queue.")) return "Background job error";
  if (code.startsWith("file.")) return "File request failed";
  if (status >= 500) return "Server error";
  if (status >= 400) return "Request failed";
  return fallbackTitle;
}

function resolveAction(code: string, retryable: boolean, fallbackAction: string | null) {
  switch (code) {
    case API_ERROR_CODES.SYSTEM_INVALID_OR_MISSING:
      return "Select a valid system and retry.";
    case API_ERROR_CODES.FILE_NOT_FOUND:
      return "Verify the file path and try again.";
    case API_ERROR_CODES.FILE_QUERY_NOT_FOUND:
      return "Adjust line/query and retry.";
    case API_ERROR_CODES.FILE_INVALID_PATH:
      return "Use a repository-relative path.";
    case API_ERROR_CODES.DESIGN_SYSTEM_ALREADY_EXISTS:
      return "Use a different ID or update the existing system.";
    case API_ERROR_CODES.DESIGN_SYSTEM_LAST_SYSTEM_PROTECTED:
      return "Create another system before deleting this one.";
    case API_ERROR_CODES.QUEUE_JOB_NOT_FOUND:
      return "Run the operation again to create a new job.";
    case API_ERROR_CODES.QUEUE_JOB_FAILED_OR_CANCELLED:
      return "Open operation logs, fix the underlying issue, then retry.";
    case API_ERROR_CODES.QUEUE_STREAM_TIMEOUT:
      return "Reconnect to the job stream or poll job status.";
    default:
      break;
  }

  if (code.startsWith("validation.")) {
    return fallbackAction || "Review inputs and retry.";
  }
  if (fallbackAction) return fallbackAction;
  if (retryable) return "Retry the action.";
  return null;
}

export function toApiErrorDisplay(
  error: unknown,
  options: BuildApiErrorDisplayOptions,
): ApiErrorDisplay {
  if (error instanceof ApiError) {
    const meta = getApiErrorMeta(error.code);
    const message = toTrimmedString(error.message) || meta?.description || options.fallbackMessage;
    const title = resolveTitle(error.code, error.status, options.fallbackTitle);
    const action = resolveAction(error.code, error.recoverable, meta?.fix ?? null);
    return {
      title,
      message,
      action,
      code: error.code,
      requestId: error.requestId,
      retryable: error.recoverable,
    };
  }

  const message =
    toTrimmedString(error instanceof Error ? error.message : error) || options.fallbackMessage;

  return {
    title: options.fallbackTitle,
    message,
    action: "Retry the action.",
    code: null,
    requestId: null,
    retryable: true,
  };
}
