import { Zap } from "lucide-preact";

export default function ClearCache() {
  const clearCache = () => {
    localStorage.clear();
    location.reload();
  };

  return (
    <button
      type="button"
      class="btn btn-ghost btn-sm gap-2"
      onClick={clearCache}
    >
      <Zap size={16} />
      Clear cache
    </button>
  );
}
