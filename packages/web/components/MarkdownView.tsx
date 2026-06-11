import { renderMarkdown } from "@/utils/markdown.ts";

interface MarkdownViewProps {
  content: string;
  class?: string;
}

export default function MarkdownView(
  { content, class: className = "" }: MarkdownViewProps,
) {
  return (
    <div
      class={`prose max-w-none ${className}`}
      // deno-lint-ignore react-no-danger
      dangerouslySetInnerHTML={{
        __html: renderMarkdown(content),
      }}
    />
  );
}
