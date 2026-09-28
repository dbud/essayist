import {
  agentflowDefinition,
  buildReviewGraph,
  ConfigInvalidError,
  ConfigMissingError,
  resolveReviewPass,
} from "@essayist/core";
import { define } from "@/define.ts";
import { configStore } from "@/store.ts";

/** The built flow graph of a review pass, as nodes, edges, and an
 * agentflow-beta definition for mermaid rendering. */
export const handler = {
  GET: define.handlers(async (ctx) => {
    const pass = await configStore.getReviewPass(ctx.params.id);
    if (!pass) {
      return Response.json(
        { error: `Review pass "${ctx.params.id}" not found` },
        { status: 404 },
      );
    }
    try {
      const resolved = await resolveReviewPass(configStore, pass);
      const graph = buildReviewGraph(resolved, "preview");
      return Response.json({
        name: pass.name,
        nodes: graph.nodes.map((node) => ({ id: node.id, kind: node.kind })),
        edges: graph.nodes.flatMap((node) =>
          node.dependsOn.map((dep) => ({ from: dep, to: node.id })),
        ),
        definition: agentflowDefinition(graph),
      });
    } catch (e) {
      if (e instanceof ConfigMissingError || e instanceof ConfigInvalidError) {
        return Response.json({ error: e.message }, { status: 400 });
      }
      throw e;
    }
  }),
};
