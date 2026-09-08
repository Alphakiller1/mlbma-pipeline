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
import "../fonts";
import "../theme.css";


export type StingProps = {
  /** Optional line under the mark - a tagline on the intro, a CTA on the outro. */
  tagline?: string;
};

const EASE = Easing.bezier(0.16, 1, 0.3, 1);

/**
 * Branded open/close. Renders transparent so it can sit over the first or last
 * seconds of your footage rather than forcing a hard cut to a black card.
 *
 * Brand lockup is the icon plus a typeset wordmark, NOT a logo file.
 * chase-logo-horizontal-light.png is RGB with no alpha channel at all, so it
 * renders as a black box over footage; both stacked variants are byte-identical
 * dark art (mean RGB 65,60,80) that dies on a dark ground. chase-icon-outline
 * is the only brand asset that is both transparent and legible here.
 */
export const Sting: React.FC<StingProps> = ({ tagline }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width } = useVideoConfig();

  const outStart = durationInFrames - 0.6 * fps;
  const exit = interpolate(frame, [outStart, durationInFrames - 2], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: EASE,
  });

  return (
    <AbsoluteFill
      name="Sting"
      style={{
        justifyContent: "center",
        alignItems: "center",
        opacity: exit,
      }}
    >
      {/* Violet bloom that blows out behind the mark, then settles. */}
      <AbsoluteFill
        name="Bloom"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, var(--ca-brand-glow) 0%, transparent 55%)",
          opacity: interpolate(
            frame,
            [0, 0.4 * fps, 1.4 * fps],
            [0, 1, 0.35],
            { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: EASE },
          ),
          scale: interpolate(frame, [0, 1.2 * fps], [0.6, 1.25], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: EASE,
            output: "perceptual-scale",
          }),
        }}
      />

      <Interactive.Div
        name="Logo"
        style={{
          opacity: interpolate(frame, [0.15 * fps, 0.7 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: EASE,
          }),
          scale: interpolate(frame, [0.15 * fps, 1.1 * fps], [0.82, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.spring({ damping: 14 }),
            output: "perceptual-scale",
          }),
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
          <CanvasImage
            src={staticFile("chase-icon-outline.png")}
            style={{
              width: width * 0.125,
              height: width * 0.125,
              filter: "drop-shadow(0 0 30px var(--ca-brand-glow))",
            }}
          />
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: width * 0.082,
              fontWeight: 700,
              letterSpacing: 2,
              lineHeight: 1,
              color: "var(--text)",
              textShadow: "0 0 34px var(--ca-brand-glow)",
            }}
          >
            CHASE
            <span style={{ color: "var(--ca-purple-light)" }}>ANALYTICS</span>
          </div>
        </div>
      </Interactive.Div>

      {/* Violet rule that wipes out from the centre under the mark. */}
      <Interactive.Div
        name="Rule"
        style={{
          height: 4,
          marginTop: 34,
          borderRadius: 2,
          background: "var(--v-grad)",
          width: interpolate(frame, [0.6 * fps, 1.5 * fps], [0, width * 0.42], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: EASE,
          }),
        }}
      />

      {tagline ? (
        <Interactive.Div
          name="Tagline"
          style={{
            marginTop: 32,
            fontFamily: "var(--font-display)",
            fontSize: 40,
            letterSpacing: 8,
            textTransform: "uppercase",
            color: "var(--text-2)",
            opacity: interpolate(frame, [1 * fps, 1.6 * fps], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: EASE,
            }),
          }}
        >
          {tagline}
        </Interactive.Div>
      ) : null}
    </AbsoluteFill>
  );
};
