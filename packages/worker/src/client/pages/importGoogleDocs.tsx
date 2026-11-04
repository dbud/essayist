import { boot } from "#/client/boot.tsx";
import { openGooglePicker } from "#/client/googlePicker.ts";
import type { GooglePickerData } from "#/pages/import/googleDocs/data.ts";
import ImportGoogleDocsPage from "#/pages/import/googleDocs/page.tsx";

void boot((data: GooglePickerData) => (
  <ImportGoogleDocsPage data={data} openGooglePicker={openGooglePicker} />
));
