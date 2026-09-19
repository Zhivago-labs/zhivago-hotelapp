import Constants from 'expo-constants';
import { Platform } from 'react-native';

const getApiUrl = () => {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL;
  }

  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      return `http://${window.location.hostname}:3333`;
    }
    return 'http://localhost:3333';
  }

  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const ip = hostUri.split(':')[0];
    return `http://${ip}:3333`;
  }

  return 'http://192.168.15.20:3333';
};

export const API_URL = getApiUrl();
