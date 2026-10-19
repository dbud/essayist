// The client transport, shared by model actions. Typed by the data
// contracts; responses are cast (the API tier validates its own outputs
// against the same schemas).

export async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`transport: GET ${path} failed with ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`transport: POST ${path} failed with ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function putJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`transport: PUT ${path} failed with ${res.status}`);
  }
  return (await res.json()) as T;
}

// Pins and similar writes resolve 204 with no body, so the parsed
// result only exists when the backend sends one.
export async function patchJson<T = void>(
  path: string,
  body: unknown,
  options?: {
    readonly keepalive?: boolean;
  },
): Promise<T> {
  const res = await fetch(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: options?.keepalive,
  });
  if (!res.ok) {
    throw new Error(`transport: PATCH ${path} failed with ${res.status}`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}
