import { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Link } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  AuthError,
  clearSessionToken,
  getSessionToken,
} from '../../lib/api';
import {
  fetchWatchedEvents,
  formatDisplayDate,
  formatEventTime,
  groupWatchedEvents,
  removeWatchedEvent,
  type WatchedEvent,
} from '../../lib/matchlog';

export default function WatchedScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const insets = useSafeAreaInsets();
  const [events, setEvents] = useState<WatchedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [sessionToken, setSessionTokenState] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [cache, setCache] = useState<WatchedEvent[] | null>(null);

  const groupedEvents = useMemo(() => groupWatchedEvents(events), [events]);

  const loadEvents = useCallback(async (forceRefresh = false) => {
    // Check cache first unless force refresh
    if (!forceRefresh && cache !== null) {
      setEvents(cache);
      setError(null);
      return;
    }

    setLoading(true);
    try {
      const loaded = await fetchWatchedEvents();
      setEvents(loaded);
      setCache(loaded);
      setError(null);
    } catch (err) {
      if (err instanceof AuthError) {
        await clearSessionToken();
        setSessionTokenState(null);
        setEvents([]);
        setCache(null);
        setError('Sign in to see your watched matches.');
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to load match log.');
    } finally {
      setLoading(false);
    }
  }, [cache]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      setCheckingSession(true);
      getSessionToken()
        .then((token) => {
          if (!active) {
            return;
          }
          setSessionTokenState(token);
          if (token) {
            void loadEvents();
          } else {
            setEvents([]);
            setLoading(false);
            setError('Sign in to see your watched matches.');
          }
        })
        .finally(() => {
          if (active) {
            setCheckingSession(false);
          }
        });
      return () => {
        active = false;
      };
    }, [loadEvents])
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

  async function unwatchEvent(eventId: string) {
    const prevEvents = events;
    const updated = events.filter((event) => event.eventId !== eventId);
    setEvents(updated);
    setPending(eventId, true);

    try {
      await removeWatchedEvent(eventId);
      setCache(updated);
      setError(null);
    } catch (err) {
      if (err instanceof AuthError) {
        await clearSessionToken();
        setSessionTokenState(null);
        setEvents([]);
        setCache(null);
        setError('Sign in to see your watched matches.');
        return;
      }
      setEvents(prevEvents);
      setError(err instanceof Error ? err.message : 'Failed to update match log.');
    } finally {
      setPending(eventId, false);
    }
  }

  async function signOut() {
    await clearSessionToken();
    setSessionTokenState(null);
    setEvents([]);
    setCache(null);
    setError('Signed out.');
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
              Sign in to see your log
            </ThemedText>
            <ThemedText style={[styles.heroCopy, { color: theme.muted }]}
            >
              Head to the fixtures tab and sign in with Google to sync your watched matches.
            </ThemedText>
          </View>
          {error ? (
            <ThemedText style={[styles.errorText, { color: theme.accent }]}>
              {error}
            </ThemedText>
          ) : null}
          <View style={styles.panel}>
            <Link href="/" asChild>
              <Pressable style={[styles.primaryButton, { backgroundColor: theme.accent }]}
              >
                <ThemedText style={[styles.primaryButtonText, { color: theme.accentText }]}
                >
                  Go to fixtures
                </ThemedText>
              </Pressable>
            </Link>
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
              onPress={signOut}
            >
              <ThemedText style={[styles.buttonText, { color: theme.text }]}
              >
                Sign out
              </ThemedText>
            </Pressable>
          </View>
          <ThemedText type="title" style={styles.heroTitle}>
            Your watched matches
          </ThemedText>
          <ThemedText style={[styles.heroCopy, { color: theme.muted }]}
          >
            Everything you marked watched lives here on your Matchlog account.
          </ThemedText>
        </View>

        <View style={[styles.panel, { backgroundColor: theme.surface }]}
        >
          <View style={styles.panelHeader}>
            <View>
              <ThemedText type="subtitle">Your log</ThemedText>
              <ThemedText style={[styles.panelCopy, { color: theme.muted }]}
              >
                {events.length} total matches
              </ThemedText>
            </View>
            <Link href="/" asChild>
              <Pressable style={[styles.ghostButton, { borderColor: theme.border }]}
              >
                <ThemedText style={[styles.buttonText, { color: theme.text }]}
                >
                  Go to fixtures
                </ThemedText>
              </Pressable>
            </Link>
          </View>

          {loading ? (
            <ThemedText style={[styles.emptyState, { color: theme.muted }]}
            >
              Loading watched matches...
            </ThemedText>
          ) : error ? (
            <ThemedText style={[styles.errorText, { color: theme.accent }]}
            >
              {error}
            </ThemedText>
          ) : events.length === 0 ? (
            <ThemedText style={[styles.emptyState, { color: theme.muted }]}
            >
              No watched matches yet. Head back and mark some fixtures.
            </ThemedText>
          ) : (
            <View style={styles.log}>
              {groupedEvents.map(({ date, items }) => (
                <View key={date} style={styles.logDay}>
                  <View style={styles.logDate}>
                    <ThemedText style={styles.logDateText}>
                      {formatDisplayDate(date)}
                    </ThemedText>
                    <ThemedText style={[styles.logDateMeta, { color: theme.muted }]}
                    >
                      {items.length} match{items.length === 1 ? '' : 'es'}
                    </ThemedText>
                  </View>
                  <View style={styles.matchList}>
                    {items.map((match) => {
                      const isPending = pendingIds.has(match.eventId);
                      return (
                        <View
                          key={match.eventId}
                          style={[styles.matchCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
                        >
                          <View style={styles.eventTimeCol}>
                            <ThemedText style={[styles.eventTime, { color: theme.tint }]}>
                              {formatEventTime(match.date, match.time)}
                            </ThemedText>
                          </View>

                          <View style={styles.eventTeamsCol}>
                            <ThemedText style={styles.eventTeam} numberOfLines={1} ellipsizeMode="tail">
                              {match.homeTeam}
                            </ThemedText>
                            <ThemedText style={styles.eventTeam} numberOfLines={1} ellipsizeMode="tail">
                              {match.awayTeam}
                            </ThemedText>
                          </View>

                          <View style={styles.eventScoreCol}>
                            <ThemedText style={styles.eventScoreText}>
                              {match.homeScore ?? '-'}
                            </ThemedText>
                            <ThemedText style={styles.eventScoreText}>
                              {match.awayScore ?? '-'}
                            </ThemedText>
                          </View>

                          <Pressable
                            style={styles.eventWatchCol}
                            onPress={() => unwatchEvent(match.eventId)}
                            disabled={isPending}
                          >
                            <Ionicons
                              name="close-circle"
                              size={20}
                              color={theme.muted}
                            />
                            <ThemedText style={[styles.watchLabel, { color: theme.muted }]}>
                              {isPending ? 'Removing' : 'Remove'}
                            </ThemedText>
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
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
  authRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  panel: {
    marginTop: 8,
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
  log: {
    marginTop: 16,
  },
  logDay: {
    marginBottom: 20,
  },
  logDate: {
    marginBottom: 12,
  },
  logDateText: {
    fontSize: 16,
    fontWeight: '700',
  },
  logDateMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  matchList: {
    gap: 8,
  },
  matchCard: {
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
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
  eventTeamsCol: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  eventTeam: {
    fontSize: 13,
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
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButton: {
    alignSelf: 'center',
    height: 34,
    minWidth: 110,
    paddingHorizontal: 14,
    borderRadius: 17,
  },
  actionButtonText: {
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
