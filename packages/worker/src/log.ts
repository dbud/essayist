// The worker's console log layer. Effect's pretty logger in vite dev builds (timestamps, levels,
// colors for the local console); JSON entries in built surfaces for structured ingestion.

import { jsonLogLayer } from "@essayist/core";
import { Logger } from "effect";

export const logLayer = import.meta.env.DEV ? Logger.layer([Logger.consolePretty()]) : jsonLogLayer;
