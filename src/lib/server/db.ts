// SQLite connection + schema + first-run seeding. The database file lives in
// data/trellis.db (gitignored); override with TRELLIS_DB for scratch runs.

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { seedPositions, seedRelations, seedThoughts } from '$lib/seed';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS graphs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS thoughts (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  title TEXT NOT NULL,
  statement TEXT NOT NULL,
  confidence TEXT,
  source TEXT,
  graph_id TEXT NOT NULL REFERENCES graphs(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS thought_revisions (
  id TEXT PRIMARY KEY,
  thought_id TEXT NOT NULL REFERENCES thoughts(id),
  title TEXT NOT NULL,
  statement TEXT NOT NULL,
  status TEXT NOT NULL,
  confidence TEXT,
  source TEXT,
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
  graph_id TEXT NOT NULL REFERENCES graphs(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS working_sets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  graph_id TEXT NOT NULL REFERENCES graphs(id),
  created_at INTEGER NOT NULL
);

-- Working sets are lenses over the whole-graph canvas: membership only.
-- Layout lives in canvas_positions, one position per thought per graph.
CREATE TABLE IF NOT EXISTS working_set_items (
  working_set_id TEXT NOT NULL REFERENCES working_sets(id),
  thought_id TEXT NOT NULL REFERENCES thoughts(id),
  PRIMARY KEY (working_set_id, thought_id)
);

-- The graph's one canonical canvas layout. Still a projection (never a column
-- on thoughts), but per-graph rather than per-working-set so spatial memory
-- survives switching lenses.
CREATE TABLE IF NOT EXISTS canvas_positions (
  graph_id TEXT NOT NULL REFERENCES graphs(id),
  thought_id TEXT NOT NULL REFERENCES thoughts(id),
  x REAL NOT NULL,
  y REAL NOT NULL,
  PRIMARY KEY (graph_id, thought_id)
);

CREATE TABLE IF NOT EXISTS change_sets (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  summary TEXT NOT NULL,
  invoked_on TEXT NOT NULL,
  consulted TEXT NOT NULL DEFAULT '[]',
  scratch_id TEXT,
  graph_id TEXT NOT NULL REFERENCES graphs(id),
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

-- Free-text boxes living directly on the canvas: annotations beside thought
-- groups, and the raw material for convert-to-thought / decompose. Position
-- lives on the row (they are not thoughts, so canvas_positions cannot hold it).
CREATE TABLE IF NOT EXISTS canvas_notes (
  id TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  graph_id TEXT NOT NULL REFERENCES graphs(id),
  x REAL NOT NULL,
  y REAL NOT NULL,
  -- User-set size (a set height scrolls overflowing text internally);
  -- NULL means the default width with content-fit height.
  w REAL,
  h REAL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS scratch_notes (
  id TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  graph_id TEXT NOT NULL REFERENCES graphs(id),
  created_at INTEGER NOT NULL,
  distilled_change_set_id TEXT
);

-- Pins (Phase 6): per-graph attention state, not knowledge — which thoughts
-- the person keeps returning to. Not a column on thoughts for the same reason
-- card coordinates live in canvas_positions.
CREATE TABLE IF NOT EXISTS pinned_thoughts (
  graph_id TEXT NOT NULL REFERENCES graphs(id),
  thought_id TEXT NOT NULL REFERENCES thoughts(id),
  pinned_at INTEGER NOT NULL,
  PRIMARY KEY (graph_id, thought_id)
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

-- Generated prose is a derived artifact. Deliberately no foreign key to a
-- working set: undo restores working-set rows and must not erase treatments.
-- Every generation appends a draft; a group/style slot keeps its history.
CREATE TABLE IF NOT EXISTS prose_treatments (
  id TEXT PRIMARY KEY,
  graph_id TEXT NOT NULL REFERENCES graphs(id),
  working_set_id TEXT NOT NULL,
  style TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  model TEXT NOT NULL,
  generated_at INTEGER NOT NULL,
  source_fingerprint TEXT NOT NULL,
  source_thought_ids TEXT NOT NULL DEFAULT '[]',
  guidance TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_prose_slot ON prose_treatments(graph_id, working_set_id, style);
`;

function open(): Database.Database {
	const dbPath = process.env.TRELLIS_DB ?? path.resolve('data/trellis.db');
	if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
	const db = new Database(dbPath);
	db.pragma('journal_mode = WAL');
	db.pragma('foreign_keys = ON');
	db.exec(SCHEMA);
	const proseCols = db.pragma('table_info(prose_treatments)') as { name: string }[];
	if (!proseCols.some((c) => c.name === 'source_thought_ids'))
		db.exec("ALTER TABLE prose_treatments ADD COLUMN source_thought_ids TEXT NOT NULL DEFAULT '[]'");
	if (!proseCols.some((c) => c.name === 'guidance'))
		db.exec("ALTER TABLE prose_treatments ADD COLUMN guidance TEXT NOT NULL DEFAULT ''");
	migrateToMultipleWorkingSets(db);
	migrateToMultipleGraphs(db);
	migrateToPredictionEvidence(db);
	migrateToWholeGraphCanvas(db);
	migrateToConsultedColumn(db);
	migrateToResizableNotes(db);
	migrateToProseDraftHistory(db);
	seedIfEmpty(db);
	return db;
}

// Databases created while regeneration replaced a group/style slot carry a
// UNIQUE(graph_id, working_set_id, style) constraint; drafts now accumulate
// per slot, so rebuild the table without it (SQLite cannot drop a constraint).
function migrateToProseDraftHistory(db: Database.Database) {
	const ddl = db
		.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'prose_treatments'")
		.get() as { sql: string } | undefined;
	if (!ddl?.sql.includes('UNIQUE')) return;
	db.transaction(() => {
		db.exec(`
			ALTER TABLE prose_treatments RENAME TO prose_treatments_old;
			CREATE TABLE prose_treatments (
			  id TEXT PRIMARY KEY,
			  graph_id TEXT NOT NULL REFERENCES graphs(id),
			  working_set_id TEXT NOT NULL,
			  style TEXT NOT NULL,
			  title TEXT NOT NULL,
			  body TEXT NOT NULL,
			  model TEXT NOT NULL,
			  generated_at INTEGER NOT NULL,
			  source_fingerprint TEXT NOT NULL,
			  source_thought_ids TEXT NOT NULL DEFAULT '[]',
			  guidance TEXT NOT NULL DEFAULT ''
			);
			INSERT INTO prose_treatments
				(id, graph_id, working_set_id, style, title, body, model, generated_at, source_fingerprint, source_thought_ids, guidance)
			  SELECT id, graph_id, working_set_id, style, title, body, model, generated_at, source_fingerprint, source_thought_ids, guidance
			  FROM prose_treatments_old;
			DROP TABLE prose_treatments_old;
			CREATE INDEX IF NOT EXISTS idx_prose_slot ON prose_treatments(graph_id, working_set_id, style);
		`);
	})();
}

// Databases created before the whole-graph canvas keep coordinates on
// working_set_items (per-set layouts). Move each graph's coordinates into
// canvas_positions — the active set's layout wins where a thought appeared in
// several sets — then rebuild working_set_items as membership only. Thoughts
// never staged in any set get grid slots below everything placed so far.
// Pre-migration undo snapshots are in the old shape; drop them rather than
// restore garbage.
function migrateToWholeGraphCanvas(db: Database.Database) {
	const cols = db.pragma('table_info(working_set_items)') as { name: string }[];
	if (!cols.some((c) => c.name === 'x')) return;
	db.pragma('foreign_keys = OFF');
	db.transaction(() => {
		const insertPos = db.prepare(
			'INSERT INTO canvas_positions (graph_id, thought_id, x, y) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING'
		);
		const graphs = db.prepare('SELECT id FROM graphs').all() as { id: string }[];
		for (const g of graphs) {
			const active = db
				.prepare('SELECT value FROM meta WHERE key = ?')
				.get(`active_working_set:${g.id}`) as { value: string } | undefined;
			const sets = (
				db
					.prepare('SELECT id FROM working_sets WHERE graph_id = ? ORDER BY created_at, rowid')
					.all(g.id) as { id: string }[]
			).map((r) => r.id);
			const ordered = active && sets.includes(active.value)
				? [active.value, ...sets.filter((s) => s !== active.value)]
				: sets;
			for (const wsId of ordered) {
				const items = db
					.prepare('SELECT thought_id, x, y FROM working_set_items WHERE working_set_id = ?')
					.all(wsId) as { thought_id: string; x: number; y: number }[];
				for (const item of items) insertPos.run(g.id, item.thought_id, item.x, item.y);
			}
			const maxY = (
				db
					.prepare('SELECT COALESCE(MAX(y), -140) AS y FROM canvas_positions WHERE graph_id = ?')
					.get(g.id) as { y: number }
			).y;
			const unplaced = db
				.prepare(
					`SELECT id FROM thoughts WHERE graph_id = ?
					 AND id NOT IN (SELECT thought_id FROM canvas_positions WHERE graph_id = ?)
					 ORDER BY created_at, rowid`
				)
				.all(g.id, g.id) as { id: string }[];
			unplaced.forEach((t, i) =>
				insertPos.run(g.id, t.id, 80 + (i % 7) * 320, maxY + 200 + Math.floor(i / 7) * 148)
			);
		}
		db.exec(`
			ALTER TABLE working_set_items RENAME TO working_set_items_old;
			CREATE TABLE working_set_items (
			  working_set_id TEXT NOT NULL REFERENCES working_sets(id),
			  thought_id TEXT NOT NULL REFERENCES thoughts(id),
			  PRIMARY KEY (working_set_id, thought_id)
			);
			INSERT INTO working_set_items (working_set_id, thought_id)
			  SELECT working_set_id, thought_id FROM working_set_items_old;
			DROP TABLE working_set_items_old;
		`);
		db.prepare(
			"DELETE FROM meta WHERE key LIKE 'undo_snapshot%' OR key LIKE 'undo_label%'"
		).run();
	})();
	db.pragma('foreign_keys = ON');
}

// Canvas notes gained user-set dimensions when they became resizable.
function migrateToResizableNotes(db: Database.Database) {
	const cols = db.pragma('table_info(canvas_notes)') as { name: string }[];
	if (!cols.some((c) => c.name === 'w')) db.exec('ALTER TABLE canvas_notes ADD COLUMN w REAL');
	if (!cols.some((c) => c.name === 'h')) db.exec('ALTER TABLE canvas_notes ADD COLUMN h REAL');
}

// Change sets gained a consulted column (thoughts pulled in by graph-wide
// relevance search) when retrieval became disclosed rather than forbidden.
function migrateToConsultedColumn(db: Database.Database) {
	const cols = db.pragma('table_info(change_sets)') as { name: string }[];
	if (!cols.some((c) => c.name === 'consulted'))
		db.exec("ALTER TABLE change_sets ADD COLUMN consulted TEXT NOT NULL DEFAULT '[]'");
}

// Databases created before the prediction/evidence thought types lack the
// confidence and source columns (JSON and plain text; NULL for the four
// original types). Old undo snapshots simply restore rows without them.
function migrateToPredictionEvidence(db: Database.Database) {
	for (const table of ['thoughts', 'thought_revisions']) {
		const cols = db.pragma(`table_info(${table})`) as { name: string }[];
		if (!cols.some((c) => c.name === 'confidence'))
			db.exec(`ALTER TABLE ${table} ADD COLUMN confidence TEXT`);
		if (!cols.some((c) => c.name === 'source'))
			db.exec(`ALTER TABLE ${table} ADD COLUMN source TEXT`);
	}
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
		// On very old databases SCHEMA just created working_sets fresh, with a
		// graph_id column; migrateToMultipleGraphs adds the 'g-main' row after us.
		db.prepare(
			"INSERT INTO working_sets (id, name, graph_id, created_at) VALUES ('ws-main', 'Main', 'g-main', ?)"
		).run(Date.now());
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

// Databases created before multiple graphs keep everything in one namespace.
// Move it all under a default "Main" graph via added graph_id columns, and
// replace the global meta pointers with per-graph keys. Pre-migration undo
// snapshots lack graph_id columns, so drop them rather than restore garbage.
function migrateToMultipleGraphs(db: Database.Database) {
	const cols = db.pragma('table_info(thoughts)') as { name: string }[];
	if (cols.some((c) => c.name === 'graph_id')) return;
	const hasGraphId = (table: string) =>
		(db.pragma(`table_info(${table})`) as { name: string }[]).some((c) => c.name === 'graph_id');
	db.pragma('foreign_keys = OFF');
	db.transaction(() => {
		db.prepare(
			"INSERT INTO graphs (id, name, created_at) VALUES ('g-main', 'Main', ?) ON CONFLICT(id) DO NOTHING"
		).run(Date.now());
		for (const table of ['thoughts', 'relations', 'working_sets', 'change_sets', 'scratch_notes']) {
			// ALTER TABLE cannot add a REFERENCES clause; the tiny local dataset
			// doesn't miss the constraint on migrated tables.
			if (!hasGraphId(table))
				db.exec(`ALTER TABLE ${table} ADD COLUMN graph_id TEXT NOT NULL DEFAULT 'g-main'`);
		}
		db.prepare(
			"UPDATE meta SET key = 'active_working_set:g-main' WHERE key = 'active_working_set'"
		).run();
		db.prepare("UPDATE meta SET key = 'last_visit_at:g-main' WHERE key = 'last_visit_at'").run();
		db.prepare(
			"INSERT INTO meta (key, value) VALUES ('active_graph', 'g-main') ON CONFLICT(key) DO UPDATE SET value = excluded.value"
		).run();
		db.prepare("DELETE FROM meta WHERE key IN ('undo_snapshot', 'undo_label')").run();
	})();
	db.pragma('foreign_keys = ON');
}

/** The current graph's id, self-healing if the meta pointer is stale. */
export function activeGraphId(): string {
	const row = db.prepare("SELECT value FROM meta WHERE key = 'active_graph'").get() as
		| { value: string }
		| undefined;
	if (row && db.prepare('SELECT 1 FROM graphs WHERE id = ?').get(row.value)) return row.value;
	const first = db.prepare('SELECT id FROM graphs ORDER BY created_at, rowid LIMIT 1').get() as {
		id: string;
	};
	db.prepare(
		"INSERT INTO meta (key, value) VALUES ('active_graph', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
	).run(first.id);
	return first.id;
}

/** A graph's active working set (lens), or null for the base state: the whole
 *  graph, no lens. Self-healing if the meta pointer names a deleted set.
 *  Defaults to the active graph. */
export function activeWorkingSetId(graphId: string = activeGraphId()): string | null {
	const key = `active_working_set:${graphId}`;
	const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as
		| { value: string }
		| undefined;
	if (!row) return null;
	if (db.prepare('SELECT 1 FROM working_sets WHERE id = ? AND graph_id = ?').get(row.value, graphId))
		return row.value;
	db.prepare('DELETE FROM meta WHERE key = ?').run(key);
	return null;
}

function seedIfEmpty(db: Database.Database) {
	// A migrated database already has its 'g-main' graph; only a brand-new one
	// (no graphs at all) gets the seed graph.
	const count = db.prepare('SELECT COUNT(*) AS n FROM graphs').get() as { n: number };
	if (count.n > 0) return;

	const insertThought = db.prepare(
		`INSERT INTO thoughts (id, type, status, title, statement, graph_id, created_at, updated_at)
		 VALUES (@id, @type, @status, @title, @statement, 'g-main', @createdAt, @updatedAt)`
	);
	const insertRevision = db.prepare(
		`INSERT INTO thought_revisions
		   (id, thought_id, title, statement, status, actor_type, source_change_set_id, edited_from_proposal, created_at)
		 VALUES (@id, @thoughtId, @title, @statement, @status, @actorType, NULL, 0, @createdAt)`
	);
	const insertRelation = db.prepare(
		`INSERT INTO relations (id, from_thought_id, to_thought_id, type, created_by, source_change_set_id, graph_id, created_at)
		 VALUES (@id, @fromThoughtId, @toThoughtId, @type, @createdBy, NULL, 'g-main', @createdAt)`
	);
	const insertPosition = db.prepare(
		"INSERT INTO canvas_positions (graph_id, thought_id, x, y) VALUES ('g-main', @thoughtId, @x, @y)"
	);

	db.transaction(() => {
		db.prepare("INSERT INTO graphs (id, name, created_at) VALUES ('g-main', 'Main', ?)").run(
			Date.now()
		);
		for (const t of seedThoughts) {
			insertThought.run(t);
			for (const rev of t.revisions) insertRevision.run({ ...rev, thoughtId: t.id });
		}
		for (const r of seedRelations) insertRelation.run(r);
		db.prepare(
			"INSERT INTO meta (key, value) VALUES ('active_graph', 'g-main') ON CONFLICT(key) DO UPDATE SET value = excluded.value"
		).run();
		// No working sets: the base state is the whole graph on the canvas.
		for (const item of seedPositions) insertPosition.run(item);
	})();
}

// Survive Vite dev-server module reloads without leaking connections.
const globalForDb = globalThis as typeof globalThis & { __trellisDb?: Database.Database };

export const db: Database.Database = (globalForDb.__trellisDb ??= open());
