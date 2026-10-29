// The hono renderer augmentation: typed props for c.render in the pages tier. The app state is
// injected by the renderer middleware, so callers never pass it.
import type { ComponentChild } from "preact";

type PageRenderer = (
  content: ComponentChild,
  props: {
    readonly title: string;
    readonly client?: string;
    readonly data?: unknown;
  },
) => Response | Promise<Response>;

declare module "hono" {
  interface ContextRenderer extends PageRenderer {}
}
