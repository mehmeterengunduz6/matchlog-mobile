import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Link } from 'expo-router';

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
  computeInsights,
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
  const [events, setEvents] = useState<WatchedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [sessionToken, setSessionTokenState] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  const groupedEvents = useMemo(() => groupWatchedEvents(events), [events]);
  const insights = useMemo(() => computeInsights(events), [events]);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const loaded = await fetchWatchedEvents();
      setEvents(loaded);
      setError(null);
    } catch (err) {
      if (err instanceof AuthError) {
        await clearSessionToken();
        setSessionTokenState(null);
        setEvents([]);
        setError('Sign in to see your watched matches.');
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to load match log.');
    } finally {
      setLoading(false);
    }
  }, []);

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
      setError(null);
    } catch (err) {
      if (err instanceof AuthError) {
        await clearSessionToken();
        setSessionTokenState(null);
        setEvents([]);
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
        <ScrollView contentContainerStyle={styles.scrollContent}>
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
      <ScrollView contentContainerStyle={styles.scrollContent}>
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

        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: theme.surface }]}
          >
            <ThemedText style={[styles.statLabel, { color: theme.muted }]}
            >
              Most watched team
            </ThemedText>
            <ThemedText style={styles.statValue}>{insights.topTeam}</ThemedText>
          </View>
          <View style={[styles.statCard, { backgroundColor: theme.surface }]}
          >
            <ThemedText style={[styles.statLabel, { color: theme.muted }]}
            >
              Top league
            </ThemedText>
            <ThemedText style={styles.statValue}>{insights.topLeague}</ThemedText>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: theme.surface }]}
          >
            <ThemedText style={[styles.statLabel, { color: theme.muted }]}
            >
              Busiest day
            </ThemedText>
            <ThemedText style={styles.statValue}>{insights.topWeekday}</ThemedText>
          </View>
          <View style={[styles.statCard, { backgroundColor: theme.surface }]}
          >
            <ThemedText style={[styles.statLabel, { color: theme.muted }]}
            >
              Total watched
            </ThemedText>
            <ThemedText style={styles.statValue}>{insights.totalCount}</ThemedText>
          </View>
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
                  {items.map((match) => (
                    <View
                      key={match.eventId}
                      style={[styles.logItem, { borderColor: theme.border }]}
                    >
                      <View style={styles.logInfo}>
                        <ThemedText style={styles.logTime}>
                          {formatEventTime(match.date, match.time)}
                        </ThemedText>
                        <ThemedText style={styles.logTeams}>
                          {match.homeTeam} vs {match.awayTeam}
                        </ThemedText>
                        <ThemedText style={[styles.logLeague, { color: theme.muted }]}
                        >
                          {match.leagueName}
                        </ThemedText>
                        <ThemedText style={[styles.logScore, { color: theme.muted }]}
                        >
                          {match.homeScore !== null && match.awayScore !== null
                            ? `${match.homeScore} - ${match.awayScore}`
                            : 'Score TBD'}
                        </ThemedText>
                      </View>
                      <Pressable
                        style={[
                          styles.ghostButton,
                          { borderColor: theme.border },
                          pendingIds.has(match.eventId) && styles.buttonDisabled,
                        ]}
                        onPress={() => unwatchEvent(match.eventId)}
                        disabled={pendingIds.has(match.eventId)}
                      >
                        <ThemedText style={[styles.buttonText, { color: theme.text }]}
                        >
                          {pendingIds.has(match.eventId) ? 'Removing...' : 'Unwatch'}
                        </ThemedText>
                      </Pressable>
                    </View>
                  ))}
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
  authRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statsRow: {
    paddingHorizontal: 20,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
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
    fontSize: 16,
    fontWeight: '700',
    marginTop: 6,
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
    marginBottom: 16,
  },
  logDate: {
    marginBottom: 10,
  },
  logDateText: {
    fontSize: 16,
    fontWeight: '700',
  },
  logDateMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  logItem: {
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  logInfo: {
    flex: 1,
  },
  logTime: {
    fontSize: 13,
    fontWeight: '700',
  },
  logTeams: {
    fontSize: 14,
    marginTop: 4,
  },
  logLeague: {
    fontSize: 12,
    marginTop: 4,
  },
  logScore: {
    fontSize: 12,
    marginTop: 2,
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
