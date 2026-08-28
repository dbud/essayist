import type { Category, ModelPool, Prompt, ReviewPass } from "@essayist/core";
import { useSignal } from "@preact/signals";
import type { ComponentChildren } from "preact";
import Tabs, { type TabItem } from "@/components/ui/Tabs.tsx";
import WaveBars from "@/components/ui/WaveBars.tsx";
import { getAdminConfig } from "@/signals/admin.ts";

type TabKey = "passes" | "pools" | "prompts" | "categories";

const TAB_ITEMS: TabItem<TabKey>[] = [
  { value: "passes", label: "Review passes" },
  { value: "pools", label: "Model pools" },
  { value: "prompts", label: "Prompts" },
  { value: "categories", label: "Categories" },
];

function Empty() {
  return <p class="text-sm text-ink/60">None configured.</p>;
}

function Field({ label, value }: { label: string; value: ComponentChildren }) {
  return (
    <>
      <div class="cell--data text-ink/60">{label}</div>
      <div class="cell--data min-w-0">{value}</div>
    </>
  );
}

function FieldLong({
  label,
  value,
}: {
  label: string;
  value: ComponentChildren;
}) {
  return (
    <>
      <div class="cell--data text-ink/60">{label}</div>
      <div class="cell--data min-w-0 break-words">{value}</div>
    </>
  );
}

function List({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <>
      <div class="cell--data text-ink/60">{label}</div>
      <div class="cell--data flex-col min-w-0 break-words">
        {items.map((item) => (
          <div>{item}</div>
        ))}
      </div>
    </>
  );
}

function ReviewPassRow({
  pass,
  active,
}: {
  pass: ReviewPass;
  active: boolean;
}) {
  return (
    <div class="grid grid-cols-[auto_1fr] stack stack--col">
      <div class="cell cell--ink col-span-full flex gap-2">
        <span>{pass.name}</span>
        {active && <span class="badge badge--success self-start">active</span>}
        <span class="ml-auto text-surface/40 font-mono">{pass.id}</span>
      </div>
      <Field label="pool" value={pass.modelPoolId} />
      <Field label="system" value={pass.systemPromptKey} />
      <Field label="directive" value={pass.directivePromptKey} />
      {pass.instructionsPromptKey && (
        <Field label="instructions" value={pass.instructionsPromptKey} />
      )}
      <List label="tools" items={pass.enabledTools} />
      <List label="categories" items={pass.allowedCategoryIds} />
      <Field label="max rounds" value={pass.maxRounds} />
    </div>
  );
}

function ModelPoolRow({ pool }: { pool: ModelPool }) {
  return (
    <div class="grid grid-cols-[auto_1fr] stack stack--col">
      <div class="cell cell--ink col-span-full flex gap-2">
        <span>{pool.name}</span>
        <span class="ml-auto text-surface/40 font-mono">{pool.id}</span>
      </div>
      <List label="models" items={pool.models} />
      {pool.apiKeyEnvKey && (
        <Field label="api key env" value={pool.apiKeyEnvKey} />
      )}
    </div>
  );
}

function PromptRow({ prompt }: { prompt: Prompt }) {
  return (
    <div class="grid grid-cols-[auto_1fr] stack stack--col">
      <div class="cell cell--ink col-span-full flex gap-2">
        <span>{prompt.key}</span>
        {prompt.variables && prompt.variables.length > 0 && (
          <span class="text-surface">
            variables: ({prompt.variables.join(", ")})
          </span>
        )}
      </div>
      <FieldLong label="body" value={prompt.body} />
      {prompt.variables && prompt.variables.length > 0 && (
        <List label="variables" items={prompt.variables} />
      )}
    </div>
  );
}

function CategoryRow({ category }: { category: Category }) {
  return (
    <div class="grid grid-cols-[auto_1fr] stack stack--col">
      <div class="cell cell--ink col-span-full flex gap-2">
        <span class="badge badge--accent self-start">{category.label}</span>
        {category.label !== category.id && (
          <span class="text-surface/60">{category.id}</span>
        )}
      </div>
      {category.description && (
        <FieldLong label="description" value={category.description} />
      )}
    </div>
  );
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
  } = getAdminConfig();
  const tab = useSignal<TabKey>("passes");

  let body: ComponentChildren;
  if (error.value) {
    body = <p class="text-sm text-ink/60">{error.value}</p>;
  } else if (loading.value && modelPools.value.length === 0) {
    body = <WaveBars />;
  } else {
    switch (tab.value) {
      case "passes":
        body =
          reviewPasses.value.length === 0 ? (
            <Empty />
          ) : (
            <div class="flex flex-col gap-10">
              {reviewPasses.value.map((p) => (
                <ReviewPassRow
                  key={p.id}
                  pass={p}
                  active={p.id === activeReviewPassId.value}
                />
              ))}
            </div>
          );
        break;
      case "pools":
        body =
          modelPools.value.length === 0 ? (
            <Empty />
          ) : (
            <div class="flex flex-col gap-10">
              {modelPools.value.map((p) => (
                <ModelPoolRow key={p.id} pool={p} />
              ))}
            </div>
          );
        break;
      case "prompts":
        body =
          prompts.value.length === 0 ? (
            <Empty />
          ) : (
            <div class="flex flex-col gap-10">
              {prompts.value.map((p) => (
                <PromptRow key={p.key} prompt={p} />
              ))}
            </div>
          );
        break;
      case "categories":
        body =
          categories.value.length === 0 ? (
            <Empty />
          ) : (
            <div class="flex flex-col gap-10">
              {categories.value.map((c) => (
                <CategoryRow key={c.id} category={c} />
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
            <Tabs
              class="w-fit"
              items={TAB_ITEMS}
              value={tab.value}
              onChange={(v) => (tab.value = v)}
            />
          </div>
        </div>
      </div>
      <div class="flex-1 min-h-0 overflow-y-auto bg-surface">
        <div class="content-layout">
          <div class="content-main min-w-0 flex flex-col py-10">{body}</div>
        </div>
      </div>
    </>
  );
}
