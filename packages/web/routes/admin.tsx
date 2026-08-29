import type { PageProps } from "fresh";
import { page } from "fresh";
import { MoveLeft } from "lucide-preact";
import { define, type State } from "@/define.ts";
import AdminConfig from "@/islands/admin/AdminConfig.tsx";
import Navigation from "@/islands/Navigation.tsx";

export const handler = define.handlers({
  GET(ctx) {
    if (ctx.state.user?.role !== "admin") {
      return ctx.redirect("/");
    }
    return page();
  },
});

export default function AdminPage({ state }: PageProps<unknown, State>) {
  return (
    <div class="flex flex-1 min-h-0">
      <main class="flex flex-1 flex-col stack stack--col min-h-0 @container">
        <Navigation user={state.user}>
          <div class="flex stack stack--row">
            <a href="/" class="btn">
              <MoveLeft size={16} />
            </a>
            <div class="cell">Control panel</div>
          </div>
        </Navigation>
        <AdminConfig />
      </main>
    </div>
  );
}
