import React from "react";

export default function DiscoveryPanel({ results }) {
  if (results.length === 0) {
    return <p className="text-gray-500 text-sm">Click "Find similar" on a search result to see related tiles here.</p>;
  }
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
      {results.map((item) => (
        <div key={item.tile_id} className="bg-gray-900 border border-gray-800 rounded-lg p-2 text-xs">
          <p className="truncate">{item.tile_id}</p>
        </div>
      ))}
    </div>
  );
}
