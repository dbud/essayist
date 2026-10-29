// The client transport shared by model actions. Responses are cast: the api tier validates its
// own outputs against the same schemas.

export interface JsonResponse<T> {
  readonly ok: boolean;
  readonly status: number;
  readonly data?: T;
  /** The failure reason sent in an error body; undefined when the error response has no body. */
  readonly message?: string;
}

/** A single json request. Failures return as values; batch flows read them per item, and the
 * wrappers below throw on failure and unwrap the body. */
export async function requestJson<T>(
  method: "GET" | "POST" | "PUT" | "PATCH",
  path: string,
  body?: unknown,
  options?: {
    readonly keepalive?: boolean;
  },
): Promise<JsonResponse<T>> {
  const init: RequestInit = { method, keepalive: options?.keepalive };
  if (body !== undefined) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(path, init);
  const text = await res.text().catch(() => "");
  if (res.ok) {
    return { ok: true, status: res.status, data: parseBody(text) as T | undefined };
  }
  return { ok: false, status: res.status, message: failureMessage(text) };
}

export async function getJson<T>(path: string): Promise<T> {
  return requireData(await requestJson<T>("GET", path), "GET", path);
}

export async function postJson<T>(path: string, body?: unknown): Promise<T> {
  return requireData(await requestJson<T>("POST", path, body), "POST", path);
}

export async function putJson<T>(
  path: string,
  body: unknown,
  options?: {
    readonly keepalive?: boolean;
  },
): Promise<T> {
  return requireData(await requestJson<T>("PUT", path, body, options), "PUT", path);
}

/** PATCH; a 204 resolves without a body. */
export async function patchJson<T = void>(
  path: string,
  body: unknown,
  options?: {
    readonly keepalive?: boolean;
  },
): Promise<T> {
  const res = await requestJson<T>("PATCH", path, body, options);
  if (!res.ok) {
    throw transportError("PATCH", path, res.status);
  }
  return res.status === 204 ? (undefined as T) : requireData(res, "PATCH", path);
}

async function requireData<T>(res: JsonResponse<T>, method: string, path: string): Promise<T> {
  if (!res.ok || res.data === undefined) {
    throw transportError(method, path, res.status);
  }
  return res.data;
}

function transportError(method: string, path: string, status: number): Error {
  return new Error(`transport: ${method} ${path} failed with ${status}`);
}

function parseBody(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function failureMessage(text: string): string | undefined {
  try {
    const body = JSON.parse(text) as { message?: string; error?: string };
    if (typeof body.message === "string") return body.message;
    if (typeof body.error === "string") return body.error;
  } catch {
    // Empty or not json: built-in api errors return no body.
  }
  return undefined;
}
