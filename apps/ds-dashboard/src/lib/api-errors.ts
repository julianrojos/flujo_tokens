export const API_ERROR_CODES = {
  ASSET_INVALID_PATH: "asset.invalid_path",
  ASSET_NOT_FOUND: "asset.not_found",
  COMPONENT_SPEC_EDITING_DISABLED: "component_spec.editing_disabled",
  COMPONENT_SPEC_NOT_FOUND: "component_spec.not_found",
  DESIGN_SYSTEM_ALREADY_EXISTS: "design_system.already_exists",
  DESIGN_SYSTEM_LAST_SYSTEM_PROTECTED: "design_system.last_system_protected",
  DESIGN_SYSTEM_NOT_FOUND: "design_system.not_found",
  FILE_INVALID_PATH: "file.invalid_path",
  FILE_NOT_FOUND: "file.not_found",
  FILE_QUERY_NOT_FOUND: "file.query_not_found",
  HTTP_METHOD_NOT_ALLOWED: "http.method_not_allowed",
  INTERNAL_UNEXPECTED_ERROR: "internal.unexpected_error",
  OPERATIONS_EVENT_NOT_FOUND: "operations.event_not_found",
  OPERATIONS_REPLAY_NOT_SUPPORTED: "operations.replay_not_supported",
  QUEUE_JOB_FAILED_OR_CANCELLED: "queue.job_failed_or_cancelled",
  QUEUE_JOB_NOT_CANCELABLE: "queue.job_not_cancelable",
  QUEUE_JOB_NOT_FOUND: "queue.job_not_found",
  QUEUE_STREAM_TIMEOUT: "queue.stream_timeout",
  SYSTEM_INVALID_OR_MISSING: "system.invalid_or_missing",
  TOKEN_GRAPH_TOKEN_NOT_FOUND: "token_graph.token_not_found",
  VALIDATION_FIGMA_URL_REQUIRED: "validation.figma_url_required",
  VALIDATION_INVALID_COMPONENT_SLUG: "validation.invalid_component_slug",
  VALIDATION_INVALID_DATE_FORMAT: "validation.invalid_date_format",
  VALIDATION_INVALID_DATE_RANGE: "validation.invalid_date_range",
  VALIDATION_INVALID_FIGMA_HOST: "validation.invalid_figma_host",
  VALIDATION_INVALID_FIGMA_URL: "validation.invalid_figma_url",
  VALIDATION_INVALID_GIT_REF: "validation.invalid_git_ref",
  VALIDATION_INVALID_LINE_PARAMETER: "validation.invalid_line_parameter",
  VALIDATION_INVALID_NAME: "validation.invalid_name",
  VALIDATION_MISSING_REQUIRED_FIELDS: "validation.missing_required_fields",
  VALIDATION_MISSING_SCRIPT_NAME: "validation.missing_script_name",
  VALIDATION_TOKEN_PATH_REQUIRED: "validation.token_path_required",
  VALIDATION_TOKEN_REQUIRED: "validation.token_required",
} as const;

export type ApiErrorCatalogCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];
export type ApiErrorCode = ApiErrorCatalogCode | `http.${number}`;

export interface ApiErrorCodeMeta {
  code: ApiErrorCode;
  httpStatus: number;
  recoverable: boolean;
  description: string;
  fix: string;
}

