import WaveBars from "@/components/ui/WaveBars.tsx";
import { getFile } from "@/signals/file.ts";
import { getFileStats } from "@/signals/fileStats.ts";
import { formatCount } from "@/utils/format.ts";

interface FileStatsProps {
  wsId: string;
  path: string;
}

export default function FileStats({ wsId, path }: FileStatsProps) {
  const { state, loading } = getFile(wsId, path);
  const stats = getFileStats(wsId, path);
  const ready = !loading.value && state.value !== null;

  return (
    <div class="flex cell cell--data relative min-w-42">
      {ready && (
        <div class="flex flex-col leading-none whitespace-nowrap text-[0.7rem]">
          <span>{formatCount(stats.wordCount.value, "word")}</span>
          <span title="Characters (no spaces)">
            {formatCount(stats.charCount.value, "char")}
          </span>
          <span title="Characters (with spaces)">
            {formatCount(
              stats.charCountWithSpaces.value,
              "char w/ space",
              "chars w/ spaces",
            )}
          </span>
        </div>
      )}
      <WaveBars fill amplitude={ready ? 0 : 1} />
    </div>
  );
}
