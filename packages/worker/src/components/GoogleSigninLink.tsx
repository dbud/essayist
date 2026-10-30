import { ArrowUpRight } from "lucide-preact";

/**
 * The full OAuth consent link: the sign-in path that also (re-)grants the Drive scopes; the GIS id
 * button only exchanges identity, so a revoked grant needs this link to recover Google API access.
 */
export default function GoogleSigninLink({ next }: { next: string }) {
  return (
    <a class="btn cell--accent self-start" href={`/oauth/google?next=${encodeURIComponent(next)}`}>
      <ArrowUpRight size={16} />
      Sign in with Google
    </a>
  );
}
