import { assert } from "@std/assert";
import type { ComponentChildren } from "preact";
import { createContext, h } from "preact";
import { useContext } from "preact/hooks";

export function createModelContext<M>(name: string) {
  const context = createContext<M | null>(null);

  function Provider(props: { readonly value: M; readonly children?: ComponentChildren }) {
    return h(context.Provider, props);
  }

  function use(): M {
    const value = useContext(context);
    assert(value, `${name} is only available inside ${name}Provider`);
    return value;
  }

  return { Provider, use };
}
