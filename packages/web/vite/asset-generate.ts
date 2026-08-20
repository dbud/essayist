import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { PNG } from "pngjs";
import { type Plugin, transformWithEsbuild, type ViteDevServer } from "vite";

export type AssetGenerator = (params: Record<string, string>) => {
  width: number;
  height: number;
  data: Uint8Array;
};

function encodePng(width: number, height: number, data: Uint8Array): Buffer {
  const png = new PNG({ width, height });
  png.data = Buffer.from(data);
  return PNG.sync.write(png);
}

async function loadGenerator(
  tsPath: string,
  server?: ViteDevServer,
): Promise<AssetGenerator> {
  if (server) {
    const mod = await server.ssrLoadModule(tsPath);
    return mod.default;
  }

  // Build mode: transpile to CJS with esbuild and evaluate directly.
  // Dynamic import() deadlocks inside the Rollup build process.
  const tsCode = readFileSync(tsPath, "utf-8");
  const { code: jsCode } = await transformWithEsbuild(tsCode, tsPath, {
    loader: "ts",
    format: "cjs",
    target: "esnext",
  });

  const moduleObj = { exports: {} as Record<string, unknown> };
  const fn = new Function("module", "exports", jsCode);
  fn(moduleObj, moduleObj.exports);
  return moduleObj.exports.default as AssetGenerator;
}

export function assetGenerate(): Plugin {
  let server: ViteDevServer | undefined;

  return {
    name: "asset-generate",
    enforce: "pre",

    configureServer(devServer) {
      server = devServer;
    },

    async transform(code, id) {
      if (!code.includes(".png?") || !id.endsWith(".css")) return null;

      const urlPattern = /url\(\s*["']?([^)"']+\.png\?[^)"']+)["']?\s*\)/g;

      const replacements = new Map<string, string>();
      const watchFiles: string[] = [];

      for (const match of code.matchAll(urlPattern)) {
        const url = match[1];
        if (replacements.has(url)) continue;

        const [bare, queryString] = url.split("?");
        const params = Object.fromEntries(new URLSearchParams(queryString));

        const dir = dirname(id);
        const tsPath = resolve(dir, `${bare}.ts`);

        if (!existsSync(tsPath)) continue;

        watchFiles.push(tsPath);
        const generate = await loadGenerator(tsPath, server);

        if (typeof generate !== "function") {
          throw new Error(`${tsPath} must export a default function`);
        }

        const result = generate(params);
        const pngBuffer = encodePng(result.width, result.height, result.data);
        const dataUri = `data:image/png;base64,${pngBuffer.toString("base64")}`;

        replacements.set(url, dataUri);
      }

      if (replacements.size === 0) return null;

      let newCode = code;
      for (const [original, replacement] of replacements) {
        newCode = newCode.replaceAll(original, replacement);
      }

      for (const file of watchFiles) {
        this.addWatchFile(file);
      }

      return { code: newCode, map: null };
    },
  };
}
