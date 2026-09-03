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
        <span class="whitespace-nowrap text-xs">
          {formatCount(stats.wordCount.value, "word")}
        </span>
      )}
      <WaveBars fill amplitude={ready ? 0 : 1} />
    </div>
  );
}
