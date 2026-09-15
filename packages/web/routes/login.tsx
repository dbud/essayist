import type { PageProps } from "fresh";
import GoogleOneTap from "@/islands/GoogleOneTap.tsx";
import Navigation from "@/islands/Navigation.tsx";
import { safeNext } from "@/utils/nextUrl.ts";

const clientId = Deno.env.get("GOOGLE_CLIENT_ID");

/**
 * Sign-in landing page. Shown to unauthenticated browser users (the auth
 * middleware redirects them here with a `next` query param). The Google
 * island handles both the native button and the One Tap prompt; its
 * credential callback posts to /oauth/onetap with `next` so the user lands
 * back on the page they originally requested.
 */
export default function LoginPage({ url }: PageProps) {
  const next = safeNext(url.searchParams.get("next"));
  return (
    <div class="flex flex-1 min-h-0">
      <main class="flex flex-1 flex-col stack stack--col min-h-0 @container">
        <Navigation>
          <div class="flex stack stack--row">
            <div class="cell">Sign in to Essayist</div>
          </div>
        </Navigation>
        <div class="flex-1 min-h-0 overflow-y-auto bg-paper">
          <div class="content-layout">
            <div class="content-main flex flex-col gap-5 py-10">
              <p class="text-ink max-w-prose">
                Use your Google account to open your workspaces.
              </p>
              {clientId && <GoogleOneTap clientId={clientId} next={next} />}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
