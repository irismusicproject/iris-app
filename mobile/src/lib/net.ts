import NetInfo from "@react-native-community/netinfo";

/**
 * True when the phone reports no connection. Screens then go straight to the
 * copy kept on the phone (OFFLINE-SPEC 3.2) instead of asking Iris first: with
 * an expired access token, every request waits about 30 seconds while the
 * sign-in library retries renewing it, so an offline phone took up to a minute
 * to show anything (Violet's phone journey, Nov 25).
 */
export async function offlineNow(): Promise<boolean> {
  const s = await NetInfo.fetch();
  return !(Boolean(s.isConnected) && s.isInternetReachable !== false);
}
