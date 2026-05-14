package main

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/inorihimea/esp-platform/shared/config"
	"github.com/inorihimea/esp-platform/shared/database"
	"github.com/inorihimea/esp-platform/shared/jwt"
	"github.com/inorihimea/esp-platform/shared/logger"
	"github.com/inorihimea/esp-platform/shared/middleware"
	"github.com/inorihimea/esp-platform/shared/models"
	"golang.org/x/crypto/bcrypt"
)

func main() {
	logger.Init("auth-service")
	logger.Info("Starting Auth Service...")

	// 載入配置
	cfg, err := config.LoadConfig()
	if err != nil {
		logger.Fatal("Failed to load config", "error", err)
	}

	// 驗證必需配置
	if err := cfg.ValidateRequired("DATABASE_URL", "JWT_SECRET"); err != nil {
		logger.Fatal("Config validation failed", "error", err)
	}

	// 連接資料庫
	db, err := database.Connect(context.Background(), cfg.DatabaseURL)
	if err != nil {
		logger.Fatal("Failed to connect to database", "error", err)
	}
	defer db.Close()

	// 初始化 JWT
	jwtManager := jwt.NewManager(cfg.JWTSecret)

	// 設置路由
	mux := http.NewServeMux()

	// 健康檢查
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		dbHealthy := "healthy"
		if err := db.HealthCheck(context.Background()); err != nil {
			dbHealthy = "unhealthy"
		}

		status := "healthy"
		if dbHealthy != "healthy" {
			status = "degraded"
		}

		resp := models.HealthResponse{
			Status:  status,
			Service: "auth-service",
			Dependencies: map[string]string{
				"database": dbHealthy,
			},
		}

		w.Header().Set("Content-Type", "application/json")
		if status != "healthy" {
			w.WriteHeader(http.StatusServiceUnavailable)
		}
		json.NewEncoder(w).Encode(resp)
	})

	// 登入端點
	mux.HandleFunc("/login", handleLogin(db, jwtManager))

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
		Addr:         ":8081",
		Handler:      handler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// 啟動服務器
	go func() {
		logger.Info("Auth Service listening", "port", 8081)
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

func handleLogin(db *database.DB, jwtManager *jwt.Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req models.LoginRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(models.ErrorResponse{
				Error:   "invalid_request",
				Message: "Invalid JSON",
			})
			return
		}

		// 驗證輸入
		if req.Username == "" || req.Password == "" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(models.ErrorResponse{
				Error:   "invalid_request",
				Message: "Username and password are required",
			})
			return
		}

		// 查詢用戶
		var user models.User
		err := db.QueryRow(
			"SELECT id, username, password FROM users WHERE username = $1",
			req.Username,
		).Scan(&user.ID, &user.Username, &user.Password)

		if err != nil {
			logger.Warn("Login failed", "username", req.Username, "error", err)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(models.ErrorResponse{
				Error:   "invalid_credentials",
				Message: "Invalid username or password",
			})
			return
		}

		// 驗證密碼
		if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); err != nil {
			logger.Warn("Login failed", "username", req.Username, "error", "invalid password")
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			json.NewEncoder(w).Encode(models.ErrorResponse{
				Error:   "invalid_credentials",
				Message: "Invalid username or password",
			})
			return
		}

		// 生成 JWT
		token, err := jwtManager.Generate(user.ID, user.Username, 24*time.Hour)
		if err != nil {
			logger.Error("Failed to generate token", "error", err)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(models.ErrorResponse{
				Error:   "internal_error",
				Message: "Failed to generate token",
			})
			return
		}

		logger.Info("User logged in", "username", user.Username, "user_id", user.ID)

		// 返回令牌
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(models.LoginResponse{
			Token:     token,
			ExpiresIn: 86400, // 24 小時
		})
	}
}
