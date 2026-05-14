package logger

import (
	"context"
	"log/slog"
	"os"
)

type contextKey string

const requestIDKey contextKey = "request_id"

var log *slog.Logger

// Init 初始化結構化日誌記錄器
func Init(serviceName string) {
	handler := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	})
	log = slog.New(handler).With("service", serviceName)
}

// WithRequestID 將請求 ID 添加到 context
func WithRequestID(ctx context.Context, requestID string) context.Context {
	return context.WithValue(ctx, requestIDKey, requestID)
}

// FromContext 從 context 獲取帶有請求 ID 的 logger
func FromContext(ctx context.Context) *slog.Logger {
	if requestID, ok := ctx.Value(requestIDKey).(string); ok {
		return log.With("request_id", requestID)
	}
	return log
}

// Info 記錄 info 級別日誌
func Info(msg string, args ...any) {
	log.Info(msg, args...)
}

// Error 記錄 error 級別日誌
func Error(msg string, args ...any) {
	log.Error(msg, args...)
}

// Warn 記錄 warn 級別日誌
func Warn(msg string, args ...any) {
	log.Warn(msg, args...)
}

// Debug 記錄 debug 級別日誌
func Debug(msg string, args ...any) {
	log.Debug(msg, args...)
}

// Fatal 記錄 fatal 級別日誌並退出程序
func Fatal(msg string, args ...any) {
	log.Error(msg, args...)
	os.Exit(1)
}

// Get 獲取全局 logger
func Get() *slog.Logger {
	return log
}
