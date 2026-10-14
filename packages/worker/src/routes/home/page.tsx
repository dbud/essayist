import { useSignal } from "@preact/signals";
import type { JSX } from "preact";
import type { HomeData } from "./loader";

function Counter() {
  const count = useSignal(0);
  return (
    <p>
      <button
        type="button"
        onClick={() => {
          count.value -= 1;
        }}
      >
        -
      </button>
      <span style="padding: 0 0.75rem;">{String(count.value)}</span>
      <button
        type="button"
        onClick={() => {
          count.value += 1;
        }}
      >
        +
      </button>
    </p>
  );
}

export interface HomePageProps {
  readonly data: HomeData;
}

export function HomePage({ data }: HomePageProps): JSX.Element {
  return (
    <main>
      <h1>essayist</h1>
      <p>{data.message}</p>
      <p>rendered by hono + preact at {data.renderedAt}</p>
      <Counter />
    </main>
  );
}

export function homePage(data: HomeData): JSX.Element {
  return <HomePage data={data} />;
}
