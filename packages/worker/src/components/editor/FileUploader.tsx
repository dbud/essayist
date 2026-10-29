import { useSignal } from "@preact/signals";
import { Upload } from "lucide-preact";

import { batchFailureMessage, formatBatchResult } from "#/models/utils/batch.ts";
import { showToast, showTaskToast } from "#/models/utils/toast.ts";
import { useEditorModels } from "#/pages/editor/models.ts";
import { type DroppedFile, filesFromFileInput, readFilesAsText } from "#/utils/fileUpload.ts";
import { formatCount } from "#/utils/format.ts";

// The upload button + hidden file input. Selections are read as text
// (binaries skipped and reported) and upserted to the workspace through
// the batch runner; a task toast mirrors progress and settles with counts.
export default function FileUploader() {
  const uploading = useSignal(false);
  const { fileTrees } = useEditorModels();

  async function handleUpload(items: DroppedFile[]) {
    if (uploading.value) {
      showToast("An upload is already running");
      return;
    }
    const tree = fileTrees.current.value;
    if (tree === null) {
      showToast("No workspace selected", "error");
      return;
    }
    uploading.value = true;
    try {
      const { uploads, skipped } = await readFilesAsText(items);
      if (uploads.length === 0) {
        showToast(
          skipped.length === 0
            ? "No text files to upload"
            : `No text files to upload (${formatCount(skipped.length, "binary file")} skipped)`,
        );
        return;
      }
      const task = showTaskToast(`Uploading ${formatCount(uploads.length, "file")}…`);
      try {
        const result = await tree.uploadFiles(uploads, {
          skipped,
          onProgress: (done, total) => task.step(`Uploading ${done}/${total}…`, { done, total }),
        });
        task.settle(formatBatchResult("Uploaded", result, "file"), result.failed.length === 0);
      } catch (err) {
        task.settle(batchFailureMessage(err, "Uploaded", "file"), false);
      }
    } finally {
      uploading.value = false;
    }
  }

  function onInputChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    void handleUpload(filesFromFileInput(input.files));
    // Reset so selecting the same files again still fires `change`.
    input.value = "";
  }

  return (
    <label class="btn" title="Upload files" data-tooltip="Upload a file from my computer">
      <Upload size={14} />
      Upload file&hellip;
      <input type="file" multiple class="hidden" onChange={onInputChange} />
    </label>
  );
}
