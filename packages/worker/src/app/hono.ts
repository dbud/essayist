// Pages tier: hono serves SSR pages and middleware. Routes mount here;
// requestLog, models, and sentry port with the first real features.
import { Hono } from "hono";
import { homeRoute } from "@/routes/home/route";

export const webApp = new Hono();

webApp.route("/", homeRoute);
