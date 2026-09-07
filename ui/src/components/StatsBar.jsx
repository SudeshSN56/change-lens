import React from "react";

export default function StatsBar({ stats }) {
  if (!stats) return null;
  return (
    <p className="text-xs text-gray-400">
      Total: {stats.total} · Confirmed: {stats.confirmed} · Rejected: {stats.rejected} · Pending: {stats.pending}
    </p>
  );
}
