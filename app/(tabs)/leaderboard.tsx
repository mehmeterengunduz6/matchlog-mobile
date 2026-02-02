import React, { useState, useMemo, useEffect } from 'react';
import { ScrollView, View, Pressable, StyleSheet, Image, Modal, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { Colors, Fonts } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { fetchJson } from '@/lib/api';
import { useFocusEffect } from 'expo-router';

type LeaderboardUser = {
  id: string;
  name: string;
  handle: string;
  watchCount: number;
  rank: number;
  isCurrentUser?: boolean;
};

type LeagueLeaderboard = {
  leagueId: string;
  leagueName: string;
  leagueBadge: string;
  users: LeaderboardUser[];
};

type TeamLeaderboard = {
  teamName: string;
  leagueName: string;
  users: LeaderboardUser[];
};

type ViewMode = 'league' | 'team';

type TeamsByLeague = {
  leagueId: string;
  leagueName: string;
  teams: string[];
};

// Mock data for league leaderboards
const MOCK_LEAGUE_LEADERBOARDS: LeagueLeaderboard[] = [
  {
    leagueId: '4328',
    leagueName: 'Premier League',
    leagueBadge: 'https://r2.thesportsdb.com/images/media/league/badge/gasy9d1737743125.png',
    users: [
      { id: 'current', name: 'You', handle: '@yourhandle', watchCount: 47, rank: 1, isCurrentUser: true },
      { id: 'u2', name: 'Kerem Aydin', handle: '@keremaydin', watchCount: 45, rank: 2 },
      { id: 'u3', name: 'Ece Demir', handle: '@ecedemir', watchCount: 42, rank: 3 },
      { id: 'u4', name: 'Ahmet Yilmaz', handle: '@ahmetyilmaz', watchCount: 39, rank: 4 },
      { id: 'u5', name: 'Zeynep Kaya', handle: '@zeynepkaya', watchCount: 36, rank: 5 },
      { id: 'u6', name: 'Can Ozturk', handle: '@canozturk', watchCount: 33, rank: 6 },
      { id: 'u7', name: 'Selin Arslan', handle: '@selinarslan', watchCount: 30, rank: 7 },
      { id: 'u8', name: 'Burak Celik', handle: '@burakcelik', watchCount: 27, rank: 8 },
      { id: 'u9', name: 'Deniz Sahin', handle: '@denizsahin', watchCount: 24, rank: 9 },
      { id: 'u10', name: 'Elif Yildiz', handle: '@elifyildiz', watchCount: 21, rank: 10 },
    ],
  },
  {
    leagueId: '4335',
    leagueName: 'La Liga',
    leagueBadge: 'https://r2.thesportsdb.com/images/media/league/badge/7onmyv1534768460.png',
    users: [
      { id: 'u2', name: 'Kerem Aydin', handle: '@keremaydin', watchCount: 42, rank: 1 },
      { id: 'u3', name: 'Ece Demir', handle: '@ecedemir', watchCount: 40, rank: 2 },
      { id: 'current', name: 'You', handle: '@yourhandle', watchCount: 38, rank: 3, isCurrentUser: true },
      { id: 'u4', name: 'Ahmet Yilmaz', handle: '@ahmetyilmaz', watchCount: 35, rank: 4 },
      { id: 'u5', name: 'Zeynep Kaya', handle: '@zeynepkaya', watchCount: 32, rank: 5 },
      { id: 'u6', name: 'Can Ozturk', handle: '@canozturk', watchCount: 29, rank: 6 },
      { id: 'u7', name: 'Selin Arslan', handle: '@selinarslan', watchCount: 26, rank: 7 },
      { id: 'u8', name: 'Burak Celik', handle: '@burakcelik', watchCount: 23, rank: 8 },
      { id: 'u9', name: 'Deniz Sahin', handle: '@denizsahin', watchCount: 20, rank: 9 },
      { id: 'u10', name: 'Elif Yildiz', handle: '@elifyildiz', watchCount: 17, rank: 10 },
    ],
  },
  {
    leagueId: '4332',
    leagueName: 'Serie A',
    leagueBadge: 'https://r2.thesportsdb.com/images/media/league/badge/0iouyo1737741959.png',
    users: [
      { id: 'u3', name: 'Ece Demir', handle: '@ecedemir', watchCount: 38, rank: 1 },
      { id: 'u2', name: 'Kerem Aydin', handle: '@keremaydin', watchCount: 36, rank: 2 },
      { id: 'u4', name: 'Ahmet Yilmaz', handle: '@ahmetyilmaz', watchCount: 33, rank: 3 },
      { id: 'u5', name: 'Zeynep Kaya', handle: '@zeynepkaya', watchCount: 30, rank: 4 },
      { id: 'current', name: 'You', handle: '@yourhandle', watchCount: 27, rank: 5, isCurrentUser: true },
      { id: 'u6', name: 'Can Ozturk', handle: '@canozturk', watchCount: 24, rank: 6 },
      { id: 'u7', name: 'Selin Arslan', handle: '@selinarslan', watchCount: 21, rank: 7 },
      { id: 'u8', name: 'Burak Celik', handle: '@burakcelik', watchCount: 18, rank: 8 },
      { id: 'u9', name: 'Deniz Sahin', handle: '@denizsahin', watchCount: 15, rank: 9 },
      { id: 'u10', name: 'Elif Yildiz', handle: '@elifyildiz', watchCount: 12, rank: 10 },
    ],
  },
  {
    leagueId: '4331',
    leagueName: 'Bundesliga',
    leagueBadge: 'https://r2.thesportsdb.com/images/media/league/badge/0j55yf1534764799.png',
    users: [
      { id: 'u4', name: 'Ahmet Yilmaz', handle: '@ahmetyilmaz', watchCount: 35, rank: 1 },
      { id: 'u2', name: 'Kerem Aydin', handle: '@keremaydin', watchCount: 33, rank: 2 },
      { id: 'u3', name: 'Ece Demir', handle: '@ecedemir', watchCount: 31, rank: 3 },
      { id: 'u5', name: 'Zeynep Kaya', handle: '@zeynepkaya', watchCount: 28, rank: 4 },
      { id: 'u6', name: 'Can Ozturk', handle: '@canozturk', watchCount: 25, rank: 5 },
      { id: 'u7', name: 'Selin Arslan', handle: '@selinarslan', watchCount: 22, rank: 6 },
      { id: 'current', name: 'You', handle: '@yourhandle', watchCount: 19, rank: 7, isCurrentUser: true },
      { id: 'u8', name: 'Burak Celik', handle: '@burakcelik', watchCount: 16, rank: 8 },
      { id: 'u9', name: 'Deniz Sahin', handle: '@denizsahin', watchCount: 13, rank: 9 },
      { id: 'u10', name: 'Elif Yildiz', handle: '@elifyildiz', watchCount: 10, rank: 10 },
    ],
  },
  {
    leagueId: '4334',
    leagueName: 'Ligue 1',
    leagueBadge: 'https://r2.thesportsdb.com/images/media/league/badge/i6o0kh1549878397.png',
    users: [
      { id: 'u5', name: 'Zeynep Kaya', handle: '@zeynepkaya', watchCount: 32, rank: 1 },
      { id: 'u2', name: 'Kerem Aydin', handle: '@keremaydin', watchCount: 30, rank: 2 },
      { id: 'u3', name: 'Ece Demir', handle: '@ecedemir', watchCount: 28, rank: 3 },
      { id: 'u4', name: 'Ahmet Yilmaz', handle: '@ahmetyilmaz', watchCount: 25, rank: 4 },
      { id: 'u6', name: 'Can Ozturk', handle: '@canozturk', watchCount: 22, rank: 5 },
      { id: 'u7', name: 'Selin Arslan', handle: '@selinarslan', watchCount: 19, rank: 6 },
      { id: 'u8', name: 'Burak Celik', handle: '@burakcelik', watchCount: 16, rank: 7 },
      { id: 'current', name: 'You', handle: '@yourhandle', watchCount: 13, rank: 8, isCurrentUser: true },
      { id: 'u9', name: 'Deniz Sahin', handle: '@denizsahin', watchCount: 10, rank: 9 },
      { id: 'u10', name: 'Elif Yildiz', handle: '@elifyildiz', watchCount: 7, rank: 10 },
    ],
  },
  {
    leagueId: '4339',
    leagueName: 'Super Lig',
    leagueBadge: 'https://r2.thesportsdb.com/images/media/league/badge/8j27zh1699118212.png',
    users: [
      { id: 'u6', name: 'Can Ozturk', handle: '@canozturk', watchCount: 40, rank: 1 },
      { id: 'current', name: 'You', handle: '@yourhandle', watchCount: 38, rank: 2, isCurrentUser: true },
      { id: 'u2', name: 'Kerem Aydin', handle: '@keremaydin', watchCount: 36, rank: 3 },
      { id: 'u3', name: 'Ece Demir', handle: '@ecedemir', watchCount: 33, rank: 4 },
      { id: 'u4', name: 'Ahmet Yilmaz', handle: '@ahmetyilmaz', watchCount: 30, rank: 5 },
      { id: 'u5', name: 'Zeynep Kaya', handle: '@zeynepkaya', watchCount: 27, rank: 6 },
      { id: 'u7', name: 'Selin Arslan', handle: '@selinarslan', watchCount: 24, rank: 7 },
      { id: 'u8', name: 'Burak Celik', handle: '@burakcelik', watchCount: 21, rank: 8 },
      { id: 'u9', name: 'Deniz Sahin', handle: '@denizsahin', watchCount: 18, rank: 9 },
      { id: 'u10', name: 'Elif Yildiz', handle: '@elifyildiz', watchCount: 15, rank: 10 },
    ],
  },
  {
    leagueId: '4480',
    leagueName: 'Champions League',
    leagueBadge: 'https://r2.thesportsdb.com/images/media/league/badge/x3e9i41517660231.png',
    users: [
      { id: 'u7', name: 'Selin Arslan', handle: '@selinarslan', watchCount: 36, rank: 1 },
      { id: 'u2', name: 'Kerem Aydin', handle: '@keremaydin', watchCount: 34, rank: 2 },
      { id: 'u3', name: 'Ece Demir', handle: '@ecedemir', watchCount: 32, rank: 3 },
      { id: 'current', name: 'You', handle: '@yourhandle', watchCount: 29, rank: 4, isCurrentUser: true },
      { id: 'u4', name: 'Ahmet Yilmaz', handle: '@ahmetyilmaz', watchCount: 26, rank: 5 },
      { id: 'u5', name: 'Zeynep Kaya', handle: '@zeynepkaya', watchCount: 23, rank: 6 },
      { id: 'u6', name: 'Can Ozturk', handle: '@canozturk', watchCount: 20, rank: 7 },
      { id: 'u8', name: 'Burak Celik', handle: '@burakcelik', watchCount: 17, rank: 8 },
      { id: 'u9', name: 'Deniz Sahin', handle: '@denizsahin', watchCount: 14, rank: 9 },
      { id: 'u10', name: 'Elif Yildiz', handle: '@elifyildiz', watchCount: 11, rank: 10 },
    ],
  },
];

// Mock data for team leaderboards with league grouping
const MOCK_TEAM_LEADERBOARDS: TeamLeaderboard[] = [
  // Premier League teams
  {
    teamName: 'All',
    leagueName: 'Premier League',
    users: [
      { id: 'current', name: 'You', handle: '@yourhandle', watchCount: 47, rank: 1, isCurrentUser: true },
      { id: 'u2', name: 'Kerem Aydin', handle: '@keremaydin', watchCount: 45, rank: 2 },
      { id: 'u3', name: 'Ece Demir', handle: '@ecedemir', watchCount: 42, rank: 3 },
      { id: 'u4', name: 'Ahmet Yilmaz', handle: '@ahmetyilmaz', watchCount: 39, rank: 4 },
      { id: 'u5', name: 'Zeynep Kaya', handle: '@zeynepkaya', watchCount: 36, rank: 5 },
      { id: 'u6', name: 'Can Ozturk', handle: '@canozturk', watchCount: 33, rank: 6 },
      { id: 'u7', name: 'Selin Arslan', handle: '@selinarslan', watchCount: 30, rank: 7 },
      { id: 'u8', name: 'Burak Celik', handle: '@burakcelik', watchCount: 27, rank: 8 },
      { id: 'u9', name: 'Deniz Sahin', handle: '@denizsahin', watchCount: 24, rank: 9 },
      { id: 'u10', name: 'Elif Yildiz', handle: '@elifyildiz', watchCount: 21, rank: 10 },
    ],
  },
  {
    teamName: 'Manchester City',
    leagueName: 'Premier League',
    users: [
      { id: 'u2', name: 'Kerem Aydin', handle: '@keremaydin', watchCount: 28, rank: 1 },
      { id: 'current', name: 'You', handle: '@yourhandle', watchCount: 24, rank: 2, isCurrentUser: true },
      { id: 'u3', name: 'Ece Demir', handle: '@ecedemir', watchCount: 22, rank: 3 },
      { id: 'u4', name: 'Ahmet Yilmaz', handle: '@ahmetyilmaz', watchCount: 19, rank: 4 },
      { id: 'u5', name: 'Zeynep Kaya', handle: '@zeynepkaya', watchCount: 16, rank: 5 },
      { id: 'u6', name: 'Can Ozturk', handle: '@canozturk', watchCount: 13, rank: 6 },
      { id: 'u7', name: 'Selin Arslan', handle: '@selinarslan', watchCount: 10, rank: 7 },
      { id: 'u8', name: 'Burak Celik', handle: '@burakcelik', watchCount: 7, rank: 8 },
    ],
  },
  {
    teamName: 'Liverpool',
    leagueName: 'Premier League',
    users: [
      { id: 'current', name: 'You', handle: '@yourhandle', watchCount: 30, rank: 1, isCurrentUser: true },
      { id: 'u2', name: 'Kerem Aydin', handle: '@keremaydin', watchCount: 27, rank: 2 },
      { id: 'u3', name: 'Ece Demir', handle: '@ecedemir', watchCount: 24, rank: 3 },
      { id: 'u4', name: 'Ahmet Yilmaz', handle: '@ahmetyilmaz', watchCount: 21, rank: 4 },
      { id: 'u5', name: 'Zeynep Kaya', handle: '@zeynepkaya', watchCount: 18, rank: 5 },
      { id: 'u6', name: 'Can Ozturk', handle: '@canozturk', watchCount: 15, rank: 6 },
      { id: 'u7', name: 'Selin Arslan', handle: '@selinarslan', watchCount: 12, rank: 7 },
    ],
  },
  {
    teamName: 'Arsenal',
    leagueName: 'Premier League',
    users: [
      { id: 'u6', name: 'Can Ozturk', handle: '@canozturk', watchCount: 23, rank: 1 },
      { id: 'u2', name: 'Kerem Aydin', handle: '@keremaydin', watchCount: 21, rank: 2 },
      { id: 'current', name: 'You', handle: '@yourhandle', watchCount: 19, rank: 3, isCurrentUser: true },
      { id: 'u3', name: 'Ece Demir', handle: '@ecedemir', watchCount: 16, rank: 4 },
      { id: 'u4', name: 'Ahmet Yilmaz', handle: '@ahmetyilmaz', watchCount: 13, rank: 5 },
      { id: 'u5', name: 'Zeynep Kaya', handle: '@zeynepkaya', watchCount: 10, rank: 6 },
    ],
  },
  {
    teamName: 'Chelsea',
    leagueName: 'Premier League',
    users: [
      { id: 'u2', name: 'Kerem Aydin', handle: '@keremaydin', watchCount: 25, rank: 1 },
      { id: 'u3', name: 'Ece Demir', handle: '@ecedemir', watchCount: 23, rank: 2 },
      { id: 'current', name: 'You', handle: '@yourhandle', watchCount: 20, rank: 3, isCurrentUser: true },
      { id: 'u4', name: 'Ahmet Yilmaz', handle: '@ahmetyilmaz', watchCount: 17, rank: 4 },
      { id: 'u5', name: 'Zeynep Kaya', handle: '@zeynepkaya', watchCount: 14, rank: 5 },
    ],
  },
  // Super Lig teams
  {
    teamName: 'All',
    leagueName: 'Super Lig',
    users: [
      { id: 'u6', name: 'Can Ozturk', handle: '@canozturk', watchCount: 40, rank: 1 },
      { id: 'current', name: 'You', handle: '@yourhandle', watchCount: 38, rank: 2, isCurrentUser: true },
      { id: 'u2', name: 'Kerem Aydin', handle: '@keremaydin', watchCount: 36, rank: 3 },
      { id: 'u3', name: 'Ece Demir', handle: '@ecedemir', watchCount: 33, rank: 4 },
      { id: 'u4', name: 'Ahmet Yilmaz', handle: '@ahmetyilmaz', watchCount: 30, rank: 5 },
      { id: 'u5', name: 'Zeynep Kaya', handle: '@zeynepkaya', watchCount: 27, rank: 6 },
      { id: 'u7', name: 'Selin Arslan', handle: '@selinarslan', watchCount: 24, rank: 7 },
      { id: 'u8', name: 'Burak Celik', handle: '@burakcelik', watchCount: 21, rank: 8 },
    ],
  },
  {
    teamName: 'Galatasaray',
    leagueName: 'Super Lig',
    users: [
      { id: 'u9', name: 'Deniz Sahin', handle: '@denizsahin', watchCount: 28, rank: 1 },
      { id: 'u6', name: 'Can Ozturk', handle: '@canozturk', watchCount: 26, rank: 2 },
      { id: 'u8', name: 'Burak Celik', handle: '@burakcelik', watchCount: 24, rank: 3 },
      { id: 'current', name: 'You', handle: '@yourhandle', watchCount: 21, rank: 4, isCurrentUser: true },
      { id: 'u2', name: 'Kerem Aydin', handle: '@keremaydin', watchCount: 18, rank: 5 },
      { id: 'u3', name: 'Ece Demir', handle: '@ecedemir', watchCount: 15, rank: 6 },
      { id: 'u4', name: 'Ahmet Yilmaz', handle: '@ahmetyilmaz', watchCount: 12, rank: 7 },
    ],
  },
  {
    teamName: 'Fenerbahce',
    leagueName: 'Super Lig',
    users: [
      { id: 'u8', name: 'Burak Celik', handle: '@burakcelik', watchCount: 32, rank: 1 },
      { id: 'u6', name: 'Can Ozturk', handle: '@canozturk', watchCount: 29, rank: 2 },
      { id: 'current', name: 'You', handle: '@yourhandle', watchCount: 26, rank: 3, isCurrentUser: true },
      { id: 'u2', name: 'Kerem Aydin', handle: '@keremaydin', watchCount: 23, rank: 4 },
      { id: 'u3', name: 'Ece Demir', handle: '@ecedemir', watchCount: 20, rank: 5 },
      { id: 'u4', name: 'Ahmet Yilmaz', handle: '@ahmetyilmaz', watchCount: 17, rank: 6 },
    ],
  },
  {
    teamName: 'Besiktas',
    leagueName: 'Super Lig',
    users: [
      { id: 'u6', name: 'Can Ozturk', handle: '@canozturk', watchCount: 24, rank: 1 },
      { id: 'current', name: 'You', handle: '@yourhandle', watchCount: 22, rank: 2, isCurrentUser: true },
      { id: 'u8', name: 'Burak Celik', handle: '@burakcelik', watchCount: 20, rank: 3 },
      { id: 'u2', name: 'Kerem Aydin', handle: '@keremaydin', watchCount: 17, rank: 4 },
      { id: 'u3', name: 'Ece Demir', handle: '@ecedemir', watchCount: 14, rank: 5 },
      { id: 'u4', name: 'Ahmet Yilmaz', handle: '@ahmetyilmaz', watchCount: 11, rank: 6 },
    ],
  },
  {
    teamName: 'Trabzonspor',
    leagueName: 'Super Lig',
    users: [
      { id: 'u7', name: 'Selin Arslan', handle: '@selinarslan', watchCount: 19, rank: 1 },
      { id: 'current', name: 'You', handle: '@yourhandle', watchCount: 17, rank: 2, isCurrentUser: true },
      { id: 'u6', name: 'Can Ozturk', handle: '@canozturk', watchCount: 15, rank: 3 },
      { id: 'u8', name: 'Burak Celik', handle: '@burakcelik', watchCount: 12, rank: 4 },
      { id: 'u2', name: 'Kerem Aydin', handle: '@keremaydin', watchCount: 9, rank: 5 },
    ],
  },
  // La Liga teams
  {
    teamName: 'All',
    leagueName: 'La Liga',
    users: [
      { id: 'u2', name: 'Kerem Aydin', handle: '@keremaydin', watchCount: 42, rank: 1 },
      { id: 'u3', name: 'Ece Demir', handle: '@ecedemir', watchCount: 40, rank: 2 },
      { id: 'current', name: 'You', handle: '@yourhandle', watchCount: 38, rank: 3, isCurrentUser: true },
      { id: 'u4', name: 'Ahmet Yilmaz', handle: '@ahmetyilmaz', watchCount: 35, rank: 4 },
      { id: 'u5', name: 'Zeynep Kaya', handle: '@zeynepkaya', watchCount: 32, rank: 5 },
    ],
  },
  {
    teamName: 'Real Madrid',
    leagueName: 'La Liga',
    users: [
      { id: 'u3', name: 'Ece Demir', handle: '@ecedemir', watchCount: 26, rank: 1 },
      { id: 'u2', name: 'Kerem Aydin', handle: '@keremaydin', watchCount: 24, rank: 2 },
      { id: 'u4', name: 'Ahmet Yilmaz', handle: '@ahmetyilmaz', watchCount: 21, rank: 3 },
      { id: 'current', name: 'You', handle: '@yourhandle', watchCount: 18, rank: 4, isCurrentUser: true },
      { id: 'u5', name: 'Zeynep Kaya', handle: '@zeynepkaya', watchCount: 15, rank: 5 },
    ],
  },
  {
    teamName: 'Barcelona',
    leagueName: 'La Liga',
    users: [
      { id: 'u4', name: 'Ahmet Yilmaz', handle: '@ahmetyilmaz', watchCount: 25, rank: 1 },
      { id: 'u3', name: 'Ece Demir', handle: '@ecedemir', watchCount: 23, rank: 2 },
      { id: 'u2', name: 'Kerem Aydin', handle: '@keremaydin', watchCount: 20, rank: 3 },
      { id: 'u5', name: 'Zeynep Kaya', handle: '@zeynepkaya', watchCount: 17, rank: 4 },
      { id: 'current', name: 'You', handle: '@yourhandle', watchCount: 14, rank: 5, isCurrentUser: true },
    ],
  },
];

// Dropdown Component for Leagues
function Dropdown({
  label,
  value,
  options,
  onSelect,
  theme,
}: {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onSelect: (value: string) => void;
  theme: any;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Pressable
        style={[styles.dropdown, { backgroundColor: theme.surface, borderColor: theme.border }]}
        onPress={() => setIsOpen(true)}
      >
        <View style={styles.dropdownContent}>
          <ThemedText style={[styles.dropdownLabel, { color: theme.muted }]}>{label}</ThemedText>
          <ThemedText style={styles.dropdownValue}>
            {options.find((opt) => opt.value === value)?.label || value}
          </ThemedText>
        </View>
        <ThemedText style={{ color: theme.muted }}>▼</ThemedText>
      </Pressable>

      <Modal visible={isOpen} transparent animationType="fade" onRequestClose={() => setIsOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setIsOpen(false)}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
            <ThemedText style={[styles.modalTitle, { color: theme.muted }]}>{label}</ThemedText>
            <ScrollView style={styles.optionsList}>
              {options.map((option) => (
                <Pressable
                  key={option.value}
                  style={[
                    styles.option,
                    option.value === value && { backgroundColor: theme.surfaceAlt },
                  ]}
                  onPress={() => {
                    onSelect(option.value);
                    setIsOpen(false);
                  }}
                >
                  <ThemedText style={[styles.optionText, option.value === value && { fontWeight: '600' }]}>
                    {option.label}
                  </ThemedText>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

// Grouped Teams Dropdown
function GroupedTeamsDropdown({
  value,
  teamsByLeague,
  onSelect,
  theme,
  isLoading,
}: {
  value: string;
  teamsByLeague: TeamsByLeague[];
  onSelect: (team: string, leagueName: string) => void;
  theme: any;
  isLoading: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const displayValue = value === 'All' ? 'All Teams' : value;

  return (
    <>
      <Pressable
        style={[styles.dropdown, { backgroundColor: theme.surface, borderColor: theme.border }]}
        onPress={() => setIsOpen(true)}
        disabled={isLoading}
      >
        <View style={styles.dropdownContent}>
          <ThemedText style={[styles.dropdownLabel, { color: theme.muted }]}>Team</ThemedText>
          <ThemedText style={styles.dropdownValue}>
            {isLoading ? 'Loading teams...' : displayValue}
          </ThemedText>
        </View>
        <ThemedText style={{ color: theme.muted }}>▼</ThemedText>
      </Pressable>

      <Modal visible={isOpen} transparent animationType="fade" onRequestClose={() => setIsOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setIsOpen(false)}>
          <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
            <ThemedText style={[styles.modalTitle, { color: theme.muted }]}>Select Team</ThemedText>
            <ScrollView style={styles.optionsList}>
              {/* All Teams Option */}
              <Pressable
                style={[
                  styles.option,
                  value === 'All' && { backgroundColor: theme.surfaceAlt },
                ]}
                onPress={() => {
                  onSelect('All', '');
                  setIsOpen(false);
                }}
              >
                <ThemedText style={[styles.optionText, value === 'All' && { fontWeight: '600' }]}>
                  All Teams
                </ThemedText>
              </Pressable>

              {/* Teams grouped by league */}
              {teamsByLeague.map((league) => (
                <View key={league.leagueId}>
                  <View style={[styles.leagueHeader, { backgroundColor: theme.surfaceAlt }]}>
                    <Image source={{ uri: league.leagueBadge }} style={styles.leagueHeaderBadge} />
                    <ThemedText style={[styles.leagueHeaderText, { color: theme.muted }]}>
                      {league.leagueName}
                    </ThemedText>
                  </View>
                  {league.teams.map((team) => (
                    <Pressable
                      key={`${league.leagueId}-${team}`}
                      style={[
                        styles.teamOption,
                        value === team && { backgroundColor: theme.surfaceAlt },
                      ]}
                      onPress={() => {
                        onSelect(team, league.leagueName);
                        setIsOpen(false);
                      }}
                    >
                      <ThemedText style={[styles.optionText, value === team && { fontWeight: '600' }]}>
                        {team}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

export default function LeaderboardScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const insets = useSafeAreaInsets();

  const [viewMode, setViewMode] = useState<ViewMode>('league');
  const [selectedLeagueId, setSelectedLeagueId] = useState('4339'); // Default to Super Lig
  const [selectedLeagueName, setSelectedLeagueName] = useState('Super Lig');
  const [selectedTeam, setSelectedTeam] = useState('All');
  const [teamsData, setTeamsData] = useState<TeamsByLeague[]>([]);
  const [isLoadingTeams, setIsLoadingTeams] = useState(true);

  // Fetch teams from API
  useFocusEffect(
    React.useCallback(() => {
      async function loadTeams() {
        try {
          setIsLoadingTeams(true);
          const response = await fetchJson('/teams');
          setTeamsData(response.teamsByLeague || []);
        } catch (error) {
          console.error('Failed to load teams:', error);
        } finally {
          setIsLoadingTeams(false);
        }
      }
      loadTeams();
    }, [])
  );

  // Get available teams for selected league
  const availableTeams = useMemo(() => {
    const teams = MOCK_TEAM_LEADERBOARDS.filter((t) => t.leagueName === selectedLeagueName);
    return teams.map((t) => ({ label: t.teamName, value: t.teamName }));
  }, [selectedLeagueName]);

  // League options
  const leagueOptions = MOCK_LEAGUE_LEADERBOARDS.map((league) => ({
    label: league.leagueName,
    value: league.leagueId,
  }));

  const currentLeaderboard = useMemo(() => {
    if (viewMode === 'league') {
      return MOCK_LEAGUE_LEADERBOARDS.find((lb) => lb.leagueId === selectedLeagueId);
    } else {
      return MOCK_TEAM_LEADERBOARDS.find(
        (lb) => lb.teamName === selectedTeam && lb.leagueName === selectedLeagueName
      );
    }
  }, [viewMode, selectedLeagueId, selectedTeam, selectedLeagueName]);

  const currentUserRank = useMemo(() => {
    if (!currentLeaderboard) return null;
    const currentUser = currentLeaderboard.users.find((u) => u.isCurrentUser);
    return currentUser || null;
  }, [currentLeaderboard]);

  const getMedalEmoji = (rank: number): string | null => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return null;
  };

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Hero Section */}
        <View style={styles.hero}>
          <ThemedText style={styles.eyebrow}>COMPETITIVE</ThemedText>
          <ThemedText style={styles.title}>Leaderboard</ThemedText>
          <ThemedText style={[styles.description, { color: theme.muted }]}>
            See how you rank against other football fans
          </ThemedText>

          {/* Segmented Control */}
          <View style={[styles.segmentedControl, { backgroundColor: theme.surfaceAlt }]}>
            <Pressable
              style={[
                styles.segmentButton,
                viewMode === 'league' && { backgroundColor: theme.surface },
              ]}
              onPress={() => setViewMode('league')}
            >
              <ThemedText
                style={[
                  styles.segmentText,
                  viewMode === 'league' && styles.segmentTextActive,
                ]}
              >
                Leagues
              </ThemedText>
            </Pressable>
            <Pressable
              style={[
                styles.segmentButton,
                viewMode === 'team' && { backgroundColor: theme.surface },
              ]}
              onPress={() => setViewMode('team')}
            >
              <ThemedText
                style={[
                  styles.segmentText,
                  viewMode === 'team' && styles.segmentTextActive,
                ]}
              >
                Teams
              </ThemedText>
            </Pressable>
          </View>
        </View>

        {/* Dropdowns */}
        <View style={styles.dropdownContainer}>
          {viewMode === 'league' ? (
            <Dropdown
              label="League"
              value={selectedLeagueId}
              options={leagueOptions}
              onSelect={(value) => {
                setSelectedLeagueId(value);
                const league = MOCK_LEAGUE_LEADERBOARDS.find((l) => l.leagueId === value);
                if (league) setSelectedLeagueName(league.leagueName);
              }}
              theme={theme}
            />
          ) : (
            <GroupedTeamsDropdown
              value={selectedTeam}
              teamsByLeague={teamsData}
              onSelect={(team, leagueName) => {
                setSelectedTeam(team);
                if (leagueName) setSelectedLeagueName(leagueName);
              }}
              theme={theme}
              isLoading={isLoadingTeams}
            />
          )}
        </View>

        {/* User Rank Card */}
        {currentUserRank && (
          <View style={[styles.panel, { backgroundColor: theme.surface }]}>
            <View style={styles.userRankCard}>
              <View style={[styles.rankBadge, { backgroundColor: theme.accent }]}>
                {getMedalEmoji(currentUserRank.rank) ? (
                  <ThemedText style={styles.medalEmoji}>
                    {getMedalEmoji(currentUserRank.rank)}
                  </ThemedText>
                ) : (
                  <ThemedText style={[styles.rankNumber, { color: '#fff' }]}>
                    #{currentUserRank.rank}
                  </ThemedText>
                )}
              </View>
              <View style={styles.userRankInfo}>
                <ThemedText style={styles.userRankLabel}>Your rank</ThemedText>
                <ThemedText style={[styles.userRankWatches, { color: theme.muted }]}>
                  {currentUserRank.watchCount} matches watched
                </ThemedText>
              </View>
            </View>
          </View>
        )}

        {/* Leaderboard List */}
        {currentLeaderboard && (
          <View style={[styles.panel, { backgroundColor: theme.surface }]}>
            {currentLeaderboard.users.map((user) => (
              <View
                key={user.id}
                style={[
                  styles.leaderboardRow,
                  user.isCurrentUser && {
                    backgroundColor: theme.surfaceAlt,
                    borderRadius: 12,
                  },
                ]}
              >
                <View
                  style={[
                    styles.rankBadgeSmall,
                    {
                      backgroundColor: getMedalEmoji(user.rank)
                        ? 'transparent'
                        : theme.surfaceAlt,
                    },
                  ]}
                >
                  {getMedalEmoji(user.rank) ? (
                    <ThemedText style={styles.medalEmojiSmall}>
                      {getMedalEmoji(user.rank)}
                    </ThemedText>
                  ) : (
                    <ThemedText style={[styles.rankNumberSmall, { color: theme.muted }]}>
                      {user.rank}
                    </ThemedText>
                  )}
                </View>
                <View style={styles.userInfo}>
                  <ThemedText style={styles.userName}>{user.name}</ThemedText>
                  <ThemedText style={[styles.userHandle, { color: theme.muted }]}>
                    {user.handle}
                  </ThemedText>
                </View>
                <View style={styles.watchCountBadge}>
                  <ThemedText style={styles.watchCountNumber}>{user.watchCount}</ThemedText>
                  <ThemedText style={[styles.watchCountLabel, { color: theme.muted }]}>
                    watched
                  </ThemedText>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  hero: {
    padding: 20,
    paddingBottom: 12,
  },
  eyebrow: {
    ...Fonts.eyebrow,
    marginBottom: 8,
  },
  title: {
    ...Fonts.title,
    marginBottom: 8,
  },
  description: {
    ...Fonts.body,
    marginBottom: 20,
  },
  subtitle: {
    ...Fonts.subtitle,
    fontWeight: '600',
  },
  segmentedControl: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  segmentText: {
    ...Fonts.button,
  },
  segmentTextActive: {
    fontWeight: '600',
  },
  dropdownContainer: {
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 16,
  },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  dropdownContent: {
    flex: 1,
  },
  dropdownLabel: {
    ...Fonts.caption,
    marginBottom: 4,
  },
  dropdownValue: {
    ...Fonts.subtitle,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '70%',
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    ...Fonts.subtitle,
    marginBottom: 16,
  },
  optionsList: {
    maxHeight: 400,
  },
  option: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  optionText: {
    ...Fonts.body,
  },
  leagueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 8,
    borderRadius: 8,
    gap: 8,
  },
  leagueHeaderBadge: {
    width: 20,
    height: 20,
    resizeMode: 'contain',
  },
  leagueHeaderText: {
    ...Fonts.caption,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  teamOption: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  panel: {
    borderRadius: 24,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  userRankCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rankBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalEmoji: {
    fontSize: 32,
  },
  rankNumber: {
    ...Fonts.title,
    fontSize: 20,
    fontWeight: '700',
  },
  userRankInfo: {
    flex: 1,
  },
  userRankLabel: {
    ...Fonts.subtitle,
    marginBottom: 4,
  },
  userRankWatches: {
    ...Fonts.caption,
  },
  leaderboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  rankBadgeSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  medalEmojiSmall: {
    fontSize: 24,
  },
  rankNumberSmall: {
    ...Fonts.subtitle,
    fontSize: 16,
    fontWeight: '600',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    ...Fonts.subtitle,
    marginBottom: 2,
  },
  userHandle: {
    ...Fonts.caption,
  },
  watchCountBadge: {
    alignItems: 'flex-end',
  },
  watchCountNumber: {
    ...Fonts.subtitle,
    fontWeight: '700',
  },
  watchCountLabel: {
    ...Fonts.caption,
    fontSize: 11,
  },
});
