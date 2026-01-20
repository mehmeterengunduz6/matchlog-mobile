import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  AuthError,
  clearSessionToken,
  fetchPublicJson,
  getSessionToken,
  setSessionToken,
} from '../../lib/api';
import {
  addDays,
  addWatchedEvent,
  fetchEventsByDate,
  formatDisplayDate,
  formatEventTime,
  removeWatchedEvent,
  todayValue,
  updateStatsForToggle,
  type EventItem,
  type LeagueGroup,
  type Stats,
} from '../../lib/matchlog';

WebBrowser.maybeCompleteAuthSession();

const initialStats: Stats = {
  weekCount: 0,
  monthCount: 0,
  totalCount: 0,
};

export default function FixturesScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const [selectedDate, setSelectedDate] = useState(todayValue());
  const [leagues, setLeagues] = useState<LeagueGroup[]>([]);
  const [watchedIds, setWatchedIds] = useState<Set<string>>(new Set());
  const [stats, setStats] = useState<Stats>(initialStats);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [sessionToken, setSessionTokenState] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);

  const totalEvents = useMemo(
    () => leagues.reduce((sum, league) => sum + league.events.length, 0),
    [leagues]
  );

  const redirectUri = makeRedirectUri({
    scheme: 'matchlogapp',
    path: 'oauthredirect',
  });

  const [request, response, promptAsync] = Google.useAuthRequest(
    {
      iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
      androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
      webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
      redirectUri,
      scopes: ['profile', 'email'],
    },
    { scheme: 'matchlogapp' }
  );

  useEffect(() => {
    getSessionToken()
      .then((token) => {
        setSessionTokenState(token);
      })
      .finally(() => setCheckingSession(false));
  }, []);

  useEffect(() => {
    if (response?.type !== 'success') {
      return;
    }
    const idToken = response.authentication?.idToken ?? response.params?.id_token;
    if (!idToken) {
      setError('Google sign-in failed.');
      return;
    }
    setAuthLoading(true);
    fetchPublicJson('/mobile/login', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    })
      .then(async (data: { token: string }) => {
        await setSessionToken(data.token);
        setSessionTokenState(data.token);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Login failed.');
      })
      .finally(() => setAuthLoading(false));
  }, [response]);

  const handleAuthError = useCallback(async () => {
    await clearSessionToken();
    setSessionTokenState(null);
    setLeagues([]);
    setWatchedIds(new Set());
    setStats(initialStats);
    setError('Sign in to see your fixtures.');
  }, []);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchEventsByDate(selectedDate);
      setLeagues(data.leagues);
      setWatchedIds(new Set(data.watchedIds));
      setStats(data.stats);
      setError(null);
    } catch (err) {
      if (err instanceof AuthError) {
        await handleAuthError();
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to load fixtures.');
    } finally {
      setLoading(false);
    }
  }, [handleAuthError, selectedDate]);

  useFocusEffect(
    useCallback(() => {
      if (!sessionToken) {
        return;
      }
      void loadEvents();
    }, [loadEvents, sessionToken])
  );

  function setPending(eventId: string, value: boolean) {
    setPendingIds((prev) => {
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
    const prevStats = stats;
    const nextWatchedIds = new Set(prevWatchedIds);
    if (isWatched) {
      nextWatchedIds.delete(event.eventId);
    } else {
      nextWatchedIds.add(event.eventId);
    }
    setWatchedIds(nextWatchedIds);
    setStats(updateStatsForToggle(prevStats, event, isWatched));
    setPending(event.eventId, true);

    try {
      if (isWatched) {
        await removeWatchedEvent(event.eventId);
      } else {
        await addWatchedEvent(event);
      }
      setError(null);
    } catch (err) {
      if (err instanceof AuthError) {
        await handleAuthError();
        return;
      }
      setWatchedIds(prevWatchedIds);
      setStats(prevStats);
      setError(err instanceof Error ? err.message : 'Failed to update match log.');
    } finally {
      setPending(event.eventId, false);
    }
  }

  function jumpToToday() {
    setSelectedDate(todayValue());
  }

  function moveDate(delta: number) {
    const nextDate = addDays(selectedDate, delta);
    const today = todayValue();
    if (nextDate > today) {
      return;
    }
    setSelectedDate(nextDate);
  }

  async function signOut() {
    await clearSessionToken();
    setSessionTokenState(null);
    setLeagues([]);
    setWatchedIds(new Set());
    setStats(initialStats);
    setError(null);
  }

  if (checkingSession) {
    return (
      <ThemedView style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.centered}>
          <ThemedText>Checking session...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (!sessionToken) {
    return (
      <ThemedView style={[styles.container, { backgroundColor: theme.background }]}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.hero}>
            <ThemedText style={[styles.eyebrow, { color: theme.muted }]}>Matchlog</ThemedText>
            <ThemedText type="title" style={styles.heroTitle}>
              Sign in to track matches
            </ThemedText>
            <ThemedText style={[styles.heroCopy, { color: theme.muted }]}
            >
              Use your Google account to sync watched matches with your Matchlog backend.
            </ThemedText>
          </View>
          {error ? (
            <ThemedText style={[styles.errorText, { color: theme.accent }]}>
              {error}
            </ThemedText>
          ) : null}
          <View style={styles.authActions}>
            <Pressable
              style={[
                styles.primaryButton,
                { backgroundColor: theme.accent },
                (!request || authLoading) && styles.buttonDisabled,
              ]}
              onPress={() => promptAsync()}
              disabled={!request || authLoading}
            >
              <ThemedText style={[styles.primaryButtonText, { color: theme.accentText }]}
              >
                {authLoading ? 'Signing in...' : 'Continue with Google'}
              </ThemedText>
            </Pressable>
            <ThemedText style={[styles.formNote, { color: theme.muted }]}
            >
              Set `EXPO_PUBLIC_API_BASE_URL` if you are running the backend on a LAN address.
            </ThemedText>
          </View>
        </ScrollView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadEvents} />}
      >
        <View style={styles.hero}>
          <View style={styles.authRow}>
            <ThemedText style={[styles.eyebrow, { color: theme.muted }]}>Matchlog</ThemedText>
            <Pressable
              style={[styles.ghostButton, { borderColor: theme.border }]}
              onPress={signOut}
            >
              <ThemedText style={[styles.buttonText, { color: theme.text }]}
              >
                Sign out
              </ThemedText>
            </Pressable>
          </View>
          <ThemedText type="title" style={styles.heroTitle}>
            Your fixture diary
          </ThemedText>
          <ThemedText style={[styles.heroCopy, { color: theme.muted }]}
          >
            Pick a day, tap what you watched, and your totals sync across devices.
          </ThemedText>
        </View>

        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: theme.surface }]}
          >
            <ThemedText style={[styles.statLabel, { color: theme.muted }]}>This week</ThemedText>
            <ThemedText style={styles.statValue}>{stats.weekCount}</ThemedText>
          </View>
          <View style={[styles.statCard, { backgroundColor: theme.surface }]}
          >
            <ThemedText style={[styles.statLabel, { color: theme.muted }]}>This month</ThemedText>
            <ThemedText style={styles.statValue}>{stats.monthCount}</ThemedText>
          </View>
          <View style={[styles.statCard, { backgroundColor: theme.surface }]}
          >
            <ThemedText style={[styles.statLabel, { color: theme.muted }]}>Total watched</ThemedText>
            <ThemedText style={styles.statValue}>{stats.totalCount}</ThemedText>
          </View>
        </View>

        <View style={[styles.panel, { backgroundColor: theme.surface }]}
        >
          <View style={styles.panelHeader}>
            <View>
              <ThemedText type="subtitle">Pick a day</ThemedText>
              <ThemedText style={[styles.panelCopy, { color: theme.muted }]}
              >
                Top leagues + Champions League.
              </ThemedText>
            </View>
            <Pressable
              style={[
                styles.ghostButton,
                { borderColor: theme.border },
                loading && styles.buttonDisabled,
              ]}
              onPress={loadEvents}
              disabled={loading}
            >
              <ThemedText style={[styles.buttonText, { color: theme.text }]}
              >
                {loading ? 'Refreshing...' : 'Refresh'}
              </ThemedText>
            </Pressable>
          </View>

          <View style={styles.dateRow}>
            <Pressable
              style={[styles.iconButton, { backgroundColor: theme.surfaceAlt }]}
              onPress={() => moveDate(-1)}
            >
              <ThemedText style={styles.iconButtonText}>◀</ThemedText>
            </Pressable>
            <View style={styles.dateInfo}>
              <ThemedText style={[styles.dateValue, { color: theme.text }]}
              >
                {formatDisplayDate(selectedDate)}
              </ThemedText>
              <ThemedText style={[styles.dateHint, { color: theme.muted }]}
              >
                {selectedDate}
              </ThemedText>
            </View>
            <Pressable
              style={[styles.iconButton, { backgroundColor: theme.surfaceAlt }]}
              onPress={() => moveDate(1)}
              disabled={selectedDate === todayValue()}
            >
              <ThemedText style={styles.iconButtonText}>▶</ThemedText>
            </Pressable>
          </View>

          <View style={styles.dateActions}>
            <Pressable
              style={[styles.primaryButton, { backgroundColor: theme.accent }]}
              onPress={jumpToToday}
            >
              <ThemedText style={[styles.primaryButtonText, { color: theme.accentText }]}
              >
                Today
              </ThemedText>
            </Pressable>
          </View>

          <View style={styles.summaryRow}>
            <ThemedText style={[styles.summaryText, { color: theme.muted }]}
            >
              {totalEvents} matches found
            </ThemedText>
            <ThemedText style={[styles.summaryText, { color: theme.muted }]}
            >
              {watchedIds.size} marked watched
            </ThemedText>
          </View>

          {error ? (
            <ThemedText style={[styles.errorText, { color: theme.accent }]}>
              {error}
            </ThemedText>
          ) : null}

          {loading ? (
            <ThemedText style={[styles.emptyState, { color: theme.muted }]}
            >
              Loading fixtures...
            </ThemedText>
          ) : leagues.length === 0 ? (
            <ThemedText style={[styles.emptyState, { color: theme.muted }]}
            >
              No fixtures found for this day.
            </ThemedText>
          ) : (
            <View style={styles.leagueList}>
              {leagues
                .filter((league) => league.events.length > 0)
                .map((league) => (
                  <View key={league.id} style={styles.leagueGroup}>
                    <View style={styles.leagueHeader}>
                      <ThemedText style={styles.leagueTitle}>{league.name}</ThemedText>
                      <ThemedText style={[styles.leagueMeta, { color: theme.muted }]}
                      >
                        {league.events.length} matches
                      </ThemedText>
                    </View>
                    {league.events
                      .slice()
                      .sort((a, b) => a.time.localeCompare(b.time))
                      .map((event) => {
                        const isWatched = watchedIds.has(event.eventId);
                        const isPending = pendingIds.has(event.eventId);
                        return (
                          <View
                            key={event.eventId}
                            style={[styles.eventCard, { borderColor: theme.border }]}
                          >
                            <View style={styles.eventInfo}>
                              <ThemedText style={styles.eventTime}>
                                {formatEventTime(event.date, event.time)}
                              </ThemedText>
                              <ThemedText style={styles.eventTeams}>
                                {event.homeTeam} vs {event.awayTeam}
                              </ThemedText>
                              <ThemedText style={[styles.eventScore, { color: theme.muted }]}
                              >
                                {event.homeScore !== null && event.awayScore !== null
                                  ? `${event.homeScore} - ${event.awayScore}`
                                  : 'Score TBD'}
                              </ThemedText>
                            </View>
                            <Pressable
                              style={[
                                isWatched ? styles.tagButton : styles.ghostButton,
                                { borderColor: theme.border },
                                isWatched && { backgroundColor: theme.surfaceAlt },
                                isPending && styles.buttonDisabled,
                              ]}
                              onPress={() => toggleWatched(event)}
                              disabled={isPending}
                            >
                              <ThemedText style={[styles.buttonText, { color: theme.text }]}
                              >
                                {isWatched ? 'Watched' : 'Mark watched'}
                              </ThemedText>
                            </Pressable>
                          </View>
                        );
                      })}
                  </View>
                ))}
            </View>
          )}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 48,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: {
    paddingHorizontal: 20,
    paddingTop: 28,
    paddingBottom: 12,
  },
  eyebrow: {
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontSize: 12,
    fontFamily: Fonts.mono,
  },
  heroTitle: {
    marginTop: 8,
    marginBottom: 6,
  },
  heroCopy: {
    fontSize: 15,
    lineHeight: 22,
  },
  authActions: {
    paddingHorizontal: 20,
    gap: 12,
  },
  authRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  formNote: {
    fontSize: 12,
  },
  statsRow: {
    paddingHorizontal: 20,
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    padding: 12,
    borderRadius: 16,
  },
  statLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 6,
  },
  panel: {
    marginTop: 20,
    marginHorizontal: 16,
    borderRadius: 24,
    padding: 16,
  },
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  panelCopy: {
    marginTop: 4,
    fontSize: 13,
  },
  dateRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  dateInfo: {
    flex: 1,
    alignItems: 'center',
  },
  dateValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  dateHint: {
    fontSize: 12,
    marginTop: 2,
  },
  dateActions: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 10,
  },
  summaryRow: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryText: {
    fontSize: 12,
  },
  leagueList: {
    marginTop: 12,
  },
  leagueGroup: {
    marginTop: 12,
  },
  leagueHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  leagueTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  leagueMeta: {
    fontSize: 12,
  },
  eventCard: {
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  eventInfo: {
    flex: 1,
  },
  eventTime: {
    fontSize: 14,
    fontWeight: '700',
  },
  eventTeams: {
    fontSize: 14,
    marginTop: 4,
  },
  eventScore: {
    fontSize: 12,
    marginTop: 4,
  },
  primaryButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  ghostButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
  emptyState: {
    marginTop: 18,
    textAlign: 'center',
  },
  errorText: {
    marginTop: 12,
    fontSize: 12,
  },
});
