import {
  $generateNodesFromSerializedNodes,
  $insertGeneratedNodes,
  ClipboardImportExtension,
  type ImportMimeTypeFunction,
} from "@lexical/clipboard";
import { $generateNodesFromDOM } from "@lexical/html";
import { $getEditor, configExtension, defineExtension } from "lexical";
import { HtmlSanitizer } from "./htmlSanitizer.ts";
import { JsonSanitizer } from "./jsonSanitizer.ts";
import { defaultPastePolicy, type PastePolicy } from "./policy.ts";

function createJsonImporter(policy: PastePolicy): ImportMimeTypeFunction {
  const sanitizer = new JsonSanitizer(policy);
  return (data, selection, $next) => {
    let payload: unknown;
    try {
      payload = JSON.parse(data);
    } catch {
      return $next();
    }
    const editor = $getEditor();
    if (
      typeof payload !== "object" ||
      payload === null ||
      (payload as { namespace?: unknown }).namespace !==
        editor._config.namespace
    ) {
      return $next();
    }
    const { nodes } = payload as { nodes?: unknown };
    if (!Array.isArray(nodes)) return $next();
    const sanitized = sanitizer.sanitize(nodes);
    $insertGeneratedNodes(
      editor,
      $generateNodesFromSerializedNodes(sanitized),
      selection,
    );
    return true;
  };
}

function createHtmlImporter(policy: PastePolicy): ImportMimeTypeFunction {
  const sanitizer = new HtmlSanitizer(policy);
  return (data, selection, $next) => {
    try {
      const clean = sanitizer.sanitize(data);
      const editor = $getEditor();
      const nodes = $generateNodesFromDOM(editor, clean);
      $insertGeneratedNodes(editor, nodes, selection);
      return true;
    } catch (error) {
      console.error("[paste] html import failed, delegating:", error);
      return $next();
    }
  };
}

export const PastePolicyExtension = defineExtension({
  name: "paste-policy",
  dependencies: [
    configExtension(ClipboardImportExtension, {
      $importMimeType: {
        "application/x-lexical-editor": [
          createJsonImporter(defaultPastePolicy),
        ],
        "text/html": [createHtmlImporter(defaultPastePolicy)],
      },
    }),
  ],
});
