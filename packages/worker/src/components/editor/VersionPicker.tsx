import { useSignal } from "@preact/signals";
import { assertExists } from "@std/assert";
import { sortBy } from "@std/collections";
import { ChevronDown, CircleDashed, LockKeyhole } from "lucide-preact";
import type { ComponentChild } from "preact";

import { CircleCheckIcon } from "#/components/ui/icons.tsx";
import Swappable from "#/components/ui/Swappable.tsx";
import WaveBars from "#/components/ui/WaveBars.tsx";
import { useBooting } from "#/hooks/useBooting.ts";
import { useClickOutside } from "#/hooks/useClickOutside.ts";
import { useTick } from "#/hooks/useTick.ts";
import { PENDING_VERSION_ID } from "#/models/fileContent.ts";
import { usePreferences } from "#/models/preferences.ts";
import { showToast } from "#/models/utils/toast.ts";
import { useEditorModels } from "#/pages/editor/models.ts";
import { formatDateTime, formatRelativeTime } from "#/utils/format.ts";
import { META_KEY } from "#/utils/platform.ts";

function useFileLoading(): boolean {
  const booting = useBooting();
  const file = useEditorModels().fileContents.current.value;
  assertExists(file, "FileViewerBody mounts VersionPicker only with a file");
  return file.loading.value || file.state.value === null || booting.value;
}

function SaveStatus() {
  useTick(30_000);
  const pending = useFileLoading();
  const { autoSave } = usePreferences();
  const file = useEditorModels().fileContents.current.value;
  assertExists(file, "VersionPicker renders SaveStatus only with a file");
  const { saving, saveError, dirty, draft, version } = file;

  const savedAt = pending ? undefined : (draft.value?.timestamp ?? version.value?.timestamp);
  const isPendingVersion = version.value?.version_id === PENDING_VERSION_ID;
  const action = isPendingVersion ? "Created" : "Saved";

  let label: ComponentChild | null = null;
  let statusKey = "";
  if (!pending) {
    statusKey = action.toLowerCase();
    label = savedAt === undefined ? action : `${action} ${formatRelativeTime(savedAt)}`;
    if (saving.value) {
      statusKey = "saving";
      label = "Saving...";
    } else if (dirty.value && saveError.value) {
      statusKey = "failed";
      label = "Save failed";
    } else if (dirty.value) {
      statusKey = "dirty";
      label = autoSave.value ? (
        "Save pending..."
      ) : (
        <span class="inline-flex items-baseline gap-1">
          <kbd>{META_KEY}</kbd>
          <kbd>S</kbd> to save changes
        </span>
      );
    }
  }

  const saved = !pending && !saving.value && !dirty.value;

  return (
    <span class="inline-flex items-center gap-1">
      {!pending && (
        <Swappable swapKey={saved ? "check" : "dashed"} class="swap-rotate shrink-0">
          {saved ? (
            <CircleCheckIcon class="text-float-ink" />
          ) : (
            <CircleDashed class="text-accent animate-[spin_3s_linear_infinite]" />
          )}
        </Swappable>
      )}
      <Swappable swapKey={statusKey} class="swap-shift" fluid>
        {label}
      </Swappable>
    </span>
  );
}

function VersionChip({ timestamp, lock }: { timestamp: number; lock?: boolean }) {
  return (
    <span class="inline-flex items-center gap-1">
      {lock && <LockKeyhole />}
      <span class="leading-none">{formatDateTime(timestamp)}</span>
    </span>
  );
}

export default function VersionPicker() {
  const open = useSignal(false);
  const close = () => (open.value = false);
  const ref = useClickOutside(open.value ? close : undefined);

  const { fileContents, fileTrees, selected, fileVersions, writable } = useEditorModels();
  const file = fileContents.current.value;
  assertExists(file, "FileViewerBody mounts VersionPicker only with a file");
  const versions = fileVersions.current.value;
  const selection = selected.value;
  const versionId = selection?.versionId ?? null;
  const list = sortBy(versions?.versions.value ?? [], (version) => version.timestamp, {
    order: "desc",
  });
  const selectedVersion = versions?.byId(versionId);
  const pending = useFileLoading();
  const active = file.saving.value || pending;

  const promotable =
    writable.value &&
    selection?.versionId !== PENDING_VERSION_ID &&
    (file.draft.value !== null || file.dirty.value);

  async function promoteDraft(dismiss: () => void): Promise<void> {
    dismiss();
    assertExists(file, "the promoted file exists");
    const promoted = await file.promote();
    if (!promoted) {
      showToast(file.promoteError.value || "Promote failed", "error");
      return;
    }
    void fileTrees.current.value?.load();
    void versions?.load();
  }

  return (
    <div class="aq-melt inline-flex" ref={ref}>
      <button
        type="button"
        class="aq-btn relative"
        aria-expanded={open.value}
        onClick={() => (open.value = !open.value)}
      >
        <WaveBars fill amplitude={active ? 0.5 : 0} class="text-float-ink" />
        <Swappable
          swapKey={writable.value ? "latest" : "pinned"}
          class="swap-shift items-center h-[1em]"
          fluid
        >
          {!writable.value && selectedVersion ? (
            <VersionChip timestamp={selectedVersion.timestamp} lock />
          ) : (
            <SaveStatus />
          )}
        </Swappable>
        {!pending && <ChevronDown class="aq-chevron" />}
      </button>
      <div class={`aq-dropdown ${open.value ? "is-open" : ""}`}>
        <div class="aq-menu">
          <ul class="aq-menu-rows" data-aq-stagger>
            {list.map((version) => (
              <li key={version.version_id}>
                <button
                  type="button"
                  class={`aq-menu-btn ${version.version_id === versionId ? "is-selected" : ""}`}
                  onClick={() => {
                    fileTrees.current.value?.selectVersion(version.version_id);
                    close();
                  }}
                >
                  <VersionChip timestamp={version.timestamp} />
                </button>
              </li>
            ))}
          </ul>
        </div>
        {import.meta.env.DEV && promotable ? (
          <button type="button" class="aq-btn" onClick={() => void promoteDraft(close)}>
            Promote draft
          </button>
        ) : null}
      </div>
    </div>
  );
}
