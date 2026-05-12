package models

import "time"

// User 代表系統用戶
type User struct {
	ID       int    `json:"id"`
	Username string `json:"username"`
	Password string `json:"-"` // 不在 JSON 中序列化
}

// Device 代表 ESP32 設備
type Device struct {
	ID         string                 `json:"id"`
	Type       string                 `json:"type"`
	Name       *string                `json:"name"`
	IP         *string                `json:"ip"`
	LastSeen   *time.Time             `json:"last_seen"`
	LastStatus map[string]interface{} `json:"last_status"`
	Online     bool                   `json:"online"`
}

// DeviceEvent 代表設備事件記錄
type DeviceEvent struct {
	ID       int64                  `json:"id"`
	DeviceID string                 `json:"device_id"`
	TS       time.Time              `json:"ts"`
	Payload  map[string]interface{} `json:"payload"`
}

// LoginRequest 登入請求
type LoginRequest struct {
	Username string `json:"username" validate:"required"`
	Password string `json:"password" validate:"required"`
}

// LoginResponse 登入響應
type LoginResponse struct {
	Token     string `json:"token"`
	ExpiresIn int    `json:"expiresIn"`
}

// CommandRequest 設備命令請求
type CommandRequest struct {
	Cmd       string  `json:"cmd" validate:"required,oneof=run stop brake coast"`
	Speed     *int    `json:"speed,omitempty"`
	Direction *string `json:"direction,omitempty"`
	RampMs    *int    `json:"ramp_ms,omitempty"`
}

// ErrorResponse 錯誤響應
type ErrorResponse struct {
	Error   string `json:"error"`
	Message string `json:"message,omitempty"`
}

// HealthResponse 健康檢查響應
type HealthResponse struct {
	Status       string            `json:"status"` // healthy, degraded, unhealthy
	Service      string            `json:"service"`
	Dependencies map[string]string `json:"dependencies,omitempty"`
}

// BroadcastMessage WebSocket 廣播消息
type BroadcastMessage struct {
	Type     string                 `json:"type"`
	DeviceID string                 `json:"device_id"`
	Payload  map[string]interface{} `json:"payload"`
}

// TokenClaims JWT 令牌聲明
type TokenClaims struct {
	UserID   int    `json:"sub"`
	Username string `json:"username"`
}
