import { createClient, getCapital } from "@essayist/core";

export const handler = {
  async GET(req: Request) {
    const url = new URL(req.url);
    const country = url.searchParams.get("country");

    if (!country) {
      return new Response(
        JSON.stringify({ error: "Missing 'country' query parameter" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const apiKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "OPENROUTER_API_KEY not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    try {
      const client = createClient(apiKey);
      const capital = await getCapital(country, client);
      return new Response(
        JSON.stringify({ country, capital }),
        { headers: { "Content-Type": "application/json" } },
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ error: String(err) }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  },
};
