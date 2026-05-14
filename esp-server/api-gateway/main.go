package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gorilla/websocket"
	"github.com/inorihimea/esp-platform/shared/config"
	"github.com/inorihimea/esp-platform/shared/jwt"
	"github.com/inorihimea/esp-platform/shared/logger"
	"github.com/inorihimea/esp-platform/shared/middleware"
	"github.com/inorihimea/esp-platform/shared/models"
)

var (
	authServiceURL      = "http://auth-service:8081"
	deviceServiceURL    = "http://device-service:8082"
	websocketServiceURL = "http://websocket-service:8084"

	upgrader = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return true
		},
	}
)

func main() {
	logger.Init("api-gateway")
	logger.Info("Starting API Gateway...")

	// 載入配置
	cfg, err := config.LoadConfig()
	if err != nil {
		logger.Fatal("Failed to load config", "error", err)
	}

	// 驗證必需配置
	if err := cfg.ValidateRequired("JWT_SECRET"); err != nil {
		logger.Fatal("Config validation failed", "error", err)
	}

	// 初始化 JWT
	jwtManager := jwt.NewManager(cfg.JWTSecret)

	// 從配置覆蓋服務 URL
	authServiceURL = cfg.AuthServiceURL
	deviceServiceURL = cfg.DeviceServiceURL
	websocketServiceURL = cfg.WebSocketServiceURL

	// 設置路由
	mux := http.NewServeMux()

	// 健康檢查
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		resp := models.HealthResponse{
			Status:  "healthy",
			Service: "api-gateway",
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	})

	// 認證端點（不需要認證）
	mux.HandleFunc("/api/v1/auth/login", proxyToService(authServiceURL, "/login", false, jwtManager))

	// 設備端點（需要認證）
	mux.HandleFunc("/api/v1/devices", proxyToService(deviceServiceURL, "/devices", true, jwtManager))
	mux.HandleFunc("/api/v1/devices/", proxyToService(deviceServiceURL, "/devices/", true, jwtManager))

	// WebSocket 端點（需要認證）
	mux.HandleFunc("/ws", handleWebSocket(jwtManager))

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
		Addr:         ":8080",
		Handler:      handler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// 啟動服務器
	go func() {
		logger.Info("API Gateway listening", "port", 8080)
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

func proxyToService(serviceURL, path string, requireAuth bool, jwtManager *jwt.Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// 認證檢查
		if requireAuth {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				json.NewEncoder(w).Encode(models.ErrorResponse{
					Error:   "unauthorized",
					Message: "Authorization header required",
				})
				return
			}

			// 驗證 Bearer token
			parts := strings.Split(authHeader, " ")
			if len(parts) != 2 || parts[0] != "Bearer" {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				json.NewEncoder(w).Encode(models.ErrorResponse{
					Error:   "unauthorized",
					Message: "Invalid authorization format",
				})
				return
			}

			token := parts[1]
			if _, err := jwtManager.Verify(token); err != nil {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				json.NewEncoder(w).Encode(models.ErrorResponse{
					Error:   "unauthorized",
					Message: "Invalid or expired token",
				})
				return
			}
		}

		// 構建目標 URL
		targetURL, err := url.Parse(serviceURL)
		if err != nil {
			logger.Error("Failed to parse service URL", "error", err)
			w.WriteHeader(http.StatusInternalServerError)
			return
		}

		// 創建反向代理
		proxy := httputil.NewSingleHostReverseProxy(targetURL)

		// 修改請求
		originalDirector := proxy.Director
		proxy.Director = func(req *http.Request) {
			originalDirector(req)
			req.URL.Path = strings.TrimPrefix(r.URL.Path, "/api/v1")
			req.Host = targetURL.Host
		}

		// 錯誤處理
		proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
			logger.Error("Proxy error", "error", err, "service", serviceURL)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadGateway)
			json.NewEncoder(w).Encode(models.ErrorResponse{
				Error:   "service_unavailable",
				Message: "Backend service unavailable",
			})
		}

		proxy.ServeHTTP(w, r)
	}
}

func handleWebSocket(jwtManager *jwt.Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// 從查詢參數獲取 token
		token := r.URL.Query().Get("token")
		if token == "" {
			http.Error(w, "Token required", http.StatusUnauthorized)
			return
		}

		// 驗證 token
		if _, err := jwtManager.Verify(token); err != nil {
			http.Error(w, "Invalid token", http.StatusUnauthorized)
			return
		}

	// 連接到 WebSocket 服務
	wsURL := strings.Replace(websocketServiceURL, "http://", "ws://", 1) + "/ws"
	backendConn, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		logger.Error("Failed to connect to WebSocket service", "error", err)
		http.Error(w, "Service unavailable", http.StatusBadGateway)
		return
	}
	defer backendConn.Close()

	// 升級客戶端連接
	clientConn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		logger.Error("Failed to upgrade client connection", "error", err)
		return
	}
	defer clientConn.Close()

	logger.Info("WebSocket connection established", "remote_addr", r.RemoteAddr)

	// 雙向代理
	errChan := make(chan error, 2)

	// 客戶端 -> 後端
	go func() {
		for {
			messageType, message, err := clientConn.ReadMessage()
			if err != nil {
				errChan <- err
				return
			}
			if err := backendConn.WriteMessage(messageType, message); err != nil {
				errChan <- err
				return
			}
		}
	}()

	// 後端 -> 客戶端
	go func() {
		for {
			messageType, message, err := backendConn.ReadMessage()
			if err != nil {
				errChan <- err
				return
			}
			if err := clientConn.WriteMessage(messageType, message); err != nil {
				errChan <- err
				return
			}
		}
	}()

	// 等待錯誤
	err = <-errChan
	if err != nil && !websocket.IsCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
		logger.Error("WebSocket proxy error", "error", err)
	}

	logger.Info("WebSocket connection closed", "remote_addr", r.RemoteAddr)
	}
}
