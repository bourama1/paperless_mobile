import axios from 'axios';
import Constants from 'expo-constants';

// For development, use your machine's IP if testing on a physical device.
// expo-constants can help identify if we're in Expo Go.
const debuggerHost = Constants.expoConfig?.hostUri;
const ip = debuggerHost ? debuggerHost.split(':')[0] : 'localhost';

export const BASE_URL = `http://${ip}:3000`;

const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    Accept: 'application/json',
  },
});

export default apiClient;
