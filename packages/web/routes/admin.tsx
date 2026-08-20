import type { PageProps } from "fresh";
import { page } from "fresh";
import { MoveLeft } from "lucide-preact";
import { define, type State } from "@/define.ts";
import AdminConfig from "@/islands/AdminConfig.tsx";
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
      <main class="flex flex-1 flex-col min-h-0 @container bg-paper text-ink">
        <Navigation user={state.user}>
          <div class="flex gap-4">
            <a href="/" class="btn btn--ghost">
              <MoveLeft />
              Back to editor
            </a>
            <h1 class="text-lg font-thin">Control panel</h1>
          </div>
        </Navigation>
        <div class="flex-1 min-h-0 overflow-y-auto">
          <div class="content-layout">
            <div class="content-main min-w-0 py-6 flex flex-col gap-4">
              <AdminConfig />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
