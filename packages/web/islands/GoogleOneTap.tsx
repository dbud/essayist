import { ArrowUpRight } from "lucide-preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { loadGsi } from "@/utils/googleGsi.ts";

interface GoogleOneTapProps {
  clientId: string;
  next: string;
}

/**
 * Google sign-in for the login page: the native "Sign in with Google"
 * button plus the One Tap prompt (FedCM) for eligible visitors. Both share
 * one callback that posts the ID token credential to /oauth/onetap, which
 * sets the session cookie and redirects to `next`. If GIS fails to load,
 * falls back to the full OAuth redirect link.
 */
export default function GoogleOneTap({ clientId, next }: GoogleOneTapProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const credentialRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLDivElement>(null);
  const [gsiFailed, setGsiFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadGsi()
      .then(() => {
        if (cancelled || !buttonRef.current) return;
        google.accounts.id.initialize({
          client_id: clientId,
          use_fedcm_for_prompt: true,
          callback: (response) => {
            if (!response.credential || !credentialRef.current) return;
            credentialRef.current.value = response.credential;
            formRef.current?.submit();
          },
        });
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
  }, [clientId]);

  return (
    <div class="flex flex-col items-start">
      {gsiFailed ? (
        <a
          href={`/oauth/signin?success_url=${encodeURIComponent(next)}`}
          class="btn cell--accent"
        >
          <ArrowUpRight size={16} />
          Sign in with Google
        </a>
      ) : (
        <div ref={buttonRef} />
      )}
      <form ref={formRef} method="POST" action="/oauth/onetap" class="hidden">
        <input ref={credentialRef} type="hidden" name="credential" />
        <input type="hidden" name="next" value={next} />
      </form>
    </div>
  );
}
