import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchJson } from './api';
import { STORAGE_KEYS } from './storage';

export type UserPreferences = {
  collapsedLeagues?: string[];
  hiddenLeagues?: string[];
  leagueOrder?: string[];
  favoriteTeams?: string[];
};

export async function getCachedPreferences(): Promise<UserPreferences> {
  try {
    const cached = await AsyncStorage.getItem(STORAGE_KEYS.PREFERENCES);
    return cached ? JSON.parse(cached) : {};
  } catch (error) {
    console.error('Failed to read cached preferences:', error);
    return {};
  }
}

async function setCachedPreferences(preferences: UserPreferences): Promise<void> {
  try {
    await AsyncStorage.setItem(
      STORAGE_KEYS.PREFERENCES,
      JSON.stringify(preferences)
    );
  } catch (error) {
    console.error('Failed to cache preferences:', error);
  }
}

export async function fetchPreferences(): Promise<UserPreferences> {
  try {
    const response = await fetchJson('/preferences');
    const preferences = response.preferences || {};
    await setCachedPreferences(preferences);
    return preferences;
  } catch (error) {
    console.error('Failed to fetch preferences:', error);
    return getCachedPreferences();
  }
}

export async function updatePreferences(
  updates: Partial<UserPreferences>
): Promise<UserPreferences> {
  try {
    const response = await fetchJson('/preferences', {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    const preferences = response.preferences || {};
    await setCachedPreferences(preferences);
    return preferences;
  } catch (error) {
    console.error('Failed to update preferences:', error);
    throw error;
  }
}

export async function toggleLeagueCollapsed(leagueId: string): Promise<void> {
  const current = await getCachedPreferences();
  const collapsedLeagues = current.collapsedLeagues || [];
  const newCollapsed = collapsedLeagues.includes(leagueId)
    ? collapsedLeagues.filter((id) => id !== leagueId)
    : [...collapsedLeagues, leagueId];

  await updatePreferences({ collapsedLeagues: newCollapsed });
}

export async function toggleLeagueHidden(leagueId: string): Promise<void> {
  const current = await getCachedPreferences();
  const hiddenLeagues = current.hiddenLeagues || [];
  const newHidden = hiddenLeagues.includes(leagueId)
    ? hiddenLeagues.filter((id) => id !== leagueId)
    : [...hiddenLeagues, leagueId];

  await updatePreferences({ hiddenLeagues: newHidden });
}

export async function updateLeagueOrder(order: string[]): Promise<void> {
  await updatePreferences({ leagueOrder: order });
}

export async function toggleFavoriteTeam(teamName: string): Promise<void> {
  const current = await getCachedPreferences();
  const favoriteTeams = current.favoriteTeams || [];
  const newFavorites = favoriteTeams.includes(teamName)
    ? favoriteTeams.filter((name) => name !== teamName)
    : [...favoriteTeams, teamName];

  await updatePreferences({ favoriteTeams: newFavorites });
}
