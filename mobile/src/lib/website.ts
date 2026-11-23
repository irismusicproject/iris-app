import { Linking } from "react-native";

// The Iris website that matches the database this build talks to: the
// staging site for test versions, the live site otherwise.
export const WEBSITE = process.env.EXPO_PUBLIC_IRIS_ENVIRONMENT === "staging" ? "https://staging.irismusicproject.org" : "https://app.irismusicproject.org";

export const openWebsite = (path: string) => Linking.openURL(`${WEBSITE}${path}`);
