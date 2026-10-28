import { renderMarkdown } from "#/utils/markdown.ts";

interface MarkdownViewProps {
  content: string;
  class?: string;
}

export default function MarkdownView({ content, class: className = "" }: MarkdownViewProps) {
  return (
    <div
      class={`text-[0.85rem] prose max-w-none ${className}`}
      // the html comes from renderMarkdown, which sanitizes it
      dangerouslySetInnerHTML={{
        __html: renderMarkdown(content),
      }}
    />
  );
}
