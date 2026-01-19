import { useCallback, useMemo, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  addDays,
  computeStats,
  fetchEventsByDate,
  formatDisplayDate,
  formatEventTime,
  loadWatchedEvents,
  saveWatchedEvents,
  todayValue,
  toggleWatchedEvent,
  type EventItem,
  type LeagueGroup,
  type WatchedEvent,
} from '../../lib/matchlog';

export default function FixturesScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const [selectedDate, setSelectedDate] = useState(todayValue());
  const [leagues, setLeagues] = useState<LeagueGroup[]>([]);
  const [watchedEvents, setWatchedEvents] = useState<WatchedEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const watchedIds = useMemo(
    () => new Set(watchedEvents.map((event) => event.eventId)),
    [watchedEvents]
  );

  const stats = useMemo(() => computeStats(watchedEvents), [watchedEvents]);

  const totalEvents = useMemo(
    () => leagues.reduce((sum, league) => sum + league.events.length, 0),
    [leagues]
  );

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchEventsByDate(selectedDate);
      setLeagues(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load fixtures.');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  const refreshWatched = useCallback(async () => {
    const stored = await loadWatchedEvents();
    setWatchedEvents(stored);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadWatchedEvents().then((stored) => {
        if (active) {
          setWatchedEvents(stored);
        }
      });
      return () => {
        active = false;
      };
    }, [])
  );

  useFocusEffect(
    useCallback(() => {
      void loadEvents();
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

  async function toggleWatched(event: EventItem) {
    const prevEvents = watchedEvents;
    const updated = toggleWatchedEvent(prevEvents, event);
    setWatchedEvents(updated);
    setPending(event.eventId, true);

    try {
      await saveWatchedEvents(updated);
      setError(null);
    } catch (err) {
      setWatchedEvents(prevEvents);
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

  return (
    <ThemedView style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadEvents} />}
      >
        <View style={styles.hero}>
          <ThemedText style={[styles.eyebrow, { color: theme.muted }]}>Matchlog</ThemedText>
          <ThemedText type="title" style={styles.heroTitle}>
            Your fixture diary
          </ThemedText>
          <ThemedText style={[styles.heroCopy, { color: theme.muted }]}
          >
            Pick a day, tap what you watched, and the app keeps your weekly and monthly totals.
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
            <Pressable
              style={[styles.ghostButton, { borderColor: theme.border }]}
              onPress={refreshWatched}
            >
              <ThemedText style={[styles.buttonText, { color: theme.text }]}
              >
                Sync watched
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
