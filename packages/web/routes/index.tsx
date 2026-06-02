import { add } from "@essayist/core";

export default function HomePage() {
  const result = add(2, 3);

  return (
    <main>
      <h1>@essayist/web</h1>
      <p>add(2, 3) = {result}</p>
    </main>
  );
}
