import { AbsoluteFill, Img, staticFile } from "remotion";
import { League, teamColors } from "../teams";
import "../fonts";

/** One graded number as the site shows it: value, rank and the site's own grade colour. */
export type CoverStat = { value: string; rank?: string; color?: string };
export type CoverRow = { label: string; away: CoverStat; home: CoverStat };
export type CoverSide = {
  abbr: string;
  /** e.g. "Steelers" */
  name: string;
  record?: string;
  logo: string;
  /** The featured player (the QB): name and headshot under public/ */
  player: string;
  headshot?: string;
  role?: string;
};

export type InstaCoverProps = {
  league: League;
  /** e.g. "NFL · Week 4 · Thu 8:15 PM ET · Prime Video" */
  eyebrow: string;
  away: CoverSide;
  home: CoverSide;
  rows: CoverRow[];
  /** e.g. "Huntington Bank Field · Cleveland, OH" */
  venue?: string;
  /** Call to the rest of the carousel */
  cta?: string;
  /** "circle": headshots in rings (NFL.com crops). "cutout": transparent cutouts standing
   *  on each club's colour field (MLB's silo portraits) - the bigger hook. */
  faces?: "circle" | "cutout";
};

/**
 * Carousel cover (1080x1350): the hook that leads the matchup posts. Faces first - each
 * featured player large over his club's colour (rings, or cutouts on a split field) - then the matchup, and a
 * short tale of the tape in the site's own numbers and grade colours (evidence, never a
 * verdict: no row says who it favours). Flat by request: no glow, no decorative lines.
 */