export const API_ERROR_CATALOG: Record<ApiErrorCatalogCode, ApiErrorCodeMeta> = {
  [API_ERROR_CODES.ASSET_INVALID_PATH]: {
    code: API_ERROR_CODES.ASSET_INVALID_PATH,
    httpStatus: 400,
    recoverable: true,
    description: "Asset path is invalid or points outside the repository.",
    fix: "Pass a valid repository-relative asset path.",
  },
  [API_ERROR_CODES.ASSET_NOT_FOUND]: {
    code: API_ERROR_CODES.ASSET_NOT_FOUND,
    httpStatus: 404,
    recoverable: true,
    description: "Asset file does not exist.",
    fix: "Verify the asset path and regenerate assets if needed.",
  },
  [API_ERROR_CODES.COMPONENT_SPEC_EDITING_DISABLED]: {
    code: API_ERROR_CODES.COMPONENT_SPEC_EDITING_DISABLED,
    httpStatus: 403,
    recoverable: true,
    description: "Spec editing endpoints are disabled in the current runtime.",
    fix: "Use development mode to edit component specs.",
  },
  [API_ERROR_CODES.COMPONENT_SPEC_NOT_FOUND]: {
    code: API_ERROR_CODES.COMPONENT_SPEC_NOT_FOUND,
    httpStatus: 404,
    recoverable: true,
    description: "The requested component spec target could not be resolved.",
    fix: "Check the component slug and registry mapping.",
  },
  [API_ERROR_CODES.DESIGN_SYSTEM_ALREADY_EXISTS]: {
    code: API_ERROR_CODES.DESIGN_SYSTEM_ALREADY_EXISTS,
    httpStatus: 409,
    recoverable: true,
    description: "A design system with this ID already exists.",
    fix: "Use a different system ID or update the existing system.",
  },
  [API_ERROR_CODES.DESIGN_SYSTEM_LAST_SYSTEM_PROTECTED]: {
    code: API_ERROR_CODES.DESIGN_SYSTEM_LAST_SYSTEM_PROTECTED,
    httpStatus: 400,
    recoverable: true,
    description: "The last remaining design system cannot be deleted.",
    fix: "Create another system before deleting this one.",
  },
  [API_ERROR_CODES.DESIGN_SYSTEM_NOT_FOUND]: {
    code: API_ERROR_CODES.DESIGN_SYSTEM_NOT_FOUND,
    httpStatus: 404,
    recoverable: true,
    description: "The requested design system ID does not exist.",
    fix: "Select an existing system ID and retry.",
  },
  [API_ERROR_CODES.FILE_INVALID_PATH]: {
    code: API_ERROR_CODES.FILE_INVALID_PATH,
    httpStatus: 400,
    recoverable: true,
    description: "File path is invalid or outside repository bounds.",
    fix: "Pass a valid repository-relative file path.",
  },
  [API_ERROR_CODES.FILE_NOT_FOUND]: {
    code: API_ERROR_CODES.FILE_NOT_FOUND,
    httpStatus: 404,
    recoverable: true,
    description: "The target file was not found on disk.",
    fix: "Verify the file path and ensure it exists.",
  },
  [API_ERROR_CODES.FILE_QUERY_NOT_FOUND]: {
    code: API_ERROR_CODES.FILE_QUERY_NOT_FOUND,
    httpStatus: 404,
    recoverable: true,
    description: "The requested query text was not found in the file.",
    fix: "Adjust the query string or inspect the file contents.",
  },
  [API_ERROR_CODES.HTTP_METHOD_NOT_ALLOWED]: {
    code: API_ERROR_CODES.HTTP_METHOD_NOT_ALLOWED,
    httpStatus: 405,
    recoverable: true,
    description: "Endpoint does not support the requested HTTP method.",
    fix: "Use the documented HTTP method for this route.",
  },
  [API_ERROR_CODES.INTERNAL_UNEXPECTED_ERROR]: {
    code: API_ERROR_CODES.INTERNAL_UNEXPECTED_ERROR,
    httpStatus: 500,
    recoverable: true,
    description: "Unhandled server-side exception.",
    fix: "Retry; if persistent, inspect server logs with requestId.",
  },
  [API_ERROR_CODES.OPERATIONS_EVENT_NOT_FOUND]: {
    code: API_ERROR_CODES.OPERATIONS_EVENT_NOT_FOUND,
    httpStatus: 404,
    recoverable: true,
    description: "Operation history event ID was not found.",
    fix: "Refresh history and retry with a valid event ID.",
  },
  [API_ERROR_CODES.OPERATIONS_REPLAY_NOT_SUPPORTED]: {
    code: API_ERROR_CODES.OPERATIONS_REPLAY_NOT_SUPPORTED,
    httpStatus: 409,
    recoverable: true,
    description: "Operation cannot be replayed automatically.",
    fix: "Run the operation manually with required parameters.",
  },
  [API_ERROR_CODES.QUEUE_JOB_FAILED_OR_CANCELLED]: {
    code: API_ERROR_CODES.QUEUE_JOB_FAILED_OR_CANCELLED,
    httpStatus: 409,
    recoverable: true,
    description: "Queued operation finished with error or cancellation.",
    fix: "Inspect job logs and re-run the operation.",
  },
  [API_ERROR_CODES.QUEUE_JOB_NOT_CANCELABLE]: {
    code: API_ERROR_CODES.QUEUE_JOB_NOT_CANCELABLE,
    httpStatus: 409,
    recoverable: true,
    description: "Job cannot be canceled in its current state.",
    fix: "Refresh job status and retry only if still queued/running.",
  },
  [API_ERROR_CODES.QUEUE_JOB_NOT_FOUND]: {
    code: API_ERROR_CODES.QUEUE_JOB_NOT_FOUND,
    httpStatus: 404,
    recoverable: true,
    description: "Queue job does not exist (or has expired).",
    fix: "Re-run the operation to create a new job.",
  },
  [API_ERROR_CODES.QUEUE_STREAM_TIMEOUT]: {
    code: API_ERROR_CODES.QUEUE_STREAM_TIMEOUT,
    httpStatus: 200,
    recoverable: true,
    description: "SSE stream timed out before job completion.",
    fix: "Reconnect using job status endpoint or reopen stream.",
  },
  [API_ERROR_CODES.SYSTEM_INVALID_OR_MISSING]: {
    code: API_ERROR_CODES.SYSTEM_INVALID_OR_MISSING,
    httpStatus: 400,
    recoverable: true,
    description: "System header is invalid or unresolved.",
    fix: "Set a valid `x-ds-system` or choose an existing default system.",
  },
  [API_ERROR_CODES.TOKEN_GRAPH_TOKEN_NOT_FOUND]: {
    code: API_ERROR_CODES.TOKEN_GRAPH_TOKEN_NOT_FOUND,
    httpStatus: 404,
    recoverable: true,
    description: "Token was not found in the token graph.",
    fix: "Verify token path and rebuild graph artifacts.",
  },
  [API_ERROR_CODES.VALIDATION_FIGMA_URL_REQUIRED]: {
    code: API_ERROR_CODES.VALIDATION_FIGMA_URL_REQUIRED,
    httpStatus: 400,
    recoverable: true,
    description: "Missing Figma URL in request body.",
    fix: "Provide a `figmaUrl` value.",
  },
  [API_ERROR_CODES.VALIDATION_INVALID_COMPONENT_SLUG]: {
    code: API_ERROR_CODES.VALIDATION_INVALID_COMPONENT_SLUG,
    httpStatus: 400,
    recoverable: true,
    description: "Component slug is invalid.",
    fix: "Use a valid component slug format.",
  },
  [API_ERROR_CODES.VALIDATION_INVALID_DATE_FORMAT]: {
    code: API_ERROR_CODES.VALIDATION_INVALID_DATE_FORMAT,
    httpStatus: 400,
    recoverable: true,
    description: "Date filter is malformed.",
    fix: "Use ISO-8601 date values, for example `2026-02-24`.",
  },
  [API_ERROR_CODES.VALIDATION_INVALID_DATE_RANGE]: {
    code: API_ERROR_CODES.VALIDATION_INVALID_DATE_RANGE,
    httpStatus: 400,
    recoverable: true,
    description: "Date range is invalid (`from` is after `to`).",
    fix: "Set `from` earlier than or equal to `to`.",
  },
  [API_ERROR_CODES.VALIDATION_INVALID_FIGMA_HOST]: {
    code: API_ERROR_CODES.VALIDATION_INVALID_FIGMA_HOST,
    httpStatus: 400,
    recoverable: true,
    description: "Provided URL host is not a valid Figma domain.",
    fix: "Use a URL hosted on `figma.com`.",
  },
  [API_ERROR_CODES.VALIDATION_INVALID_FIGMA_URL]: {
    code: API_ERROR_CODES.VALIDATION_INVALID_FIGMA_URL,
    httpStatus: 400,
    recoverable: true,
    description: "Provided Figma URL is malformed.",
    fix: "Provide a complete and valid Figma URL.",
  },
  [API_ERROR_CODES.VALIDATION_INVALID_GIT_REF]: {
    code: API_ERROR_CODES.VALIDATION_INVALID_GIT_REF,
    httpStatus: 400,
    recoverable: true,
    description: "Git ref format is invalid.",
    fix: "Use a valid ref containing only allowed characters.",
  },
  [API_ERROR_CODES.VALIDATION_INVALID_LINE_PARAMETER]: {
    code: API_ERROR_CODES.VALIDATION_INVALID_LINE_PARAMETER,
    httpStatus: 400,
    recoverable: true,
    description: "Line parameter is not a valid number.",
    fix: "Provide an integer value for `line`.",
  },
  [API_ERROR_CODES.VALIDATION_INVALID_NAME]: {
    code: API_ERROR_CODES.VALIDATION_INVALID_NAME,
    httpStatus: 400,
    recoverable: true,
    description: "Name value is invalid or empty.",
    fix: "Provide a non-empty name.",
  },
  [API_ERROR_CODES.VALIDATION_MISSING_REQUIRED_FIELDS]: {
    code: API_ERROR_CODES.VALIDATION_MISSING_REQUIRED_FIELDS,
    httpStatus: 400,
    recoverable: true,
    description: "Request body is missing required fields.",
    fix: "Include all required fields in the request payload.",
  },
  [API_ERROR_CODES.VALIDATION_MISSING_SCRIPT_NAME]: {
    code: API_ERROR_CODES.VALIDATION_MISSING_SCRIPT_NAME,
    httpStatus: 400,
    recoverable: true,
    description: "Script name parameter is missing.",
    fix: "Specify a script name in the URL or request.",
  },
  [API_ERROR_CODES.VALIDATION_TOKEN_PATH_REQUIRED]: {
    code: API_ERROR_CODES.VALIDATION_TOKEN_PATH_REQUIRED,
    httpStatus: 400,
    recoverable: true,
    description: "Token path query parameter is required.",
    fix: "Provide `tokenPath` in query string.",
  },
  [API_ERROR_CODES.VALIDATION_TOKEN_REQUIRED]: {
    code: API_ERROR_CODES.VALIDATION_TOKEN_REQUIRED,
    httpStatus: 400,
    recoverable: true,
    description: "Token query parameter is required.",
    fix: "Provide `token` (or `tokenPath`) in query string.",
  },
};

export function getApiErrorMeta(code: string): ApiErrorCodeMeta | null {
  if (code in API_ERROR_CATALOG) {
    return API_ERROR_CATALOG[code as ApiErrorCatalogCode];
  }

  const httpMatch = /^http\.(\d{3})$/.exec(code);
  if (httpMatch) {
    const status = Number.parseInt(httpMatch[1], 10);
    if (Number.isFinite(status)) {
      return {
        code: `http.${status}` as ApiErrorCode,
        httpStatus: status,
        recoverable: status >= 500 || status === 429,
        description: `HTTP ${status} error.`,
        fix:
          status >= 500 || status === 429
            ? "Retry after a short delay."
            : "Review the request and retry.",
      };
    }
  }

  return null;
}
