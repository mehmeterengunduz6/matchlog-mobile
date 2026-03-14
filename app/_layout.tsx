import { useEffect } from 'react';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { AuthProvider, useAuth } from '@/contexts/auth-context';

function useProtectedRoute() {
  const { sessionToken, checkingSession } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (checkingSession) {
      return;
    }

    const onLoginScreen = segments[0] === 'login';

    if (!sessionToken && !onLoginScreen) {
      router.replace('/login');
    } else if (sessionToken && onLoginScreen) {
      router.replace('/');
    }
  }, [sessionToken, checkingSession, segments]);
}

function RootNavigator() {
  const colorScheme = useColorScheme();

  useProtectedRoute();

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal', headerShown: true }} />
        <Stack.Screen
          name="team/[teamId]"
          options={{ presentation: 'card' }}
        />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}
