package jwt

import (
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/inorihimea/esp-platform/shared/models"
)

var (
	ErrInvalidToken = errors.New("invalid token")
	ErrExpiredToken = errors.New("token expired")
	ErrInvalidSignature = errors.New("invalid token signature")
)

// Manager JWT 令牌管理器
type Manager struct {
	secret []byte
}

// NewManager 創建新的 JWT 管理器
func NewManager(secret string) *Manager {
	return &Manager{
		secret: []byte(secret),
	}
}

// Generate 生成 JWT 令牌
func (m *Manager) Generate(userID int, username string, expiresIn time.Duration) (string, error) {
	now := time.Now()
	claims := jwt.MapClaims{
		"sub":      userID,
		"username": username,
		"iat":      now.Unix(),
		"exp":      now.Add(expiresIn).Unix(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(m.secret)
}

// Verify 驗證 JWT 令牌
func (m *Manager) Verify(tokenString string) (*models.TokenClaims, error) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		// 驗證簽名方法
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return m.secret, nil
	})

	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return nil, ErrExpiredToken
		}
		if errors.Is(err, jwt.ErrSignatureInvalid) {
			return nil, ErrInvalidSignature
		}
		return nil, ErrInvalidToken
	}

	if !token.Valid {
		return nil, ErrInvalidToken
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, ErrInvalidToken
	}

	// 提取用戶信息
	userID, ok := claims["sub"].(float64)
	if !ok {
		return nil, ErrInvalidToken
	}

	username, ok := claims["username"].(string)
	if !ok {
		return nil, ErrInvalidToken
	}

	return &models.TokenClaims{
		UserID:   int(userID),
		Username: username,
	}, nil
}
