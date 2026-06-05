import Chat from "@/islands/Chat.tsx";

const sampleFiles = ["essay.txt", "report.txt"];

export default function HomePage() {
  return (
    <main class="container mx-auto px-4 py-8">
      <div class="hero mb-8">
        <div class="hero-content text-center">
          <div>
            <h1 class="text-4xl font-bold">Essayist</h1>
            <p class="py-4 text-base-content/70">
              AI-powered tools for writing
            </p>
          </div>
        </div>
      </div>

      <div class="flex flex-wrap gap-1 text-xs justify-center mb-4">
        <span class="text-base-content/50">Available files:</span>
        {sampleFiles.map((f) => (
          <span key={f} class="badge badge-ghost badge-sm">{f}</span>
        ))}
      </div>

      <Chat />
    </main>
  );
}
