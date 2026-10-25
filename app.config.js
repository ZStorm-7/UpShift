// Dynamic wrapper around app.json. Everything normal stays in app.json; this
// only adds the iOS Screen Time (Family Controls) native extensions when an
// Apple team ID is provided, because that capability needs Apple's approval
// and would break an ordinary build without it.
//
//   APPLE_TEAM_ID=ABCDE12345 eas build --platform ios
//
// See docs/mindful-breaks.md.

module.exports = ({ config }) => {
  const plugins = [...(config.plugins ?? [])];
  const teamId = process.env.APPLE_TEAM_ID;

  if (teamId) {
    const bundleId = config.ios?.bundleIdentifier ?? 'com.upshift.app';
    plugins.push([
      'react-native-device-activity',
      { appleTeamId: teamId, appGroup: `group.${bundleId}.screentime` },
    ]);
  }

  return { ...config, plugins };
};
