import type { Signal } from "@preact/signals";
import { showToast } from "@/signals/toast.ts";
import createAsyncState from "@/utils/asyncState.ts";

async function ensureOk(res: Response): Promise<void> {
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

export interface Mutations {
  mutating: Signal<boolean>;
  mutateError: Signal<string>;
  post: <T>(url: string, body: T) => Promise<boolean>;
  put: <T>(url: string, body: T) => Promise<boolean>;
  del: (url: string) => Promise<boolean>;
}

export function createMutations(reload: () => Promise<void>): Mutations {
  const [mutateRun, { loading: mutating, error: mutateError }] =
    createAsyncState();

  async function doMutate(fn: () => Promise<void>): Promise<boolean> {
    const result = await mutateRun(async () => {
      await fn();
      return true as const;
    });
    if (result !== true) {
      if (mutateError.value) showToast(mutateError.value, "error");
      return false;
    }
    await reload();
    return true;
  }

  function post<T>(url: string, body: T) {
    return doMutate(async () => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await ensureOk(res);
    });
  }

  function put<T>(url: string, body: T) {
    return doMutate(async () => {
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await ensureOk(res);
    });
  }

  function del(url: string) {
    return doMutate(async () => {
      const res = await fetch(url, { method: "DELETE" });
      await ensureOk(res);
    });
  }

  return { mutating, mutateError, post, put, del };
}
