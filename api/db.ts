import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuidv4 } from 'uuid'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const dataDir = path.join(__dirname, 'data')

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

const dbPath = path.join(dataDir, 'voicecmd.db')
const db = new Database(dbPath)

db.pragma('journal_mode = WAL')

db.exec(`
  CREATE TABLE IF NOT EXISTS recognition_logs (
    id TEXT PRIMARY KEY,
    timestamp DATETIME NOT NULL,
    audio_duration REAL NOT NULL,
    result TEXT NOT NULL,
    confidence REAL NOT NULL,
    action TEXT,
    inference_time REAL NOT NULL,
    model_version TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS model_versions (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    version TEXT NOT NULL,
    url TEXT NOT NULL,
    input_shape TEXT NOT NULL,
    labels TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_active BOOLEAN DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON recognition_logs(timestamp);
  CREATE INDEX IF NOT EXISTS idx_logs_result ON recognition_logs(result);
`)

const activeModel = db.prepare('SELECT id FROM model_versions WHERE is_active = 1').get() as { id: string } | undefined

if (!activeModel) {
  db.prepare(`
    INSERT INTO model_versions (id, name, version, url, input_shape, labels, is_active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `).run(
    uuidv4(),
    'VoiceCmd-Default',
    '1.0.0',
    'https://example.com/models/voicecmd-default-v1.onnx',
    '[1,16000]',
    '["up","down","left","right","stop","go","yes","no"]'
  )
}

export default db
