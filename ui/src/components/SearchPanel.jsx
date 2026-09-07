import React, { useState } from "react";
import { api } from "../api.js";

export default function SearchPanel({ onFindSimilar }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);

  const runSearch = async () => {
    if (!query.trim()) return;
    setResults(await api.searchText(query));
  };

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && runSearch()}
          placeholder="e.g. newly built structures near a river"
          className="flex-1 bg-gray-800 border border-gray-700 rounded-md px-3 py-2 text-sm"
        />
        <button onClick={runSearch} className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-md text-sm">
          Search
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {results.map((item) => (
          <div key={item.tile_id} className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
            <div className="h-28 bg-gray-800 flex items-center justify-center text-xs text-gray-500">
              tile preview
            </div>
            <div className="p-2 text-xs space-y-1">
              <p className="truncate">{item.tile_id}</p>
              <p className="text-gray-400">sim: {item._distance?.toFixed?.(3) ?? "-"}</p>
              <button
                onClick={() => onFindSimilar(item.tile_id)}
                className="w-full bg-gray-800 hover:bg-gray-700 rounded py-1"
              >
                Find similar
              </button>
            </div>
          </div>
        ))}
        {results.length === 0 && <p className="text-gray-500 text-sm">No results yet — try a search.</p>}
      </div>
    </div>
  );
}
