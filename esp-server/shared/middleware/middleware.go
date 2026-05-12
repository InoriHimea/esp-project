package middleware

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/inorihimea/esp-platform/shared/jwt"
	"github.com/inorihimea/esp-platform/shared/logger"
	"github.com/inorihimea/esp-platform/shared/models"
)

type contextKey string

const (
	userClaimsKey contextKey = "user_claims"
)

// RequestID 中間件：生成或傳遞請求 ID
func RequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestID := r.Header.Get("X-Request-ID")
		if requestID == "" {
			requestID = uuid.New().String()
		}

		ctx := logger.WithRequestID(r.Context(), requestID)
		w.Header().Set("X-Request-ID", requestID)

		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// Logger 中間件：記錄請求日誌
func Logger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		log := logger.FromContext(r.Context())
		log.Info("request started",
			"method", r.Method,
			"path", r.URL.Path,
			"remote_addr", r.RemoteAddr,
		)

		// 包裝 ResponseWriter 以捕獲狀態碼
		wrapped := &responseWriter{ResponseWriter: w, statusCode: http.StatusOK}
		next.ServeHTTP(wrapped, r)

		duration := time.Since(start)
		log.Info("request completed",
			"method", r.Method,
			"path", r.URL.Path,
			"status", wrapped.statusCode,
			"duration_ms", duration.Milliseconds(),
		)
	})
}

// Recovery 中間件：捕獲 panic
func Recovery(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {
				log := logger.FromContext(r.Context())
				log.Error("panic recovered",
					"error", err,
					"path", r.URL.Path,
				)

				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusInternalServerError)
				w.Write([]byte(`{"error":"internal_server_error","message":"An internal error occurred"}`))
			}
		}()

		next.ServeHTTP(w, r)
	})
}

// CORS 中間件：處理跨域請求
func CORS(origins []string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			
			// 檢查 origin 是否在允許列表中
			allowed := false
			for _, o := range origins {
				if o == "*" || o == origin {
					allowed = true
					break
				}
			}

			if allowed {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-ID")
				w.Header().Set("Access-Control-Allow-Credentials", "true")
			}

			// 處理 preflight 請求
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

// Auth 中間件：驗證 JWT 令牌
func Auth(jwtManager *jwt.Manager) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				respondError(w, http.StatusUnauthorized, "missing_token", "Authorization header is required")
				return
			}

			// 解析 Bearer token
			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) != 2 || parts[0] != "Bearer" {
				respondError(w, http.StatusUnauthorized, "invalid_token_format", "Authorization header must be 'Bearer <token>'")
				return
			}

			tokenString := parts[1]
			claims, err := jwtManager.Verify(tokenString)
			if err != nil {
				switch err {
				case jwt.ErrExpiredToken:
					respondError(w, http.StatusUnauthorized, "token_expired", "Token has expired")
				case jwt.ErrInvalidSignature:
					respondError(w, http.StatusUnauthorized, "invalid_signature", "Token signature is invalid")
				default:
					respondError(w, http.StatusUnauthorized, "invalid_token", "Token is invalid")
				}
				return
			}

			// 將用戶信息添加到 context 和 header
			ctx := context.WithValue(r.Context(), userClaimsKey, claims)
			r.Header.Set("X-User-ID", string(rune(claims.UserID)))
			r.Header.Set("X-Username", claims.Username)

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// GetUserClaims 從 context 獲取用戶聲明
func GetUserClaims(ctx context.Context) (*models.TokenClaims, bool) {
	claims, ok := ctx.Value(userClaimsKey).(*models.TokenClaims)
	return claims, ok
}

// responseWriter 包裝 http.ResponseWriter 以捕獲狀態碼
type responseWriter struct {
	http.ResponseWriter
	statusCode int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}

func respondError(w http.ResponseWriter, status int, error, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	resp := models.ErrorResponse{
		Error:   error,
		Message: message,
	}
	// 簡單的 JSON 序列化
	w.Write([]byte(`{"error":"` + resp.Error + `","message":"` + resp.Message + `"}`))
}
