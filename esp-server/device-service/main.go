package main

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/eclipse/paho.mqtt.golang"
	"github.com/inorihimea/esp-platform/shared/config"
	"github.com/inorihimea/esp-platform/shared/database"
	"github.com/inorihimea/esp-platform/shared/logger"
	"github.com/inorihimea/esp-platform/shared/middleware"
	"github.com/inorihimea/esp-platform/shared/models"
)

var mqttClient mqtt.Client

const maxCommandPayloadBytes = 16 * 1024

func main() {
	logger.Init("device-service")
	logger.Info("Starting Device Service...")

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
	db, err := database.Connect(context.Background(), cfg.DatabaseURL)
	if err != nil {
		logger.Fatal("Failed to connect to database", "error", err)
	}
	defer db.Close()

	// 連接 MQTT
	opts := mqtt.NewClientOptions().
		AddBroker(cfg.MQTTBroker).
		SetClientID("device-service").
		SetAutoReconnect(true)

	mqttClient = mqtt.NewClient(opts)
	if token := mqttClient.Connect(); token.Wait() && token.Error() != nil {
		logger.Error("Failed to connect to MQTT", "error", token.Error())
	} else {
		logger.Info("Connected to MQTT broker")
	}
	defer mqttClient.Disconnect(250)

	// 設置路由
	mux := http.NewServeMux()

	// 健康檢查
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		dbHealthy := "healthy"
		if err := db.HealthCheck(context.Background()); err != nil {
			dbHealthy = "unhealthy"
		}

		mqttHealthy := "healthy"
		if !mqttClient.IsConnected() {
			mqttHealthy = "unhealthy"
		}

		status := "healthy"
		if dbHealthy != "healthy" || mqttHealthy != "healthy" {
			status = "degraded"
		}

		resp := models.HealthResponse{
			Status:  status,
			Service: "device-service",
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

	// 設備端點
	mux.HandleFunc("/devices", handleGetDevices(db))
	mux.HandleFunc("/devices/", handleDeviceRoutes(db))

	// 應用中間件
	handler := middleware.RequestID(
		middleware.Logger(
			middleware.Recovery(
				middleware.CORS(cfg.CORSOrigins)(mux),
			),
		),
	)

	// 創建 HTTP 服務器
	srv := &http.Server{
		Addr:         ":8082",
		Handler:      handler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// 啟動服務器
	go func() {
		logger.Info("Device Service listening", "port", 8082)
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

func handleGetDevices(db *database.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		rows, err := db.Query(`
			SELECT id, type, name, ip, last_seen, last_status,
			       (last_seen > NOW() - INTERVAL '2 minutes') as online
			FROM devices
			ORDER BY id
		`)
		if err != nil {
			logger.Error("Failed to query devices", "error", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(models.ErrorResponse{
				Error: "database_error",
			})
			return
		}
		defer rows.Close()

		var devices []models.Device
		for rows.Next() {
			var d models.Device
			var lastStatus []byte
			err := rows.Scan(&d.ID, &d.Type, &d.Name, &d.IP, &d.LastSeen, &lastStatus, &d.Online)
			if err != nil {
				logger.Error("Failed to scan device", "error", err)
				continue
			}
			if len(lastStatus) > 0 {
				json.Unmarshal(lastStatus, &d.LastStatus)
			}
			devices = append(devices, d)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(devices)
	}
}

func handleDeviceRoutes(db *database.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// 解析路徑：/devices/{id}/{action}
		path := strings.TrimPrefix(r.URL.Path, "/devices/")
		parts := strings.Split(path, "/")

		if len(parts) < 1 || parts[0] == "" {
			http.Error(w, "Device ID required", http.StatusBadRequest)
			return
		}

		deviceID := parts[0]

		// 根據路徑長度和最後一部分判斷動作
		if len(parts) == 1 {
			// /devices/{id} - 獲取設備詳情（與 status 相同）
			handleGetDeviceStatus(db, deviceID)(w, r)
		} else if len(parts) == 2 {
			action := parts[1]
			switch action {
			case "status":
				handleGetDeviceStatus(db, deviceID)(w, r)
			case "history":
				handleGetDeviceHistory(db, deviceID)(w, r)
			case "command":
				handleSendCommand(db, deviceID)(w, r)
			default:
				http.Error(w, "Unknown action", http.StatusNotFound)
			}
		} else {
			http.Error(w, "Invalid path", http.StatusBadRequest)
		}
	}
}

func handleGetDeviceStatus(db *database.DB, deviceID string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var d models.Device
		var lastStatus []byte
		err := db.QueryRow(`
			SELECT id, type, name, ip, last_seen, last_status,
			       (last_seen > NOW() - INTERVAL '2 minutes') as online
			FROM devices WHERE id = $1
		`, deviceID).Scan(&d.ID, &d.Type, &d.Name, &d.IP, &d.LastSeen, &lastStatus, &d.Online)

		if err != nil {
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(models.ErrorResponse{
				Error: "device_not_found",
			})
			return
		}

		if len(lastStatus) > 0 {
			json.Unmarshal(lastStatus, &d.LastStatus)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(d)
	}
}

func handleGetDeviceHistory(db *database.DB, deviceID string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := db.Query(`
			SELECT id, device_id, ts, payload
			FROM device_events
			WHERE device_id = $1
			ORDER BY ts DESC
			LIMIT 100
		`, deviceID)

		if err != nil {
			logger.Error("Failed to query history", "error", err)
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(models.ErrorResponse{
				Error: "database_error",
			})
			return
		}
		defer rows.Close()

		var events []models.DeviceEvent
		for rows.Next() {
			var e models.DeviceEvent
			var payload []byte
			if err := rows.Scan(&e.ID, &e.DeviceID, &e.TS, &payload); err != nil {
				continue
			}
			json.Unmarshal(payload, &e.Payload)
			events = append(events, e)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(events)
	}
}

func handleSendCommand(db *database.DB, deviceID string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		payload, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxCommandPayloadBytes))
		if err != nil {
			w.WriteHeader(http.StatusRequestEntityTooLarge)
			json.NewEncoder(w).Encode(models.ErrorResponse{
				Error: "payload_too_large",
			})
			return
		}

		var cmd map[string]interface{}
		if err := json.Unmarshal(payload, &cmd); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(models.ErrorResponse{
				Error: "invalid_json",
			})
			return
		}

		cmdName, ok := cmd["cmd"].(string)
		if !ok || strings.TrimSpace(cmdName) == "" {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(models.ErrorResponse{
				Error:   "invalid_command",
				Message: "cmd must be a non-empty string",
			})
			return
		}

		// 發送 MQTT 命令
		topic := "esp/devices/" + deviceID + "/command"
		if token := mqttClient.Publish(topic, 0, false, payload); token.Wait() && token.Error() != nil {
			logger.Error("Failed to publish command", "error", token.Error())
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(models.ErrorResponse{
				Error: "mqtt_error",
			})
			return
		}

		logger.Info("Command sent", "device_id", deviceID, "cmd", cmdName)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"status": "ok",
		})
	}
}
