import {
  AbsoluteFill,
  CanvasImage,
  Easing,
  Interactive,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { League, teamAccent, teamLogoPath } from "../teams";
import "../fonts";
import "../theme.css";


export type CornerBugProps = {
  /** Required: MLB and NFL share sixteen abbreviations. */
  league: League;
  away: string;
  home: string;
  /** Optional number to hold on screen next to the teams. */
  statLabel?: string;
  statValue?: string;
};

const EASE = Easing.bezier(0.16, 1, 0.3, 1);

/**
 * Small persistent overlay that sits up while you talk. Top-left by default:
 * Instagram and YouTube both stack their own controls down the right edge and
 * across the bottom, and the top-left is the only corner neither one uses.
 *
 * Transparent render - no background on the AbsoluteFill.
 */
export const CornerBug: React.FC<CornerBugProps> = ({
  league,
  away,
  home,
  statLabel,
  statValue,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const awayInk = teamAccent(away, league);
  const homeInk = teamAccent(home, league);

  const outStart = durationInFrames - 0.7 * fps;
  const enter = interpolate(frame, [0, 0.6 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });
  const exit = interpolate(frame, [outStart, durationInFrames - 2], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });

  return (
    <AbsoluteFill name="Corner Bug">
      <Interactive.Div
        name="Bug"
        style={{
          position: "absolute",
          top: 96,
          left: 64,
          display: "flex",
          alignItems: "center",
          gap: 22,
          padding: "20px 28px",
          borderRadius: 14,
          background: "rgba(18, 20, 29, 0.88)",
          border: "1px solid var(--border-violet)",
          backdropFilter: "blur(12px)",
          boxShadow: "0 0 36px rgba(0,0,0,0.45)",
          opacity: enter * exit,
          translate:
            interpolate(frame, [0, 0.7 * fps], [-40, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: EASE,
            }) + "px 0px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontFamily: "var(--font-display)",
            fontSize: 44,
            fontWeight: 700,
            letterSpacing: 1,
          }}
        >
          <CanvasImage
            src={staticFile(teamLogoPath(away, league))}
            style={{ width: 46, height: 46 }}
          />
          <span style={{ color: awayInk }}>{away}</span>
          <span style={{ color: "var(--text-3)" }}>@</span>
          <span style={{ color: homeInk }}>{home}</span>
          <CanvasImage
            src={staticFile(teamLogoPath(home, league))}
            style={{ width: 46, height: 46 }}
          />
        </div>

        {statValue ? (
          <>
            <div
              style={{
                width: 1,
                alignSelf: "stretch",
                background: "var(--border-2)",
              }}
            />
            <div style={{ textAlign: "right" }}>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 40,
                  fontWeight: 700,
                  color: "var(--ca-green)",
                  lineHeight: 1,
                }}
              >
                {statValue}
              </div>
              {statLabel ? (
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 18,
                    letterSpacing: 2,
                    textTransform: "uppercase",
                    color: "var(--text-3)",
                    marginTop: 6,
                  }}
                >
                  {statLabel}
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </Interactive.Div>
    </AbsoluteFill>
  );
};
