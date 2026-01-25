import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthError, clearSessionToken, getSessionToken } from '../../lib/api';
import {
  computeInsights,
  fetchWatchedEvents,
  formatDate,
  startOfWeek,
  type WatchedEvent,
} from '../../lib/matchlog';

const TOP_LIMIT = 6;

export default function StatsScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const insets = useSafeAreaInsets();
  const [events, setEvents] = useState<WatchedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionToken, setSessionTokenState] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [cache, setCache] = useState<WatchedEvent[] | null>(null);

  const insights = useMemo(() => computeInsights(events), [events]);

  const stats = useMemo(() => {
    const teamCounts = new Map<string, number>();
    const leagueCounts = new Map<string, number>();
    const now = new Date();
    const weekStart = formatDate(startOfWeek(now));
    const monthStart = formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
    let weekCount = 0;
    let monthCount = 0;

    events.forEach((event) => {
      teamCounts.set(event.homeTeam, (teamCounts.get(event.homeTeam) ?? 0) + 1);
      teamCounts.set(event.awayTeam, (teamCounts.get(event.awayTeam) ?? 0) + 1);
      leagueCounts.set(event.leagueName, (leagueCounts.get(event.leagueName) ?? 0) + 1);
      if (event.date >= weekStart) {
        weekCount += 1;
      }
      if (event.date >= monthStart) {
        monthCount += 1;
      }
    });

    function topList(map: Map<string, number>) {
      return Array.from(map.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, TOP_LIMIT);
    }

    return {
      teams: topList(teamCounts),
      leagues: topList(leagueCounts),
      weekCount,
      monthCount,
      totalCount: events.length,
      uniqueTeams: teamCounts.size,
      uniqueLeagues: leagueCounts.size,
    };
  }, [events]);

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
        setError('Sign in to see your stats.');
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to load stats.');
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
            setError('Sign in to see your stats.');
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
          contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 12 }]}
        >
          <View style={styles.hero}>
            <ThemedText style={[styles.eyebrow, { color: theme.muted }]}>Matchlog</ThemedText>
            <ThemedText type="title" style={styles.heroTitle}>
              Sign in to see stats
            </ThemedText>
            <ThemedText style={[styles.heroCopy, { color: theme.muted }]}
            >
              We use your watched matches to build personal insights.
            </ThemedText>
          </View>
          {error ? (
            <ThemedText style={[styles.errorText, { color: theme.accent }]}>{error}</ThemedText>
          ) : null}
        </ScrollView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { backgroundColor: theme.background }]}
    >
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 12 }]}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => loadEvents(true)} />}
      >
        <View style={styles.hero}>
          <ThemedText style={[styles.eyebrow, { color: theme.muted }]}>Matchlog</ThemedText>
          <ThemedText type="title" style={styles.heroTitle}>
            Your stats
          </ThemedText>
          <ThemedText style={[styles.heroCopy, { color: theme.muted }]}
          >
            A snapshot of the teams, leagues, and days you watch the most.
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

        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: theme.surface }]}
          >
            <ThemedText style={[styles.statLabel, { color: theme.muted }]}>Top team</ThemedText>
            <ThemedText style={styles.statValue}>{insights.topTeam}</ThemedText>
          </View>
          <View style={[styles.statCard, { backgroundColor: theme.surface }]}
          >
            <ThemedText style={[styles.statLabel, { color: theme.muted }]}>Top league</ThemedText>
            <ThemedText style={styles.statValue}>{insights.topLeague}</ThemedText>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: theme.surface }]}
          >
            <ThemedText style={[styles.statLabel, { color: theme.muted }]}>Busiest day</ThemedText>
            <ThemedText style={styles.statValue}>{insights.topWeekday}</ThemedText>
          </View>
          <View style={[styles.statCard, { backgroundColor: theme.surface }]}
          >
            <ThemedText style={[styles.statLabel, { color: theme.muted }]}>Unique teams</ThemedText>
            <ThemedText style={styles.statValue}>{stats.uniqueTeams}</ThemedText>
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: theme.surface }]}
          >
            <ThemedText style={[styles.statLabel, { color: theme.muted }]}>Unique leagues</ThemedText>
            <ThemedText style={styles.statValue}>{stats.uniqueLeagues}</ThemedText>
          </View>
        </View>

        <View style={[styles.panel, { backgroundColor: theme.surface }]}
        >
          <View style={styles.panelHeader}>
            <ThemedText type="subtitle">Watched teams</ThemedText>
            <ThemedText style={[styles.panelMeta, { color: theme.muted }]}
            >
              Top {TOP_LIMIT}
            </ThemedText>
          </View>
          {loading ? (
            <ThemedText style={[styles.emptyState, { color: theme.muted }]}
            >
              Loading stats...
            </ThemedText>
          ) : stats.teams.length === 0 ? (
            <ThemedText style={[styles.emptyState, { color: theme.muted }]}
            >
              No watched matches yet.
            </ThemedText>
          ) : (
            <View style={styles.list}>
              {stats.teams.map(([team, count]) => (
                <View key={team} style={styles.listRow}>
                  <ThemedText style={styles.listLabel}>{team}</ThemedText>
                  <ThemedText style={[styles.listValue, { color: theme.muted }]}
                  >
                    {count}
                  </ThemedText>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={[styles.panel, { backgroundColor: theme.surface }]}
        >
          <View style={styles.panelHeader}>
            <ThemedText type="subtitle">Top leagues</ThemedText>
            <ThemedText style={[styles.panelMeta, { color: theme.muted }]}
            >
              Top {TOP_LIMIT}
            </ThemedText>
          </View>
          {loading ? (
            <ThemedText style={[styles.emptyState, { color: theme.muted }]}
            >
              Loading stats...
            </ThemedText>
          ) : stats.leagues.length === 0 ? (
            <ThemedText style={[styles.emptyState, { color: theme.muted }]}
            >
              No watched matches yet.
            </ThemedText>
          ) : (
            <View style={styles.list}>
              {stats.leagues.map(([league, count]) => (
                <View key={league} style={styles.listRow}>
                  <ThemedText style={styles.listLabel}>{league}</ThemedText>
                  <ThemedText style={[styles.listValue, { color: theme.muted }]}
                  >
                    {count}
                  </ThemedText>
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
  statsRow: {
    paddingHorizontal: 20,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  statCard: {
    flexGrow: 1,
    flexBasis: '30%',
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
    marginBottom: 12,
  },
  panelMeta: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  list: {
    gap: 10,
  },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  listLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  listValue: {
    fontSize: 13,
  },
  emptyState: {
    textAlign: 'center',
  },
  errorText: {
    marginHorizontal: 20,
    marginTop: 12,
    fontSize: 12,
  },
});
