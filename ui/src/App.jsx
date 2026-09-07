import React, { useState, useEffect } from "react";
import StatsBar from "./components/StatsBar.jsx";
import SearchPanel from "./components/SearchPanel.jsx";
import ReviewQueue from "./components/ReviewQueue.jsx";
import DiscoveryPanel from "./components/DiscoveryPanel.jsx";
import { api } from "./api.js";

export default function App() {
  const [tab, setTab] = useState("search");
  const [discoveryResults, setDiscoveryResults] = useState([]);
  const [stats, setStats] = useState(null);

  const refreshStats = async () => setStats(await api.reviewStats());
  useEffect(() => { refreshStats(); }, []);

  const showSimilar = async (tileId) => {
    const results = await api.searchImage(tileId, 12);
    setDiscoveryResults(results);
    setTab("discover");
  };

  return (
    <div className="min-h-screen">
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <h1 className="text-xl font-semibold mb-3">Geospatial Semantic Indexer &amp; Change Detection</h1>
        <nav className="flex gap-2 mb-2">
          {["search", "review", "discover"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-md text-sm capitalize ${
                tab === t ? "bg-blue-600" : "bg-gray-800 hover:bg-gray-700"
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
        <StatsBar stats={stats} />
      </header>

      <main className="p-6">
        {tab === "search" && <SearchPanel onFindSimilar={showSimilar} />}
        {tab === "review" && <ReviewQueue onDecided={refreshStats} />}
        {tab === "discover" && <DiscoveryPanel results={discoveryResults} />}
      </main>
    </div>
  );
}
