// A workspace in the editor URL: its name to read, then the start of its id to find it by. The name
// part is only for reading, so a link keeps working after a rename.

import { toKebabCase } from "@std/text/to-kebab-case";

// ids are random, so this many characters tell apart the few workspaces a user sees
const ID_CHARS = 8;

/** Without a name, the editor fills it in when it next writes the URL. */
export function workspaceParam(id: string, name = ""): string {
  const slug = toKebabCase(name);
  const start = id.slice(0, ID_CHARS);
  return slug === "" ? start : `${slug}-${start}`;
}

/** The id the parameter names among the given ones, or null when it names none or several. */
export function workspaceIdOf(
  param: string | null | undefined,
  ids: readonly string[],
): string | null {
  if (param == null) return null;
  const start = param.slice(param.lastIndexOf("-") + 1);
  if (start.length !== ID_CHARS) return null;
  const matches = ids.filter((id) => id.startsWith(start));
  return matches.length === 1 ? matches[0] : null;
}
