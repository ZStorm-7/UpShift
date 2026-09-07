// Avatar — the one place a profile picture gets rendered.
//
// Every screen that shows a user's photo (Dashboard's header, Leaderboard's
// rows, Edit Profile's preview) goes through this component rather than
// each rolling its own <Image>/<Text> switch. That used to be duplicated
// three times with three slightly different fallback rules — one of them
// still fell back to an emoji even after the picker was removed, because
// nothing forced the three copies to agree.
//
// The fallback, in order:
//   1. A real photo (`photoUrl` is a real URL — anything not starting with
//      the old `preset:` scheme and not empty).
//   2. Colored initials — `color` if the caller/profile has one chosen,
//      otherwise a deterministic default from `uid` (see services/avatar.ts).
//
// A `preset:` value is treated as "no photo", not specially handled. Any
// account that picked an emoji before the picker was removed just starts
// showing initials — no migration, no dangling emoji rendering.

import { Image, Text, View, StyleSheet } from 'react-native';
import { usePalette } from '../theme/themedColors';
import { fontFamily } from '../theme/fonts';
import { getInitials, getDefaultAvatarColor } from '../services/avatar';

type AvatarProps = {
  /** The profile's stored `avatar` field — a photo URL, a legacy `preset:`
   *  string, or empty/undefined. */
  photoUrl?: string;
  /** The profile's stored `avatarColor`, if the user picked one. */
  color?: string;
  /** Used two ways: to derive the deterministic default color, and as the
   *  cache-busting-safe stable key React can rely on if the caller needs one
   *  — not read for that here, just documenting why it's required rather
   *  than optional. */
  uid: string;
  firstName?: string;
  lastInitial?: string;
  /** Diameter in px. Font size and border scale off this, so every call site
   *  gets a proportionally correct avatar rather than tuning text size by hand. */
  size: number;
};

function isRealPhoto(url?: string): url is string {
  return !!url && !url.startsWith('preset:');
}

export default function Avatar({
  photoUrl,
  color,
  uid,
  firstName,
  lastInitial,
  size,
}: AvatarProps) {
  const palette = usePalette();
  const dimension = { width: size, height: size, borderRadius: size / 2 };

  if (isRealPhoto(photoUrl)) {
    return (
      <Image
        source={{ uri: photoUrl }}
        // Themed placeholder background — visible briefly while the photo
        // loads (or if it fails to). This used to be the static dark-only
        // colors.surfaceRaised, which flashed as a dark square in light mode.
        style={[styles.photo, dimension, { backgroundColor: palette.surfaceRaised }]}
        accessibilityIgnoresInvertColors
      />
    );
  }

  const fill = color || getDefaultAvatarColor(uid);
  const initials = getInitials(firstName, lastInitial);
  // Roughly 40% of the diameter reads as "fills the circle without touching
  // the edge" across the sizes this app actually uses (28–96px). A fixed
  // point size would look cramped in the small header avatar or lost in the
  // large Edit Profile preview.
  //
  // But theme/colors.ts's avatarPalette comment stakes its contrast claim on
  // white text clearing 3:1 as WCAG "large text" — 18.66px+ (14pt) at this
  // weight — not on the 4.5:1 normal-text minimum. 40% of this app's SMALLEST
  // avatar sizes (36–44px, used on Dashboard/Leaderboard/Friends/Challenges)
  // comes out to 14–17.6px, which is neither: too small to be "large text",
  // so it needed the stricter ratio the palette was never checked against.
  // MIN_LARGE_TEXT_PX is that 18.66px line, rounded up a hair for margin —
  // this floor only lifts the sizes below it; the 56px avatars (Edit
  // Profile, Onboarding) already clear it and are unaffected.
  const MIN_LARGE_TEXT_PX = 19;
  const fontSize = Math.max(MIN_LARGE_TEXT_PX, Math.round(size * 0.4));

  return (
    <View style={[styles.initialsCircle, dimension, { backgroundColor: fill }]}>
      <Text
        style={[styles.initialsText, { fontSize, lineHeight: fontSize * 1.15 }]}
        // The initials are decorative once the accessibility label below is
        // in place — a screen reader saying "J D" for every avatar in a
        // leaderboard is noise; the surrounding row already announces the name.
        importantForAccessibility="no"
        allowFontScaling={false}>
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  photo: {
    // backgroundColor is applied inline from the palette.
  },
  initialsCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    // The MIN_LARGE_TEXT_PX floor above can push text past its old
    // proportional size at the smallest avatar diameters — clip rather than
    // let a wide two-letter pair spill past the circle's edge.
    overflow: 'hidden',
  },
  initialsText: {
    // Always plain white, regardless of the fill: every color in
    // theme/colors.ts's avatarPalette was chosen specifically to clear
    // contrast against white text — see that file's comment.
    color: '#FFFFFF',
    // The weight comes from the FAMILY, not a `fontWeight` on top of it —
    // React Native fake-bolds a custom font if you combine the two, which is
    // exactly the bug the rest of the app's redesign had to strip out of 31
    // other styles. sansBlack IS the 800-weight face.
    fontFamily: fontFamily.sansBlack,
    // Nudges the glyphs up ~1px — most fonts' caps sit slightly above true
    // vertical center, and unnudged text reads as low in the circle.
    includeFontPadding: false,
  },
});
