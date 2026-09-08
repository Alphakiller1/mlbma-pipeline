import "./index.css";
import { CalculateMetadataFunction, Composition } from "remotion";
import { MatchupCutaway, Matchup } from "./graphics/MatchupCutaway";
import { LowerThird, LowerThirdProps } from "./graphics/LowerThird";
import { CornerBug, CornerBugProps } from "./graphics/CornerBug";
import { Sting, StingProps } from "./graphics/Sting";
import { MatchupBar, MatchupBarProps } from "./graphics/MatchupBar";
import { NflCutaway, NflMatchup } from "./graphics/NflCutaway";
import { ShowTemplate, ShowTemplateProps } from "./graphics/ShowTemplate";
import { SafeZoneCalibration } from "./graphics/SafeZoneCalibration";
import { ModelSnapshot, ModelSnapshotProps } from "./graphics/ModelSnapshot";
import { BoardMotion, BoardMotionProps } from "./graphics/BoardMotion";

/** 9:16 master for Reels/Shorts. WIDE is for horizontal YouTube. */
const VERTICAL = { width: 1080, height: 1920, fps: 30 };
const WIDE = { width: 1920, height: 1080, fps: 30 };

/**
 * ProRes 4444 with a real alpha channel - what DaVinci Resolve wants for an
 * overlay. Set per composition so `npx remotion render LowerThird out.mov`
 * needs no flags; passing --codec on the CLI still overrides it.
 */
function alphaExport<T extends Record<string, unknown>>(): CalculateMetadataFunction<T> {
  return () => ({
    defaultCodec: "prores",
    defaultVideoImageFormat: "png",
    defaultPixelFormat: "yuva444p10le",
    defaultProResProfile: "4444",
  });
}

/** Studio preview defaults. Real renders get --props from outputs/video_props.py. */
const defaultMatchup: Matchup = {
  away: "NYM",
  home: "TBR",
  awaySP: "Sean Manaea",
  awayHand: "L",
  awayPitchScore: 51.5,
  homeSP: "Freddy Peralta",
  homeHand: "R",
  homePitchScore: 79.0,
  awayOSI: 42.0,
  homeOSI: 43.7,
  lineupEdge: "TBR +1.7",
};

const defaultLowerThird: LowerThirdProps = {
  title: "Sean Manaea",
  subtitle: "LHP · New York Mets",
  stat: "51.5",
  statLabel: "Pitching Score",
};

const defaultBug: CornerBugProps = {
  league: "mlb",
  away: "NYM",
  home: "TBR",
  statLabel: "Pitching Edge",
  statValue: "TBR +27.5",
};

const defaultBugNFL: CornerBugProps = {
  league: "nfl",
  away: "NE",
  home: "SEA",
  statLabel: "Model Margin",
  statValue: "SEA 6.5",
};

/** Mirrors video/props/nfl/NE-SEA.json from outputs/video_props.py. */
const defaultNfl: NflMatchup = {
  away: "NE",
  home: "SEA",
  awayRating: 3.7,
  homeRating: 9.5,
  modelMargin: 6.5,
  marketMargin: 3.5,
  winProbability: 0.6036,
  projectedTotal: 45.3,
  marketTotal: 44.5,
  kickoff: "Wed Sep 9 · 8:20 PM ET",
  action: "MONITOR",
  edgeWithheld: true,
  authority: "RESEARCH_ONLY",
};

/** THE template: furniture with a transparent window for your camera. */
const defaultTemplate: ShowTemplateProps = {
  platform: "reels",
  league: "nfl",
  away: "NE",
  home: "SEA",
  eyebrow: "Week 1",
  title: "NE at Seattle",
  // Market numbers from nfl-model's board. lineSource stays "current" because
  // no opening-line data exists yet - see ShowTemplateProps.lineSource.
  spread: "SEA -3.5",
  total: "44.5",
  moneyline: "SEA -185",
  lineSource: "current",
};

/** Model numbers live here, clearly labelled, NOT in the template. */
const defaultModelSnapshot: ModelSnapshotProps = {
  league: "nfl",
  away: "NE",
  home: "SEA",
  modelMargin: 6.5,
  marketMargin: 3.5,
  modelTotal: 45.3,
  marketTotal: 44.5,
  winProbability: 0.6036,
  edgeWithheld: true,
  action: "MONITOR",
};

/**
 * BoardMotion is driven entirely by content_engine's --video directive, which
 * writes both the captures and this props object. The default is therefore empty
 * rather than a checked-in sample: video/public/captures is generated output and
 * a stale sample path would render a broken image in Studio.
 *
 *   python -m outputs.content_engine compose --artifacts nfl_edges --video
 *   cd video && npx remotion render BoardMotion out/x.mov --props=props/nfl/....json
 */
const defaultBoardMotion: BoardMotionProps = {
  platform: "reels",
  league: "nfl",
  captures: [],
  eyebrow: "Week 1",
  title: "Render with --props",
  sub: "content_engine --video writes the captures and this props file.",
  footer: "Access Premium NFL Research At Chase-Analytics.com",
};

const defaultSting: StingProps = { tagline: "MLB Matchup Analytics" };

const defaultBarMLB: MatchupBarProps = {
  league: "mlb",
  away: "NYM",
  home: "TBR",
  awayNote: "Manaea 51.5",
  homeNote: "Peralta 79.0",
  centerLabel: "Pitching Edge",
  centerValue: "TBR +27.5",
};

