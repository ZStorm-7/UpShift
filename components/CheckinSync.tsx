// Keeps the daily check-in reminder scheduled (in the current language) and handles its "+250 ml water" button.
// Renders nothing. Mounted once, inside the providers.

import { useEffect, useRef } from 'react';
import { useUser } from '../context/UserContext';
import { useLanguage } from '../i18n/LanguageContext';
import { loadCheckin, loadHandledAt, saveHandledAt, addWaterFromNotification } from '../firebase/checkin';
import { scheduleDailyCheckin, cancelDailyCheckin, onNotificationResponse, lastNotificationResponse } from '../services/notifications';
import { handleCheckinResponse, type ResponseLike } from '../services/habits/checkin';

export default function CheckinSync() {
  const { authUser, profile } = useUser();
  const { t, language } = useLanguage();
  const uid = authUser?.uid ?? null;
  const uidRef = useRef<string | null>(uid);
  uidRef.current = uid;
  const notificationsOn = profile?.notificationsEnabled !== false;

  // (Re)schedule whenever the person, the language or the master reminders switch changes.
  useEffect(() => {
    if (!uid || !profile) return;
    let alive = true;
    (async () => {
      const s = await loadCheckin(uid).catch(() => null);
      if (!alive || !s) return;
      if (s.enabled && notificationsOn) {
        await scheduleDailyCheckin(s.hour, s.minute, { title: t('ciNotifTitle'), body: t('ciNotifBody'), action: t('ciAction') });
      } else {
        await cancelDailyCheckin();
      }
    })();
    return () => { alive = false; };
  }, [uid, !!profile, language, notificationsOn]);

  // The button on the notification, tapped while the app is open or in the background, or one that launched it.
  useEffect(() => {
    const act = async (r: ResponseLike) => {
      const id = uidRef.current;
      if (!id) return;
      const lastHandledAt = await loadHandledAt(id);
      await handleCheckinResponse(r, { uid: id, lastHandledAt, addWater: addWaterFromNotification, rememberHandled: saveHandledAt });
    };
    const stop = onNotificationResponse(r => { act(r); });
    if (uid) lastNotificationResponse().then(r => { if (r) act(r); });
    return stop;
  }, [uid]);

  return null;
}
