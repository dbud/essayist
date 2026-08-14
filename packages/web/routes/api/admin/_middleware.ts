import { define } from "@/define.ts";

export default define.middleware((ctx) => {
  if (ctx.state.user?.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return ctx.next();
});
