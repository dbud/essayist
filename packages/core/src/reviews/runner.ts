import type { Agent } from "@/agent.ts";
import { renderPrompt } from "@/config/template.ts";
import type { ResolvedReviewPass, ToolName } from "@/config/types.ts";
import type { ReviewStore } from "@/reviews/store.ts";
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

/** Run a review pass over `fileId` and record a ReviewRun. */
export async function runReviewPass(
  agent: Agent,
  vfs: VFS,
  reviewStore: ReviewStore,
  pass: ResolvedReviewPass,
  workspaceId: string,
  fileId: string,
): Promise<ReviewRun> {
  const run = await reviewStore.createRun(
    workspaceId,
    fileId,
    pass.reviewPass.id,
  );

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
    );
    const summary = await result.getText();
    return (await reviewStore.completeRun(workspaceId, run.id, summary)) ?? run;
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return (await reviewStore.failRun(workspaceId, run.id, error)) ?? run;
  }
}