const defaultBarNFL: MatchupBarProps = {
  league: "nfl",
  away: "NE",
  home: "SEA",
  awayNote: "Rating 2.5",
  homeNote: "Rating 9.5",
  centerLabel: "Model Margin",
  centerValue: "SEA 6.5",
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* THE TEMPLATE - lay this over your footage for the whole video. Near
          static after its entrance, so freeze the last frame in Resolve and
          stretch it rather than rendering minutes of ProRes. */}
      {/* Model output as a drop-in graphic, separate from the template. */}
      <Composition
        id="ModelSnapshot"
        component={ModelSnapshot}
        durationInFrames={9 * VERTICAL.fps}
        {...VERTICAL}
        defaultProps={defaultModelSnapshot}
        calculateMetadata={alphaExport<ModelSnapshotProps>()}
      />

      {/* The still engine's boards, in motion, from the same capture. */}
      <Composition
        id="BoardMotion"
        component={BoardMotion}
        durationInFrames={8 * VERTICAL.fps}
        {...VERTICAL}
        defaultProps={defaultBoardMotion}
        calculateMetadata={alphaExport<BoardMotionProps>()}
      />
      <Composition
        id="BoardMotionWide"
        component={BoardMotion}
        durationInFrames={8 * WIDE.fps}
        {...WIDE}
        defaultProps={{ ...defaultBoardMotion, platform: "youtube" }}
        calculateMetadata={alphaExport<BoardMotionProps>()}
      />

      {/* Measuring stick - post it, screenshot it, read the real reserves. */}
      <Composition
        id="SafeZoneCalibration"
        component={SafeZoneCalibration}
        durationInFrames={5 * VERTICAL.fps}
        {...VERTICAL}
        defaultProps={{}}
      />

      {(["reels", "reels-ads", "tiktok", "shorts"] as const).map((p) => (
        <Composition
          key={p}
          id={"Template-" + p}
          component={ShowTemplate}
          durationInFrames={4 * VERTICAL.fps}
          {...VERTICAL}
          defaultProps={{ ...defaultTemplate, platform: p }}
          calculateMetadata={alphaExport<ShowTemplateProps>()}
        />
      ))}
      {/* 16:9 long-form. No platform chrome over the frame, shallower bands. */}
      <Composition
        id="Template-youtube"
        component={ShowTemplate}
        durationInFrames={4 * WIDE.fps}
        {...WIDE}
        defaultProps={{ ...defaultTemplate, platform: "youtube" }}
        calculateMetadata={alphaExport<ShowTemplateProps>()}
      />

      {/* Full-frame cutaway - you cut to this while talking through a game. */}
      <Composition
        id="MatchupCutaway"
        component={MatchupCutaway}
        durationInFrames={10 * VERTICAL.fps}
        {...VERTICAL}
        defaultProps={defaultMatchup}
        calculateMetadata={alphaExport<Matchup>()}
      />

      <Composition
        id="NflCutaway"
        component={NflCutaway}
        durationInFrames={10 * VERTICAL.fps}
        {...VERTICAL}
        defaultProps={defaultNfl}
        calculateMetadata={alphaExport<NflMatchup>()}
      />

      {/* Team-colored header bar. League selects colors AND logos - the two
          leagues share sixteen abbreviations, so it can never be inferred. */}
      <Composition
        id="MatchupBarMLB"
        component={MatchupBar}
        durationInFrames={20 * VERTICAL.fps}
        {...VERTICAL}
        defaultProps={defaultBarMLB}
        calculateMetadata={alphaExport<MatchupBarProps>()}
      />
      <Composition
        id="MatchupBarNFL"
        component={MatchupBar}
        durationInFrames={20 * VERTICAL.fps}
        {...VERTICAL}
        defaultProps={defaultBarNFL}
        calculateMetadata={alphaExport<MatchupBarProps>()}
      />

      {/* Overlays - transparent, composite straight over your footage. */}
      <Composition
        id="LowerThird"
        component={LowerThird}
        durationInFrames={6 * VERTICAL.fps}
        {...VERTICAL}
        defaultProps={defaultLowerThird}
        calculateMetadata={alphaExport<LowerThirdProps>()}
      />
      <Composition
        id="LowerThirdWide"
        component={LowerThird}
        durationInFrames={6 * WIDE.fps}
        {...WIDE}
        defaultProps={defaultLowerThird}
        calculateMetadata={alphaExport<LowerThirdProps>()}
      />

      <Composition
        id="CornerBug"
        component={CornerBug}
        durationInFrames={20 * VERTICAL.fps}
        {...VERTICAL}
        defaultProps={defaultBug}
        calculateMetadata={alphaExport<CornerBugProps>()}
      />
      <Composition
        id="CornerBugNFL"
        component={CornerBug}
        durationInFrames={20 * VERTICAL.fps}
        {...VERTICAL}
        defaultProps={defaultBugNFL}
        calculateMetadata={alphaExport<CornerBugProps>()}
      />
      <Composition
        id="CornerBugWide"
        component={CornerBug}
        durationInFrames={20 * WIDE.fps}
        {...WIDE}
        defaultProps={defaultBug}
        calculateMetadata={alphaExport<CornerBugProps>()}
      />

      <Composition
        id="Sting"
        component={Sting}
        durationInFrames={Math.round(2.5 * VERTICAL.fps)}
        {...VERTICAL}
        defaultProps={defaultSting}
        calculateMetadata={alphaExport<StingProps>()}
      />
      <Composition
        id="StingWide"
        component={Sting}
        durationInFrames={Math.round(2.5 * WIDE.fps)}
        {...WIDE}
        defaultProps={defaultSting}
        calculateMetadata={alphaExport<StingProps>()}
      />
    </>
  );
};
