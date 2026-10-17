// The votes endpoints: a blueprint for wrapping core services in HttpApi
// groups.
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/http-api";
import { VotesDataSchema } from "#/models/votes.data.ts";

const getVotes = HttpApiEndpoint.get("getVotes", "/votes", {
  success: VotesDataSchema,
});

const incrementVotes = HttpApiEndpoint.post(
  "incrementVotes",
  "/votes/increment",
  { success: VotesDataSchema },
);

const decrementVotes = HttpApiEndpoint.post(
  "decrementVotes",
  "/votes/decrement",
  { success: VotesDataSchema },
);

const chaosVotes = HttpApiEndpoint.post("chaosVotes", "/votes/chaos", {
  success: Schema.Struct({ armed: Schema.Boolean }),
});

export const votesGroup = HttpApiGroup.make("votes")
  .add(getVotes)
  .add(incrementVotes)
  .add(decrementVotes)
  .add(chaosVotes);
