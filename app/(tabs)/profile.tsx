import { useCallback, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
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

// ─── Friends Mock Data ───────────────────────────────────────────────────────

const MOCK_USERS = [
  { id: '1', name: 'Ece Demir', handle: '@ecedemir', mutuals: 4, status: 'none' },
  { id: '2', name: 'Kerem Aydin', handle: '@keremaydin', mutuals: 2, status: 'friends' },
  { id: '3', name: 'Mert Ozkan', handle: '@mertozkan', mutuals: 6, status: 'requested' },
  { id: '4', name: 'Selin Aras', handle: '@selinaras', mutuals: 1, status: 'none' },
  { id: '5', name: 'Arda Yilmaz', handle: '@ardayilmaz', mutuals: 3, status: 'none' },
  { id: '6', name: 'Gokce Akar', handle: '@gokceakar', mutuals: 5, status: 'friends' },
] as const;

type FriendStatus = 'none' | 'requested' | 'friends';

type FriendUser = {
  id: string;
  name: string;
  handle: string;
  mutuals: number;
  status: FriendStatus;
};

// ─── Segment Tabs Component ──────────────────────────────────────────────────

type Segment = 'watched' | 'friends';

function SegmentedControl({
  selected,
  onSelect,
  theme,
}: {
  selected: Segment;
  onSelect: (segment: Segment) => void;
  theme: typeof Colors.light;
}) {
  return (
    <View style={[styles.segmentContainer, { backgroundColor: theme.surfaceAlt }]}>
      <Pressable
        style={[
          styles.segmentButton,
          selected === 'watched' && { backgroundColor: theme.surface },
        ]}
        onPress={() => onSelect('watched')}
      >
        <ThemedText
          style={[
            styles.segmentText,
            { color: selected === 'watched' ? theme.text : theme.muted },
          ]}
        >
          Watched
        </ThemedText>
      </Pressable>
      <Pressable
        style={[
          styles.segmentButton,
          selected === 'friends' && { backgroundColor: theme.surface },
        ]}
        onPress={() => onSelect('friends')}
      >
        <ThemedText
          style={[
            styles.segmentText,
            { color: selected === 'friends' ? theme.text : theme.muted },
          ]}
        >
          Friends
        </ThemedText>
      </Pressable>
    </View>
  );
}

// ─── Main Profile Screen ─────────────────────────────────────────────────────

export default function ProfileScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const insets = useSafeAreaInsets();

  const [segment, setSegment] = useState<Segment>('watched');

  // ─── Watched State ───────────────────────────────────────────────────────────
  const [events, setEvents] = useState<WatchedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [sessionToken, setSessionTokenState] = useState<string | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [cache, setCache] = useState<WatchedEvent[] | null>(null);

  const groupedEvents = useMemo(() => groupWatchedEvents(events), [events]);

  // ─── Friends State ───────────────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<FriendUser[]>([...MOCK_USERS]);

  // ─── Settings State ─────────────────────────────────────────────────────────
  const [showSettings, setShowSettings] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return users;
    }
    return users.filter((user) =>
      `${user.name} ${user.handle}`.toLowerCase().includes(normalized)
    );
  }, [query, users]);

  // ─── Watched Logic ───────────────────────────────────────────────────────────

  const loadEvents = useCallback(
    async (forceRefresh = false) => {
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
    },
    [cache]
  );

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

  // ─── Friends Logic ───────────────────────────────────────────────────────────

  function toggleRequest(id: string) {
    setUsers((prev) =>
      prev.map((user) => {
        if (user.id !== id) {
          return user;
        }
        if (user.status === 'none') {
          return { ...user, status: 'requested' };
        }
        if (user.status === 'requested') {
          return { ...user, status: 'none' };
        }
        return user;
      })
    );
  }

  // ─── Loading State ───────────────────────────────────────────────────────────

  if (checkingSession) {
    return (
      <ThemedView style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.centered}>
          <ThemedText>Checking session...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  // ─── Not Signed In ───────────────────────────────────────────────────────────

  if (!sessionToken) {
    return (
      <ThemedView style={[styles.container, { backgroundColor: theme.background }]}>
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 12 }]}
        >
          <View style={styles.hero}>
            <ThemedText style={[styles.eyebrow, { color: theme.muted }]}>Profile</ThemedText>
            <ThemedText type="title" style={styles.heroTitle}>
              Sign in to continue
            </ThemedText>
            <ThemedText style={[styles.heroCopy, { color: theme.muted }]}>
              Head to the fixtures tab and sign in with Google to access your profile.
            </ThemedText>
          </View>
          {error ? (
            <ThemedText style={[styles.errorText, { color: theme.accent, marginHorizontal: 20 }]}>
              {error}
            </ThemedText>
          ) : null}
        </ScrollView>
      </ThemedView>
    );
  }

  // ─── Signed In ───────────────────────────────────────────────────────────────

  return (
    <ThemedView style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 12 }]}
        refreshControl={
          segment === 'watched' ? (
            <RefreshControl refreshing={loading} onRefresh={() => loadEvents(true)} />
          ) : undefined
        }
      >
        {/* Header */}
        <View style={styles.hero}>
          <View style={styles.headerRow}>
            <ThemedText style={[styles.eyebrow, { color: theme.muted }]}>Profile</ThemedText>
            <Pressable
              style={styles.settingsIconButton}
              onPress={() => setShowSettings(true)}
            >
              <Ionicons name="settings-outline" size={22} color={theme.muted} />
            </Pressable>
          </View>
          <ThemedText type="title" style={styles.heroTitle}>
            Your Profile
          </ThemedText>
        </View>

        {/* Segmented Control */}
        <View style={styles.segmentWrapper}>
          <SegmentedControl selected={segment} onSelect={setSegment} theme={theme} />
        </View>

        {/* Content based on segment */}
        {segment === 'watched' ? (
          <WatchedContent
            theme={theme}
            events={events}
            groupedEvents={groupedEvents}
            loading={loading}
            error={error}
            pendingIds={pendingIds}
            unwatchEvent={unwatchEvent}
          />
        ) : (
          <FriendsContent
            theme={theme}
            query={query}
            setQuery={setQuery}
            filtered={filtered}
            toggleRequest={toggleRequest}
          />
        )}
      </ScrollView>

      {/* Settings Modal */}
      <Modal
        visible={showSettings}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowSettings(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowSettings(false)}>
          <Pressable style={[styles.modalContent, { backgroundColor: theme.background }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <ThemedText type="title">Settings</ThemedText>
              <Pressable
                style={styles.modalCloseButton}
                onPress={() => setShowSettings(false)}
              >
                <Ionicons name="close" size={24} color={theme.text} />
              </Pressable>
            </View>
            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              <SettingsContent
                theme={theme}
                displayName={displayName}
                setDisplayName={setDisplayName}
                username={username}
                setUsername={setUsername}
                email={email}
                setEmail={setEmail}
                signOut={async () => {
                  setShowSettings(false);
                  await signOut();
                }}
              />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </ThemedView>
  );
}

