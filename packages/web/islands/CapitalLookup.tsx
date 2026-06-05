import { useState } from "preact/hooks";

export default function CapitalLookup() {
  const [country, setCountry] = useState("");
  const [capital, setCapital] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function lookup() {
    if (!country.trim()) return;
    setLoading(true);
    setError(null);
    setCapital(null);

    try {
      const res = await fetch(
        `/api/capital?country=${encodeURIComponent(country)}`,
      );
      const data = await res.json();
      if (res.ok) {
        setCapital(data.capital);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div class="card bg-base-200 shadow-xl max-w-md mx-auto">
      <div class="card-body">
        <h2 class="card-title">Country Capital Lookup</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            lookup();
          }}
          class="flex flex-col gap-4"
        >
          <input
            type="text"
            value={country}
            onInput={(e) => setCountry(e.currentTarget.value)}
            placeholder="Enter a country..."
            class="input input-bordered w-full"
          />
          <button type="submit" class="btn btn-primary" disabled={loading}>
            {loading && (
              <span class="loading loading-spinner loading-sm">
              </span>
            )}
            {loading ? "Looking up…" : "Look up"}
          </button>
        </form>
        {capital && (
          <div class="alert alert-success mt-4">
            <span>
              <strong>Capital:</strong> {capital}
            </span>
          </div>
        )}
        {error && (
          <div class="alert alert-error mt-4">
            <span>Error: {error}</span>
          </div>
        )}
      </div>
    </div>
  );
}
