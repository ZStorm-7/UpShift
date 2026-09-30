// BodyFatIcon — a front-view torso silhouette for the onboarding body-fat
// step (OnboardingScreen's case 5), one per bucket in bodyFatOptions
// (3-4% ... 40%+). Drawn as parametrized vector shapes rather than photos or
// downloaded reference images — a body-fat percentage chart is exactly the
// kind of image other fitness apps and sites hold copyright on, and a
// hand-authored SVG sidesteps that entirely while still scaling perfectly to
// whatever box size the grid needs, instead of a raster image that has to
// be pre-cropped to fit.
//
// `level` (0-8, one per bodyFatOptions entry, leanest to highest) drives
// three things in lockstep, all off the same single number: the waist width,
// how much belly overhang appears below it, and how much ab/oblique
// definition is still visible — so a caller only ever has to pass one prop
// and the three never end up disagreeing about how lean the figure is
// supposed to look.

import Svg, { Path, Circle, G } from 'react-native-svg';

export const BODY_FAT_LEVEL_COUNT = 9;

// Fixed, theme-independent grays — like the shoulder/waist width the fill
// itself never changes, including for a "selected" state. A body-fat chart
// doesn't recolor the figure you tapped; the option CARD (border + tint,
// applied by the caller) is what shows selection here too.
const TONE = '#B9B9B9';
const LINE_COLOR = '#4A4A4A';

type BodyFatIconProps = {
  /** 0 = leanest (3-4%) ... 8 = highest (40%+) — see bodyFatOptions. */
  level: number;
  size: number;
};

