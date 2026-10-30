import { MoveLeft } from "lucide-preact";

import AdminConfig from "#/components/admin/AdminConfig.tsx";
import Navigation from "#/components/Navigation.tsx";
import { useAppState } from "#/state.ts";

function AdminPage() {
  const { user } = useAppState();

  return (
    <div class="flex flex-1 min-h-0">
      <main class="flex flex-1 flex-col stack stack--col min-h-0 @container">
        <Navigation user={user}>
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

export default function Page() {
  return <AdminPage />;
}
