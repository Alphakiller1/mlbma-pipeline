import { AbsoluteFill, Img, staticFile } from "remotion";
import { League } from "../teams";
import "../fonts";

export type InstaMatchupProps = {
  league: League;
  /** e.g. "NL Wild Card · Game 1 · Tue 2:00 PM ET" */
  eyebrow: string;
  /** Club nicknames, e.g. "Phillies", "Braves" */
  awayName: string;
  homeName: string;
  /** Logo files under public/ (the site's own, dark-background variants) */
  awayLogo: string;
  homeLogo: string;
  /** The captured site section (public/ path) and its pixel size */
  artifact: { src: string; width: number; height: number };
  /** Small print under the section, e.g. "Projected orders until lineups are posted" */
  note?: string;
  /** "1/2" style marker for the carousel */
  page?: string;
};

/**
 * Instagram matchup post (1080x1350, 4:5): the site's black page, a header band naming
 * the game, and one real chase-analytics.com section filling the rest. Deliberately flat
 * (owner, 2026-09-29): no glow, no tilt, no decorative lines - the site's own component is
 * the picture. python -m outputs.insta_matchup makes the starters + offense pair per game.
 */
export const InstaMatchup: React.FC<InstaMatchupProps> = ({ eyebrow, awayName, homeName, awayLogo, homeLogo, artifact, note, page }) => {
  const W = 1080;
  const H = 1350;
  const side = 28;
  const top = 196; // header band
  const bottom = 72; // footer
  const boxW = W - side * 2;
  const boxH = H - top - bottom;
  const k = Math.min(boxW / artifact.width, boxH / artifact.height);
  const aw = artifact.width * k;
  const ah = artifact.height * k;
  const title = `${awayName} @ ${homeName}`;
  const titleSize = Math.min(92, 820 / Math.max(1, title.length * 0.5));

  return (
    <AbsoluteFill style={{ background: "var(--surface-page)", fontFamily: "var(--font-body)", color: "var(--text-primary)" }}>
      {/* header band */}
      <div style={{ position: "absolute", left: side + 8, right: side + 8, top: 38, display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span
            style={{
              fontWeight: 700,
              fontSize: 24,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--text-accent)",
            }}
          >
            {eyebrow}
          </span>
          {page ? <span style={{ fontWeight: 700, fontSize: 22, color: "var(--text-secondary)" }}>{page}</span> : null}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <Img src={staticFile(awayLogo)} style={{ width: 96, height: 96, objectFit: "contain" }} />
          <div
            style={{
              flex: 1,
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: titleSize,
              lineHeight: 1,
              letterSpacing: "-0.01em",
              textTransform: "uppercase",
              whiteSpace: "nowrap",
              textAlign: "center",
            }}
          >
            {title}
          </div>
          <Img src={staticFile(homeLogo)} style={{ width: 96, height: 96, objectFit: "contain" }} />
        </div>
      </div>

      {/* the site section, as the site draws it */}
      <Img
        src={staticFile(artifact.src)}
        style={{ position: "absolute", left: (W - aw) / 2, top: top + (boxH - ah) / 2, width: aw, height: ah }}
      />

      {/* footer */}
      <div
        style={{
          position: "absolute",
          left: side + 8,
          right: side + 8,
          bottom: 24,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Img src={staticFile("brand/chase-icon.png")} style={{ width: 30, height: 30, objectFit: "contain" }} />
          <span style={{ fontFamily: "var(--font-display)", fontStyle: "italic", fontWeight: 700, fontSize: 26, textTransform: "uppercase" }}>
            Chase <span style={{ color: "var(--text-secondary)" }}>Analytics</span>
          </span>
        </div>
        <span style={{ fontSize: 20, color: "var(--text-secondary)", textAlign: "right" }}>
          {note ? `${note} · ` : ""}chase-analytics.com
        </span>
      </div>
    </AbsoluteFill>
  );
};
