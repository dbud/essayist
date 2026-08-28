import type { Category, ModelPool, Prompt, ReviewPass } from "@essayist/core";
import type { ComponentChildren } from "preact";
import WaveBars from "@/components/ui/WaveBars.tsx";
import Section from "@/islands/Section.tsx";
import { getAdminConfig } from "@/signals/admin.ts";

function Empty() {
  return <p class="text-sm text-ink/60">None configured.</p>;
}

function Meta({ label, value }: { label: string; value: ComponentChildren }) {
  return (
    <div class="text text-ink/80">
      <span class="text-ink/60">{label}: </span>
      {value}
    </div>
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
    <div class="text-sm p-2 rounded">
      <div class="flex items-center gap-2 mb-1">
        <span class="font-semibold">{pass.name}</span>
        {active && <span class="badge badge--success">active</span>}
        <span class="text-ink/40 text-xs ml-auto">{pass.id}</span>
      </div>
      <div class="flex flex-col gap-0.5">
        <Meta label="pool" value={pass.modelPoolId} />
        <Meta label="system" value={pass.systemPromptKey} />
        <Meta label="directive" value={pass.directivePromptKey} />
        {pass.instructionsPromptKey && (
          <Meta label="instructions" value={pass.instructionsPromptKey} />
        )}
        <Meta label="tools" value={pass.enabledTools.join(", ")} />
        <Meta label="categories" value={pass.allowedCategoryIds.join(", ")} />
        <Meta label="max rounds" value={pass.maxRounds} />
      </div>
    </div>
  );
}

function ModelPoolRow({ pool }: { pool: ModelPool }) {
  return (
    <div class="text-sm p-2 rounded">
      <div class="flex items-center gap-2 mb-1">
        <span class="font-semibold">{pool.name}</span>
        <span class="text-ink/40 text-xs ml-auto">{pool.id}</span>
      </div>
      <Meta label="models" value={pool.models.join(", ")} />
      {pool.apiKeyEnvKey && (
        <Meta label="api key env" value={pool.apiKeyEnvKey} />
      )}
    </div>
  );
}

function PromptRow({ prompt }: { prompt: Prompt }) {
  return (
    <div class="text-sm p-2 rounded">
      <div class="flex items-center gap-2 mb-1">
        <span class="font-mono text-xs">{prompt.key}</span>
        {prompt.variables && prompt.variables.length > 0 && (
          <span class="text-ink/40 text-xs">
            ({prompt.variables.join(", ")})
          </span>
        )}
      </div>
      <div class="text-xs text-ink/70 line-clamp-3 whitespace-pre-wrap">
        {prompt.body}
      </div>
    </div>
  );
}

function CategoryRow({ category }: { category: Category }) {
  return (
    <div class="text-sm p-2 rounded">
      <div class="flex items-center gap-2">
        <span class="badge badge--accent">{category.label}</span>
        {category.label !== category.id && (
          <span class="text-xs">{category.id}</span>
        )}
        {category.description && (
          <span class="text-xs">{category.description}</span>
        )}
      </div>
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

  if (loading.value && modelPools.value.length === 0) {
    return <WaveBars />;
  }
  if (error.value) {
    return <p class="text-sm text-ink/60">{error.value}</p>;
  }

  return (
    <div class="flex flex-col gap-10">
      <Section title="Review passes">
        {reviewPasses.value.length === 0 ? (
          <Empty />
        ) : (
          <div class="flex flex-col gap-2">
            {reviewPasses.value.map((p) => (
              <ReviewPassRow
                key={p.id}
                pass={p}
                active={p.id === activeReviewPassId.value}
              />
            ))}
          </div>
        )}
      </Section>
      <Section title="Model pools">
        {modelPools.value.length === 0 ? (
          <Empty />
        ) : (
          <div class="flex flex-col gap-2">
            {modelPools.value.map((p) => (
              <ModelPoolRow key={p.id} pool={p} />
            ))}
          </div>
        )}
      </Section>
      <Section title="Prompts">
        {prompts.value.length === 0 ? (
          <Empty />
        ) : (
          <div class="flex flex-col gap-2">
            {prompts.value.map((p) => (
              <PromptRow key={p.key} prompt={p} />
            ))}
          </div>
        )}
      </Section>
      <Section title="Categories">
        {categories.value.length === 0 ? (
          <Empty />
        ) : (
          <div class="flex flex-col gap-2">
            {categories.value.map((c) => (
              <CategoryRow key={c.id} category={c} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
