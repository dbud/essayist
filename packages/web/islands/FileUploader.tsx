import { computed, effect } from "@preact/signals";
import { Upload } from "lucide-preact";
import { getFileTree } from "@/signals/fileTree.ts";
import { dismissToast, showToast } from "@/signals/toast.ts";
import { filesFromFileInput, readFilesAsText } from "@/utils/fileUpload.ts";

/**
 * The upload button + hidden file input. On selection, files are read as
 * text (binaries skipped), PUT to the workspace in parallel, and a toast in
 * the bottom-right mirrors the runner's progress signal.
 */
export default function FileUploader() {
  const files = getFileTree();
  if (!files) return null;
  const { uploadProgress, uploadFiles, clearUploadProgress } = files;

  async function handleUpload(items: { path: string; file: File }[]) {
    if (items.length === 0) return;
    const { uploads } = await readFilesAsText(items);
    if (uploads.length === 0) {
      showToast("No text files to upload", "info");
      return;
    }
    clearUploadProgress();
    const toast = showToast(`Uploading 0/${uploads.length}…`, "info", {
      done: 0,
      total: uploads.length,
    });
    const message = computed(() => {
      const p = uploadProgress.value;
      if (!p) return "";
      const { total, done, complete, errors } = p;
      return complete
        ? `Uploaded ${total} file${total === 1 ? "" : "s"}${
            errors.length > 0 ? ` (${errors.length} failed)` : ""
          }`
        : `Uploading ${done}/${total}…`;
    });
    // Subscribe to the progress signal and mirror it into the toast.
    // Disposed after the upload settles so we don't leak the subscription.
    const dispose = effect(() => {
      const p = uploadProgress.value;
      if (!p) return;
      const { total, done, complete, errors } = p;
      toast.value = {
        message: message.value,
        type: complete ? (errors.length > 0 ? "error" : "success") : "info",
        progress: complete ? undefined : { done, total },
      };
      if (complete) setTimeout(() => dismissToast(toast), 5000);
    });
    try {
      await uploadFiles(uploads);
    } finally {
      dispose();
      clearUploadProgress();
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
    <label class="btn btn-sm gap-2" title="Upload files">
      <Upload size={16} />
      Upload
      <input type="file" multiple class="hidden" onChange={onInputChange} />
    </label>
  );
}
