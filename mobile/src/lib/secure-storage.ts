import * as SecureStore from "expo-secure-store";

// Where Supabase keeps the sign-in session on the phone: the phone's secure
// store (Android Keystore, iPhone Keychain), so it's encrypted at rest
// (OFFLINE-SPEC principle 6, R9.4). The secure store holds at most about
// 2 KB per item and a session is larger, so each value is split into
// numbered chunks, with the chunk count kept under the key itself.

const CHUNK = 1800;
const options: SecureStore.SecureStoreOptions = {
  // Readable only while the phone is unlocked, and never copied to backups or other devices.
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

// Secure-store keys may use only letters, numbers, ".", "-" and "_".
const safe = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, "_");

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const count = await SecureStore.getItemAsync(safe(key), options);
    if (count === null) return null;
    const parts: string[] = [];
    for (let i = 0; i < Number(count); i++) {
      const part = await SecureStore.getItemAsync(`${safe(key)}.${i}`, options);
      if (part === null) return null; // incomplete: treat as signed out
      parts.push(part);
    }
    return parts.join("");
  },
  async setItem(key: string, value: string): Promise<void> {
    await this.removeItem(key);
    const count = Math.ceil(value.length / CHUNK);
    for (let i = 0; i < count; i++) {
      await SecureStore.setItemAsync(`${safe(key)}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK), options);
    }
    await SecureStore.setItemAsync(safe(key), String(count), options);
  },
  async removeItem(key: string): Promise<void> {
    const count = await SecureStore.getItemAsync(safe(key), options);
    for (let i = 0; i < Number(count ?? 0); i++) await SecureStore.deleteItemAsync(`${safe(key)}.${i}`, options);
    await SecureStore.deleteItemAsync(safe(key), options);
  },
};
