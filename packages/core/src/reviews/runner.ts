import type { Agent } from "@/agent.ts";
import { renderPrompt } from "@/config/template.ts";
import type { ResolvedReviewPass, ToolName } from "@/config/types.ts";
import type { ReviewStore } from "@/reviews/store.ts";
import type { TraceStore } from "@/reviews/trace.ts";
import type { ReviewRun } from "@/reviews/types.ts";
import type { ToolPrompt } from "@/tools/index.ts";
import {
  createGrepTool,
  createListFilesTool,
  createMarkTool,
  createReadFileTool,
  createWriteFileTool,
} from "@/tools/index.ts";
import type { VFS } from "@/vfs/types.ts";

function buildTools(
  enabledTools: readonly ToolName[],
  vfs: VFS,
  allowedLabels: readonly string[],
): ToolPrompt[] {
  const tools: ToolPrompt[] = [];
  for (const name of enabledTools) {
    switch (name) {
      case "read_file":
        tools.push(createReadFileTool(vfs));
        break;
      case "list_files":
        tools.push(createListFilesTool(vfs));
        break;
      case "grep":
        tools.push(createGrepTool(vfs));
        break;
      case "mark":
        tools.push(createMarkTool(vfs, { allowedLabels: [...allowedLabels] }));
        break;
      case "write_file":
        tools.push(createWriteFileTool(vfs));
        break;
    }
  }
  return tools;
}

/** Options for {@linkcode runReviewPass}. */
export interface RunReviewPassOptions {
  agent: Agent;
  vfs: VFS;
  reviewStore: ReviewStore;
  traceStore?: TraceStore;
  pass: ResolvedReviewPass;
  workspaceId: string;
  fileId: string;
}

/** Run a review pass over `fileId` and record a ReviewRun. */
export async function runReviewPass({
  agent,
  vfs,
  reviewStore,
  traceStore,
  pass,
  workspaceId,
  fileId,
}: RunReviewPassOptions): Promise<ReviewRun> {
  const run = await reviewStore.createRun({
    workspaceId,
    fileId,
    reviewPassId: pass.reviewPass.id,
  });
  const recorder = traceStore?.recorder({ workspaceId, runId: run.id });

  try {
    const tools = buildTools(
      pass.reviewPass.enabledTools,
      vfs,
      pass.allowedLabels,
    );
    const directive = renderPrompt(pass.directive, { file: fileId });
    const input = `${pass.systemPrompt}\n\n${pass.instructions}\n\n${directive}`;
    const result = agent.callModelWithTools(
      input,
      tools,
      pass.modelRefs,
      pass.reviewPass.maxRounds,
      recorder,
    );
    recorder?.follow(result);
    const summary = await result.getText();
    await recorder?.flush();
    return (
      (await reviewStore.completeRun({ workspaceId, id: run.id, summary })) ??
      run
    );
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    recorder?.record({ type: "error", error });
    await recorder?.flush();
    return (
      (await reviewStore.failRun({ workspaceId, id: run.id, error })) ?? run
    );
  }
}
