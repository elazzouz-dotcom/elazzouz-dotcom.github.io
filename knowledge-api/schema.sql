PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS nodes (
  id INTEGER PRIMARY KEY,
  node_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT 'ar',
  domain TEXT NOT NULL DEFAULT 'general',
  trust_score REAL NOT NULL DEFAULT 0.5 CHECK (trust_score >= 0 AND trust_score <= 1),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','review','unavailable')),
  source_type TEXT NOT NULL DEFAULT 'web',
  parent_id INTEGER REFERENCES nodes(id),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_nodes_status ON nodes(status);
CREATE INDEX IF NOT EXISTS idx_nodes_domain ON nodes(domain);
CREATE INDEX IF NOT EXISTS idx_nodes_language ON nodes(language);
CREATE INDEX IF NOT EXISTS idx_nodes_updated_at ON nodes(updated_at);

CREATE VIRTUAL TABLE IF NOT EXISTS nodes_fts USING fts5(
  node_key UNINDEXED,
  title,
  description,
  content,
  url,
  domain,
  tokenize = 'unicode61 remove_diacritics 2'
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_message TEXT NOT NULL,
  assistant_message TEXT NOT NULL DEFAULT '',
  source_ids_json TEXT NOT NULL DEFAULT '[]',
  confidence REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_id, created_at);

CREATE TABLE IF NOT EXISTS node_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT REFERENCES conversations(id),
  node_id INTEGER REFERENCES nodes(id),
  rating INTEGER CHECK (rating IN (-1, 1)),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS nodes_ai AFTER INSERT ON nodes BEGIN
  INSERT INTO nodes_fts(rowid, node_key, title, description, content, url, domain)
  VALUES (new.id, new.node_key, new.title, new.description, new.content, new.url, new.domain);
END;

CREATE TRIGGER IF NOT EXISTS nodes_au AFTER UPDATE ON nodes BEGIN
  INSERT INTO nodes_fts(nodes_fts, rowid, node_key, title, description, content, url, domain)
  VALUES ('delete', old.id, old.node_key, old.title, old.description, old.content, old.url, old.domain);
  INSERT INTO nodes_fts(rowid, node_key, title, description, content, url, domain)
  VALUES (new.id, new.node_key, new.title, new.description, new.content, new.url, new.domain);
END;

CREATE TRIGGER IF NOT EXISTS nodes_ad AFTER DELETE ON nodes BEGIN
  INSERT INTO nodes_fts(nodes_fts, rowid, node_key, title, description, content, url, domain)
  VALUES ('delete', old.id, old.node_key, old.title, old.description, old.content, old.url, old.domain);
END;
