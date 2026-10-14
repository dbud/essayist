// Pages tier: SSR pages and middleware mount here.
import { Hono } from "hono";
import { homeRoute } from "@/routes/home/route";

export const webApp = new Hono();

webApp.route("/", homeRoute);
