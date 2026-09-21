// Registers this device's Expo push token once per sign-in — see
// services/notifications.ts's registerPushToken for what that token is used
// for (functions/src/index.ts's Cloud Function delivers new-message pushes
// to it). Mounted once, app-wide, the same way OfflineBanner is: renders
// nothing, purely a side effect.
//
// Replaces the old MessageNotifier, which fired a local notification from a
// live onSnapshot listener — that only ever worked while this device's JS
// was alive (foreground/recently-backgrounded), never for a closed app.
// Real push (via the Cloud Function) covers every app state, so the local
// fallback is gone rather than kept alongside it, which would have doubled
// up notifications for anyone with the app open when a message arrived.

import { useEffect } from 'react';
import { useUser } from '../context/UserContext';
import { registerPushToken } from '../services/notifications';

export default function PushTokenRegistrar() {
  const { authUser } = useUser();

  useEffect(() => {
    if (!authUser) return;
    registerPushToken(authUser.uid);
  }, [authUser?.uid]);

  return null;
}
