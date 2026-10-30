import type { Category, ModelPool, Prompt, ReviewPass } from "@essayist/core";
import { useSignal } from "@preact/signals";
import type { ComponentChildren } from "preact";

import { CategoriesExport } from "#/components/admin/CategoriesExport.tsx";
import EntityDialog from "#/components/admin/EntityDialog.tsx";
import MarkSwatches from "#/components/admin/MarkSwatches.tsx";
import PassGraph, { PassGraphSide } from "#/components/admin/PassGraph.tsx";
import { CategoryRow } from "#/components/admin/rows/CategoryRow.tsx";
import { ModelPoolRow } from "#/components/admin/rows/ModelPoolRow.tsx";
import { PromptRow } from "#/components/admin/rows/PromptRow.tsx";
import { ReviewPassRow } from "#/components/admin/rows/ReviewPassRow.tsx";
import type { DialogRequest } from "#/components/admin/types.ts";
import { NewButton } from "#/components/admin/ui/EntityCard.tsx";
import Tabs, { type TabItem } from "#/components/admin/ui/Tabs.tsx";
import WaveBars from "#/components/ui/WaveBars.tsx";
import { type AdminTab, usePreferences } from "#/models/preferences.ts";
import { useAdminModels } from "#/pages/admin/models.ts";

const TAB_ITEMS: TabItem<AdminTab>[] = [
  { value: "passes", label: "Review passes" },
  { value: "graph", label: "Graph" },
  { value: "pools", label: "Model pools" },
  { value: "prompts", label: "Prompts" },
  { value: "categories", label: "Categories" },
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
    updateReviewPass,
  } = useAdminModels().admin;
  const { adminTab } = usePreferences();
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

  function removeUnit(pass: ReviewPass, unitId: string) {
    const referring = pass.units.filter((u) => u.inputs?.includes(unitId)).map((u) => u.id);
    const warning =
      referring.length > 0 ? ` It is referenced as input by: ${referring.join(", ")}.` : "";
    if (!confirm(`Delete unit "${unitId}" from pass "${pass.name}"?${warning}`)) {
      return;
    }
    void updateReviewPass(pass.id, {
      ...pass,
      units: pass.units.filter((u) => u.id !== unitId),
    });
  }

  const loadingEmpty = loading.value && modelPools.value.length === 0;

  let body: ComponentChildren;
  let side: ComponentChildren;
  if (error.value) {
    body = <p class="text-sm text-ink/60">{error.value}</p>;
  } else if (loadingEmpty) {
    body = null;
  } else {
    switch (adminTab.value) {
      case "passes":
        body = (
          <div class="flex flex-col gap-10">
            <NewButton label="New review pass" onClick={() => openEntity({ kind: "pass" })} />
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
                  onDeleteUnit={(unitId) => removeUnit(p, unitId)}
                  onAddUnit={() => openEntity({ kind: "unit", pass: p })}
                  onEditUnit={(unitId) => openEntity({ kind: "unit", pass: p, unitId })}
                />
              ))
            )}
          </div>
        );
        break;
      case "graph":
        body = <PassGraph />;
        side = <PassGraphSide />;
        break;
      case "pools":
        body = (
          <div class="flex flex-col gap-10">
            <NewButton label="New model pool" onClick={() => openEntity({ kind: "pool" })} />
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
            <NewButton label="New prompt" onClick={() => openEntity({ kind: "prompt" })} />
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
        side = (
          <div class="flex flex-col gap-10">
            <MarkSwatches />
            <CategoriesExport categories={categories.value} />
          </div>
        );
        body = (
          <div class="flex flex-col gap-10">
            <NewButton label="New category" onClick={() => openEntity({ kind: "category" })} />
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
                value={adminTab.value}
                onChange={(v) => (adminTab.value = v)}
              />
            )}
          </div>
        </div>
      </div>
      <div class="flex-1 min-h-0 overflow-y-auto bg-surface">
        <div class={`content-layout ${side ? "content-layout--side" : ""}`}>
          <div class="content-main min-w-0 flex flex-col py-10">{body}</div>
          {side && <div class="content-side py-10">{side}</div>}
        </div>
      </div>
      <EntityDialog open={dialogOpen} request={dialogRequest.value} stamp={dialogStamp.value} />
    </>
  );
}
