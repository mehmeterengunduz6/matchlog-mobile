import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Image,
  Modal,
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
  isMatchLive,
  removeWatchedEvent,
  todayValue,
  type EventItem,
  type EventsResponse,
  type LeagueGroup,
} from '../../lib/matchlog';

WebBrowser.maybeCompleteAuthSession();

export default function FixturesScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const insets = useSafeAreaInsets();
  const [selectedDate, setSelectedDate] = useState(todayValue());
  const [leagues, setLeagues] = useState<LeagueGroup[]>([]);
  const [leagueOrder, setLeagueOrder] = useState<string[]>([]);
  const [watchedIds, setWatchedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [sessionToken, setSessionTokenState] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [cache, setCache] = useState<Map<string, EventsResponse>>(new Map());

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
    setLeagues([]);
    setWatchedIds(new Set());
    setError('Sign in to see your fixtures.');
  }, []);

  const loadEvents = useCallback(async (forceRefresh = false) => {
    // Check cache first unless force refresh
    if (!forceRefresh) {
      const cached = cache.get(selectedDate);
      if (cached) {
        setLeagues(cached.leagues ?? []);
        if (leagueOrder.length === 0 && cached.leagues?.length > 0) {
          setLeagueOrder(cached.leagues.map((l) => l.id));
        }
        setWatchedIds(new Set(cached.watchedIds ?? []));
        setError(null);
        return;
      }
    }

    setLoading(true);
    try {
      const data = await fetchEventsByDate(selectedDate);
      setLeagues(data.leagues ?? []);
      if (leagueOrder.length === 0 && data.leagues?.length > 0) {
        setLeagueOrder(data.leagues.map((l) => l.id));
      }
      setWatchedIds(new Set(data.watchedIds ?? []));
      setError(null);
      // Update cache
      setCache((prev) => new Map(prev).set(selectedDate, data));
    } catch (err) {
      if (err instanceof AuthError) {
        await handleAuthError();
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to load fixtures.');
    } finally {
      setLoading(false);
    }
  }, [handleAuthError, selectedDate, leagueOrder.length, cache]);

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
      // Update cache with new watchedIds
      const cached = cache.get(selectedDate);
      if (cached) {
        const updatedCache = {
          ...cached,
          watchedIds: Array.from(nextWatchedIds),
        };
        setCache((prev) => new Map(prev).set(selectedDate, updatedCache));
      }
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
    setLeagues([]);
    setWatchedIds(new Set());
    setError(null);
  }

  function moveLeague(leagueId: string, direction: 'up' | 'down') {
    const newOrder = [...leagueOrder];
    const idx = newOrder.indexOf(leagueId);
    if (direction === 'up' && idx > 0) {
      [newOrder[idx - 1], newOrder[idx]] = [newOrder[idx], newOrder[idx - 1]];
    } else if (direction === 'down' && idx < newOrder.length - 1) {
      [newOrder[idx], newOrder[idx + 1]] = [newOrder[idx + 1], newOrder[idx]];
    }
    setLeagueOrder(newOrder);
    setLeagues((prev) =>
      [...prev].sort((a, b) => newOrder.indexOf(a.id) - newOrder.indexOf(b.id))
    );
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
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => loadEvents(true)} />}
      >
        <View style={styles.hero}>
          <View style={styles.authRow}>
            <ThemedText style={[styles.eyebrow, { color: theme.muted }]}>Matchlog</ThemedText>
            <Pressable
              style={[styles.ghostButton, { borderColor: theme.border }]}
              onPress={() => setShowSettings(true)}
            >
              <ThemedText style={[styles.buttonText, { color: theme.text }]}
              >
                Settings
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
                disabled={selectedDate >= todayValue()}
              >
                <ThemedText style={[styles.datePillIcon, { color: theme.tint }]}>▶</ThemedText>
              </Pressable>
            </View>
          </View>

          {selectedDate !== todayValue() && (
            <Pressable
              style={[styles.ghostButton, { borderColor: theme.border, marginTop: 12 }]}
              onPress={() => setSelectedDate(todayValue())}
            >
              <ThemedText style={[styles.buttonText, { color: theme.text }]}>
                Jump to today
              </ThemedText>
            </Pressable>
          )}

          <View style={styles.summaryRow}>
            <ThemedText style={[styles.summaryText, { color: theme.muted }]}>
              {leagues.reduce((sum, l) => sum + l.events.length, 0)} matches found
            </ThemedText>
            <ThemedText style={[styles.summaryText, { color: theme.muted }]}>
              {watchedIds.size} marked watched
            </ThemedText>
          </View>

          {error ? (
            <ThemedText style={[styles.errorText, { color: theme.accent }]}>
              {error}
            </ThemedText>
          ) : null}

          {loading ? (
            <ThemedText style={[styles.emptyState, { color: theme.muted }]}>
              Loading fixtures...
            </ThemedText>
          ) : leagues.length === 0 ? (
            <ThemedText style={[styles.emptyState, { color: theme.muted }]}>
              No fixtures found for this day.
            </ThemedText>
          ) : (
            <View style={styles.leagueList}>
              {leagues
                .filter((league) => league.events.length > 0)
                .map((league, index, filtered) => (
                  <View
                    key={league.id}
                    style={[styles.leagueGroup, { backgroundColor: theme.surfaceAlt }]}
                  >
                    <View style={styles.leagueHeader}>
                      <View style={styles.leagueTitle}>
                        <Image
                          source={{ uri: league.badge }}
                          style={styles.leagueBadgeImage}
                        />
                        <ThemedText style={styles.leagueName}>{league.name}</ThemedText>
                      </View>
                      <ThemedText style={[styles.leagueCount, { color: theme.muted }]}>
                        {league.events.length}
                      </ThemedText>
                    </View>
                    {league.events.map((event) => {
                      const isWatched = watchedIds.has(event.eventId);
                      const isPending = pendingIds.has(event.eventId);
                      const isLive = isMatchLive(event.date, event.time);
                      return (
                        <View
                          key={event.eventId}
                          style={[styles.eventCard, { borderColor: theme.border }]}
                        >
                          <View style={styles.eventInfo}>
                            <View style={styles.eventTimeRow}>
                              <ThemedText style={styles.eventTime}>
                                {formatEventTime(event.date, event.time)}
                              </ThemedText>
                              {isLive && (
                                <View style={styles.liveBadge}>
                                  <ThemedText style={styles.liveBadgeText}>LIVE</ThemedText>
                                </View>
                              )}
                            </View>
                            <ThemedText style={styles.eventTeams}>
                              {event.homeTeam} vs {event.awayTeam}
                            </ThemedText>
                            <ThemedText style={[styles.eventScore, { color: theme.muted }]}>
                              {event.homeScore !== null && event.awayScore !== null
                                ? `${event.homeScore} - ${event.awayScore}`
                                : 'Score TBD'}
                            </ThemedText>
                          </View>
                          <Pressable
                            style={[
                              isWatched ? styles.tagButton : styles.ghostButton,
                              styles.watchButton,
                              { borderColor: theme.border },
                              isWatched && { backgroundColor: theme.surface },
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
                ))}
            </View>
          )}
        </View>
      </ScrollView>

      <Modal
        visible={showSettings}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowSettings(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowSettings(false)}>
          <Pressable
            style={[styles.modalContent, { backgroundColor: theme.surface }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <ThemedText type="title">Settings</ThemedText>
              <Pressable
                style={[styles.modalClose, { borderColor: theme.border }]}
                onPress={() => setShowSettings(false)}
              >
                <ThemedText>✕</ThemedText>
              </Pressable>
            </View>

            <ScrollView
              style={styles.modalBody}
              contentContainerStyle={styles.modalBodyContent}
            >
              <View style={styles.settingsSection}>
                <ThemedText type="subtitle">League Order</ThemedText>
                <ThemedText style={[styles.settingsDescription, { color: theme.muted }]}>
                  Use arrows to reorder leagues
                </ThemedText>
                <View style={styles.leagueOrderList}>
                  {leagueOrder.map((leagueId, index) => {
                    const league = leagues.find((l) => l.id === leagueId);
                    if (!league) return null;
                    return (
                      <View
                        key={leagueId}
                        style={[styles.leagueOrderItem, { backgroundColor: theme.surfaceAlt, borderColor: theme.border }]}
                      >
                        <View style={styles.leagueOrderInfo}>
                          <Image
                            source={{ uri: league.badge }}
                            style={styles.leagueBadgeImage}
                          />
                          <ThemedText style={styles.leagueOrderName}>
                            {league.name}
                          </ThemedText>
                        </View>
                        <View style={styles.leagueOrderActions}>
                          <Pressable
                            style={[
                              styles.orderButton,
                              { borderColor: theme.border },
                              index === 0 && styles.buttonDisabled,
                            ]}
                            onPress={() => {
                              const newOrder = [...leagueOrder];
                              [newOrder[index - 1], newOrder[index]] = [
                                newOrder[index],
                                newOrder[index - 1],
                              ];
                              setLeagueOrder(newOrder);
                              setLeagues((prev) =>
                                [...prev].sort(
                                  (a, b) =>
                                    newOrder.indexOf(a.id) -
                                    newOrder.indexOf(b.id)
                                )
                              );
                            }}
                            disabled={index === 0}
                          >
                            <ThemedText style={styles.orderButtonText}>▲</ThemedText>
                          </Pressable>
                          <Pressable
                            style={[
                              styles.orderButton,
                              { borderColor: theme.border },
                              index === leagueOrder.length - 1 && styles.buttonDisabled,
                            ]}
                            onPress={() => {
                              const newOrder = [...leagueOrder];
                              [newOrder[index], newOrder[index + 1]] = [
                                newOrder[index + 1],
                                newOrder[index],
                              ];
                              setLeagueOrder(newOrder);
                              setLeagues((prev) =>
                                [...prev].sort(
                                  (a, b) =>
                                    newOrder.indexOf(a.id) -
                                    newOrder.indexOf(b.id)
                                )
                              );
                            }}
                            disabled={index === leagueOrder.length - 1}
                          >
                            <ThemedText style={styles.orderButtonText}>▼</ThemedText>
                          </Pressable>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>

              <View style={styles.accountSection}>
                <ThemedText type="subtitle">Account</ThemedText>
                <Pressable
                  style={[styles.ghostButton, { borderColor: theme.border }]}
                  onPress={() => {
                    setShowSettings(false);
                    signOut();
                  }}
                >
                  <ThemedText style={[styles.buttonText, { color: theme.text }]}>
                    Sign out
                  </ThemedText>
                </Pressable>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
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
    alignItems: 'center',
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
  leagueList: {
    marginTop: 12,
    gap: 16,
  },
  leagueGroup: {
    borderRadius: 16,
    padding: 12,
    gap: 10,
  },
  leagueHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  leagueTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  leagueName: {
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  leagueCount: {
    fontSize: 12,
    marginRight: 4,
  },
  orderButton: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderButtonText: {
    fontSize: 10,
  },
  leagueBadgeImage: {
    width: 24,
    height: 24,
    resizeMode: 'contain',
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
  eventTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  eventTime: {
    fontSize: 14,
    fontWeight: '700',
  },
  liveBadge: {
    backgroundColor: '#e53935',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  liveBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.5,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 20,
    paddingHorizontal: 20,
    paddingBottom: 40,
    height: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalClose: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    flex: 1,
  },
  modalBodyContent: {
    padding: 20,
  },
  settingsSection: {
    marginBottom: 20,
  },
  accountSection: {
    marginTop: 12,
    gap: 16,
  },
  settingsDescription: {
    fontSize: 13,
    marginTop: 4,
    marginBottom: 12,
  },
  leagueOrderList: {
    gap: 8,
  },
  leagueOrderItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  leagueOrderInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  leagueOrderName: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  leagueOrderActions: {
    flexDirection: 'row',
    gap: 6,
  },
});
