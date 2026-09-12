import { useEffect, useState } from "react";

let push = null;

export const tip = {
  show: (e, content) => push?.({ x: e.clientX, y: e.clientY, content }),
  showEl: (el, content) => {
    const r = el.getBoundingClientRect();
    push?.({ x: r.left + r.width / 2, y: r.bottom, content });
  },
  hide: () => push?.(null),
};

export function TipLayer() {
  const [state, setState] = useState(null);
  useEffect(() => {
    push = setState;
    return () => {
      push = null;
    };
  }, []);
  if (!state) return null;
  const left = Math.max(8, Math.min(state.x + 14, window.innerWidth - 270));
  const top = state.y + 130 > window.innerHeight ? state.y - 96 : state.y + 16;
  return (
    <div className="tip" style={{ left, top }} role="tooltip">
      {state.content}
    </div>
  );
}
