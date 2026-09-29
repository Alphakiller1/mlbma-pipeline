import { AbsoluteFill, Img, staticFile, useVideoConfig } from "remotion";
import { BrandLockup, TeamLogo } from "../ds/kit";
import { League } from "../teams";
import "../fonts";

/** A real chase-analytics.com component, captured by `python -m outputs.video_thumb`. */
export type DeskArtifact = {
  /** Path under public/, e.g. "thumbs/2026-09-29-PHI-ATL-starters.png". */
  src: string;
  /** Captured pixel size. */
  width: number;
  height: number;
  /** The band to show, as fractions of the capture height (the top of a section reads best). */
  cropTop?: number;
  cropBottom?: number;
};

export type ThumbnailDeskProps = {
  league: League;
  away: string;
  home: string;
  /** Small caps over the headline, e.g. "MLB · Matchup Analysis". */
  eyebrow: string;
  /** The hook: two to four words, e.g. "Luzardo vs Sale". */
  title: string;
  /** One short accent line under it, e.g. "Phillies at Braves". */
  sub?: string;
  /** Chip beside the eyebrow, e.g. "Wild Card" or "Week 4". */
  badge?: string;
  artifact: DeskArtifact;
};

/**
 * THE series thumbnail: the site's desk look at feed-tile size. Every video gets the
 * same frame - black page, the headline band on top and a real site component in a
 * thin violet-edged card underneath - so the channel reads as one
 * product. Only the props change per video (teams, words, which component).
 *
 *   python -m outputs.video_thumb --league mlb --game PHI@ATL --title "Luzardo vs Sale"
 *
 * Colours and faces are the site's semantic tokens. Kept deliberately quiet (owner,
 * 2026-09-29: "cleaner, darker"): pure black, no grid, no club tints, a flat card.
 */
export const ThumbnailDesk: React.FC<ThumbnailDeskProps> = ({ league, away, home, eyebrow, title, sub, badge, artifact }) => {
  const { width, height } = useVideoConfig();
  const u = height / 720; // designed at 1280x720

  const top = artifact.cropTop ?? 0;
  const bottom = artifact.cropBottom ?? 1;
  // Every site section is a wide band, so the component runs the full width under the
  // headline, big enough that its numbers still read on a phone's feed tile.
  const cardW = 1230 * u;
  const scale = cardW / artifact.width;
  const cardH = Math.min(artifact.height * (bottom - top) * scale, 380 * u);
  const titleSize = Math.min(138, 1150 / Math.max(1, title.length * 0.5)) * u;

  return (
    <AbsoluteFill style={{ background: "var(--surface-page)", overflow: "hidden", fontFamily: "var(--font-body)" }}>
      {/* ground: the site's black, one faint violet glow under the component - nothing else */}
      <AbsoluteFill
        style={{ background: "radial-gradient(ellipse 60% 45% at 50% 82%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 75%)" }}
      />

      {/* headline band */}
      <div style={{ position: "absolute", left: 56 * u, right: 56 * u, top: 50 * u, display: "flex", flexDirection: "column", gap: 10 * u }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12 * u,
            fontWeight: 700,
            fontSize: 22 * u,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: "var(--text-accent)",
          }}
        >
          <span style={{ width: 34 * u, height: 3 * u, background: "var(--accent)", borderRadius: 2 * u }} />
          {eyebrow}
          {badge ? (
            <span
              style={{
                marginLeft: 6 * u,
                padding: `${6 * u}px ${16 * u}px`,
                borderRadius: 999,
                border: `${2 * u}px solid var(--accent)`,
                background: "color-mix(in srgb, var(--accent) 18%, transparent)",
                fontFamily: "var(--font-display)",
                fontWeight: 800,
                fontSize: 22 * u,
                letterSpacing: "0.04em",
                lineHeight: 1,
                color: "var(--text-primary)",
              }}
            >
              {badge}
            </span>
          ) : null}
        </div>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: titleSize,
            lineHeight: 0.95,
            letterSpacing: "-0.01em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
            color: "var(--text-primary)",
          }}
        >
          {title}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 * u, filter: `drop-shadow(0 ${6 * u}px ${12 * u}px rgba(0,0,0,0.6))` }}>
          <TeamLogo team={away} league={league} size={62 * u} />
          {sub ? (
            <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 44 * u, lineHeight: 1, textTransform: "uppercase", color: "var(--text-accent)" }}>
              {sub}
            </span>
          ) : null}
          <TeamLogo team={home} league={league} size={62 * u} />
        </div>
      </div>

      {/* the site component */}
      <div
        style={{
          position: "absolute",
          left: (width - cardW) / 2,
          bottom: 58 * u,
          width: cardW,
          height: cardH,
          borderRadius: 14 * u,
          overflow: "hidden",
          border: `${1.5 * u}px solid color-mix(in srgb, var(--accent) 60%, transparent)`,
          boxShadow: `0 0 ${40 * u}px color-mix(in srgb, var(--accent) 22%, transparent)`,
          background: "var(--surface-card)",
        }}
      >
        <Img
          src={staticFile(artifact.src)}
          style={{ position: "absolute", left: 0, top: -artifact.height * top * scale, width: cardW, height: artifact.height * scale }}
        />
      </div>


      <div style={{ position: "absolute", right: 56 * u, top: 42 * u }}>
        <BrandLockup size={28 * u} />
      </div>
    </AbsoluteFill>
  );
};
