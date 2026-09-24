/* @ts-types="npm:@types/babel__core@^7.20.5" */ import * as babel from "npm:@babel/core@^7.28.0";
import type { Plugin } from "npm:vite@^8.3.0";
import { JS_REG, JSX_REG } from "../utils.ts";
import { codeEvalPlugin } from "./patches/code_eval.ts";
import { cjsPlugin } from "./patches/commonjs.ts";
import { inlineEnvVarsPlugin } from "./patches/inline_env_vars.ts";
import { jsxComments } from "./patches/jsx_comment.ts";
import { removePolyfills } from "./patches/remove_polyfills.ts";

// @ts-expect-error Workaround for https://github.com/denoland/deno/issues/30850
const { default: babelReact } = await import("npm:@babel/preset-react@^7.27.1");

export function patches(): Plugin {
  let isDev = false;

  return {
    name: "fresh:patches",
    sharedDuringBuild: true,
    config(_, env) {
      isDev = env.command === "serve";
    },
    applyToEnvironment() {
      return true;
    },
    transform: {
      filter: {
        id: JS_REG,
      },
      handler(code, id) {
        const presets = [];
        if (this.environment.config.consumer === "client" && JSX_REG.test(id)) {
          presets.push([
            babelReact,
            {
              runtime: "automatic",
              importSource: "preact",
              development: isDev,
              throwIfNamespace: false,
            },
          ]);
        }

        const env = isDev ? "development" : "production";

        const plugins: babel.PluginItem[] = [
          codeEvalPlugin(this.environment.config.consumer, env),
          cjsPlugin,
          removePolyfills,
          jsxComments,
          inlineEnvVarsPlugin(env, Deno.env.toObject()),
        ];

        const res = babel.transformSync(code, {
          filename: id,
          babelrc: false,
          compact: false,
          plugins,
          presets,
          sourceMaps: "both",
        });

        if (res?.code) {
          return {
            code: res.code,
            map: res.map,
          };
        }
      },
    },
  };
}
