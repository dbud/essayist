import { useEffect, useRef, useState } from "preact/hooks";

import { loadGsi } from "#/client/googleGsi.ts";

/** The login page: the native "Sign in with Google" button plus the One
 * Tap prompt (FedCM) for eligible visitors. Both share one callback that
 * posts the ID token credential to /oauth/onetap, which sets the session
 * cookie and redirects to `next`. If GIS fails to load, falls back to the
 * full OAuth redirect link. */
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
        // Arriving from /oauth/signout: clear the auto selection
        // remembered by GSI so the user is not silently signed back in.
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
    <main style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;gap:1rem;">
      <p>Sign in to Essayist</p>
      {googleClientId === undefined ? (
        <p>Google sign-in is not configured</p>
      ) : gsiFailed ? (
        <a href={`/oauth/google?next=${encodeURIComponent(next)}`}>Continue with Google</a>
      ) : (
        <div ref={buttonRef} />
      )}
      <form ref={formRef} method="POST" action="/oauth/onetap" hidden>
        <input ref={credentialRef} type="hidden" name="credential" />
        <input type="hidden" name="next" value={next} />
      </form>
    </main>
  );
}
