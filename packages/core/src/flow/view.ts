import type {
  Artifact,
  Artifacts,
  ArtifactType,
  FlowTypes,
} from "@/flow/types.ts";

/** The input view handed to a node. Type-scoped reads trust artifact
 * data to match the vocabulary's declared data types. */
export function view<T extends FlowTypes>(
  inputs: readonly Artifact<T>[],
): Artifacts<T> {
  const matching = <A extends ArtifactType<T>>(type: A): Artifact<T, A>[] =>
    inputs.filter(
      (artifact): artifact is Artifact<T, A> => artifact.type === type,
    );
  return {
    all: inputs,
    allOf: matching,
    of: <A extends ArtifactType<T>>(type: A): T["artifacts"][A][] =>
      matching(type).map((artifact) => artifact.data),
    one: <A extends ArtifactType<T>>(type: A): T["artifacts"][A] => {
      const matches = matching(type);
      if (matches.length !== 1) {
        throw new Error(
          `expected exactly one "${String(type)}" artifact, got ${matches.length}`,
        );
      }
      return matches[0].data;
    },
  };
}
