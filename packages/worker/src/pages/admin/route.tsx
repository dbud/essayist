import { Hono } from "hono";

import Page from "./page";

export default new Hono().get("/", (c) => {
  const user = c.get("auth-user");
  if (user?.role !== "admin") {
    return c.redirect("/", 303);
  }
  return c.render(<Page />, {
    title: "control panel",
    client: "admin",
    data: {},
  });
});
