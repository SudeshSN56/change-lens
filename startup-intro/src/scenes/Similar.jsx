// Similar tiles, white: tile 02353 and the five tiles with the closest change pattern, as the app ranks them
// (src/search.py SimilarityIndex over the index, shown as "N% match" like components/ui.jsx).
import { C } from "../theme";
import { FadeUp, LevelBadge, Overlay, Page, ScaleIn, SHADOW } from "../ui";

// [tile, sector, % of frame changed, similarity]
const SIMILAR = [
  ["03247", "Shanghai", 25.9, 0.9895],
  ["03586", "Hangzhou", 29.6, 0.9891],
  ["09587", "Chengdu", 4.5, 0.9839],
  ["02637", "Chengdu", 44.4, 0.9836],
  ["02330", "Hangzhou", 26.7, 0.9781],
];

export function Similar() {
  return (
    <Page>
      <FadeUp style={{ fontSize: 64, fontWeight: 600, letterSpacing: "-0.03em", marginBottom: 40 }}>Find similar changes.</FadeUp>
      <ScaleIn start={6}>
        <div
          style={{
            width: 1560, display: "flex", gap: 50, padding: 36, background: C.white, border: `1px solid ${C.line}`,
            borderRadius: 18, boxShadow: SHADOW,
          }}
        >
          <div style={{ width: 320, flex: "none", paddingRight: 50, borderRight: `1px solid ${C.line}` }}>
            <div style={{ fontSize: 23, fontWeight: 600, marginBottom: 18 }}>Tile 02353</div>
            <Overlay src="ov_02353.png" size={300} radius={12} />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, fontSize: 19 }}>
              <span>Chengdu · 70.5%</span>
              <LevelBadge pct={70.5} />
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 23, fontWeight: 600 }}>Tiles with a similar change pattern</div>
            <div style={{ fontSize: 17, color: C.muted, marginTop: 4 }}>Ranked by cosine similarity of the 36-cell transition signature</div>
            <div style={{ display: "flex", gap: 22, marginTop: 26 }}>
              {SIMILAR.map(([id, sector, pct, sim], i) => (
                <FadeUp key={id} start={16 + i * 6} rise={32}>
                  <Overlay src={`ov_${id}.png`} size={190} />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, marginTop: 10, fontVariantNumeric: "tabular-nums" }}>
                    <span style={{ fontWeight: 500 }}>{id}</span>
                    <span style={{ color: C.muted }}>{pct.toFixed(1)}%</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 17, marginTop: 4 }}>
                    <span style={{ color: C.muted }}>{sector}</span>
                    <span style={{ color: C.accent, fontWeight: 600 }}>{Math.round(sim * 100)}% match</span>
                  </div>
                </FadeUp>
              ))}
            </div>
          </div>
        </div>
      </ScaleIn>
    </Page>
  );
}
