import type { Signal } from "@preact/signals";
import type { ComponentChildren } from "preact";

import { CategoryForm } from "#/components/admin/forms/CategoryForm.tsx";
import { ModelPoolForm } from "#/components/admin/forms/ModelPoolForm.tsx";
import { PromptForm } from "#/components/admin/forms/PromptForm.tsx";
import { ReviewPassForm } from "#/components/admin/forms/ReviewPassForm.tsx";
import { ReviewUnitForm } from "#/components/admin/forms/ReviewUnitForm.tsx";
import MarkSwatches from "#/components/admin/MarkSwatches.tsx";
import type { DialogRequest } from "#/components/admin/types.ts";
import Dialog from "#/components/ui/Dialog.tsx";

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
  let aside: ComponentChildren;
  switch (request.kind) {
    case "pool":
      form = <ModelPoolForm entity={request.entity} open={open} />;
      break;
    case "prompt":
      form = <PromptForm entity={request.entity} open={open} />;
      break;
    case "category":
      form = <CategoryForm entity={request.entity} open={open} />;
      aside = <MarkSwatches />;
      break;
    case "pass":
      form = <ReviewPassForm entity={request.entity} open={open} />;
      break;
    case "unit":
      form = <ReviewUnitForm pass={request.pass} unitId={request.unitId} open={open} />;
      break;
  }
  return (
    <Dialog open={open} aside={aside}>
      <div key={stamp}>{form}</div>
    </Dialog>
  );
}
