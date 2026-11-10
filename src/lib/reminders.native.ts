import * as Notifications from 'expo-notifications';

import type { Reminders } from '@/lib/reminders.types';

/**
 * Daily study reminder as a local notification scheduled on the iPhone (no server, no push).
 * The app schedules only this one notification, so "cancel all" is safe.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

/** Notifications.IosAuthorizationStatus.PROVISIONAL (quiet delivery also counts as allowed). */
const PROVISIONAL = 3;
const allowed = (p: Notifications.NotificationPermissionsStatus) => p.granted || p.ios?.status === PROVISIONAL;

export const reminders: Reminders = {
  supported: true,
  async schedule(hour, minute) {
    let granted = allowed(await Notifications.getPermissionsAsync());
    if (!granted) granted = allowed(await Notifications.requestPermissionsAsync());
    if (!granted) return 'denied';
    await Notifications.cancelAllScheduledNotificationsAsync();
    await Notifications.scheduleNotificationAsync({
      content: { title: '学习时间到了！Time to study', body: 'A few minutes today keeps your streak going. 加油！' },
      // DAILY triggers are Android-only; iOS repeats a calendar trigger instead.
      trigger: { type: Notifications.SchedulableTriggerInputTypes.CALENDAR, hour, minute, repeats: true },
    });
    return 'scheduled';
  },
  async cancel() {
    await Notifications.cancelAllScheduledNotificationsAsync();
  },
};