export default function BodyFatIcon({ level, size }: BodyFatIconProps) {
  const tone = TONE;
  const lineColor = LINE_COLOR;
  const l = Math.max(0, Math.min(BODY_FAT_LEVEL_COUNT - 1, level));

  // Everything below is a function of `l` alone, so the 9 icons are one
  // continuous progression rather than 9 independently-tuned drawings that
  // could drift out of order.
  const shoulderHalf = 29;
  const chestHalf = 26 + l * 0.3; // widens slightly at the top too — a
  // heavier figure isn't narrow everywhere except the waist.
  const waistHalf = 15 + l * 2.55; // the main driver of "looks heavier".
  const bellyBulge = l > 2 ? (l - 2) * 3.1 : 0; // overhang below the navel,
  // only kicking in once there's enough fat for it to read as a belly
  // rather than just a thicker waist.
  const hipHalf = 17 + l * 1.9;

  const cx = 50;
  const shoulderY = 14;
  const chestY = 32;
  const waistY = 60;
  const bellyY = 76;
  const hemY = 100;

  const torsoPath = [
    `M ${cx - shoulderHalf} ${shoulderY}`,
    `C ${cx - shoulderHalf - 2} ${shoulderY + 8}, ${cx - chestHalf} ${chestY - 6}, ${cx - chestHalf} ${chestY}`,
    `C ${cx - chestHalf} ${chestY + 10}, ${cx - waistHalf} ${waistY - 10}, ${cx - waistHalf} ${waistY}`,
    `C ${cx - waistHalf} ${waistY + 6}, ${cx - waistHalf - bellyBulge} ${bellyY - 6}, ${cx - waistHalf - bellyBulge} ${bellyY}`,
    `C ${cx - waistHalf - bellyBulge} ${bellyY + 8}, ${cx - hipHalf} ${hemY - 8}, ${cx - hipHalf} ${hemY}`,
    `L ${cx + hipHalf} ${hemY}`,
    `C ${cx + hipHalf} ${hemY - 8}, ${cx + waistHalf + bellyBulge} ${bellyY + 8}, ${cx + waistHalf + bellyBulge} ${bellyY}`,
    `C ${cx + waistHalf + bellyBulge} ${bellyY - 6}, ${cx + waistHalf} ${waistY + 6}, ${cx + waistHalf} ${waistY}`,
    `C ${cx + waistHalf} ${waistY - 10}, ${cx + chestHalf} ${chestY + 10}, ${cx + chestHalf} ${chestY}`,
    `C ${cx + chestHalf} ${chestY - 6}, ${cx + shoulderHalf + 2} ${shoulderY + 8}, ${cx + shoulderHalf} ${shoulderY}`,
    'Z',
  ].join(' ');

  // Arms — a simple tapered stub from shoulder to mid-forearm on each side.
  // Constant width regardless of `l`: the grid is about the torso/waist, and
  // varying arm thickness too would read as noise rather than signal.
  const armPath = (side: 1 | -1) => {
    const shoulderX = cx + side * (shoulderHalf - 4);
    const elbowX = cx + side * (shoulderHalf + 5);
    const wristX = cx + side * (shoulderHalf + 2);
    return [
      `M ${shoulderX} ${shoulderY + 2}`,
      `C ${shoulderX + side * 6} ${shoulderY + 2}, ${elbowX} ${chestY + 6}, ${elbowX} ${chestY + 20}`,
      `C ${elbowX} ${chestY + 34}, ${wristX} ${waistY - 4}, ${wristX} ${waistY + 6}`,
      `L ${wristX - side * 9} ${waistY + 4}`,
      `C ${wristX - side * 9} ${waistY - 6}, ${shoulderX - side * 3} ${chestY + 18}, ${shoulderX - side * 2} ${shoulderY + 4}`,
      'Z',
    ].join(' ');
  };

  // Ab/oblique definition fades out over the first ~5 levels and is gone
  // for good after that — nobody's abs are "a little visible" under a
  // hanging belly, so this is a hard cutoff, not one more gradient.
  const showAbs = l <= 4;
  const abRows = l <= 1 ? 3 : l <= 3 ? 2 : 1;
  const abOpacity = Math.max(0.25, 1 - l * 0.16);
  const showObliques = l <= 2;

  const abRects = [];
  if (showAbs) {
    for (let row = 0; row < abRows; row++) {
      const y = chestY + 12 + row * 9;
      const w = 7 - row * 0.6;
      const h = 6.5;
      abRects.push(
        <Path
          key={`ab-l-${row}`}
          d={`M ${cx - w - 1.5} ${y} h ${w} v ${h} h ${-w} Z`}
          fill="none"
          stroke={lineColor}
          strokeWidth={1}
          strokeOpacity={abOpacity}
          strokeLinejoin="round"
        />
      );
      abRects.push(
        <Path
          key={`ab-r-${row}`}
          d={`M ${cx + 1.5} ${y} h ${w} v ${h} h ${-w} Z`}
          fill="none"
          stroke={lineColor}
          strokeWidth={1}
          strokeOpacity={abOpacity}
          strokeLinejoin="round"
        />
      );
    }
    // Linea alba — the centerline running from the sternum to the navel.
    abRects.push(
      <Path
        key="linea-alba"
        d={`M ${cx} ${chestY + 8} L ${cx} ${chestY + 12 + abRows * 9}`}
        stroke={lineColor}
        strokeWidth={1}
        strokeOpacity={abOpacity}
      />
    );
  } else {
    // Past the cutoff, just a soft navel — enough to read as a stomach
    // rather than a blank shape, without implying any muscle definition.
    abRects.push(
      <Circle key="navel" cx={cx} cy={bellyY - 2} r={1.4} fill={lineColor} fillOpacity={0.35} />
    );
  }

  const obliqueLines = showObliques
    ? [
        <Path
          key="obl-l"
          d={`M ${cx - chestHalf + 4} ${chestY + 4} Q ${cx - waistHalf + 2} ${waistY - 14}, ${cx - waistHalf + 4} ${waistY}`}
          fill="none"
          stroke={lineColor}
          strokeWidth={1}
          strokeOpacity={abOpacity * 0.8}
        />,
        <Path
          key="obl-r"
          d={`M ${cx + chestHalf - 4} ${chestY + 4} Q ${cx + waistHalf - 2} ${waistY - 14}, ${cx + waistHalf - 4} ${waistY}`}
          fill="none"
          stroke={lineColor}
          strokeWidth={1}
          strokeOpacity={abOpacity * 0.8}
        />,
      ]
    : [];

  // A pec/chest crease reads at every level (unlike abs, chest shape doesn't
  // vanish under fat the same way — it just softens), so it's drawn
  // unconditionally with its own fixed, fairly faint opacity.
  const chestCrease = (
    <Path
      key="chest-crease"
      d={`M ${cx - chestHalf + 5} ${chestY + 6} Q ${cx} ${chestY + 9}, ${cx + chestHalf - 5} ${chestY + 6}`}
      fill="none"
      stroke={lineColor}
      strokeWidth={1}
      strokeOpacity={0.25}
    />
  );

  return (
    <Svg width={size} height={size} viewBox="0 0 100 116">
      <G>
        <Path d={armPath(-1)} fill={tone} />
        <Path d={armPath(1)} fill={tone} />
        <Path d={torsoPath} fill={tone} />
        {chestCrease}
        {obliqueLines}
        {abRects}
      </G>
    </Svg>
  );
}
