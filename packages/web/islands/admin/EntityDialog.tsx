import type { Signal } from "@preact/signals";
import type { ComponentChildren } from "preact";
import Dialog from "@/components/ui/Dialog.tsx";
import { CategoryForm } from "@/islands/admin/forms/CategoryForm.tsx";
import { ModelPoolForm } from "@/islands/admin/forms/ModelPoolForm.tsx";
import { PromptForm } from "@/islands/admin/forms/PromptForm.tsx";
import { ReviewPassForm } from "@/islands/admin/forms/ReviewPassForm.tsx";
import type { DialogRequest } from "@/islands/admin/types.ts";

export default function EntityDialog({
  open,
  request,
  stamp,
}: {
  open: Signal<boolean>;
  request: DialogRequest | null;
  stamp: number;
}) {
  if (!request) return null;
  let form: ComponentChildren;
  switch (request.kind) {
    case "pool":
      form = <ModelPoolForm entity={request.entity} open={open} />;
      break;
    case "prompt":
      form = <PromptForm entity={request.entity} open={open} />;
      break;
    case "category":
      form = <CategoryForm entity={request.entity} open={open} />;
      break;
    case "pass":
      form = <ReviewPassForm entity={request.entity} open={open} />;
      break;
  }
  return (
    <Dialog open={open}>
      <div key={stamp}>{form}</div>
    </Dialog>
  );
}
