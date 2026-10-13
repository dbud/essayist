/** Structured logging for composition roots and test layers. */

import { Logger } from "effect";

/** A `Logger` rendering one JSON object per log entry, on console.log. */
export const jsonLogger = Logger.consoleJson;

/** The app's log layer: JSON entries, filtered by `References.MinimumLogLevel`. */
export const jsonLogLayer = Logger.layer([jsonLogger]);
