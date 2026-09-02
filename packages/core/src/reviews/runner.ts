import type { Agent } from "@/agent.ts";
import { renderPrompt } from "@/config/template.ts";
import type { ResolvedReviewPass, ToolName } from "@/config/types.ts";
import type { ReviewProgress } from "@/reviews/progress.ts";
import { ReviewProgressTracker } from "@/reviews/progress.ts";
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
import { PinnedVFS } from "@/vfs/pin.ts";
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
  /** Receives text-free progress snapshots as the run advances. */
  onProgress?: (progress: ReviewProgress) => void;
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
  onProgress,
}: RunReviewPassOptions): Promise<ReviewRun> {
  const versionId = (await vfs.getHistory(fileId)).at(-1)?.version_id;
  if (!versionId) {
    const missing = await reviewStore.createRun({
      workspaceId,
      fileId,
      reviewPassId: pass.reviewPass.id,
    });
    return (
      (await reviewStore.failRun({
        workspaceId,
        id: missing.id,
        error: `File not found: ${fileId}`,
      })) ?? missing
    );
  }

  const run = await reviewStore.createRun({
    workspaceId,
    fileId,
    reviewPassId: pass.reviewPass.id,
    versionId,
  });
  const progress = onProgress
    ? new ReviewProgressTracker(onProgress)
    : undefined;
  const recorder = traceStore?.recorder(
    { workspaceId, runId: run.id },
    progress ? (event) => progress.handle(event) : undefined,
  );
  const pinned = new PinnedVFS(vfs, { path: fileId, versionId });

  try {
    const tools = buildTools(
      pass.reviewPass.enabledTools,
      pinned,
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
    await pinned.migrateMarks(fileId, versionId);
    return (
      (await reviewStore.completeRun({ workspaceId, id: run.id, summary })) ??
      run
    );
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    recorder?.record({ type: "error", error });
    await recorder?.flush();
    // Marks placed before the failure are still valid annotations.
    await pinned.migrateMarks(fileId, versionId);
    return (
      (await reviewStore.failRun({ workspaceId, id: run.id, error })) ?? run
    );
  }
}
