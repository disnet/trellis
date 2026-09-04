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

CREATE TABLE IF NOT EXISTS working_sets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS working_set_items (
  working_set_id TEXT NOT NULL REFERENCES working_sets(id),
  thought_id TEXT NOT NULL REFERENCES thoughts(id),
  x REAL NOT NULL,
  y REAL NOT NULL,
  PRIMARY KEY (working_set_id, thought_id)
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

-- One row per model/fixture attempt: inputs, raw output, validation errors and
-- latency, for evaluation. Review decisions live on proposed_operations; join
-- through change_set_id.
CREATE TABLE IF NOT EXISTS agent_calls (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  adapter TEXT NOT NULL,
  model TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  request TEXT NOT NULL,
  raw_output TEXT,
  validation_errors TEXT,
  error TEXT,
  latency_ms INTEGER NOT NULL,
  change_set_id TEXT,
  created_at INTEGER NOT NULL
);
`;

function open(): Database.Database {
	const dbPath = process.env.TRELLIS_DB ?? path.resolve('data/trellis.db');
	if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
	const db = new Database(dbPath);
	db.pragma('journal_mode = WAL');
	db.pragma('foreign_keys = ON');
	db.exec(SCHEMA);
	migrateToMultipleWorkingSets(db);
	seedIfEmpty(db);
	return db;
}

// Databases created before working sets were plural have a single-set
// working_set_items table (thought_id primary key, no working_set_id). Rebuild
// it under a default "Main" set. Pre-migration undo snapshots are in the old
// shape too, so drop them rather than restore garbage.
function migrateToMultipleWorkingSets(db: Database.Database) {
	const cols = db.pragma('table_info(working_set_items)') as { name: string }[];
	if (cols.some((c) => c.name === 'working_set_id')) return;
	db.pragma('foreign_keys = OFF');
	db.transaction(() => {
		db.prepare("INSERT INTO working_sets (id, name, created_at) VALUES ('ws-main', 'Main', ?)").run(
			Date.now()
		);
		db.exec(`
			ALTER TABLE working_set_items RENAME TO working_set_items_old;
			CREATE TABLE working_set_items (
			  working_set_id TEXT NOT NULL REFERENCES working_sets(id),
			  thought_id TEXT NOT NULL REFERENCES thoughts(id),
			  x REAL NOT NULL,
			  y REAL NOT NULL,
			  PRIMARY KEY (working_set_id, thought_id)
			);
			INSERT INTO working_set_items (working_set_id, thought_id, x, y)
			  SELECT 'ws-main', thought_id, x, y FROM working_set_items_old;
			DROP TABLE working_set_items_old;
		`);
		db.prepare(
			"INSERT INTO meta (key, value) VALUES ('active_working_set', 'ws-main') ON CONFLICT(key) DO UPDATE SET value = excluded.value"
		).run();
		db.prepare("DELETE FROM meta WHERE key IN ('undo_snapshot', 'undo_label')").run();
	})();
	db.pragma('foreign_keys = ON');
}

/** The current working set's id, self-healing if the meta pointer is stale. */
export function activeWorkingSetId(): string {
	const row = db.prepare("SELECT value FROM meta WHERE key = 'active_working_set'").get() as
		| { value: string }
		| undefined;
	if (row && db.prepare('SELECT 1 FROM working_sets WHERE id = ?').get(row.value)) return row.value;
	const first = db
		.prepare('SELECT id FROM working_sets ORDER BY created_at, rowid LIMIT 1')
		.get() as { id: string };
	db.prepare(
		"INSERT INTO meta (key, value) VALUES ('active_working_set', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
	).run(first.id);
	return first.id;
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
		"INSERT INTO working_set_items (working_set_id, thought_id, x, y) VALUES ('ws-main', @thoughtId, @x, @y)"
	);

	db.transaction(() => {
		for (const t of seedThoughts) {
			insertThought.run(t);
			for (const rev of t.revisions) insertRevision.run({ ...rev, thoughtId: t.id });
		}
		for (const r of seedRelations) insertRelation.run(r);
		db.prepare(
			"INSERT INTO working_sets (id, name, created_at) VALUES ('ws-main', 'Main', ?) ON CONFLICT(id) DO NOTHING"
		).run(Date.now());
		db.prepare(
			"INSERT INTO meta (key, value) VALUES ('active_working_set', 'ws-main') ON CONFLICT(key) DO UPDATE SET value = excluded.value"
		).run();
		for (const item of seedWorkingSet) insertItem.run(item);
	})();
}

// Survive Vite dev-server module reloads without leaking connections.
const globalForDb = globalThis as typeof globalThis & { __trellisDb?: Database.Database };

export const db: Database.Database = (globalForDb.__trellisDb ??= open());
