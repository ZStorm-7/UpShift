// Applies the in-app "Text size" preference (Settings → Customize) on top
// of whatever the OS's own accessibility text-size setting already
// contributes — rather than only one or the other.
//
// React Native's `Text` respects `allowFontScaling` (on by default) by
// reading `PixelRatio.getFontScale()` at render time. There's no supported
// public API to add a SECOND, app-level multiplier on top of that, so this
// does the standard workaround several production RN apps use: replace
// `PixelRatio.getFontScale` with a function that returns
// (the real device font scale) × (the user's in-app preference). Every
// Text component that reads it — which is nearly all of them, since
// `allowFontScaling` defaults to true — picks up the change automatically,
// with no per-component edits needed anywhere else in the app.
//
// This is a native-platform mechanism: react-native-web's Text component
// never reads PixelRatio.getFontScale() at all (confirmed in its source —
// there's no equivalent concept for a browser), so this is a genuine no-op
// in the web preview and can only be verified on a real iOS/Android build.
import { PixelRatio } from 'react-native';

// Captured once, before any patching, so repeated calls (the setting can be
// changed any number of times in one session) always multiply from the
// REAL device value rather than compounding on top of a previous custom
// scale — patching this as `getFontScale = () => getFontScale() * appScale`
// would double- and triple-apply the preference on every subsequent call.
const deviceGetFontScale = PixelRatio.getFontScale.bind(PixelRatio);

export function applyFontScale(appScale: number): void {
  PixelRatio.getFontScale = () => deviceGetFontScale() * appScale;
}
