import type { Middleware } from "fresh";
import { define, type State } from "@/define.ts";

const COMPRESSIBLE =
  /^(text\/|application\/(?:javascript|json|xml|wasm)|image\/svg)/;

const isDev = Deno.env.get("DENO_ENV") === "development";

/**
 * Compresses text-like responses with gzip. Register before `staticFiles()`
 * so assets are covered. Skipped in dev: the vite plugin rewrites HTML
 * bodies for css injection and would corrupt encoded streams.
 */
const compressMiddleware: Middleware<State> = define.middleware(async (ctx) => {
  if (isDev) {
    return ctx.next();
  }

  const accepts = ctx.req.headers.get("accept-encoding") ?? "";
  if (!/\b(gzip|deflate)\b/.test(accepts)) {
    return ctx.next();
  }

  const res = await ctx.next();
  const type = res.headers.get("content-type") ?? "";
  if (
    !res.body ||
    res.headers.has("content-encoding") ||
    !COMPRESSIBLE.test(type)
  ) {
    return res;
  }

  const headers = new Headers(res.headers);
  headers.delete("content-length");
  headers.append("vary", "Accept-Encoding");
  headers.set("content-encoding", "gzip");

  return new Response(res.body.pipeThrough(new CompressionStream("gzip")), {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
});

export default compressMiddleware;
