import type { CategoryData } from "#/models/categories.data.ts";

export function CategoriesExport({ categories }: { categories: readonly CategoryData[] }) {
  const json = JSON.stringify(categories, null, 2);
  return (
    <div class="flex flex-col swiss-stack swiss-stack--col shadow-md">
      <div class="flex swiss-stack swiss-stack--row">
        <div class="swiss-cell min-w-0 flex-1">export</div>
        <button type="button" class="swiss-btn" onClick={() => navigator.clipboard.writeText(json)}>
          copy
        </button>
      </div>
      <div class="grid swiss-stack swiss-stack--row">
        <div class="swiss-cell--data max-h-80 min-w-0 overflow-auto">
          <pre class="min-w-0 font-mono text-xs whitespace-pre-wrap">{json}</pre>
        </div>
      </div>
    </div>
  );
}
