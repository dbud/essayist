import type { JSX } from "preact";
import { type HomeModels, HomeModelsProvider, useHomeModels } from "./models";

function Counter() {
  const { votes } = useHomeModels();
  return (
    <div>
      <p>{votes.summary.value}</p>
      <p>
        <button type="button" onClick={votes.dec}>
          -
        </button>
        <span style="padding: 0 0.75rem;">{votes.count.value}</span>
        <button type="button" onClick={votes.inc}>
          +
        </button>
      </p>
    </div>
  );
}

export function HomePage(): JSX.Element {
  const models = useHomeModels();
  return (
    <main>
      <h1>essayist</h1>
      <p>{models.pageInfo.message.value}</p>
      <p>rendered by hono + preact at {models.pageInfo.renderedAt.value}</p>
      <Counter />
    </main>
  );
}

export function HomeTree(models: HomeModels): JSX.Element {
  return (
    <HomeModelsProvider value={models}>
      <HomePage />
    </HomeModelsProvider>
  );
}
