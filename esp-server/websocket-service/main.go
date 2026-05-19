package main

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	"github.com/gorilla/websocket"
	"github.com/inorihimea/esp-platform/shared/config"
	"github.com/inorihimea/esp-platform/shared/logger"
	"github.com/inorihimea/esp-platform/shared/middleware"
	"github.com/inorihimea/esp-platform/shared/models"
)

var (
	upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return true // 允許所有來源（生產環境應限制）
		},
	}

	clients   = make(map[*websocket.Conn]bool)
	clientsMu sync.RWMutex

	mqttClient mqtt.Client
)

func main() {
	logger.Init("websocket-service")
	logger.Info("Starting WebSocket Service...")

	// 載入配置
	cfg, err := config.LoadConfig()
	if err != nil {
		logger.Fatal("Failed to load config", "error", err)
	}

	// 驗證必需配置
	if err := cfg.ValidateRequired("MQTT_BROKER"); err != nil {
		logger.Fatal("Config validation failed", "error", err)
	}

	// 連接 MQTT
	opts := mqtt.NewClientOptions().
		AddBroker(cfg.MQTTBroker).
		SetClientID("websocket-service").
		SetAutoReconnect(true).
		SetOnConnectHandler(onMQTTConnect)

	mqttClient = mqtt.NewClient(opts)
	if token := mqttClient.Connect(); token.Wait() && token.Error() != nil {
		logger.Fatal("Failed to connect to MQTT", "error", token.Error())
	}
	defer mqttClient.Disconnect(250)

	logger.Info("Connected to MQTT broker")

	// 設置路由
	mux := http.NewServeMux()

	// 健康檢查
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		mqttHealthy := "healthy"
		if !mqttClient.IsConnected() {
			mqttHealthy = "unhealthy"
		}

		status := "healthy"
		if mqttHealthy != "healthy" {
			status = "degraded"
		}

		resp := models.HealthResponse{
			Status:  status,
			Service: "websocket-service",
			Dependencies: map[string]string{
				"mqtt": mqttHealthy,
			},
		}

		w.Header().Set("Content-Type", "application/json")
		if status != "healthy" {
			w.WriteHeader(http.StatusServiceUnavailable)
		}
		json.NewEncoder(w).Encode(resp)
	})

	// WebSocket 端點
	mux.HandleFunc("/ws", handleWebSocket)

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
		Addr:         ":8084",
		Handler:      handler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// 啟動服務器
	go func() {
		logger.Info("WebSocket Service listening", "port", 8084)
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

	// 關閉所有 WebSocket 連接
	clientsMu.Lock()
	for client := range clients {
		client.Close()
	}
	clientsMu.Unlock()

	if err := srv.Shutdown(ctx); err != nil {
		logger.Fatal("Server forced to shutdown", "error", err)
	}

	logger.Info("Server exited")
}

func onMQTTConnect(client mqtt.Client) {
	logger.Info("MQTT connected, subscribing to topics...")

	// 訂閱所有設備狀態
	if token := client.Subscribe("esp/devices/+/status", 0, handleMQTTMessage); token.Wait() && token.Error() != nil {
		logger.Error("Failed to subscribe", "error", token.Error())
	}

	logger.Info("Subscribed to esp/devices/+/status")
}

func handleMQTTMessage(client mqtt.Client, msg mqtt.Message) {
	topic := msg.Topic()
	payload := msg.Payload()

	logger.Debug("Received MQTT message", "topic", topic)

	// 解析設備 ID
	deviceID := extractDeviceID(topic)
	if deviceID == "" {
		return
	}

	// 解析 payload
	var status map[string]interface{}
	if err := json.Unmarshal(payload, &status); err != nil {
		logger.Error("Failed to parse payload", "error", err)
		return
	}

	// 廣播到所有 WebSocket 客戶端
	broadcast := models.BroadcastMessage{
		Type:     "status", // 修改為 "status" 以匹配前端期望
		DeviceID: deviceID,
		Payload:  status,
	}

	broadcastJSON, _ := json.Marshal(broadcast)
	broadcastToClients(broadcastJSON)
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		logger.Error("Failed to upgrade connection", "error", err)
		return
	}

	// 註冊客戶端
	clientsMu.Lock()
	clients[conn] = true
	clientsMu.Unlock()

	logger.Info("WebSocket client connected", "remote_addr", r.RemoteAddr)

	// 處理客戶端消息
	go func() {
		defer func() {
			clientsMu.Lock()
			delete(clients, conn)
			clientsMu.Unlock()
			conn.Close()
			logger.Info("WebSocket client disconnected", "remote_addr", r.RemoteAddr)
		}()

		for {
			_, message, err := conn.ReadMessage()
			if err != nil {
				if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
					logger.Error("WebSocket error", "error", err)
				}
				break
			}

			logger.Debug("Received WebSocket message", "message", string(message))
			// 可以在這裡處理客戶端發送的消息
		}
	}()

	// 發送心跳
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
			return
		}
	}
}

func broadcastToClients(message []byte) {
	clientsMu.RLock()
	defer clientsMu.RUnlock()

	for client := range clients {
		err := client.WriteMessage(websocket.TextMessage, message)
		if err != nil {
			logger.Error("Failed to send message to client", "error", err)
			client.Close()
			delete(clients, client)
		}
	}

	logger.Debug("Broadcasted message to clients", "count", len(clients))
}

func extractDeviceID(topic string) string {
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
