import { define } from "../../utils.ts";
import { getCapital } from "@essayist/core";

export const handler = {
  GET: define.handlers(async (ctx) => {
    const url = new URL(ctx.req.url);
    const country = url.searchParams.get("country");

    if (!country) {
      return Response.json(
        { error: "Missing 'country' query parameter" },
        { status: 400 },
      );
    }

    try {
      const capital = await getCapital(country, ctx.state.agent);
      return Response.json({ country, capital });
    } catch (err) {
      return Response.json(
        { error: String(err) },
        { status: 500 },
      );
    }
  }),
};
