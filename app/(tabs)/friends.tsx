import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

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

export default function FriendsScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<FriendUser[]>([...MOCK_USERS]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return users;
    }
    return users.filter((user) =>
      `${user.name} ${user.handle}`.toLowerCase().includes(normalized)
    );
  }, [query, users]);

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

  return (
    <ThemedView style={[styles.container, { backgroundColor: theme.background }]}
    >
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 12 }]}
      >
        <View style={styles.hero}>
          <ThemedText style={[styles.eyebrow, { color: theme.muted }]}>Matchlog</ThemedText>
          <ThemedText type="title" style={styles.heroTitle}>
            Friends
          </ThemedText>
          <ThemedText style={[styles.heroCopy, { color: theme.muted }]}
          >
            Find friends, see their match diaries, and grow your watch list together.
          </ThemedText>
        </View>

        <View style={[styles.searchCard, { backgroundColor: theme.surface }]}
        >
          <ThemedText style={[styles.searchLabel, { color: theme.muted }]}
          >
            Search people
          </ThemedText>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name or handle"
            placeholderTextColor={theme.muted}
            style={[styles.searchInput, { color: theme.text, borderColor: theme.border }]}
          />
        </View>

        <View style={[styles.panel, { backgroundColor: theme.surface }]}
        >
          <View style={styles.panelHeader}>
            <ThemedText type="subtitle">People</ThemedText>
            <ThemedText style={[styles.panelMeta, { color: theme.muted }]}
            >
              {filtered.length} results
            </ThemedText>
          </View>

          {filtered.length === 0 ? (
            <ThemedText style={[styles.emptyState, { color: theme.muted }]}
            >
              No matches yet. Try a different name.
            </ThemedText>
          ) : (
            <View style={styles.list}>
              {filtered.map((user) => (
                <View key={user.id} style={styles.listRow}>
                  <View style={styles.listInfo}>
                    <ThemedText style={styles.listName}>{user.name}</ThemedText>
                    <ThemedText style={[styles.listHandle, { color: theme.muted }]}
                    >
                      {user.handle}
                    </ThemedText>
                    <ThemedText style={[styles.listMutuals, { color: theme.muted }]}
                    >
                      {user.mutuals} mutual friends
                    </ThemedText>
                  </View>
                  {user.status === 'friends' ? (
                    <View style={[styles.friendBadge, { backgroundColor: theme.surfaceAlt }]}
                    >
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
    gap: 14,
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
    textAlign: 'center',
  },
});
