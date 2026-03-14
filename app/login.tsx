import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri, ResponseType } from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { fetchPublicJson } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const insets = useSafeAreaInsets();
  const { setSessionToken } = useAuth();

  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      .then(async (data: { token: string; user?: { name?: string; email?: string; image?: string } }) => {
        await setSessionToken(data.token, data.user ? {
          name: data.user.name ?? null,
          email: data.user.email ?? null,
          image: data.user.image ?? null,
        } : undefined);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Login failed.');
      })
      .finally(() => setAuthLoading(false));
  }, [response]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      <View style={styles.content}>
        <View style={styles.headingSection}>
          <ThemedText style={styles.heading}>
            Welcome to{'\n'}Matchlog
          </ThemedText>
          <ThemedText style={[styles.subtitle, { color: theme.muted }]}>
            Sign in with your Google account to track the matches you watch.
          </ThemedText>
        </View>

        <View style={styles.bottomSection}>
          {error ? (
            <ThemedText style={[styles.errorText, { color: theme.accent }]}>
              {error}
            </ThemedText>
          ) : null}

          <Pressable
            style={[
              styles.googleButton,
              { backgroundColor: theme.surfaceAlt, borderColor: theme.border },
              (!request || authLoading) && styles.buttonDisabled,
            ]}
            onPress={promptWithProxy}
            disabled={!request?.url || authLoading}
          >
            <Ionicons name="logo-google" size={20} color={theme.text} />
            <ThemedText style={[styles.googleButtonText, { color: theme.text }]}>
              {authLoading ? 'Signing in...' : 'Continue with Google'}
            </ThemedText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
  },
  headingSection: {
    paddingTop: 80,
  },
  heading: {
    fontSize: 34,
    fontWeight: '800',
    lineHeight: 42,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    marginTop: 16,
  },
  bottomSection: {
    paddingBottom: 48,
    gap: 16,
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    height: 56,
    borderRadius: 14,
    borderWidth: 1,
  },
  googleButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
