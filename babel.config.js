// Babel config — this file was MISSING, and its absence is the single most
// likely reason the redesign "barely changed" on device.
//
// Reanimated 4 does not animate by interpreting JavaScript. Every function
// marked 'worklet' — which is every animated style in this app: the splash
// stroke, the calorie ring, the level-up takeover, the entrance stagger, the
// press scale — has to be compiled into a form the UI thread can run. That
// compilation is a Babel plugin. With no babel.config.js, the plugin never
// runs, and the result is not an error: the worklets quietly fall back to
// doing nothing, or animate one frame and stop. The layout, the colours and
// the copy all update, so the app looks "slightly different" rather than
// broken — exactly the symptom described.
//
// `babel-preset-expo` pulls in `react-native-worklets/plugin` automatically
// when `react-native-worklets` is a dependency (it is — 0.7.1), so the preset
// alone is enough. It is spelled out here rather than left implicit because
// the plugin MUST be last in the plugin list, and having the file present
// means the next person to add a Babel plugin sees where it goes.
//
// After adding this file, clear the bundler cache once — Metro caches
// transformed modules, so an untransformed build will otherwise persist:
//
//     npx expo start --clear
//
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Nothing else yet. If a plugin is ever added here, it goes ABOVE any
    // worklets plugin — that one is always last.
    plugins: [],
  };
};
