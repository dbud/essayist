import type { JSX } from "preact";
import type { HomeData } from "./loader";

export interface HomePageProps {
  readonly data: HomeData;
}

export function HomePage({ data }: HomePageProps): JSX.Element {
  return (
    <main>
      <h1>essayist</h1>
      <p>{data.message}</p>
      <p>rendered by hono + preact at {data.renderedAt}</p>
    </main>
  );
}
