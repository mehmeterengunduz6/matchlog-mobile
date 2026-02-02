import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri, ResponseType } from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DraggableFlatList, {
  ScaleDecorator,
} from 'react-native-draggable-flatlist';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

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
  addNotifiedEvent,
  fetchEventsByDate,
  formatDisplayDate,
  formatEventTime,
  getNotifiedEvent,
  isMatchLive,
  removeWatchedEvent,
  removeNotifiedEvent,
  todayValue,
  type EventItem,
  type EventsResponse,
  type LeagueGroup,
} from '../../lib/matchlog';
import {
  cancelNotification,
  getMatchStatus,
  requestNotificationPermissions,
  scheduleMatchNotification,
} from '../../lib/notifications';
import {
  fetchPreferences,
  getCachedPreferences,
  toggleLeagueCollapsed,
  toggleLeagueHidden,
  toggleFavoriteTeam,
  updateLeagueOrder,
  type UserPreferences,
} from '../../lib/preferences';

WebBrowser.maybeCompleteAuthSession();

function groupLeaguesWithFavorites(
  leagues: LeagueGroup[],
  favoriteTeams: Set<string>
): LeagueGroup[] {
  if (favoriteTeams.size === 0) {
    return leagues;
  }

  const favoriteEvents: EventItem[] = [];
  const updatedLeagues: LeagueGroup[] = [];

  // Extract favorite matches from all leagues
  leagues.forEach((league) => {
    const nonFavoriteEvents: EventItem[] = [];

    league.events.forEach((event) => {
      if (favoriteTeams.has(event.homeTeam) || favoriteTeams.has(event.awayTeam)) {
        favoriteEvents.push(event);
      } else {
        nonFavoriteEvents.push(event);
      }
    });

    // Only include league if it still has non-favorite events
    if (nonFavoriteEvents.length > 0) {
      updatedLeagues.push({
        ...league,
        events: nonFavoriteEvents,
      });
    }
  });

  // Create Favorites group if there are any favorite matches
  if (favoriteEvents.length > 0) {
    const favoritesGroup: LeagueGroup = {
      id: 'favorites',
      name: 'Favorites',
      badge: '',
      events: favoriteEvents,
    };
    return [favoritesGroup, ...updatedLeagues];
  }

  return updatedLeagues;
}

