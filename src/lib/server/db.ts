// SQLite connection + schema + first-run seeding. The database file lives in
// data/trellis.db (gitignored); override with TRELLIS_DB for scratch runs.

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { seedRelations, seedThoughts, seedWorkingSet } from '$lib/seed';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS thoughts (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  title TEXT NOT NULL,
  statement TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS thought_revisions (
  id TEXT PRIMARY KEY,
  thought_id TEXT NOT NULL REFERENCES thoughts(id),
  title TEXT NOT NULL,
  statement TEXT NOT NULL,
  status TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  source_change_set_id TEXT,
  edited_from_proposal INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_revisions_thought ON thought_revisions(thought_id);

CREATE TABLE IF NOT EXISTS relations (
  id TEXT PRIMARY KEY,
  from_thought_id TEXT NOT NULL REFERENCES thoughts(id),
  to_thought_id TEXT NOT NULL REFERENCES thoughts(id),
  type TEXT NOT NULL,
  created_by TEXT NOT NULL,
  source_change_set_id TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS working_set_items (
  thought_id TEXT PRIMARY KEY REFERENCES thoughts(id),
  x REAL NOT NULL,
  y REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS change_sets (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  summary TEXT NOT NULL,
  invoked_on TEXT NOT NULL,
  scratch_id TEXT,
  created_at INTEGER NOT NULL,
  applied_by TEXT,
  applied_at INTEGER
);

CREATE TABLE IF NOT EXISTS proposed_operations (
  id TEXT PRIMARY KEY,
  change_set_id TEXT NOT NULL REFERENCES change_sets(id),
  client_ref TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  depends_on TEXT NOT NULL,
  evidence_refs TEXT NOT NULL,
  payload TEXT NOT NULL,
  edited_payload TEXT,
  rationale TEXT NOT NULL,
  decision TEXT NOT NULL DEFAULT 'pending',
  decided_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_ops_change_set ON proposed_operations(change_set_id);

CREATE TABLE IF NOT EXISTS scratch_notes (
  id TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  distilled_change_set_id TEXT
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

function open(): Database.Database {
	const dbPath = process.env.TRELLIS_DB ?? path.resolve('data/trellis.db');
	if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
	const db = new Database(dbPath);
	db.pragma('journal_mode = WAL');
	db.pragma('foreign_keys = ON');
	db.exec(SCHEMA);
	seedIfEmpty(db);
	return db;
}

function seedIfEmpty(db: Database.Database) {
	const count = db.prepare('SELECT COUNT(*) AS n FROM thoughts').get() as { n: number };
	if (count.n > 0) return;

	const insertThought = db.prepare(
		`INSERT INTO thoughts (id, type, status, title, statement, created_at, updated_at)
		 VALUES (@id, @type, @status, @title, @statement, @createdAt, @updatedAt)`
	);
	const insertRevision = db.prepare(
		`INSERT INTO thought_revisions
		   (id, thought_id, title, statement, status, actor_type, source_change_set_id, edited_from_proposal, created_at)
		 VALUES (@id, @thoughtId, @title, @statement, @status, @actorType, NULL, 0, @createdAt)`
	);
	const insertRelation = db.prepare(
		`INSERT INTO relations (id, from_thought_id, to_thought_id, type, created_by, source_change_set_id, created_at)
		 VALUES (@id, @fromThoughtId, @toThoughtId, @type, @createdBy, NULL, @createdAt)`
	);
	const insertItem = db.prepare(
		'INSERT INTO working_set_items (thought_id, x, y) VALUES (@thoughtId, @x, @y)'
	);

	db.transaction(() => {
		for (const t of seedThoughts) {
			insertThought.run(t);
			for (const rev of t.revisions) insertRevision.run({ ...rev, thoughtId: t.id });
		}
		for (const r of seedRelations) insertRelation.run(r);
		for (const item of seedWorkingSet) insertItem.run(item);
	})();
}

// Survive Vite dev-server module reloads without leaking connections.
const globalForDb = globalThis as typeof globalThis & { __trellisDb?: Database.Database };

export const db: Database.Database = (globalForDb.__trellisDb ??= open());
