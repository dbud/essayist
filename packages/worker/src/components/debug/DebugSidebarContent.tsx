import ExportPreviewSection from "#/components/debug/ExportPreviewSection.tsx";
import LexicalTreeViewSection from "#/components/debug/LexicalTreeViewSection.tsx";
import MarksSection from "#/components/debug/MarksSection.tsx";
import ReviewHistorySection from "#/components/debug/ReviewHistorySection.tsx";

export default function DebugSidebarContent() {
  return (
    <>
      <ExportPreviewSection />
      <ReviewHistorySection />
      <MarksSection />
      <LexicalTreeViewSection />
    </>
  );
}
