import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { EventItem } from './matchlog';

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Request permissions (iOS prompts user, Android auto-grants)
export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('match-notifications', {
      name: 'Match Notifications',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  return finalStatus === 'granted';
}

// Calculate match status for button display
export function getMatchStatus(
  date: string,
  time: string | null
): 'past' | 'soon' | 'future' {
  if (!time || time.includes('TBD')) return 'future'; // TBD matches default to future

  const now = new Date();
  const matchStart = new Date(`${date}T${time}Z`);

  if (Number.isNaN(matchStart.getTime())) return 'future';

  const minutesUntil = (matchStart.getTime() - now.getTime()) / (1000 * 60);

  if (minutesUntil < 0) return 'past'; // Match already started
  if (minutesUntil <= 30) return 'soon'; // Within 30 min
  return 'future'; // More than 30 min away
}

// Schedule notification 30 min before match
export async function scheduleMatchNotification(
  event: EventItem
): Promise<string> {
  const matchStart = new Date(`${event.date}T${event.time}Z`);
  const notificationTime = new Date(matchStart.getTime() - 30 * 60 * 1000);

  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: '⚽ Match Starting Soon!',
      body: `${event.homeTeam} vs ${event.awayTeam} - Are you watching?`,
      sound: true,
      data: { eventId: event.eventId },
    },
    trigger: notificationTime,
  });

  return notificationId;
}

// Cancel scheduled notification
export async function cancelNotification(
  notificationId: string
): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(notificationId);
}
