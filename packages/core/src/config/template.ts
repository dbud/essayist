const PLACEHOLDER_PATTERN = /\{\{(\w+)\}\}/g;

/** Names a template expects, in order of first appearance. */
export function extractVariables(body: string): string[] {
  return [...new Set([...body.matchAll(PLACEHOLDER_PATTERN)].map((m) => m[1]))];
}

/** {{var}} placeholder replacement for prompt templates. Unknown placeholders are left intact. */
export function renderPrompt(
  body: string,
  variables: Record<string, string> = {},
): string {
  return body.replace(PLACEHOLDER_PATTERN, (match, name: string) =>
    Object.hasOwn(variables, name) ? variables[name] : match,
  );
}