export const InstaCover: React.FC<InstaCoverProps> = ({ league, eyebrow, away, home, rows, venue, cta, faces = "circle" }) => {
  const a = teamColors(away.abbr, league).primary;
  const h = teamColors(home.abbr, league).primary;
  const title = `${away.name} @ ${home.name}`;
  const cutout = faces === "cutout";
  const titleSize = Math.min(cutout ? 84 : 104, 960 / Math.max(1, title.length * 0.5));
  const titleTop = cutout ? 722 : 600;
  const tapeTop = cutout ? 818 : 748;
  const rowPad = cutout ? "14px 0" : "20px 0";

  /* Cutout hero: each player stands on his club's colour, split on a diagonal and
     fading to black under the names. Flat colour, no glow. */
  const half = (side: "away" | "home"): React.CSSProperties => ({
    position: "absolute",
    top: 0,
    left: 0,
    width: 1080,
    height: 760,
    background: `color-mix(in srgb, ${side === "away" ? a : h} 42%, var(--surface-page))`,
    clipPath: side === "away" ? "polygon(0 0, 57% 0, 43% 100%, 0 100%)" : "polygon(57% 0, 100% 0, 100% 100%, 43% 100%)",
    maskImage: "linear-gradient(180deg, #000 0%, #000 58%, transparent 100%)",
  });
  const Cutout: React.FC<{ s: CoverSide; side: "away" | "home" }> = ({ s, side }) =>
    s.headshot ? (
      <Img
        src={staticFile(s.headshot)}
        style={{
          position: "absolute",
          top: 78,
          [side === "away" ? "left" : "right"]: -34,
          width: 600,
          height: 600,
          objectFit: "contain",
          maskImage: "linear-gradient(180deg, #000 0%, #000 70%, transparent 96%)",
        }}
      />
    ) : null;
  const Nameplate: React.FC<{ s: CoverSide; side: "away" | "home" }> = ({ s, side }) => (
    <div style={{ width: 500, display: "flex", flexDirection: "column", alignItems: side === "away" ? "flex-start" : "flex-end", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexDirection: side === "away" ? "row" : "row-reverse" }}>
        <Img src={staticFile(s.logo)} style={{ width: 64, height: 64, objectFit: "contain" }} />
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 56, lineHeight: 1, textTransform: "uppercase", whiteSpace: "nowrap" }}>{s.player}</div>
      </div>
      <div style={{ fontSize: 22, fontWeight: 600, color: "var(--text-secondary)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
        {[s.role, s.name, s.record].filter(Boolean).join(" · ")}
      </div>
    </div>
  );

  const Face: React.FC<{ s: CoverSide; side: "away" | "home" }> = ({ s, side }) => (
    <div style={{ width: 440, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
      <div style={{ position: "relative", width: 330, height: 330 }}>
        <div
          style={{
            width: 330,
            height: 330,
            borderRadius: "50%",
            overflow: "hidden",
            background: "var(--surface-card)",
            border: "2px solid var(--border-subtle)",
          }}
        >
          {s.headshot ? <Img src={staticFile(s.headshot)} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 20%" }} /> : null}
        </div>
        <Img
          src={staticFile(s.logo)}
          style={{ position: "absolute", width: 112, height: 112, objectFit: "contain", bottom: -6, [side === "away" ? "left" : "right"]: -10 }}
        />
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 44, lineHeight: 1, textTransform: "uppercase" }}>{s.player}</div>
        <div style={{ marginTop: 8, fontSize: 22, fontWeight: 600, color: "var(--text-secondary)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
          {[s.role, s.name, s.record].filter(Boolean).join(" · ")}
        </div>
      </div>
    </div>
  );

  const Num: React.FC<{ s: CoverStat; align: "left" | "right" }> = ({ s, align }) => (
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, justifyContent: align === "left" ? "flex-start" : "flex-end" }}>
      <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 46, lineHeight: 1, color: s.color || "var(--text-primary)" }}>{s.value}</span>
      {s.rank ? (
        <span
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: 22,
            padding: "4px 8px",
            borderRadius: 6,
            color: s.color || "var(--text-secondary)",
            background: s.color ? `color-mix(in srgb, ${s.color} 14%, transparent)` : "transparent",
          }}
        >
          {s.rank}
        </span>
      ) : null}
    </div>
  );

  return (
    <AbsoluteFill style={{ background: "var(--surface-page)", color: "var(--text-primary)", fontFamily: "var(--font-body)", overflow: "hidden" }}>
      {cutout ? (
        <>
          <div style={half("away")} />
          <div style={half("home")} />
          <Cutout s={away} side="away" />
          <Cutout s={home} side="home" />
        </>
      ) : (
        /* each club's colour, faint, on its own half - identity without noise */
        <AbsoluteFill
          style={{
            background: `linear-gradient(90deg, color-mix(in srgb, ${a} 26%, transparent) 0%, transparent 50%, color-mix(in srgb, ${h} 26%, transparent) 100%)`,
            maskImage: "linear-gradient(180deg, #000 0%, #000 30%, transparent 62%)",
          }}
        />
      )}

      {/* eyebrow */}
      <div
        style={{
          position: "absolute",
          top: 44,
          left: 0,
          right: 0,
          textAlign: "center",
          fontWeight: 700,
          fontSize: 25,
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          color: "var(--text-accent)",
        }}
      >
        {eyebrow}
      </div>

      {/* faces */}
      {cutout ? (
        <>
          <div
            style={{
              position: "absolute",
              top: 318,
              left: 0,
              right: 0,
              textAlign: "center",
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: 112,
              lineHeight: 1,
              color: "var(--text-primary)",
            }}
          >
            VS
          </div>
          <div style={{ position: "absolute", top: 606, left: 44, right: 44, display: "flex", justifyContent: "space-between" }}>
            <Nameplate s={away} side="away" />
            <Nameplate s={home} side="home" />
          </div>
        </>
      ) : (
        <div style={{ position: "absolute", top: 112, left: 40, right: 40, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <Face s={away} side="away" />
          <div style={{ alignSelf: "center", marginTop: -90, fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 64, color: "var(--text-secondary)" }}>VS</div>
          <Face s={home} side="home" />
        </div>
      )}

      {/* the matchup */}
      <div
        style={{
          position: "absolute",
          top: titleTop,
          left: 0,
          right: 0,
          textAlign: "center",
          fontFamily: "var(--font-display)",
          fontWeight: 800,
          fontSize: titleSize,
          lineHeight: 1,
          textTransform: "uppercase",
          whiteSpace: "nowrap",
        }}
      >
        {title}
      </div>

      {/* tale of the tape */}
      <div
        style={{
          position: "absolute",
          top: tapeTop,
          left: 44,
          right: 44,
          borderRadius: 18,
          background: "var(--surface-card)",
          border: "1px solid var(--border-subtle)",
          padding: "18px 30px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 20, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--text-secondary)", paddingBottom: 10 }}>
          <span>{away.name}</span>
          <span style={{ color: "var(--text-accent)" }}>Tale of the Tape</span>
          <span>{home.name}</span>
        </div>
        {rows.map((r, i) => (
          <div
            key={r.label}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto 1fr",
              alignItems: "center",
              gap: 16,
              padding: rowPad,
              borderTop: i === 0 ? "1px solid var(--border-subtle)" : "1px solid var(--border-subtle)",
            }}
          >
            <Num s={r.away} align="left" />
            <span style={{ fontSize: 21, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-secondary)", textAlign: "center", minWidth: 260 }}>
              {r.label}
            </span>
            <Num s={r.home} align="right" />
          </div>
        ))}
      </div>

      {/* footer */}
      <div style={{ position: "absolute", left: 44, right: 44, bottom: 30, display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Img src={staticFile("brand/chase-icon.png")} style={{ width: 30, height: 30, objectFit: "contain" }} />
            <span style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 700, fontSize: 26, textTransform: "uppercase" }}>
              Chase <span style={{ color: "var(--text-secondary)" }}>Analytics</span>
            </span>
          </div>
          {venue ? <span style={{ fontSize: 20, color: "var(--text-secondary)" }}>{venue}</span> : null}
        </div>
        {cta ? (
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: 28,
              textTransform: "uppercase",
              padding: "12px 22px",
              borderRadius: 999,
              border: "2px solid var(--accent)",
              color: "var(--text-primary)",
            }}
          >
            {cta}
          </span>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
