import { createHash } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'

// SQL is authored here only. Application values always use bound parameters.
export const APPLICATION_ID = 0x494f5453
export const SCHEMA_VERSION = 2
const migrations = [
  {
    version: 1,
    sql: `
      CREATE TABLE entities (
        kind TEXT NOT NULL CHECK(kind IN ('project','demand','approvedPlan','sprint','task','attempt','evidence','run','approval')),
        id TEXT NOT NULL,
        project_id TEXT,
        project_kind TEXT GENERATED ALWAYS AS (CASE WHEN project_id IS NOT NULL THEN 'project' END) STORED,
        body TEXT NOT NULL CHECK(json_valid(body) AND json_type(body) = 'object'),
        version INTEGER NOT NULL CHECK(version > 0),
        PRIMARY KEY(kind,id),
        FOREIGN KEY(project_kind,project_id) REFERENCES entities(kind,id),
        CHECK(json_extract(body,'$.id') IS id),
        CHECK((kind = 'project' AND project_id IS NULL) OR
          (kind <> 'project' AND project_id IS NOT NULL AND json_extract(body,'$.projectId') IS project_id))
      ) STRICT;
      CREATE INDEX entities_project ON entities(project_id,kind,id);
      CREATE TABLE entity_links (
        source_kind TEXT NOT NULL, source_id TEXT NOT NULL, relation TEXT NOT NULL,
        target_kind TEXT NOT NULL, target_id TEXT NOT NULL,
        PRIMARY KEY(source_kind,source_id,relation),
        FOREIGN KEY(source_kind,source_id) REFERENCES entities(kind,id),
        FOREIGN KEY(target_kind,target_id) REFERENCES entities(kind,id)
      ) STRICT;
      CREATE INDEX entity_links_target ON entity_links(target_kind,target_id);
      PRAGMA user_version = 1;
    `,
  },
  {
    version: 2,
    sql: `
      CREATE TABLE events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        project_id TEXT NOT NULL,
        project_kind TEXT GENERATED ALWAYS AS ('project') STORED,
        run_id TEXT,
        run_kind TEXT GENERATED ALWAYS AS (CASE WHEN run_id IS NOT NULL THEN 'run' END) STORED,
        body TEXT NOT NULL CHECK(json_valid(body) AND json_type(body) = 'object'),
        FOREIGN KEY(project_kind,project_id) REFERENCES entities(kind,id),
        FOREIGN KEY(run_kind,run_id) REFERENCES entities(kind,id),
        CHECK(json_extract(body,'$.id') IS id AND json_extract(body,'$.projectId') IS project_id),
        CHECK(json_extract(body,'$.runId') IS run_id)
      ) STRICT;
      CREATE INDEX events_project_sequence ON events(project_id,sequence);
      CREATE TABLE command_receipts (
        id TEXT PRIMARY KEY, input_hash TEXT NOT NULL,
        result TEXT CHECK(result IS NULL OR json_valid(result))
      ) STRICT;
      PRAGMA user_version = 2;
    `,
  },
] as const

export function migrate(database: DatabaseSync) {
  database.exec('BEGIN IMMEDIATE')
  try {
    const version = Number(database.prepare('PRAGMA user_version').get()!.user_version)
    if (version > SCHEMA_VERSION) throw new Error('Versão do banco mais recente que o Store')
    database.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY, checksum TEXT NOT NULL
    ) STRICT`)
    const applied = database.prepare('SELECT version,checksum FROM schema_migrations ORDER BY version').all()
    if (applied.length !== version) throw new Error('Histórico de migrações inconsistente')
    for (const migration of migrations) {
      const checksum = createHash('sha256').update(migration.sql).digest('hex')
      if (migration.version <= version) {
        if (applied[migration.version - 1]?.checksum !== checksum) throw new Error('Checksum de migração divergente')
      } else {
        database.exec(migration.sql)
        database.prepare('INSERT INTO schema_migrations(version,checksum) VALUES (?,?)').run(migration.version, checksum)
      }
    }
    if (database.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Integridade referencial inválida')
    database.exec('COMMIT')
  } catch (error) {
    database.exec('ROLLBACK')
    throw error
  }
}
