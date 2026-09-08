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
import { League, onTeamInk, teamAccent, teamColors, teamLogoPath } from "../teams";
import "../fonts";
import "../theme.css";

export type ModelSnapshotProps = {
  league: League;
  away: string;
  home: string;
  /** Model's number, signed so positive favours the home side. */
  modelMargin: number;
  /** The market number it is being compared against. */
  marketMargin: number;
  modelTotal?: number;
  marketTotal?: number;
  winProbability?: number;
  /** True when the model withheld an edge - renders the research-only strip. */
  edgeWithheld?: boolean;
  action?: string;
};

const EASE = Easing.bezier(0.16, 1, 0.3, 1);

const favourite = (margin: number, away: string, home: string) => ({
  team: margin >= 0 ? home : away,
  points: Math.abs(margin).toFixed(1),
});

/**
 * MODEL SNAPSHOT - a drop-in graphic for the model's own numbers.
 *
 * Deliberately separate from ShowTemplate. The template carries the market:
 * the line and total a viewer can go and bet. This is the model's read, which
 * is a different claim and has to be labelled as one, especially while
 * nfl-model withholds edges because it does not beat the closing line.
 *
 * Full-frame with a background, meant to be cut to rather than overlaid.
 */
export const ModelSnapshot: React.FC<ModelSnapshotProps> = ({
  league,
  away,
  home,
  modelMargin,
  marketMargin,
  modelTotal,
  marketTotal,
  winProbability,
  edgeWithheld,
  action,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const awayCol = teamColors(away, league);
  const homeCol = teamColors(home, league);
  const model = favourite(modelMargin, away, home);
  const market = favourite(marketMargin, away, home);
  const gap = Math.abs(modelMargin - marketMargin).toFixed(1);

  const rise = (start: number) => ({
    opacity: interpolate(frame, [start, start + 0.6 * fps], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: EASE,
    }),
    translate:
      interpolate(frame, [start, start + 0.8 * fps], [30, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: EASE,
      }) + "px 0px",
  });

  return (
    <AbsoluteFill
      name="Model Snapshot"
      style={{
        backgroundColor: "var(--page-bg)",
        fontFamily: "var(--font-body)",
        flexDirection: "column",
        padding: "0 0 96px",
      }}
    >
      {/* Team-coloured header, same language as the template. */}
      <div style={{ position: "relative", height: 300, marginBottom: 56 }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(100deg, ${awayCol.primary} 0%, #0a0b10 185%)`,
            clipPath: "polygon(0 0, 34% 0, 40% 100%, 0 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(260deg, ${homeCol.primary} 0%, #0a0b10 185%)`,
            clipPath: "polygon(66% 0, 100% 0, 100% 100%, 60% 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(180deg, #1A1E2E 0%, #0E1018 100%)",
            clipPath: "polygon(34% 0, 66% 0, 60% 100%, 40% 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 50px",
            opacity: interpolate(frame, [0, 0.7 * fps], [0, 1], {
              extrapolateRight: "clamp",
              easing: EASE,
            }),
          }}
        >
          {[
            { t: away, ink: onTeamInk(away, league) },
            { t: home, ink: onTeamInk(home, league) },
          ].map((s) => (
            <div key={s.t} style={{ textAlign: "center" }}>
              <CanvasImage
                src={staticFile(teamLogoPath(s.t, league))}
                style={{ width: 124, height: 124 }}
              />
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 60,
                  fontWeight: 700,
                  color: s.ink,
                  lineHeight: 1,
                }}
              >
                {s.t}
              </div>
            </div>
          ))}
          <div
            className="chrome"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              textAlign: "center",
              fontFamily: "var(--font-display)",
              fontSize: 46,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            Model Snapshot
          </div>
        </div>
      </div>

      <div
        style={{
          padding: "0 72px",
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          gap: 54,
        }}
      >
        {/* Model vs market, side by side, each labelled for what it is. */}
        <Interactive.Div name="Spread" style={{ ...rise(0.8 * fps) }}>
          <div style={{ display: "flex", gap: 26 }}>
            {[
              { label: "Model", fav: model, tone: "var(--ca-purple-light)" },
              { label: "Market", fav: market, tone: "var(--text-2)" },
            ].map((m) => (
              <div
                key={m.label}
                style={{
                  flex: 1,
                  background: "var(--bg-3)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--ca-card-radius)",
                  padding: "28px 30px",
                }}
              >
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 28,
                    letterSpacing: 4,
                    textTransform: "uppercase",
                    color: m.tone,
                    marginBottom: 10,
                  }}
                >
                  {m.label}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 70,
                    fontWeight: 700,
                    color: "var(--text)",
                    lineHeight: 1,
                  }}
                >
                  {m.fav.team} −{m.fav.points}
                </div>
              </div>
            ))}
          </div>
          <div
            style={{
              marginTop: 18,
              fontFamily: "var(--font-display)",
              fontSize: 32,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: "var(--text-3)",
            }}
          >
            Gap {gap} pts
          </div>
        </Interactive.Div>

        {modelTotal != null && marketTotal != null ? (
          <Interactive.Div name="Total" style={{ ...rise(1.3 * fps) }}>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 28,
                letterSpacing: 4,
                textTransform: "uppercase",
                color: "var(--text-3)",
                marginBottom: 12,
              }}
            >
              Total · Model vs Market
            </div>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 76,
                fontWeight: 700,
                color: "var(--text)",
              }}
            >
              {modelTotal.toFixed(1)}
              <span style={{ color: "var(--text-4)", margin: "0 18px" }}>/</span>
              <span style={{ color: "var(--text-2)" }}>
                {marketTotal.toFixed(1)}
              </span>
            </div>
          </Interactive.Div>
        ) : null}

        {winProbability != null ? (
          <Interactive.Div name="Win Probability" style={{ ...rise(1.7 * fps) }}>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 28,
                letterSpacing: 4,
                textTransform: "uppercase",
                color: "var(--text-3)",
                marginBottom: 14,
              }}
            >
              {home} Win Probability
            </div>
            <div
              style={{
                height: 24,
                borderRadius: 6,
                background: "var(--bg-4)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  borderRadius: 6,
                  background: teamAccent(home, league),
                  width:
                    interpolate(
                      frame,
                      [1.9 * fps, 2.8 * fps],
                      [0, winProbability * 100],
                      {
                        extrapolateLeft: "clamp",
                        extrapolateRight: "clamp",
                        easing: EASE,
                      },
                    ) + "%",
                }}
              />
            </div>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 60,
                fontWeight: 700,
                color: "var(--text)",
                marginTop: 14,
              }}
            >
              {Math.round(winProbability * 100)}%
            </div>
          </Interactive.Div>
        ) : null}
      </div>

      {edgeWithheld ? (
        <Interactive.Div
          name="Authority"
          style={{
            ...rise(2.4 * fps),
            margin: "0 72px",
            padding: "22px 30px",
            borderRadius: 12,
            background: "rgba(232, 194, 74, 0.10)",
            border: "1px solid rgba(232, 194, 74, 0.38)",
            display: "flex",
            alignItems: "center",
            gap: 18,
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 30,
              fontWeight: 700,
              letterSpacing: 3,
              textTransform: "uppercase",
              color: "var(--ca-amber)",
            }}
          >
            {action ?? "Monitor"}
          </span>
          <span style={{ fontSize: 28, color: "var(--text-2)", lineHeight: 1.3 }}>
            Research only — model does not beat the closing line
          </span>
        </Interactive.Div>
      ) : null}
    </AbsoluteFill>
  );
};
