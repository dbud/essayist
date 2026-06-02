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
    <div>
      <h2>Country Capital Lookup</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          lookup();
        }}
      >
        <input
          type="text"
          value={country}
          onInput={(e) => setCountry(e.currentTarget.value)}
          placeholder="Enter a country..."
        />
        <button type="submit" disabled={loading}>
          {loading ? "Looking up…" : "Look up"}
        </button>
      </form>
      {capital && (
        <p>
          <strong>Capital:</strong> {capital}
        </p>
      )}
      {error && <p style="color: red;">Error: {error}</p>}
    </div>
  );
}
