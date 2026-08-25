/**
 * Throw an Error if the response is not ok. Prefers the server-provided
 * `error` field when the body is JSON, otherwise falls back to a generic
 * message including the status code.
 */
export async function ensureOk(res: Response): Promise<void> {
  if (res.ok) return;
  let message = `Request failed (${res.status})`;
  try {
    const body = await res.json();
    if (body?.error) message = body.error;
  } catch {
    /* not JSON */
  }
  throw new Error(message);
}
