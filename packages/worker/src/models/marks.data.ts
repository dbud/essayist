import { Mark } from "@essayist/core";
import { Schema } from "effect";

export const MarksData = Schema.Array(Mark);

export type MarksData = Schema.Schema.Type<typeof MarksData>;
