import * as AppleAuthentication from 'expo-apple-authentication';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

export type Session = {
  accessToken: string;
  userId: string;
  expiresAt?: string | null;
};

type AnyRecord = Record<string, unknown>;

type AppleCredential = {
  identityToken?: string | null;
  authorizationCode?: string | null;
  user?: string | null;
};

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://api.yearinpixels.app';
const AUTH_REQUEST_TIMEOUT_MS = 7000;
const WEB_SESSION_KEY = 'year-in-pixels.session';
const SESSION_FILE_URI = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}year-in-pixels-session.json`
  : null;

let currentSession: Session | null = null;
let hasLoadedSession = false;

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseUserId(payload: AnyRecord): string {
  const directUserId = payload.userId ?? payload.user_id ?? payload.id;
  if (typeof directUserId === 'string' && directUserId.trim().length > 0) {
    return directUserId;
  }

  const user = payload.user;
  if (isRecord(user)) {
    const nestedUserId = user.id ?? user.userId ?? user.user_id;
    if (typeof nestedUserId === 'string' && nestedUserId.trim().length > 0) {
      return nestedUserId;
    }
  }

  return '';
}

function normalizeSession(payload: unknown): Session | null {
  if (!isRecord(payload)) {
    return null;
  }

  const accessTokenRaw =
    payload.accessToken ?? payload.access_token ?? payload.token ?? payload.sessionToken;
  const accessToken =
    typeof accessTokenRaw === 'string' && accessTokenRaw.trim().length > 0
      ? accessTokenRaw.trim()
      : null;

  if (!accessToken) {
    return null;
  }

  const userId = parseUserId(payload);
  if (!userId) {
    return null;
  }

  const expiresRaw = payload.expiresAt ?? payload.expires_at;
  const expiresAt =
    typeof expiresRaw === 'string' && expiresRaw.trim().length > 0 ? expiresRaw : undefined;

  return {
    accessToken,
    userId,
    ...(expiresAt ? { expiresAt } : null),
  };
}

async function readPersistedSession(): Promise<Session | null> {
  if (Platform.OS === 'web') {
    try {
      const raw = globalThis.localStorage?.getItem(WEB_SESSION_KEY);
      if (!raw) {
        return null;
      }
      return normalizeSession(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  if (!SESSION_FILE_URI) {
    return null;
  }

  try {
    const raw = await FileSystem.readAsStringAsync(SESSION_FILE_URI);
    return normalizeSession(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function persistSession(session: Session | null): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (session) {
        globalThis.localStorage?.setItem(WEB_SESSION_KEY, JSON.stringify(session));
      } else {
        globalThis.localStorage?.removeItem(WEB_SESSION_KEY);
      }
    } catch {
      // Ignore persistence failures and continue with in-memory state.
    }
    return;
  }

  if (!SESSION_FILE_URI) {
    return;
  }

  try {
    if (session) {
      await FileSystem.writeAsStringAsync(SESSION_FILE_URI, JSON.stringify(session));
      return;
    }
    await FileSystem.deleteAsync(SESSION_FILE_URI);
  } catch {
    // Ignore persistence failures and continue with in-memory state.
  }
}

async function ensureSessionLoaded(): Promise<void> {
  if (hasLoadedSession) {
    return;
  }

  currentSession = await readPersistedSession();
  hasLoadedSession = true;
}

async function requestAppleCredential(): Promise<AppleCredential> {
  if (Platform.OS !== 'ios') {
    throw new Error('Sign in with Apple is only available on iOS.');
  }

  const isAvailable = await AppleAuthentication.isAvailableAsync();
  if (!isAvailable) {
    throw new Error('Sign in with Apple is unavailable on this device.');
  }

  const options = {
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  };

  return AppleAuthentication.signInAsync(options);
}

async function exchangeAppleToken(credential: AppleCredential): Promise<Session> {
  const identityToken =
    typeof credential.identityToken === 'string' && credential.identityToken.trim().length > 0
      ? credential.identityToken
      : null;

  if (!identityToken) {
    throw new Error('Apple sign-in did not return an identity token.');
  }

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, AUTH_REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/auth/apple`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        identityToken,
        idToken: identityToken,
        authorizationCode: credential.authorizationCode ?? null,
        user: credential.user ?? null,
        appleUser: credential.user ?? null,
      }),
      signal: abortController.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Timed out reaching ${API_BASE_URL}/auth/apple. Check your API server and try again.`);
    }
    throw new Error(`Unable to reach ${API_BASE_URL}/auth/apple. Check your API server and try again.`);
  } finally {
    clearTimeout(timeoutId);
  }

  const rawBody = await response.text();
  if (!response.ok) {
    let message = `Apple sign-in failed (${response.status}).`;
    if (rawBody.trim().length > 0) {
      try {
        const payload = JSON.parse(rawBody) as AnyRecord;
        const errorMessage = payload.message ?? payload.error ?? payload.detail;
        if (typeof errorMessage === 'string' && errorMessage.trim().length > 0) {
          message = errorMessage.trim();
        }
      } catch {
        // Keep the default message when response is not valid JSON.
      }
    }
    throw new Error(message);
  }

  let payload: unknown = null;
  try {
    payload = rawBody.trim().length > 0 ? JSON.parse(rawBody) : null;
  } catch {
    throw new Error('Apple sign-in failed due to an invalid server response.');
  }

  const session = normalizeSession(payload);
  if (!session) {
    throw new Error('Apple sign-in failed: session payload was missing access credentials.');
  }

  return session;
}

export async function signInWithApple(): Promise<Session> {
  await ensureSessionLoaded();

  const credential = await requestAppleCredential();
  const session = await exchangeAppleToken(credential);
  setSession(session);
  return session;
}

export async function signOut(): Promise<void> {
  await ensureSessionLoaded();
  const accessToken = currentSession?.accessToken;

  if (accessToken) {
    try {
      await fetch(`${API_BASE_URL}/auth/session`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
    } catch {
      // Ignore sign-out network failures and clear local session anyway.
    }
  }

  clearSession();
}

export function setSession(session: Session | null) {
  currentSession = session;
  hasLoadedSession = true;
  void persistSession(session);
}

export function clearSession() {
  setSession(null);
}

export async function getSession(): Promise<Session | null> {
  await ensureSessionLoaded();
  return currentSession;
}

export async function getAccessToken(): Promise<string | null> {
  await ensureSessionLoaded();

  if (currentSession?.accessToken) {
    return currentSession.accessToken;
  }

  return null;
}

export async function applySessionRotation(accessToken: string, expiresAt?: string | null): Promise<void> {
  const nextToken = accessToken.trim();
  if (!nextToken) {
    return;
  }

  await ensureSessionLoaded();
  if (!currentSession) {
    return;
  }

  const nextSession: Session = {
    ...currentSession,
    accessToken: nextToken,
    ...(typeof expiresAt === 'string' && expiresAt.trim().length > 0 ? { expiresAt: expiresAt.trim() } : null),
  };
  setSession(nextSession);
}
