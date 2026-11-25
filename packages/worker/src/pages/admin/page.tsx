import { MoveLeft } from "lucide-preact";

import AdminConfig from "#/components/admin/AdminConfig.tsx";
import Navigation from "#/components/admin/Navigation.tsx";
import { useAppState } from "#/state.ts";

function AdminPage() {
  const { user } = useAppState();

  return (
    <div class="flex flex-1 min-h-0">
      <main class="flex flex-1 flex-col swiss-stack swiss-stack--col min-h-0 @container">
        <Navigation user={user}>
          <div class="flex swiss-stack swiss-stack--row">
            <a href="/editor" class="swiss-btn">
              <MoveLeft size={16} />
            </a>
            <div class="swiss-cell">Control panel</div>
          </div>
        </Navigation>
        <AdminConfig />
      </main>
    </div>
  );
}

export default function Page() {
  return <AdminPage />;
}
