-- ESP 控制平台数据库 Schema
-- db/schema.sql

CREATE TABLE IF NOT EXISTS users (
  id       SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL  -- bcrypt hash
);

CREATE TABLE IF NOT EXISTS devices (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,
  name        TEXT,
  ip          TEXT,
  last_seen   TIMESTAMPTZ,
  last_status JSONB
);

CREATE TABLE IF NOT EXISTS device_events (
  id        BIGSERIAL PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES devices(id),
  ts        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload   JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_device_events_device_ts
  ON device_events (device_id, ts DESC);
