/** {{var}} placeholder replacement for prompt templates. Unknown placeholders are left intact. */
export function renderPrompt(
  body: string,
  variables: Record<string, string> = {},
): string {
  return body.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    Object.hasOwn(variables, name) ? variables[name] : match,
  );
}
