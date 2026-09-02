import type { Category, ModelPool, Prompt, ReviewPass } from "@essayist/core";
import { getToolInfos } from "@essayist/core";
import { useSignal } from "@preact/signals";
import type { ComponentChildren } from "preact";
import { EntityCard, NewButton } from "@/components/ui/EntityCard.tsx";
import { Field } from "@/components/ui/EntityRows.tsx";
import Tabs, { type TabItem } from "@/components/ui/Tabs.tsx";
import WaveBars from "@/components/ui/WaveBars.tsx";
import EntityDialog from "@/islands/admin/EntityDialog.tsx";
import { CategoryRow } from "@/islands/admin/rows/CategoryRow.tsx";
import { ModelPoolRow } from "@/islands/admin/rows/ModelPoolRow.tsx";
import { PromptRow } from "@/islands/admin/rows/PromptRow.tsx";
import { ReviewPassRow } from "@/islands/admin/rows/ReviewPassRow.tsx";
import type { DialogRequest } from "@/islands/admin/types.ts";
import { getAdminConfig } from "@/signals/admin.ts";

type TabKey = "passes" | "pools" | "prompts" | "categories" | "tools";

const TAB_ITEMS: TabItem<TabKey>[] = [
  { value: "passes", label: "Review passes" },
  { value: "pools", label: "Model pools" },
  { value: "prompts", label: "Prompts" },
  { value: "categories", label: "Categories" },
  { value: "tools", label: "Tools" },
];

function Empty() {
  return <p class="text-sm text-ink/60">None configured.</p>;
}

export default function AdminConfig() {
  const {
    modelPools,
    prompts,
    categories,
    reviewPasses,
    activeReviewPassId,
    loading,
    error,
    mutating,
    deleteModelPool,
    deletePrompt,
    deleteCategory,
    deleteReviewPass,
    setActiveReviewPass,
  } = getAdminConfig();
  const tab = useSignal<TabKey>("passes");
  const dialogOpen = useSignal(false);
  const dialogRequest = useSignal<DialogRequest | null>(null);
  const dialogStamp = useSignal(0);

  function openEntity(request: DialogRequest) {
    dialogStamp.value += 1;
    dialogRequest.value = request;
    dialogOpen.value = true;
  }

  function removeModelPool(pool: ModelPool) {
    if (!confirm(`Delete model pool "${pool.name}"?`)) return;
    void deleteModelPool(pool.id);
  }

  function removePrompt(prompt: Prompt) {
    if (!confirm(`Delete prompt "${prompt.key}"?`)) return;
    void deletePrompt(prompt.key);
  }

  function removeCategory(category: Category) {
    if (!confirm(`Delete category "${category.label}"?`)) return;
    void deleteCategory(category.id);
  }

  function removeReviewPass(pass: ReviewPass) {
    if (!confirm(`Delete review pass "${pass.name}"?`)) return;
    void deleteReviewPass(pass.id);
  }

  function activateReviewPass(pass: ReviewPass) {
    void setActiveReviewPass(pass.id);
  }

  const loadingEmpty = loading.value && modelPools.value.length === 0;

  let body: ComponentChildren;
  if (error.value) {
    body = <p class="text-sm text-ink/60">{error.value}</p>;
  } else if (loadingEmpty) {
    body = null;
  } else {
    switch (tab.value) {
      case "passes":
        body = (
          <div class="flex flex-col gap-10">
            <NewButton
              label="New review pass"
              onClick={() => openEntity({ kind: "pass" })}
            />
            {reviewPasses.value.length === 0 ? (
              <Empty />
            ) : (
              reviewPasses.value.map((p) => (
                <ReviewPassRow
                  key={p.id}
                  pass={p}
                  prompts={prompts.value}
                  active={p.id === activeReviewPassId.value}
                  busy={mutating.value}
                  showActivate={p.id !== activeReviewPassId.value}
                  onActivate={() => activateReviewPass(p)}
                  onEdit={() => openEntity({ kind: "pass", entity: p })}
                  onDelete={() => removeReviewPass(p)}
                />
              ))
            )}
          </div>
        );
        break;
      case "pools":
        body = (
          <div class="flex flex-col gap-10">
            <NewButton
              label="New model pool"
              onClick={() => openEntity({ kind: "pool" })}
            />
            {modelPools.value.length === 0 ? (
              <Empty />
            ) : (
              modelPools.value.map((p) => (
                <ModelPoolRow
                  key={p.id}
                  pool={p}
                  busy={mutating.value}
                  onEdit={() => openEntity({ kind: "pool", entity: p })}
                  onDelete={() => removeModelPool(p)}
                />
              ))
            )}
          </div>
        );
        break;
      case "prompts":
        body = (
          <div class="flex flex-col gap-10">
            <NewButton
              label="New prompt"
              onClick={() => openEntity({ kind: "prompt" })}
            />
            {prompts.value.length === 0 ? (
              <Empty />
            ) : (
              prompts.value.map((p) => (
                <PromptRow
                  key={p.key}
                  prompt={p}
                  busy={mutating.value}
                  onEdit={() => openEntity({ kind: "prompt", entity: p })}
                  onDelete={() => removePrompt(p)}
                />
              ))
            )}
          </div>
        );
        break;
      case "categories":
        body = (
          <div class="flex flex-col gap-10">
            <NewButton
              label="New category"
              onClick={() => openEntity({ kind: "category" })}
            />
            {categories.value.length === 0 ? (
              <Empty />
            ) : (
              categories.value.map((c) => (
                <CategoryRow
                  key={c.id}
                  category={c}
                  busy={mutating.value}
                  onEdit={() => openEntity({ kind: "category", entity: c })}
                  onDelete={() => removeCategory(c)}
                />
              ))
            )}
          </div>
        );
        break;
      case "tools":
        body = (
          <div class="flex flex-col gap-10">
            {getToolInfos().map((tool) => (
              <EntityCard key={tool.name} title={tool.name} actions={null}>
                <Field label="description" value={tool.description} />
                <Field label="instruction" value={tool.instruction} />
                <div class="cell--data col-span-2 min-w-0">
                  <pre class="whitespace-pre-wrap font-mono">
                    {JSON.stringify(tool.parameters, null, 2)}
                  </pre>
                </div>
              </EntityCard>
            ))}
          </div>
        );
        break;
    }
  }

  return (
    <>
      <div class="z-toolbar flex flex-col bg-surface shadow-md">
        <div class="content-layout">
          <div class="content-main min-w-0">
            {loadingEmpty ? (
              <WaveBars class="h-10" />
            ) : (
              <Tabs
                class="w-fit"
                items={TAB_ITEMS}
                value={tab.value}
                onChange={(v) => (tab.value = v)}
              />
            )}
          </div>
        </div>
      </div>
      <div class="flex-1 min-h-0 overflow-y-auto bg-surface">
        <div class="content-layout">
          <div class="content-main min-w-0 flex flex-col py-10">{body}</div>
        </div>
      </div>
      <EntityDialog
        open={dialogOpen}
        request={dialogRequest.value}
        stamp={dialogStamp.value}
      />
    </>
  );
}
