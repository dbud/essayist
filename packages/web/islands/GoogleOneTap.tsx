import { useEffect, useRef } from "preact/hooks";
import { loadGsi } from "@/utils/googleGsi.ts";

interface GoogleOneTapProps {
  clientId: string;
  next: string;
}

/**
 * Google One Tap prompt (FedCM): shows "Continue as <name>" for visitors
 * with an active Google session. Renders no visible UI; on accept it posts
 * the ID token credential to /oauth/onetap, which sets the session cookie
 * and redirects to `next`.
 */
export default function GoogleOneTap({ clientId, next }: GoogleOneTapProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const credentialRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadGsi()
      .then(() => {
        if (cancelled) return;
        google.accounts.id.initialize({
          client_id: clientId,
          use_fedcm_for_prompt: true,
          callback: (response) => {
            if (!response.credential || !credentialRef.current) return;
            credentialRef.current.value = response.credential;
            formRef.current?.submit();
          },
        });
        google.accounts.id.prompt();
      })
      .catch(() => {
        // GIS failed to load (offline, blocked); the custom sign-in button
        // on the login page remains as the fallback.
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  return (
    <form ref={formRef} method="POST" action="/oauth/onetap" class="hidden">
      <input ref={credentialRef} type="hidden" name="credential" />
      <input type="hidden" name="next" value={next} />
    </form>
  );
}
