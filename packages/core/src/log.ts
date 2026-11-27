/** Structured logging for composition roots and test layers. */

import { Logger } from "effect";

/** The app's log layer: a JSON object per entry on console.log, filtered by
 * `References.MinimumLogLevel`. */
export const jsonLogLayer = Logger.layer([Logger.consoleJson]);
