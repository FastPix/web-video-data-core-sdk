// Server Component. It renders the client-only <Player />. Because the SDK is
// SSR-safe to import, a plain client component is enough — no next/dynamic
// { ssr: false } workaround needed.
import Player from "./Player";

export default function Page() {
  return <Player />;
}
