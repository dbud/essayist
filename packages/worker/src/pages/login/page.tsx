import { useEffect, useRef, useState } from "preact/hooks";

import { loadGsi } from "#/client/googleGsi.ts";
import GoogleSigninLink from "#/components/GoogleSigninLink.tsx";

/** The login page: the native "Sign in with Google" button plus the One
 * Tap prompt (FedCM) for eligible visitors. Both share one callback that posts the ID token
 * credential to /oauth/onetap, which sets the session cookie and redirects to `next`. If GIS fails
 * to load, falls back to the full OAuth redirect link. */
export default function Page({
  googleClientId,
  next,
}: {
  readonly googleClientId?: string;
  readonly next: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const credentialRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLDivElement>(null);
  const [gsiFailed, setGsiFailed] = useState(false);

  useEffect(() => {
    if (googleClientId === undefined) return;
    let cancelled = false;
    loadGsi()
      .then(() => {
        if (cancelled || !buttonRef.current) return;
        google.accounts.id.initialize({
          client_id: googleClientId,
          auto_select: true,
          use_fedcm_for_prompt: true,
          callback: (response) => {
            if (!response.credential || !credentialRef.current) return;
            credentialRef.current.value = response.credential;
            formRef.current?.submit();
          },
        });
        // Arriving from /oauth/signout: clear the auto selection remembered by GSI so the user is
        // not silently signed back in.
        if (new URLSearchParams(globalThis.location.search).has("signedout")) {
          google.accounts.id.disableAutoSelect();
        }
        google.accounts.id.renderButton(buttonRef.current, {
          type: "standard",
          theme: "filled_blue",
          size: "large",
          text: "signin_with",
          shape: "rectangular",
          logo_alignment: "left",
        });
        google.accounts.id.prompt();
      })
      .catch(() => {
        if (!cancelled) setGsiFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [googleClientId]);

  return (
    <main class="flex-1 min-h-0 flex flex-col @container">
      <div class="content-layout min-h-full">
        <div class="content-main py-5 flex flex-col gap-5">
          <h1 class="text-lg">Sign in to Essayist</h1>
          {googleClientId === undefined ? (
            <p>Google sign-in is not configured</p>
          ) : gsiFailed ? (
            <GoogleSigninLink next={next} />
          ) : (
            <div ref={buttonRef} class="self-start" />
          )}
          <form ref={formRef} method="POST" action="/oauth/onetap" hidden>
            <input ref={credentialRef} type="hidden" name="credential" />
            <input type="hidden" name="next" value={next} />
          </form>
        </div>
      </div>
    </main>
  );
}
