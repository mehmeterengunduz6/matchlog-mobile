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
import { makeRedirectUri, ResponseType } from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
  type EventItem,
} from '../../lib/matchlog';

WebBrowser.maybeCompleteAuthSession();

export default function FixturesScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const insets = useSafeAreaInsets();
  const [selectedDate, setSelectedDate] = useState(todayValue());
  const [events, setEvents] = useState<EventItem[]>([]);
  const [watchedIds, setWatchedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [sessionToken, setSessionTokenState] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);

  const proxyRedirectUri = 'https://auth.expo.io/@mehmeterengunduz6/matchlog-app';
  const returnUrl = makeRedirectUri({ path: 'oauthredirect' });

  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: process.env.EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID,
    redirectUri: proxyRedirectUri,
    responseType: ResponseType.IdToken,
    scopes: ['profile', 'email'],
  });

  function promptWithProxy() {
    if (!request?.url) {
      return;
    }
    const startUrl = `${proxyRedirectUri}/start?authUrl=${encodeURIComponent(
      request.url
    )}&returnUrl=${encodeURIComponent(returnUrl)}`;
    void promptAsync({ url: startUrl });
  }

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
    setEvents([]);
    setWatchedIds(new Set());
    setError('Sign in to see your fixtures.');
  }, []);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchEventsByDate(selectedDate);
      setEvents(data.events);
      setWatchedIds(new Set(data.watchedIds));
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
    } catch (err) {
      if (err instanceof AuthError) {
        await handleAuthError();
        return;
      }
      setWatchedIds(prevWatchedIds);
      setError(err instanceof Error ? err.message : 'Failed to update match log.');
    } finally {
      setPending(event.eventId, false);
    }
  }

  function moveDate(delta: number) {
    const nextDate = addDays(selectedDate, delta);
    setSelectedDate(nextDate);
  }

  async function signOut() {
    await clearSessionToken();
    setSessionTokenState(null);
    setEvents([]);
    setWatchedIds(new Set());
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
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 12 },
        ]}
      >
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
              onPress={promptWithProxy}
              disabled={!request?.url || authLoading}
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
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 12 },
        ]}
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
            <View style={[styles.datePill, { backgroundColor: theme.surfaceAlt }]}>
              <Pressable
                style={styles.datePillButton}
                onPress={() => moveDate(-1)}
              >
                <ThemedText style={[styles.datePillIcon, { color: theme.tint }]}>◀</ThemedText>
              </Pressable>
              <View style={styles.datePillCenter}>
                <ThemedText style={[styles.datePillLabel, { color: theme.tint }]}>
                  {selectedDate === todayValue() ? 'Today' : formatDisplayDate(selectedDate)}
                </ThemedText>
              </View>
              <Pressable
                style={styles.datePillButton}
                onPress={() => moveDate(1)}
              >
                <ThemedText style={[styles.datePillIcon, { color: theme.tint }]}>▶</ThemedText>
              </Pressable>
            </View>
          </View>

          <View style={styles.summaryRow}>
            <ThemedText style={[styles.summaryText, { color: theme.muted }]}
            >
              {events.length} matches found
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
          ) : events.length === 0 ? (
            <ThemedText style={[styles.emptyState, { color: theme.muted }]}
            >
              No fixtures found for this day.
            </ThemedText>
          ) : (
            <View style={styles.eventList}>
              {events.map((event) => {
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
                      <View style={styles.eventMeta}>
                        <View style={[styles.leagueBadge, { backgroundColor: theme.tint }]}>
                          <ThemedText style={styles.leagueBadgeText}>
                            {event.leagueName}
                          </ThemedText>
                        </View>
                        <ThemedText style={[styles.eventScore, { color: theme.muted }]}
                        >
                          {event.homeScore !== null && event.awayScore !== null
                            ? `${event.homeScore} - ${event.awayScore}`
                            : 'Score TBD'}
                        </ThemedText>
                      </View>
                    </View>
                    <Pressable
                      style={[
                        isWatched ? styles.tagButton : styles.ghostButton,
                        styles.watchButton,
                        { borderColor: theme.border },
                        isWatched && { backgroundColor: theme.surfaceAlt },
                        isPending && styles.buttonDisabled,
                      ]}
                      onPress={() => toggleWatched(event)}
                      disabled={isPending}
                    >
                      <ThemedText
                        style={[styles.buttonText, styles.watchButtonText, { color: theme.text }]}
                      >
                        {isWatched ? 'Watched' : 'Mark watched'}
                      </ThemedText>
                    </Pressable>
                  </View>
                );
              })}
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
    paddingTop: 0,
    paddingBottom: 48,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hero: {
    paddingHorizontal: 20,
    paddingTop: 8,
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
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  datePillButton: {
    width: 40,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  datePillCenter: {
    flex: 1,
    alignItems: 'center',
  },
  datePillLabel: {
    fontSize: 18,
    fontWeight: '600',
  },
  datePillIcon: {
    fontSize: 18,
    fontWeight: '700',
  },
  summaryRow: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryText: {
    fontSize: 12,
  },
  eventList: {
    marginTop: 12,
    gap: 10,
  },
  eventMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  leagueBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  leagueBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
  watchButton: {
    alignSelf: 'center',
    height: 34,
    minWidth: 110,
    paddingHorizontal: 14,
    borderRadius: 17,
  },
  watchButtonText: {
    fontSize: 11,
    lineHeight: 14,
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
  emptyState: {
    marginTop: 18,
    textAlign: 'center',
  },
  errorText: {
    marginTop: 12,
    fontSize: 12,
  },
});