export default function FixturesScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const insets = useSafeAreaInsets();
  const [selectedDate, setSelectedDate] = useState(todayValue());
  const [leagues, setLeagues] = useState<LeagueGroup[]>([]);
  const [leagueOrder, setLeagueOrder] = useState<string[]>([]);
  const [collapsedLeagues, setCollapsedLeagues] = useState<Set<string>>(new Set());
  const [hiddenLeagues, setHiddenLeagues] = useState<Set<string>>(new Set());
  const [favoriteTeams, setFavoriteTeams] = useState<Set<string>>(new Set());
  const [watchedIds, setWatchedIds] = useState<Set<string>>(new Set());
  const [notifiedIds, setNotifiedIds] = useState<Set<string>>(new Set());
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

  const applyPreferences = useCallback((prefs: UserPreferences) => {
    if (prefs.collapsedLeagues) {
      setCollapsedLeagues(new Set(prefs.collapsedLeagues));
    }
    if (prefs.hiddenLeagues) {
      setHiddenLeagues(new Set(prefs.hiddenLeagues));
    }
    if (prefs.leagueOrder && prefs.leagueOrder.length > 0) {
      setLeagueOrder(prefs.leagueOrder);
    }
    if (prefs.favoriteTeams) {
      setFavoriteTeams(new Set(prefs.favoriteTeams));
    }
  }, []);

  const loadPreferences = useCallback(async () => {
    const cached = await getCachedPreferences();
    applyPreferences(cached);

    try {
      const fresh = await fetchPreferences();
      applyPreferences(fresh);
    } catch (err) {
      console.error('Failed to fetch fresh preferences:', err);
    }
  }, [applyPreferences]);

  useEffect(() => {
    if (!sessionToken) {
      return;
    }
    void loadPreferences();
  }, [sessionToken, loadPreferences]);

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
    setNotifiedIds(new Set());
    setError('Sign in to see your fixtures.');
  }, []);

  const loadEvents = useCallback(async (forceRefresh = false) => {
    // Check cache first unless force refresh
    if (!forceRefresh) {
      const cached = cache.get(selectedDate);
      if (cached) {
        // Group cached leagues with favorites at top
        const groupedLeagues = groupLeaguesWithFavorites(cached.leagues ?? [], favoriteTeams);
        setLeagues(groupedLeagues);
        if (leagueOrder.length === 0 && cached.leagues?.length > 0) {
          setLeagueOrder(cached.leagues.map((l) => l.id));
        }
        setWatchedIds(new Set(cached.watchedIds ?? []));
        setNotifiedIds(new Set(cached.notifiedIds ?? []));
        setError(null);
        return;
      }
    }

    setLoading(true);
    try {
      const data = await fetchEventsByDate(selectedDate);

      // Group leagues with favorites at top
      const groupedLeagues = groupLeaguesWithFavorites(data.leagues ?? [], favoriteTeams);

      setLeagues(groupedLeagues);
      if (leagueOrder.length === 0 && data.leagues?.length > 0) {
        setLeagueOrder(data.leagues.map((l) => l.id));
      }
      setWatchedIds(new Set(data.watchedIds ?? []));
      setNotifiedIds(new Set(data.notifiedIds ?? []));
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
  }, [handleAuthError, selectedDate, leagueOrder.length, favoriteTeams, cache]);

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

  async function toggleNotified(event: EventItem) {
    // Check if match is too soon or past
    const matchStatus = getMatchStatus(event.date, event.time);
    if (matchStatus !== 'future') {
      Alert.alert(
        'Cannot Notify',
        'This match is starting soon or has already started.'
      );
      return;
    }

    // Request permissions
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) {
      Alert.alert(
        'Notifications Disabled',
        'Please enable notifications in Settings to receive match reminders.',
        [{ text: 'OK' }]
      );
      return;
    }

    const isNotified = notifiedIds.has(event.eventId);
    const prevNotifiedIds = notifiedIds;
    const nextNotifiedIds = new Set(prevNotifiedIds);

    // Optimistic UI update
    if (isNotified) {
      nextNotifiedIds.delete(event.eventId);
    } else {
      nextNotifiedIds.add(event.eventId);
    }
    setNotifiedIds(nextNotifiedIds);
    setPending(event.eventId, true);

    try {
      if (isNotified) {
        // Cancel notification and remove from backend
        const record = await getNotifiedEvent(event.eventId);
        if (record?.notificationId) {
          await cancelNotification(record.notificationId);
        }
        await removeNotifiedEvent(event.eventId);
      } else {
        // Schedule notification and save to backend
        const notificationId = await scheduleMatchNotification(event);
        await addNotifiedEvent(event, notificationId);
      }

      setError(null);

      // Update cache
      const cached = cache.get(selectedDate);
      if (cached) {
        const updatedCache = {
          ...cached,
          notifiedIds: Array.from(nextNotifiedIds),
        };
        setCache((prev) => new Map(prev).set(selectedDate, updatedCache));
      }
    } catch (err) {
      if (err instanceof AuthError) {
        await handleAuthError();
        return;
      }
      // Rollback on error
      setNotifiedIds(prevNotifiedIds);
      setError(
        err instanceof Error ? err.message : 'Failed to update notification.'
      );
    } finally {
      setPending(event.eventId, false);
    }
  }

  function moveDate(delta: number) {
    const nextDate = addDays(selectedDate, delta);
    setSelectedDate(nextDate);
  }

  async function toggleCollapsed(leagueId: string) {
    const newCollapsed = new Set(collapsedLeagues);
    if (newCollapsed.has(leagueId)) {
      newCollapsed.delete(leagueId);
    } else {
      newCollapsed.add(leagueId);
    }
    setCollapsedLeagues(newCollapsed);

    try {
      await toggleLeagueCollapsed(leagueId);
    } catch (err) {
      console.error('Failed to toggle collapsed state:', err);
      setCollapsedLeagues(collapsedLeagues);
    }
  }

  async function toggleHidden(leagueId: string) {
    const newHidden = new Set(hiddenLeagues);
    if (newHidden.has(leagueId)) {
      newHidden.delete(leagueId);
    } else {
      newHidden.add(leagueId);
    }
    setHiddenLeagues(newHidden);

    try {
      await toggleLeagueHidden(leagueId);
    } catch (err) {
      console.error('Failed to toggle hidden state:', err);
      setHiddenLeagues(hiddenLeagues);
    }
  }

  async function toggleFavorite(teamName: string) {
    const newFavorites = new Set(favoriteTeams);
    if (newFavorites.has(teamName)) {
      newFavorites.delete(teamName);
    } else {
      newFavorites.add(teamName);
    }

    // Optimistic update
    setFavoriteTeams(newFavorites);

    // Re-group leagues with new favorites
    const cached = cache.get(selectedDate);
    if (cached) {
      const regroupedLeagues = groupLeaguesWithFavorites(cached.leagues ?? [], newFavorites);
      setLeagues(regroupedLeagues);
    }

    try {
      await toggleFavoriteTeam(teamName);
      // Invalidate cache for current date so it refetches with updated favorites
      const newCache = new Map(cache);
      newCache.delete(selectedDate);
      setCache(newCache);
    } catch (err) {
      console.error('Failed to toggle favorite team:', err);
      // Rollback on error
      setFavoriteTeams(favoriteTeams);
      if (cached) {
        const regroupedLeagues = groupLeaguesWithFavorites(cached.leagues ?? [], favoriteTeams);
        setLeagues(regroupedLeagues);
      }
    }
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
          <ThemedText style={[styles.eyebrow, { color: theme.muted }]}>Matchlog</ThemedText>
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
              style={styles.settingsIconButton}
              onPress={() => setShowSettings(true)}
            >
              <Ionicons name="settings-outline" size={22} color={theme.muted} />
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
                .filter((league) => !hiddenLeagues.has(league.id))
                .map((league, index, filtered) => (
                  <View
                    key={league.id}
                    style={[styles.leagueGroup, { backgroundColor: theme.surfaceAlt }]}
                  >
                    <Pressable
                      style={styles.leagueHeader}
                      onPress={() => toggleCollapsed(league.id)}
                    >
                      <View style={styles.leagueTitle}>
                        {league.id === 'favorites' ? (
                          <View style={styles.leagueBadgeImage}>
                            <Ionicons name="star" size={20} color={theme.muted} />
                          </View>
                        ) : (
                          <Image
                            source={{ uri: league.badge }}
                            style={styles.leagueBadgeImage}
                          />
                        )}
                        <ThemedText style={styles.leagueName}>{league.name}</ThemedText>
                      </View>
                      <View style={styles.leagueRight}>
                        <ThemedText style={[styles.leagueCount, { color: theme.muted }]}>
                          {league.events.length}
                        </ThemedText>
                        <Ionicons
                          name={collapsedLeagues.has(league.id) ? 'chevron-forward' : 'chevron-down'}
                          size={20}
                          color={theme.muted}
                        />
                      </View>
                    </Pressable>
                    {!collapsedLeagues.has(league.id) && league.events.map((event) => {
                      const isWatched = watchedIds.has(event.eventId);
                      const isNotified = notifiedIds.has(event.eventId);
                      const isPending = pendingIds.has(event.eventId);
                      const isLive = isMatchLive(event.date, event.time);
                      const matchStatus = getMatchStatus(event.date, event.time);
                      const showNotifyButton = matchStatus === 'future' && !event.time?.includes('TBD');

                      return (
                        <Pressable
                          key={event.eventId}
                          style={[styles.eventCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                          onPress={() => showNotifyButton ? toggleNotified(event) : toggleWatched(event)}
                          disabled={isPending}
                        >
                          <View style={styles.eventTimeCol}>
                            <ThemedText style={[styles.eventTime, { color: theme.tint }]}>
                              {formatEventTime(event.date, event.time)}
                            </ThemedText>
                            {isLive && (
                              <ThemedText style={styles.eventStatus}>LIVE</ThemedText>
                            )}
                          </View>

                          <View style={styles.eventTeamsCol}>
                            {/* Home Team Row */}
                            <View style={styles.teamRow}>
                              <ThemedText style={styles.eventTeam} numberOfLines={1} ellipsizeMode="tail">
                                {event.homeTeam}
                              </ThemedText>
                              <Pressable
                                onPress={(e) => {
                                  e.stopPropagation();
                                  void toggleFavorite(event.homeTeam);
                                }}
                                hitSlop={8}
                                style={styles.starButton}
                              >
                                <Ionicons
                                  name={favoriteTeams.has(event.homeTeam) ? "star" : "star-outline"}
                                  size={14}
                                  color={favoriteTeams.has(event.homeTeam) ? "#FFC107" : theme.muted}
                                />
                              </Pressable>
                            </View>

                            {/* Away Team Row */}
                            <View style={styles.teamRow}>
                              <ThemedText style={styles.eventTeam} numberOfLines={1} ellipsizeMode="tail">
                                {event.awayTeam}
                              </ThemedText>
                              <Pressable
                                onPress={(e) => {
                                  e.stopPropagation();
                                  void toggleFavorite(event.awayTeam);
                                }}
                                hitSlop={8}
                                style={styles.starButton}
                              >
                                <Ionicons
                                  name={favoriteTeams.has(event.awayTeam) ? "star" : "star-outline"}
                                  size={14}
                                  color={favoriteTeams.has(event.awayTeam) ? "#FFC107" : theme.muted}
                                />
                              </Pressable>
                            </View>
                          </View>

                          <View style={styles.eventScoreCol}>
                            <ThemedText style={styles.eventScoreText}>
                              {event.homeScore ?? '-'}
                            </ThemedText>
                            <ThemedText style={styles.eventScoreText}>
                              {event.awayScore ?? '-'}
                            </ThemedText>
                          </View>

                          {showNotifyButton ? (
                            <View style={styles.eventWatchCol}>
                              <Ionicons
                                name={isNotified ? 'notifications' : 'notifications-outline'}
                                size={20}
                                color={isNotified ? theme.tint : theme.muted}
                              />
                              <ThemedText style={[styles.watchLabel, { color: isNotified ? theme.tint : theme.muted }]}>
                                {isNotified ? 'Notified' : 'Notify'}
                              </ThemedText>
                            </View>
                          ) : (
                            <View style={styles.eventWatchCol}>
                              <Ionicons
                                name={isWatched ? 'eye' : 'eye-outline'}
                                size={20}
                                color={isLive && isWatched ? '#FF3B30' : theme.muted}
                              />
                              <ThemedText style={[styles.watchLabel, { color: isLive && isWatched ? '#FF3B30' : theme.muted }]}>
                                {isWatched ? (isLive ? 'Watching' : 'Watched') : 'Watch'}
                              </ThemedText>
                            </View>
                          )}
                        </Pressable>
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

            <View style={styles.modalBody}>
              <View style={styles.settingsSection}>
                <ThemedText type="subtitle">League Settings</ThemedText>
                <ThemedText style={[styles.settingsDescription, { color: theme.muted }]}>
                  Long press to reorder, toggle to hide/show leagues
                </ThemedText>
                <GestureHandlerRootView style={styles.leagueOrderList}>
                  <DraggableFlatList
                    data={leagueOrder.map((leagueId) => ({
                      id: leagueId,
                      league: leagues.find((l) => l.id === leagueId),
                    })).filter((item) => item.league !== undefined)}
                    keyExtractor={(item) => item.id}
                    onDragEnd={async ({ data }) => {
                      const newOrder = data.map((item) => item.id);
                      setLeagueOrder(newOrder);
                      setLeagues((prev) =>
                        [...prev].sort(
                          (a, b) =>
                            newOrder.indexOf(a.id) - newOrder.indexOf(b.id)
                        )
                      );
                      try {
                        await updateLeagueOrder(newOrder);
                      } catch (err) {
                        console.error('Failed to persist league order:', err);
                      }
                    }}
                    renderItem={({ item, drag, isActive }) => (
                      <ScaleDecorator>
                        <View
                          style={[
                            styles.leagueOrderItem,
                            {
                              backgroundColor: isActive ? theme.surface : theme.surfaceAlt,
                              borderColor: theme.border,
                              opacity: isActive ? 0.8 : 1,
                            },
                          ]}
                        >
                          <Pressable
                            onLongPress={drag}
                            disabled={isActive}
                            style={styles.leagueOrderInfo}
                          >
                            <Ionicons
                              name="menu"
                              size={20}
                              color={theme.muted}
                              style={{ marginRight: 8 }}
                            />
                            <Image
                              source={{ uri: item.league!.badge }}
                              style={styles.leagueBadgeImage}
                            />
                            <ThemedText style={styles.leagueOrderName}>
                              {item.league!.name}
                            </ThemedText>
                          </Pressable>
                          <Switch
                            value={!hiddenLeagues.has(item.id)}
                            onValueChange={() => toggleHidden(item.id)}
                          />
                        </View>
                      </ScaleDecorator>
                    )}
                  />
                </GestureHandlerRootView>
              </View>

            </View>
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
  settingsIconButton: {
    padding: 8,
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
  leagueRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  leagueName: {
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  leagueCount: {
    fontSize: 12,
  },
  leagueBadgeImage: {
    width: 24,
    height: 24,
    resizeMode: 'contain',
    justifyContent: 'center',
    alignItems: 'center',
  },
  eventCard: {
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  eventTimeCol: {
    width: 50,
    alignItems: 'center',
  },
  eventTime: {
    fontSize: 13,
    fontWeight: '700',
  },
  eventStatus: {
    fontSize: 9,
    fontWeight: '600',
    color: '#e53935',
    marginTop: 2,
  },
  eventTeamsCol: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  eventTeam: {
    fontSize: 13,
    flexShrink: 1,
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    minWidth: 0,
  },
  starButton: {
    padding: 0,
    paddingLeft: 2,
  },
  eventScoreCol: {
    width: 35,
    alignItems: 'center',
    gap: 4,
  },
  eventScoreText: {
    fontSize: 15,
    fontWeight: '700',
  },
  eventWatchCol: {
    width: 55,
    alignItems: 'center',
    gap: 4,
  },
  watchLabel: {
    fontSize: 10,
    fontWeight: '600',
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
    padding: 20,
  },
  settingsSection: {
    marginBottom: 20,
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
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
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
});
