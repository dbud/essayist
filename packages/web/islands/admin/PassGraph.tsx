import type { ReviewPass } from "@essayist/core";
import { signal } from "@preact/signals";
import { useEffect, useState } from "preact/hooks";
import { type Option, OptionsRow } from "@/components/ui/forms/OptionsRow.tsx";
import WaveBars from "@/components/ui/WaveBars.tsx";
import { getAdminConfig } from "@/signals/admin.ts";
import { showToast } from "@/signals/toast.ts";

interface PassGraphData {
  name: string;
  definition: string;
}

/** The definition of the pass graph in view, shared with the side panel. */
export const passGraphDefinition = signal<string | null>(null);

type MermaidApi = import("mermaid").Mermaid;

let mermaid: Promise<MermaidApi> | undefined;

function loadMermaid(): Promise<MermaidApi> {
  mermaid ??= import("mermaid").then((mod) => {
    mod.default.initialize({
      startOnLoad: false,
      themeVariables: { fontFamily: "var(--font-sans)" },
    });
    return mod.default;
  });
  return mermaid;
}

/** The built flow graph of a review pass, rendered with mermaid's
 * agentflow type and ELK layout. */
export default function PassGraph() {
  const admin = getAdminConfig();
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const passes = admin.reviewPasses.value;
  const passId = selected ?? admin.activeReviewPassId.value;
  const [graph, setGraph] = useState<PassGraphData | null>(null);
  const [svg, setSvg] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!passId) return;
    let cancelled = false;
    setGraph(null);
    setSvg("");
    setError(null);
    passGraphDefinition.value = null;
    fetch(`/api/admin/review-passes/${encodeURIComponent(passId)}/graph`)
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }
        return body as PassGraphData;
      })
      .then((data) => {
        if (!cancelled) {
          setGraph(data);
          passGraphDefinition.value = data.definition;
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [passId]);

  useEffect(() => {
    if (!graph) return;
    let cancelled = false;
    loadMermaid()
      .then((mermaid) =>
        mermaid.render(`pass-graph-${Date.now()}`, graph.definition),
      )
      .then(({ svg }) => {
        if (!cancelled) setSvg(svg);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [graph]);

  useEffect(() => {
    if (error) showToast(error, "error");
  }, [error]);

  if (passes.length === 0) {
    return <p class="text-sm">No review passes configured.</p>;
  }
  const options: Option[] = passes.map((p: ReviewPass) => ({
    value: p.id,
    label: p.name,
  }));

  return (
    <div class="flex flex-col gap-10">
      <div class="grid grid-cols-[auto_1fr] stack stack--row stack--col">
        <OptionsRow
          kind="radio"
          name="graph-pass"
          label="pass"
          options={options}
          values={[passId ?? ""]}
          onToggle={setSelected}
        />
      </div>
      {error && <p class="text-sm text-accent">Error:{error}</p>}
      {!error && !graph && <WaveBars class="h-10" />}
      {graph && (
        <div
          // deno-lint-ignore react-no-danger -- mermaid-rendered svg from our own definition
          dangerouslySetInnerHTML={{ __html: svg }}
          class="graph-svg min-w-0 overflow-x-auto bg-surface"
        />
      )}
    </div>
  );
}

/** The agentflow artifact of the pass graph in view. */
export function PassGraphSide() {
  const definition = passGraphDefinition.value;
  if (definition === null) return null;

  async function copy() {
    if (definition === null) return;
    await navigator.clipboard.writeText(definition);
    showToast("Definition copied", "success");
  }

  return (
    <div class="flex flex-col stack stack--col shadow-md">
      <div class="flex stack stack--row">
        <div class="cell min-w-0 flex-1">agentflow definition</div>
        <button type="button" class="btn" onClick={copy}>
          copy
        </button>
      </div>
      <div class="grid stack stack--row">
        <div class="cell--data max-h-80 min-w-0 overflow-auto">
          <pre class="min-w-0 font-mono text-xs whitespace-pre-wrap">
            {definition}
          </pre>
        </div>
      </div>
    </div>
  );
}
