import { useCallback, useState } from 'react';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import {
  ScrollView,
  RefreshControl,
  Pressable,
  StyleSheet,
  View,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { Colors } from '@/constants/theme';
import {
  fetchTeamMatches,
  addWatchedEvent,
  removeWatchedEvent,
  addNotifiedEvent,
  removeNotifiedEvent,
  formatDisplayDate,
  formatEventTime,
  getNotifiedEvent,
  type EventItem,
  type TeamMatchesResponse,
} from '@/lib/matchlog';
import {
  toggleFavoriteTeam,
  getCachedPreferences
} from '@/lib/preferences';
import {
  getMatchStatus,
  requestNotificationPermissions,
  scheduleMatchNotification,
  cancelNotification,
} from '@/lib/notifications';
import { AuthError } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';

export default function TeamDetailScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const router = useRouter();
  const { clearSession } = useAuth();
  const insets = useSafeAreaInsets();
  const { teamId, name } = useLocalSearchParams<{
    teamId: string;
    name: string
  }>();

  const [data, setData] = useState<TeamMatchesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [favoriteTeams, setFavoriteTeams] = useState<Set<string>>(new Set());
  const [watchedIds, setWatchedIds] = useState<Set<string>>(new Set());
  const [notifiedIds, setNotifiedIds] = useState<Set<string>>(new Set());
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [cache, setCache] = useState<Map<string, TeamMatchesResponse>>(
    new Map()
  );

  useFocusEffect(
    useCallback(() => {
      if (teamId) {
        void loadTeamMatches();
        void loadFavorites();
      }
    }, [teamId, name])
  );

  async function loadTeamMatches(forceRefresh = false) {
    if (!teamId || !name) return;

    if (!forceRefresh) {
      const cached = cache.get(teamId);
      if (cached) {
        setData(cached);
        setWatchedIds(new Set(cached.watchedIds));
        setNotifiedIds(new Set(cached.notifiedIds));
        setError(null);
        return;
      }
    }

    setLoading(true);
    try {
      const response = await fetchTeamMatches(teamId, name);
      setData(response);
      setWatchedIds(new Set(response.watchedIds));
      setNotifiedIds(new Set(response.notifiedIds));
      setError(null);

      setCache(prev => new Map(prev).set(teamId, response));
    } catch (err) {
      if (err instanceof AuthError) {
        await handleAuthError();
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to load team matches.');
    } finally {
      setLoading(false);
    }
  }

  async function loadFavorites() {
    const prefs = await getCachedPreferences();
    if (prefs.favoriteTeams) {
      setFavoriteTeams(new Set(prefs.favoriteTeams));
    }
  }

  async function handleAuthError() {
    await clearSession();
  }

  async function toggleFavorite() {
    if (!name) return;

    const newFavorites = new Set(favoriteTeams);
    if (newFavorites.has(name)) {
      newFavorites.delete(name);
    } else {
      newFavorites.add(name);
    }

    setFavoriteTeams(newFavorites);

    try {
      await toggleFavoriteTeam(name);
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
      setFavoriteTeams(favoriteTeams);
    }
  }

  function setPending(eventId: string, value: boolean) {
    setPendingIds(prev => {
      const next = new Set(prev);
      if (value) {
        next.add(eventId);
      } else {
        next.delete(eventId);
      }
      return next;
    });
  }

  async function toggleWatched(event: EventItem) {
    const isWatched = watchedIds.has(event.eventId);
    const prevWatchedIds = watchedIds;
    const nextWatchedIds = new Set(prevWatchedIds);

    if (isWatched) {
      nextWatchedIds.delete(event.eventId);
    } else {
      nextWatchedIds.add(event.eventId);
    }

    setWatchedIds(nextWatchedIds);
    setPending(event.eventId, true);

    try {
      if (isWatched) {
        await removeWatchedEvent(event.eventId);
      } else {
        await addWatchedEvent(event);
      }

      setError(null);

      if (data) {
        const updatedData = {
          ...data,
          watchedIds: Array.from(nextWatchedIds)
        };
        setCache(prev => new Map(prev).set(teamId!, updatedData));
      }
    } catch (err) {
      if (err instanceof AuthError) {
        await handleAuthError();
        return;
      }
      setWatchedIds(prevWatchedIds);
      setError(err instanceof Error ? err.message : 'Failed to update.');
    } finally {
      setPending(event.eventId, false);
    }
  }

  async function toggleNotified(event: EventItem) {
    const matchStatus = getMatchStatus(event.date, event.time);
    if (matchStatus !== 'future') {
      Alert.alert(
        'Cannot Notify',
        'This match is starting soon or has already started.'
      );
      return;
    }

    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) {
      Alert.alert(
        'Notifications Disabled',
        'Please enable notifications in Settings.'
      );
      return;
    }

    const isNotified = notifiedIds.has(event.eventId);
    const prevNotifiedIds = notifiedIds;
    const nextNotifiedIds = new Set(prevNotifiedIds);

    if (isNotified) {
      nextNotifiedIds.delete(event.eventId);
    } else {
      nextNotifiedIds.add(event.eventId);
    }

    setNotifiedIds(nextNotifiedIds);
    setPending(event.eventId, true);

    try {
      if (isNotified) {
        const record = await getNotifiedEvent(event.eventId);
        if (record?.notificationId) {
          await cancelNotification(record.notificationId);
        }
        await removeNotifiedEvent(event.eventId);
      } else {
        const notificationId = await scheduleMatchNotification(event);
        await addNotifiedEvent(event, notificationId);
      }

      setError(null);

      if (data) {
        const updatedData = {
          ...data,
          notifiedIds: Array.from(nextNotifiedIds)
        };
        setCache(prev => new Map(prev).set(teamId!, updatedData));
      }
    } catch (err) {
      if (err instanceof AuthError) {
        await handleAuthError();
        return;
      }
      setNotifiedIds(prevNotifiedIds);
      setError(err instanceof Error ? err.message : 'Failed to update.');
    } finally {
      setPending(event.eventId, false);
    }
  }

  function renderMatchCard(event: EventItem, isPast: boolean) {
    const isWatched = watchedIds.has(event.eventId);
    const isNotified = notifiedIds.has(event.eventId);
    const isPending = pendingIds.has(event.eventId);
    const matchStatus = getMatchStatus(event.date, event.time);
    const showNotifyButton = !isPast && matchStatus === 'future';

    return (
      <Pressable
        key={event.eventId}
        style={[
          styles.matchCard,
          { backgroundColor: theme.surface, borderColor: theme.border }
        ]}
        onPress={() => showNotifyButton ? toggleNotified(event) : toggleWatched(event)}
        disabled={isPending}
      >
        <View style={styles.matchTimeCol}>
          <ThemedText style={[styles.matchDate, { color: theme.muted }]}>
            {formatDisplayDate(event.date).split(',')[0]}
          </ThemedText>
          <ThemedText style={[styles.matchTime, { color: theme.tint }]}>
            {formatEventTime(event.date, event.time)}
          </ThemedText>
        </View>

        <View style={styles.matchTeamsCol}>
          <ThemedText style={styles.matchTeam} numberOfLines={1}>
            {event.homeTeam}
          </ThemedText>
          <ThemedText style={styles.matchTeam} numberOfLines={1}>
            {event.awayTeam}
          </ThemedText>
        </View>

        {isPast && (
          <View style={styles.matchScoreCol}>
            <ThemedText style={styles.matchScore}>
              {event.homeScore ?? '-'}
            </ThemedText>
            <ThemedText style={styles.matchScore}>
              {event.awayScore ?? '-'}
            </ThemedText>
          </View>
        )}

        <View style={styles.matchActionCol}>
          {showNotifyButton ? (
            <>
              <Ionicons
                name={isNotified ? 'notifications' : 'notifications-outline'}
                size={20}
                color={isNotified ? theme.tint : theme.muted}
              />
              <ThemedText
                style={[
                  styles.actionLabel,
                  { color: isNotified ? theme.tint : theme.muted }
                ]}
              >
                {isNotified ? 'Notified' : 'Notify'}
              </ThemedText>
            </>
          ) : (
            <>
              <Ionicons
                name={isWatched ? 'eye' : 'eye-outline'}
                size={20}
                color={isWatched ? theme.tint : theme.muted}
              />
              <ThemedText
                style={[
                  styles.actionLabel,
                  { color: isWatched ? theme.tint : theme.muted }
                ]}
              >
                {isWatched ? 'Watched' : 'Watch'}
              </ThemedText>
            </>
          )}
        </View>
      </Pressable>
    );
  }

  if (!teamId || !name) {
    return (
      <ThemedView style={[styles.container, { backgroundColor: theme.background }]}>
        <ThemedText style={styles.errorText}>Invalid team.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { backgroundColor: theme.background }]}>
      <Stack.Screen
        options={{
          title: name,
          headerShown: true,
          headerBackTitle: 'Back',
          headerRight: () => (
            <Pressable onPress={toggleFavorite} style={{ padding: 8 }}>
              <Ionicons
                name={favoriteTeams.has(name) ? 'star' : 'star-outline'}
                size={24}
                color={favoriteTeams.has(name) ? '#FFC107' : theme.muted}
              />
            </Pressable>
          ),
        }}
      />

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 24 }
        ]}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => loadTeamMatches(true)}
          />
        }
      >
        {error && (
          <View style={[styles.errorBanner, { backgroundColor: theme.surfaceAlt }]}>
            <ThemedText style={[styles.errorText, { color: theme.accent }]}>
              {error}
            </ThemedText>
          </View>
        )}

        {loading && !data ? (
          <ThemedText style={[styles.emptyState, { color: theme.muted }]}>
            Loading team matches...
          </ThemedText>
        ) : data ? (
          <>
            <View style={styles.section}>
              <ThemedText type="subtitle" style={styles.sectionTitle}>
                Past Matches ({data.pastMatches.length})
              </ThemedText>
              {data.pastMatches.length === 0 ? (
                <ThemedText style={[styles.emptyState, { color: theme.muted }]}>
                  No past matches found.
                </ThemedText>
              ) : (
                <View style={styles.matchList}>
                  {data.pastMatches.map(event => renderMatchCard(event, true))}
                </View>
              )}
            </View>

            <View style={styles.section}>
              <ThemedText type="subtitle" style={styles.sectionTitle}>
                Upcoming Matches ({data.upcomingMatches.length})
              </ThemedText>
              {data.upcomingMatches.length === 0 ? (
                <ThemedText style={[styles.emptyState, { color: theme.muted }]}>
                  No upcoming matches scheduled.
                </ThemedText>
              ) : (
                <View style={styles.matchList}>
                  {data.upcomingMatches.map(event => renderMatchCard(event, false))}
                </View>
              )}
            </View>
          </>
        ) : null}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  errorBanner: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 13,
  },
  emptyState: {
    textAlign: 'center',
    marginTop: 24,
    fontSize: 14,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    marginBottom: 12,
  },
  matchList: {
    gap: 8,
  },
  matchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  matchTimeCol: {
    width: 60,
    alignItems: 'center',
  },
  matchDate: {
    fontSize: 11,
    textTransform: 'uppercase',
  },
  matchTime: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  matchTeamsCol: {
    flex: 1,
    gap: 4,
  },
  matchTeam: {
    fontSize: 13,
  },
  matchScoreCol: {
    width: 30,
    alignItems: 'center',
    gap: 4,
  },
  matchScore: {
    fontSize: 16,
    fontWeight: '700',
  },
  matchActionCol: {
    width: 55,
    alignItems: 'center',
    gap: 4,
  },
  actionLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
});
