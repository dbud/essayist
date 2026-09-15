import type { Category } from "@essayist/core";

export function CategoriesExport({ categories }: { categories: Category[] }) {
  const json = JSON.stringify(categories, null, 2);
  return (
    <div class="flex flex-col stack stack--col shadow-md">
      <div class="flex stack stack--row">
        <div class="cell min-w-0 flex-1">export</div>
        <button
          type="button"
          class="btn"
          onClick={() => navigator.clipboard.writeText(json)}
        >
          copy
        </button>
      </div>
      <div class="grid stack stack--row">
        <div class="cell--data max-h-80 min-w-0 overflow-auto">
          <pre class="min-w-0 font-mono text-xs whitespace-pre-wrap">
            {json}
          </pre>
        </div>
      </div>
    </div>
  );
}
