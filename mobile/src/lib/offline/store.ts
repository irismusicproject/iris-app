import * as Crypto from "expo-crypto";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import * as SQLite from "expo-sqlite";

// Where the phone keeps work offline (docs/OFFLINE-SPEC.md, Lauren Nov 23, 2026).
//
// One encrypted database file (SQLCipher), whose key lives in the phone's
// secure store (Android Keystore / iPhone Keychain). Two tables:
// - `outbox`: work saved on this phone and not sent yet;
// - `cache`: the last copy of my week and upcoming dates, so screens open
//   without signal ("Last updated …"). Resident names here are first name +
//   last initial only (O7); room numbers are not kept.
//
// Nothing is stored unless the phone has a screen lock (O12). Everything is
// wiped on sign-out and when access ends (O9, O13).

const DB_NAME = "iris-offline.db";
const KEY_NAME = "iris-offline-key";

let opening: Promise<SQLite.SQLiteDatabase> | null = null;

/** True when the phone has a PIN, pattern, password or fingerprint/face (O12). */
export async function hasScreenLock(): Promise<boolean> {
  try {
    return (await LocalAuthentication.getEnrolledLevelAsync()) !== LocalAuthentication.SecurityLevel.NONE;
  } catch {
    return false;
  }
}

async function key(): Promise<string> {
  let k = await SecureStore.getItemAsync(KEY_NAME);
  if (!k) {
    k = Array.from(Crypto.getRandomBytes(32), (b) => b.toString(16).padStart(2, "0")).join("");
    await SecureStore.setItemAsync(KEY_NAME, k);
  }
  return k;
}

function db(): Promise<SQLite.SQLiteDatabase> {
  if (!opening)
    opening = (async () => {
      const k = await key();
      const d = await SQLite.openDatabaseAsync(DB_NAME);
      await d.execAsync(`PRAGMA key = "x'${k}'";`);
      await d.execAsync(`
        create table if not exists cache (key text primary key, value text not null, saved_at text not null);
        create table if not exists outbox (
          id text primary key, person_id text not null, kind text not null, payload text not null,
          summary text not null, state text not null, problem text, conflict text,
          created_at text not null, updated_at text not null
        );`);
      return d;
    })().catch((e) => {
      opening = null;
      throw e;
    });
  return opening;
}

// Maps survive the round trip (the week uses them).
const replacer = (_k: string, v: unknown) => (v instanceof Map ? { __map: [...v.entries()] } : v);
const reviver = (_k: string, v: unknown) => (v && typeof v === "object" && "__map" in v ? new Map((v as { __map: [unknown, unknown][] }).__map) : v);

export async function cacheGet<T>(k: string): Promise<{ value: T; savedAt: string } | null> {
  try {
    const row = await (await db()).getFirstAsync<{ value: string; saved_at: string }>("select value, saved_at from cache where key = ?", k);
    return row ? { value: JSON.parse(row.value, reviver) as T, savedAt: row.saved_at } : null;
  } catch {
    return null;
  }
}

export async function cacheSet(k: string, value: unknown): Promise<void> {
  if (!(await hasScreenLock())) return;
  try {
    await (await db()).runAsync("insert or replace into cache (key, value, saved_at) values (?, ?, ?)", k, JSON.stringify(value, replacer), new Date().toISOString());
  } catch {
    // A full or broken store never stops the app working online.
  }
}

export type OutboxKind = "activity" | "report";
export type OutboxState = "saved" | "needs_attention";
export type Conflict = { name: string; newId: string; existingId: string };
export type OutboxItem = {
  id: string;
  personId: string;
  kind: OutboxKind;
  payload: Record<string, unknown>;
  summary: string;
  state: OutboxState;
  problem: string | null;
  conflict: Conflict | null;
  createdAt: string;
};

type Row = { id: string; person_id: string; kind: OutboxKind; payload: string; summary: string; state: OutboxState; problem: string | null; conflict: string | null; created_at: string };

export async function outboxList(personId: string): Promise<OutboxItem[]> {
  try {
    const rows = await (await db()).getAllAsync<Row>("select * from outbox where person_id = ? order by created_at", personId);
    return rows.map((r) => ({
      id: r.id,
      personId: r.person_id,
      kind: r.kind,
      payload: JSON.parse(r.payload),
      summary: r.summary,
      state: r.state,
      problem: r.problem,
      conflict: r.conflict ? JSON.parse(r.conflict) : null,
      createdAt: r.created_at,
    }));
  } catch {
    return [];
  }
}

export async function outboxPut(item: OutboxItem): Promise<void> {
  const now = new Date().toISOString();
  await (await db()).runAsync(
    "insert or replace into outbox (id, person_id, kind, payload, summary, state, problem, conflict, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    item.id,
    item.personId,
    item.kind,
    JSON.stringify(item.payload),
    item.summary,
    item.state,
    item.problem,
    item.conflict ? JSON.stringify(item.conflict) : null,
    item.createdAt,
    now,
  );
}

export async function outboxRemove(id: string): Promise<void> {
  try {
    await (await db()).runAsync("delete from outbox where id = ?", id);
  } catch {
    // Nothing to remove.
  }
}

/** Remove everything this phone keeps for Iris (sign-out, access ended). */
export async function wipe(): Promise<void> {
  try {
    if (opening) {
      const d = await opening;
      opening = null;
      await d.closeAsync();
    }
  } catch {
    opening = null;
  }
  try {
    await SQLite.deleteDatabaseAsync(DB_NAME);
  } catch {
    // Not created yet.
  }
  await SecureStore.deleteItemAsync(KEY_NAME).catch(() => {});
}

export const newId = () => Crypto.randomUUID();
