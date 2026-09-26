import type {
  Artifact,
  Artifacts,
  ArtifactType,
  FlowTypes,
  NodeKind,
  NodeRunner,
} from "@/flow/types.ts";

/** Spec carried on a forwarding node's payload. */
export interface ForwardSpec<T extends FlowTypes> {
  /** Artifact types to re-emit from inputs. */
  types: ReadonlyArray<ArtifactType<T>>;
}

/** Spec carried on a conditional forwarding node's payload. */
export interface PassWhenSpec<T extends FlowTypes> {
  /** Forward only while this holds over dependency artifacts. */
  when: (inputs: Artifacts<T>) => boolean;
  /** Artifact types to forward. */
  types: ReadonlyArray<ArtifactType<T>>;
}

/** Re-emit the selected dependency artifact types, unchanged; the original
 * producer is kept. */
export function forward<
  T extends FlowTypes,
  K extends NodeKind<T>,
>(): NodeRunner<T, K> {
  return {
    execute: (payload, { inputs }) => {
      // The payload is trusted to be this kind's spec.
      const spec = payload as ForwardSpec<T>;
      return Promise.resolve(picked(inputs, spec.types));
    },
  };
}

/** Forward the selected types while a predicate holds; complete with no
 * artifacts otherwise. */
export function passWhen<
  T extends FlowTypes,
  K extends NodeKind<T>,
>(): NodeRunner<T, K> {
  return {
    execute: (payload, { inputs }) => {
      // The payload is trusted to be this kind's spec.
      const spec = payload as PassWhenSpec<T>;
      if (!spec.when(inputs)) {
        return Promise.resolve([]);
      }
      return Promise.resolve(picked(inputs, spec.types));
    },
  };
}

function picked<T extends FlowTypes>(
  inputs: Artifacts<T>,
  types: ReadonlyArray<ArtifactType<T>>,
): Artifact<T>[] {
  return types.flatMap((type) =>
    inputs.all.filter(
      (artifact): artifact is Artifact<T, typeof type> =>
        artifact.type === type,
    ),
  );
}