// ─── Watched Content Component ───────────────────────────────────────────────

function WatchedContent({
  theme,
  events,
  groupedEvents,
  loading,
  error,
  pendingIds,
  unwatchEvent,
}: {
  theme: typeof Colors.light;
  events: WatchedEvent[];
  groupedEvents: { date: string; items: WatchedEvent[] }[];
  loading: boolean;
  error: string | null;
  pendingIds: Set<string>;
  unwatchEvent: (eventId: string) => Promise<void>;
}) {
  return (
    <View style={[styles.panel, { backgroundColor: theme.surface }]}>
      <View style={styles.panelHeader}>
        <View>
          <ThemedText type="subtitle">Your log</ThemedText>
          <ThemedText style={[styles.panelCopy, { color: theme.muted }]}>
            {events.length} total matches
          </ThemedText>
        </View>
      </View>

      {loading ? (
        <ThemedText style={[styles.emptyState, { color: theme.muted }]}>
          Loading watched matches...
        </ThemedText>
      ) : error ? (
        <ThemedText style={[styles.errorText, { color: theme.accent }]}>{error}</ThemedText>
      ) : events.length === 0 ? (
        <ThemedText style={[styles.emptyState, { color: theme.muted }]}>
          No watched matches yet. Head back and mark some fixtures.
        </ThemedText>
      ) : (
        <View style={styles.log}>
          {groupedEvents.map(({ date, items }) => (
            <View key={date} style={styles.logDay}>
              <View style={styles.logDate}>
                <ThemedText style={styles.logDateText}>{formatDisplayDate(date)}</ThemedText>
                <ThemedText style={[styles.logDateMeta, { color: theme.muted }]}>
                  {items.length} match{items.length === 1 ? '' : 'es'}
                </ThemedText>
              </View>
              <View style={styles.matchList}>
                {items.map((match) => {
                  const isPending = pendingIds.has(match.eventId);
                  return (
                    <View
                      key={match.eventId}
                      style={[
                        styles.matchCard,
                        { backgroundColor: theme.surface, borderColor: theme.border },
                      ]}
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
                        <ThemedText style={styles.eventScoreText}>{match.homeScore ?? '-'}</ThemedText>
                        <ThemedText style={styles.eventScoreText}>{match.awayScore ?? '-'}</ThemedText>
                      </View>

                      <Pressable
                        style={styles.eventWatchCol}
                        onPress={() => unwatchEvent(match.eventId)}
                        disabled={isPending}
                      >
                        <Ionicons name="close-circle" size={20} color={theme.muted} />
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
  );
}

// ─── Friends Content Component ───────────────────────────────────────────────

function FriendsContent({
  theme,
  query,
  setQuery,
  filtered,
  toggleRequest,
}: {
  theme: typeof Colors.light;
  query: string;
  setQuery: (q: string) => void;
  filtered: FriendUser[];
  toggleRequest: (id: string) => void;
}) {
  return (
    <>
      <View style={[styles.searchCard, { backgroundColor: theme.surface }]}>
        <ThemedText style={[styles.searchLabel, { color: theme.muted }]}>Search people</ThemedText>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name or handle"
          placeholderTextColor={theme.muted}
          style={[styles.searchInput, { color: theme.text, borderColor: theme.border }]}
        />
      </View>

      <View style={[styles.panel, { backgroundColor: theme.surface }]}>
        <View style={styles.panelHeader}>
          <ThemedText type="subtitle">People</ThemedText>
          <ThemedText style={[styles.panelMeta, { color: theme.muted }]}>
            {filtered.length} results
          </ThemedText>
        </View>

        {filtered.length === 0 ? (
          <ThemedText style={[styles.emptyState, { color: theme.muted }]}>
            No matches yet. Try a different name.
          </ThemedText>
        ) : (
          <View style={styles.list}>
            {filtered.map((user) => (
              <View key={user.id} style={styles.listRow}>
                <View style={styles.listInfo}>
                  <ThemedText style={styles.listName}>{user.name}</ThemedText>
                  <ThemedText style={[styles.listHandle, { color: theme.muted }]}>
                    {user.handle}
                  </ThemedText>
                  <ThemedText style={[styles.listMutuals, { color: theme.muted }]}>
                    {user.mutuals} mutual friends
                  </ThemedText>
                </View>
                {user.status === 'friends' ? (
                  <View style={[styles.friendBadge, { backgroundColor: theme.surfaceAlt }]}>
                    <ThemedText style={styles.friendBadgeText}>Friends</ThemedText>
                  </View>
                ) : (
                  <Pressable
                    style={[
                      styles.actionButton,
                      user.status === 'requested'
                        ? styles.actionButtonGhost
                        : styles.actionButtonSolid,
                      user.status === 'requested'
                        ? { borderColor: theme.border }
                        : { backgroundColor: theme.accent },
                    ]}
                    onPress={() => toggleRequest(user.id)}
                  >
                    <ThemedText
                      style={[
                        styles.actionButtonText,
                        user.status === 'requested'
                          ? { color: theme.text }
                          : { color: theme.accentText },
                      ]}
                    >
                      {user.status === 'requested' ? 'Requested' : 'Add friend'}
                    </ThemedText>
                  </Pressable>
                )}
              </View>
            ))}
          </View>
        )}
      </View>
    </>
  );
}

// ─── Settings Content Component ──────────────────────────────────────────────

function SettingsContent({
  theme,
  displayName,
  setDisplayName,
  username,
  setUsername,
  email,
  setEmail,
  signOut,
}: {
  theme: typeof Colors.light;
  displayName: string;
  setDisplayName: (value: string) => void;
  username: string;
  setUsername: (value: string) => void;
  email: string;
  setEmail: (value: string) => void;
  signOut: () => Promise<void>;
}) {
  return (
    <View>
      <ThemedText type="subtitle" style={{ marginBottom: 16 }}>Account Settings</ThemedText>

      <View style={styles.settingsField}>
        <ThemedText style={[styles.settingsLabel, { color: theme.muted }]}>Display Name</ThemedText>
        <TextInput
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Enter your name"
          placeholderTextColor={theme.muted}
          style={[styles.settingsInput, { color: theme.text, borderColor: theme.border }]}
        />
      </View>

      <View style={styles.settingsField}>
        <ThemedText style={[styles.settingsLabel, { color: theme.muted }]}>Username</ThemedText>
        <TextInput
          value={username}
          onChangeText={setUsername}
          placeholder="@username"
          placeholderTextColor={theme.muted}
          autoCapitalize="none"
          style={[styles.settingsInput, { color: theme.text, borderColor: theme.border }]}
        />
      </View>

      <View style={styles.settingsField}>
        <ThemedText style={[styles.settingsLabel, { color: theme.muted }]}>Email</ThemedText>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="your@email.com"
          placeholderTextColor={theme.muted}
          keyboardType="email-address"
          autoCapitalize="none"
          style={[styles.settingsInput, { color: theme.text, borderColor: theme.border }]}
        />
      </View>

      <View style={styles.settingsDivider} />

      <Pressable
        style={[styles.signOutButton, { borderColor: theme.accent }]}
        onPress={signOut}
      >
        <Ionicons name="log-out-outline" size={18} color={theme.accent} />
        <ThemedText style={[styles.signOutText, { color: theme.accent }]}>Sign Out</ThemedText>
      </Pressable>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingsIconButton: {
    padding: 8,
  },
  // Segmented Control
  segmentWrapper: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  segmentContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // Panels
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
  panelMeta: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  // Watched styles
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
  // Friends styles
  searchCard: {
    marginHorizontal: 16,
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
  },
  searchLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  searchInput: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  list: {
    gap: 14,
    marginTop: 12,
  },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  listInfo: {
    flex: 1,
  },
  listName: {
    fontSize: 16,
    fontWeight: '700',
  },
  listHandle: {
    fontSize: 13,
    marginTop: 2,
  },
  listMutuals: {
    fontSize: 12,
    marginTop: 4,
  },
  actionButton: {
    alignSelf: 'center',
    height: 34,
    minWidth: 110,
    paddingHorizontal: 14,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonSolid: {
    borderWidth: 0,
  },
  actionButtonGhost: {
    borderWidth: 1,
  },
  actionButtonText: {
    fontSize: 11,
    lineHeight: 14,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
  },
  friendBadge: {
    alignSelf: 'center',
    paddingHorizontal: 14,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  friendBadgeText: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
  },
  emptyState: {
    marginTop: 18,
    textAlign: 'center',
  },
  errorText: {
    marginTop: 12,
    fontSize: 12,
  },
  // Settings styles
  settingsField: {
    marginBottom: 16,
  },
  settingsLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  settingsInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  settingsDivider: {
    height: 1,
    backgroundColor: 'rgba(128, 128, 128, 0.2)',
    marginVertical: 20,
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  signOutText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // Modal styles
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
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalCloseButton: {
    padding: 4,
  },
  modalScroll: {
    flexGrow: 0,
  },
});
