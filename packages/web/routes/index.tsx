import CapitalLookup from "@/islands/CapitalLookup.tsx";

export default function HomePage() {
  return (
    <main class="container mx-auto px-4 py-8">
      <div class="hero mb-8">
        <div class="hero-content text-center">
          <div>
            <h1 class="text-4xl font-bold">Essayist</h1>
            <p class="py-4 text-base-content/70">
              AI-powered tools built on OpenRouter
            </p>
          </div>
        </div>
      </div>
      <CapitalLookup />
    </main>
  );
}
