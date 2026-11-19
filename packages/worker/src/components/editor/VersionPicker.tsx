import { useSignal } from "@preact/signals";
import { assertExists } from "@std/assert";
import { sortBy } from "@std/collections";
import { ChevronDown, CircleDashed, LockKeyhole, PencilLine } from "lucide-preact";

import AqSwap from "#/components/ui/AqSwap.tsx";
import { CircleCheckIcon, CountdownRingIcon } from "#/components/ui/icons.tsx";
import WaveBars from "#/components/ui/WaveBars.tsx";
import { useBooting } from "#/hooks/useBooting.ts";
import { useClickOutside } from "#/hooks/useClickOutside.ts";
import { useCountdown } from "#/hooks/useCountdown.ts";
import { useTick } from "#/hooks/useTick.ts";
import { PENDING_VERSION_ID, type FileContent } from "#/models/fileContent.ts";
import { usePreferences } from "#/models/preferences.ts";
import { showToast } from "#/models/utils/toast.ts";
import { useEditorModels } from "#/pages/editor/models.ts";
import { formatDateTime, formatRelativeTime } from "#/utils/format.ts";
import { META_KEY } from "#/utils/platform.ts";

function useFileLoading(): boolean {
  const booting = useBooting();
  const file = useEditorModels().fileContents.current.value;
  assertExists(file, "VersionPicker mounts only with a file");
  return file.loading.value || file.state.value === null || booting.value;
}

function VersionChip({ timestamp, lock }: { timestamp: number; lock?: boolean }) {
  return (
    <span class="inline-flex items-center gap-1">
      {lock && <LockKeyhole />}
      <span class="leading-none">{formatDateTime(timestamp)}</span>
    </span>
  );
}

// Counts down to the scheduled autosave: the ring drains with the time remaining since the last
// edit, reaching empty as the save fires. The dashed spinner takes over when autosave is off.
function SaveArc({ file, intervalSeconds }: { file: FileContent; intervalSeconds: number }) {
  const fraction = useCountdown(file.markdown, intervalSeconds);
  return <CountdownRingIcon fraction={fraction.value} />;
}

export default function VersionPicker() {
  const open = useSignal(false);
  const close = () => (open.value = false);
  const ref = useClickOutside(open.value ? close : undefined);

  const { fileContents, fileTrees, selected, fileVersions, writable } = useEditorModels();
  const file = fileContents.current.value;
  assertExists(file, "VersionPicker mounts only with a file");
  const versions = fileVersions.current.value;
  const selection = selected.value;
  const versionId = selection?.versionId ?? null;
  const list = sortBy(versions?.versions.value ?? [], (version) => version.timestamp, {
    order: "desc",
  });
  const hasVersions = list.length > 0;
  const selectedVersion = versions?.byId(versionId);
  const pending = useFileLoading();
  useTick(30_000);
  const { autoSave, autoSaveInterval } = usePreferences();
  const active = file.saving.value || pending;

  const saving = file.saving.value;
  const saveError = file.saveError.value;
  const dirty = file.dirty.value;
  const { draft, version: currentVersion } = file;
  const savedAt = pending ? undefined : (draft.value?.timestamp ?? currentVersion.value?.timestamp);
  const isPendingVersion = currentVersion.value?.version_id === PENDING_VERSION_ID;
  const saved = !pending && !saving && !dirty;

  const action = isPendingVersion ? "Created" : "Saved";
  // The key doubles as the rendered label: a swap fires exactly when the pill text changes,
  // relative time included.
  const [saveState, label] = (() => {
    if (pending) return ["pending", null] as const;
    if (saving) return ["saving", "Saving..."] as const;
    if (dirty && saveError) return ["failed", "Save failed"] as const;
    if (dirty) {
      return autoSave.value
        ? (["dirty", "Save pending..."] as const)
        : ([
            "kbd",
            <span class="inline-flex items-baseline gap-1">
              <kbd>{META_KEY}</kbd>
              <kbd>S</kbd> to save changes
            </span>,
          ] as const);
    }
    const text = savedAt === undefined ? action : `${action} ${formatRelativeTime(savedAt)}`;
    return [text, text] as const;
  })();
  const state = writable.value ? saveState : `pinned-${versionId ?? ""}`;

  const promotable =
    writable.value &&
    selection?.versionId !== PENDING_VERSION_ID &&
    (file.draft.value !== null || file.dirty.value);

  async function promoteDraft(dismiss: () => void): Promise<void> {
    dismiss();
    assertExists(file, "the promoted file exists");
    const promoted = await file.promote();
    if (!promoted) {
      showToast(file.promoteError.value || "Failed to save version", "error");
      return;
    }
    void fileTrees.current.value?.load();
    void versions?.load();
  }

  return (
    <div class="aq-melt inline-flex z-toolbar" ref={ref}>
      <AqSwap on={state}>
        <button
          type="button"
          class="aq-btn aq-btn--idle relative min-w-36"
          aria-expanded={hasVersions ? open.value : false}
          onClick={() => {
            if (hasVersions) open.value = !open.value;
          }}
        >
          <WaveBars fill amplitude={active ? 1 : 0} data-static />
          {!writable.value && selectedVersion ? (
            <VersionChip timestamp={selectedVersion.timestamp} lock />
          ) : (
            <>
              <span class={`swap-rotate${pending ? " invisible" : ""}`}>
                {saved ? (
                  <CircleCheckIcon />
                ) : autoSave.value ? (
                  <SaveArc file={file} intervalSeconds={autoSaveInterval.value} />
                ) : (
                  <CircleDashed class="text-(--btn-accent-ink) animate-[spin_3s_linear_infinite]" />
                )}
              </span>
              {!pending && label && <span>{label}</span>}
            </>
          )}
          {hasVersions && <ChevronDown class="aq-chevron" data-static />}
        </button>
      </AqSwap>
      {hasVersions && (
        <div class={`aq-dropdown ${open.value ? "is-open" : ""}`}>
          <div class="aq-menu">
            <ul class="aq-menu-rows" data-aq-stagger>
              {list.map((version, i) => (
                <li key={version.version_id}>
                  <button
                    type="button"
                    class={`aq-menu-btn ${version.version_id === versionId ? "is-selected" : ""}`}
                    onClick={() => {
                      fileTrees.current.value?.selectVersion(version.version_id);
                      close();
                    }}
                  >
                    <span class="flex flex-col items-start leading-tight">
                      <span class="flex items-center gap-1">
                        {i === 0 && <PencilLine class="size-3" />}
                        <VersionChip timestamp={version.timestamp} />
                      </span>
                      {i === 0 &&
                        draft.value !== null &&
                        draft.value.timestamp > version.timestamp + 60_000 && (
                          <span class="text-xs">
                            draft saved {formatRelativeTime(draft.value.timestamp)}
                          </span>
                        )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          {import.meta.env.DEV && promotable ? (
            <button type="button" class="aq-btn" onClick={() => void promoteDraft(close)}>
              Save version
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
