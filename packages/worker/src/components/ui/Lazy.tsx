import type { ComponentChildren, ComponentType } from "preact";
import { useEffect, useState } from "preact/hooks";

export interface LazyProps {
  active: boolean;
  idlePrefetch?: boolean;
  placeholder?: ComponentChildren;
  loader: () => Promise<{ default: ComponentType }>;
}

export default function Lazy({
  active,
  idlePrefetch = false,
  placeholder = null,
  loader,
}: LazyProps) {
  const [Content, setContent] = useState<ComponentType | null>(null);

  useEffect(() => {
    if (!idlePrefetch) return;
    const id = requestIdleCallback(() => void loader());
    return () => cancelIdleCallback(id);
  }, [idlePrefetch, loader]);

  useEffect(() => {
    if (!active || Content !== null) return;
    let live = true;
    void loader()
      .then((module) => {
        // Wrap in an updater: plain function arguments get invoked by the state setter.
        if (live) setContent(() => module.default);
      })
      .catch((error) => {
        console.error("[Lazy] the loader failed:", error);
        if (live && error instanceof Error) setContent(() => <div>{error.message}</div>);
      });
    return () => {
      live = false;
    };
  }, [active, Content, loader]);

  return Content === null ? placeholder : <Content />;
}
