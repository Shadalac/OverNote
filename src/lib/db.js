import Database from "@tauri-apps/plugin-sql";

// The schema is created here (rather than only in the Rust-side migration)
// so the app works the same in `tauri dev` and after a fresh install, and
// so it's easy to see the shape of the data in one place.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );

  -- Small key/value store for app-wide gamification state (credits,
  -- unlocked themes, owned/visible pets) — global, not per-note, so it
  -- doesn't belong as columns on the notes table.
  CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

let dbPromise = null;

// Lazily opens (and migrates) the sqlite file. Tauri resolves "sqlite:notes.db"
// to a file inside the OS's per-app data directory, so this works unchanged
// on Windows and on Linux/the Pi.
function getDb() {
  if (!dbPromise) {
    dbPromise = Database.load("sqlite:notes.db").then(async (db) => {
      await db.execute(SCHEMA);
      await addTagsColumnIfMissing(db);
      await addEarnedItemIdsColumnIfMissing(db);
      return db;
    });
  }
  return dbPromise;
}

// CREATE TABLE IF NOT EXISTS only helps on a brand-new database. Anyone who
// already had notes before this feature existed has a `notes` table with no
// `tags` column, so add it in place without touching their existing rows.
async function addTagsColumnIfMissing(db) {
  const columns = await db.select("PRAGMA table_info(notes)");
  const hasTags = columns.some((c) => c.name === "tags");
  if (!hasTags) {
    await db.execute("ALTER TABLE notes ADD COLUMN tags TEXT NOT NULL DEFAULT ''");
  }
}

// Same idea, for the gamification feature: a comma-separated list of
// checklist-item ids that have already earned their one-time credit on
// this note, so a checkbox never pays out twice.
async function addEarnedItemIdsColumnIfMissing(db) {
  const columns = await db.select("PRAGMA table_info(notes)");
  const hasCol = columns.some((c) => c.name === "earned_item_ids");
  if (!hasCol) {
    await db.execute(
      "ALTER TABLE notes ADD COLUMN earned_item_ids TEXT NOT NULL DEFAULT ''"
    );
  }
}

export async function listNotes() {
  const db = await getDb();
  return db.select(
    "SELECT id, title, body, tags, earned_item_ids, created_at, updated_at FROM notes ORDER BY updated_at DESC"
  );
}

export async function createNote() {
  const db = await getDb();
  const now = new Date().toISOString();
  const result = await db.execute(
    "INSERT INTO notes (title, body, tags, earned_item_ids, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)",
    ["Untitled note", "", "", "", now, now]
  );
  return result.lastInsertId;
}

export async function updateNote(id, title, body, tags, earnedItemIds = "") {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute(
    "UPDATE notes SET title = $1, body = $2, tags = $3, earned_item_ids = $4, updated_at = $5 WHERE id = $6",
    [title, body, tags, earnedItemIds, now, id]
  );
}

export async function deleteNote(id) {
  const db = await getDb();
  await db.execute("DELETE FROM notes WHERE id = $1", [id]);
}

// ---- Templates ------------------------------------------------------------
//
// A template is just a saved (title, body, tags) triple under a name the
// user picks, used to stamp out new notes that already have the same
// checklist groups/structure filled in.

export async function listTemplates() {
  const db = await getDb();
  return db.select(
    "SELECT id, name, title, body, tags, created_at FROM templates ORDER BY name COLLATE NOCASE ASC"
  );
}

export async function createTemplate(name, title, body, tags) {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.execute(
    "INSERT INTO templates (name, title, body, tags, created_at) VALUES ($1, $2, $3, $4, $5)",
    [name, title, body, tags, now]
  );
}

export async function deleteTemplate(id) {
  const db = await getDb();
  await db.execute("DELETE FROM templates WHERE id = $1", [id]);
}

export async function renameTemplate(id, name) {
  const db = await getDb();
  await db.execute("UPDATE templates SET name = $1 WHERE id = $2", [name, id]);
}

// Creates a brand-new note by copying a template's saved content.
export async function createNoteFromTemplate(templateId) {
  const db = await getDb();
  const rows = await db.select(
    "SELECT title, body, tags FROM templates WHERE id = $1",
    [templateId]
  );
  const tpl = rows[0];
  const now = new Date().toISOString();
  const result = await db.execute(
    "INSERT INTO notes (title, body, tags, earned_item_ids, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6)",
    [tpl?.title ?? "Untitled note", tpl?.body ?? "", tpl?.tags ?? "", "", now, now]
  );
  return result.lastInsertId;
}

// ---- Gamification: credits, unlocked themes, owned/visible pets -------
//
// A tiny key/value store. Each key's value is JSON-encoded so callers get
// back real numbers/arrays/booleans, not strings to parse themselves.

const APP_STATE_DEFAULTS = {
  credits: 0,
  unlockedThemes: ["default"],
  ownedPets: [],
  // Only one Holo-Pet shows at a time, in its own frame — this is that
  // pet's id (null once you own pets but haven't picked one, in which case
  // the UI just falls back to the first owned pet).
  activePetId: null,
  petsWindowVisible: true,
};

export async function getAppState() {
  const db = await getDb();
  const rows = await db.select("SELECT key, value FROM app_state");
  const state = { ...APP_STATE_DEFAULTS };
  for (const row of rows) {
    try {
      state[row.key] = JSON.parse(row.value);
    } catch {
      // Ignore a corrupted row rather than let it break the whole app —
      // that key just falls back to its default.
    }
  }
  return state;
}

// Merges `partial` into the stored state, one row per key. Callers pass
// only the keys that changed (e.g. { credits: 260 }).
export async function setAppState(partial) {
  const db = await getDb();
  for (const [key, value] of Object.entries(partial)) {
    await db.execute(
      "INSERT INTO app_state (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      [key, JSON.stringify(value)]
    );
  }
}

// ---- Tags -------------------------------------------------------------
//
// Tags aren't a separate table — they're just a comma-separated string on
// each note — so renaming or deleting one everywhere means walking every
// note that has it and rewriting that note's tags field.

function splitTags(tagString) {
  return (tagString || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export async function renameTagEverywhere(oldTag, newTag) {
  const db = await getDb();
  const rows = await db.select("SELECT id, tags FROM notes WHERE tags != ''");
  for (const row of rows) {
    const tags = splitTags(row.tags);
    if (!tags.some((t) => t.toLowerCase() === oldTag.toLowerCase())) continue;
    const renamed = tags.map((t) => (t.toLowerCase() === oldTag.toLowerCase() ? newTag : t));
    // De-dupe in case the new name collides with a tag already on this note.
    const deduped = [...new Set(renamed)];
    await db.execute("UPDATE notes SET tags = $1 WHERE id = $2", [deduped.join(","), row.id]);
  }
}

export async function deleteTagEverywhere(tag) {
  const db = await getDb();
  const rows = await db.select("SELECT id, tags FROM notes WHERE tags != ''");
  for (const row of rows) {
    const tags = splitTags(row.tags);
    if (!tags.some((t) => t.toLowerCase() === tag.toLowerCase())) continue;
    const remaining = tags.filter((t) => t.toLowerCase() !== tag.toLowerCase());
    await db.execute("UPDATE notes SET tags = $1 WHERE id = $2", [remaining.join(","), row.id]);
  }
}
