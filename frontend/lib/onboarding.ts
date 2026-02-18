import AsyncStorage from '@react-native-async-storage/async-storage';

const ONBOARDING_COMPLETED_KEY = 'year_in_pixels_onboarding_completed_v1';

export async function getOnboardingCompleted(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(ONBOARDING_COMPLETED_KEY);
    return value === '1';
  } catch {
    return false;
  }
}

export async function setOnboardingCompleted(completed = true): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDING_COMPLETED_KEY, completed ? '1' : '0');
  } catch {
    // Persistence failure should not block app navigation.
  }
}
