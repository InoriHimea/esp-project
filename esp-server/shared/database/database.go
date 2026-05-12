package database

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	_ "github.com/lib/pq"
)

// DB 資料庫連接包裝器
type DB struct {
	*sql.DB
}

// Connect 連接到 PostgreSQL 資料庫
func Connect(ctx context.Context, databaseURL string) (*DB, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	db, err := sql.Open("postgres", databaseURL)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// 配置連接池
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(2)
	db.SetConnMaxLifetime(time.Hour)

	// 測試連接
	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	return &DB{db}, nil
}

// Close 關閉資料庫連接
func (db *DB) Close() error {
	return db.DB.Close()
}

// HealthCheck 檢查資料庫健康狀態
func (db *DB) HealthCheck(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	return db.PingContext(ctx)
}

// RunMigrations 執行資料庫遷移
func (db *DB) RunMigrations(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	schema := `
	CREATE TABLE IF NOT EXISTS users (
		id       SERIAL PRIMARY KEY,
		username TEXT UNIQUE NOT NULL,
		password TEXT NOT NULL
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
	`

	_, err := db.ExecContext(ctx, schema)
	if err != nil {
		return fmt.Errorf("failed to run migrations: %w", err)
	}

	return nil
}
