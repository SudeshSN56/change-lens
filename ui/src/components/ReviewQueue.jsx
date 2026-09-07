import React, { useEffect, useState } from "react";
import { api } from "../api.js";

export default function ReviewQueue({ onDecided }) {
  const [pairs, setPairs] = useState([]);

  const load = async () => setPairs(await api.reviewQueue());
  useEffect(() => { load(); }, []);

  const decide = async (id, decision) => {
    await api.reviewDecision(id, decision);
    onDecided();
    load();
  };

  if (pairs.length === 0) {
    return <p className="text-gray-500 text-sm">No pending candidates. Run ingestion first.</p>;
  }

  return (
    <div className="space-y-3">
      {pairs.map((pair) => (
        <div key={pair.id} className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex items-center gap-6">
          <div className="text-xs text-gray-400 w-40">
            <p className="font-medium text-gray-200">{pair.id.slice(0, 8)}</p>
            <p>Change score: {pair.change_score?.toFixed(3)}</p>
            <p>Rerank weight: {pair.rerank_weight?.toFixed(2)}</p>
          </div>
          <div className="flex gap-2 ml-auto">
            <button onClick={() => decide(pair.id, "confirmed")} className="bg-green-600 hover:bg-green-500 px-4 py-2 rounded-md text-sm">
              Confirm
            </button>
            <button onClick={() => decide(pair.id, "rejected")} className="bg-red-600 hover:bg-red-500 px-4 py-2 rounded-md text-sm">
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
