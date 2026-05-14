package main

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	"github.com/inorihimea/esp-platform/shared/config"
	"github.com/inorihimea/esp-platform/shared/database"
	"github.com/inorihimea/esp-platform/shared/logger"
	"github.com/inorihimea/esp-platform/shared/middleware"
	"github.com/inorihimea/esp-platform/shared/models"
)

var db *database.DB

func main() {
	logger.Init("mqtt-service")
	logger.Info("Starting MQTT Service...")

	// 載入配置
	cfg, err := config.LoadConfig()
	if err != nil {
		logger.Fatal("Failed to load config", "error", err)
	}

	// 驗證必需配置
	if err := cfg.ValidateRequired("DATABASE_URL", "MQTT_BROKER"); err != nil {
		logger.Fatal("Config validation failed", "error", err)
	}

	// 連接資料庫
	db, err = database.Connect(context.Background(), cfg.DatabaseURL)
	if err != nil {
		logger.Fatal("Failed to connect to database", "error", err)
	}
	defer db.Close()

	// 連接 MQTT
	opts := mqtt.NewClientOptions().
		AddBroker(cfg.MQTTBroker).
		SetClientID("mqtt-service").
		SetAutoReconnect(true).
		SetOnConnectHandler(onConnect)

	client := mqtt.NewClient(opts)
	if token := client.Connect(); token.Wait() && token.Error() != nil {
		logger.Fatal("Failed to connect to MQTT", "error", token.Error())
	}
	defer client.Disconnect(250)

	logger.Info("Connected to MQTT broker")

	// 設置 HTTP 服務器（僅用於健康檢查）
	mux := http.NewServeMux()

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		dbHealthy := "healthy"
		if err := db.HealthCheck(context.Background()); err != nil {
			dbHealthy = "unhealthy"
		}

		mqttHealthy := "healthy"
		if !client.IsConnected() {
			mqttHealthy = "unhealthy"
		}

		status := "healthy"
		if dbHealthy != "healthy" || mqttHealthy != "healthy" {
			status = "degraded"
		}

		resp := models.HealthResponse{
			Status:  status,
			Service: "mqtt-service",
			Dependencies: map[string]string{
				"database": dbHealthy,
				"mqtt":     mqttHealthy,
			},
		}

		w.Header().Set("Content-Type", "application/json")
		if status != "healthy" {
			w.WriteHeader(http.StatusServiceUnavailable)
		}
		json.NewEncoder(w).Encode(resp)
	})

	handler := middleware.RequestID(
		middleware.Logger(
			middleware.Recovery(
				middleware.CORS(cfg.CORSOrigins)(mux),
			),
		),
	)

	srv := &http.Server{
		Addr:         ":8083",
		Handler:      handler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		logger.Info("MQTT Service listening", "port", 8083)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("Server failed", "error", err)
		}
	}()

	// 優雅關閉
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	logger.Info("Shutting down server...")
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		logger.Fatal("Server forced to shutdown", "error", err)
	}

	logger.Info("Server exited")
}

func onConnect(client mqtt.Client) {
	logger.Info("MQTT connected, subscribing to topics...")

	// 訂閱設備狀態主題
	if token := client.Subscribe("esp/devices/+/status", 0, handleDeviceStatus); token.Wait() && token.Error() != nil {
		logger.Error("Failed to subscribe to status topic", "error", token.Error())
	}

	logger.Info("Subscribed to esp/devices/+/status")
}

func handleDeviceStatus(client mqtt.Client, msg mqtt.Message) {
	topic := msg.Topic()
	payload := msg.Payload()

	logger.Debug("Received MQTT message", "topic", topic, "payload", string(payload))

	// 解析設備 ID（從 esp/devices/{id}/status 提取）
	deviceID := extractDeviceIDFromTopic(topic)
	if deviceID == "" {
		logger.Warn("Invalid topic format", "topic", topic)
		return
	}

	// 解析 payload
	var status map[string]interface{}
	if err := json.Unmarshal(payload, &status); err != nil {
		logger.Error("Failed to parse payload", "error", err, "payload", string(payload))
		return
	}

	// 更新設備狀態
	statusJSON, _ := json.Marshal(status)
	_, err := db.Exec(`
		INSERT INTO devices (id, type, last_seen, last_status)
		VALUES ($1, $2, NOW(), $3)
		ON CONFLICT (id) DO UPDATE SET
			last_seen = NOW(),
			last_status = $3
	`, deviceID, status["device_type"], statusJSON)

	if err != nil {
		logger.Error("Failed to update device status", "error", err, "device_id", deviceID)
		return
	}

	// 記錄事件
	_, err = db.Exec(`
		INSERT INTO device_events (device_id, ts, payload)
		VALUES ($1, NOW(), $2)
	`, deviceID, statusJSON)

	if err != nil {
		logger.Error("Failed to insert device event", "error", err, "device_id", deviceID)
	}

	logger.Info("Device status updated", "device_id", deviceID)
}

func extractDeviceIDFromTopic(topic string) string {
	// esp/devices/{id}/status
	const prefix = "esp/devices/"
	const suffix = "/status"

	if len(topic) < len(prefix)+len(suffix) {
		return ""
	}

	start := len(prefix)
	end := len(topic) - len(suffix)

	if end <= start {
		return ""
	}

	return topic[start:end]
}
