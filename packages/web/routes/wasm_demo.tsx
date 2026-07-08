import WasmSortDemo from "@/islands/WasmSortDemo.tsx";

export default function WasmDemoPage() {
  return (
    <main class="p-8 flex flex-col gap-4">
      <h1 class="text-xl font-semibold">WASM worker demo</h1>
      <WasmSortDemo />
    </main>
  );
}
