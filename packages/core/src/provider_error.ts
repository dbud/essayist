/**
 * A provider error normalized into a plain, serializable shape suitable
 * for sending to clients (e.g. over SSE) and rendering in the UI.
 *
 * OpenRouter SDK errors expose the provider's human-readable explanation
 * in `err.error.metadata.raw`, which is far more useful than the generic
 * `err.message` (typically "Provider returned error").
 */
export interface ProviderError {
  name: string;
  statusCode?: number;
  code?: number;
  message: string;
  raw?: string;
  providerName?: string;
  isByok?: boolean;
}

interface OpenRouterLikeError {
  statusCode?: number;
  message?: string;
  name?: string;
  error?: {
    code?: number;
    message?: string;
    metadata?: {
      raw?: string;
      provider_name?: string;
      is_byok?: boolean;
    };
  };
  data$?: {
    error?: OpenRouterLikeError["error"];
  };
}

/**
 * Normalize an OpenRouter SDK error (or any thrown value) into a
 * {@link ProviderError}. Falls back gracefully for non-SDK errors.
 */
export function extractProviderError(err: unknown): ProviderError {
  if (err instanceof Error) {
    const e = err as Error & OpenRouterLikeError;
    const errorData = e.error ?? e.data$?.error;
    const meta = errorData?.metadata;
    return {
      name: e.name,
      statusCode: e.statusCode,
      code: errorData?.code,
      message: errorData?.message ?? e.message,
      raw: meta?.raw,
      providerName: meta?.provider_name,
      isByok: meta?.is_byok,
    };
  }
  if (typeof err === "object" && err !== null) {
    const e = err as OpenRouterLikeError;
    const errorData = e.error ?? e.data$?.error;
    const meta = errorData?.metadata;
    return {
      name: e.name ?? "Error",
      statusCode: e.statusCode,
      code: errorData?.code,
      message: errorData?.message ?? String(err),
      raw: meta?.raw,
      providerName: meta?.provider_name,
      isByok: meta?.is_byok,
    };
  }
  return { name: "Error", message: String(err) };
}

const STATUS_LABELS: Record<number, string> = {
  400: "Bad request",
  401: "Unauthorized",
  402: "Payment required",
  403: "Forbidden",
  404: "Not found",
  408: "Request timeout",
  409: "Conflict",
  413: "Payload too large",
  422: "Unprocessable entity",
  429: "Rate limited",
  500: "Server error",
  502: "Bad gateway",
  503: "Service unavailable",
  504: "Gateway timeout",
};

/**
 * A short, human-friendly label for a provider error, e.g.
 * "Rate limited (429)". Falls back to the error name.
 */
export function providerErrorLabel(err: ProviderError): string {
  const label =
    err.statusCode != null ? STATUS_LABELS[err.statusCode] : undefined;
  if (label && err.statusCode != null) return `${label} (${err.statusCode})`;
  if (err.statusCode != null) return `${err.name} (${err.statusCode})`;
  return err.name;
}

/**
 * The most useful human-readable explanation of a provider error.
 * Prefers the provider's raw message, then the structured message,
 * then the generic Error message.
 */
export function providerErrorDetail(err: ProviderError): string {
  return err.raw ?? err.message ?? "Unknown error";
}
