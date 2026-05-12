package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

// Config 應用配置
type Config struct {
	Port              int
	DatabaseURL       string
	JWTSecret         string
	MQTTBroker        string
	AuthServiceURL    string
	DeviceServiceURL  string
	MQTTServiceURL    string
	WebSocketServiceURL string
	InternalToken     string
	CORSOrigins       []string
}

// LoadConfig 從環境變數載入配置
func LoadConfig() (*Config, error) {
	cfg := &Config{
		Port:                getEnvInt("PORT", 8080),
		DatabaseURL:         os.Getenv("DATABASE_URL"),
		JWTSecret:           os.Getenv("JWT_SECRET"),
		MQTTBroker:          os.Getenv("MQTT_BROKER"),
		AuthServiceURL:      getEnv("AUTH_SERVICE_URL", "http://auth-service:8081"),
		DeviceServiceURL:    getEnv("DEVICE_SERVICE_URL", "http://device-service:8082"),
		MQTTServiceURL:      getEnv("MQTT_SERVICE_URL", "http://mqtt-service:8083"),
		WebSocketServiceURL: getEnv("WEBSOCKET_SERVICE_URL", "http://websocket-service:8084"),
		InternalToken:       getEnv("INTERNAL_TOKEN", "internal-secret-token"),
		CORSOrigins:         strings.Split(getEnv("CORS_ORIGINS", "http://localhost:5173"), ","),
	}

	return cfg, nil
}

// ValidateRequired 驗證必需的配置項
func (c *Config) ValidateRequired(fields ...string) error {
	for _, field := range fields {
		switch field {
		case "DATABASE_URL":
			if c.DatabaseURL == "" {
				return fmt.Errorf("DATABASE_URL is required")
			}
		case "JWT_SECRET":
			if c.JWTSecret == "" {
				return fmt.Errorf("JWT_SECRET is required")
			}
		case "MQTT_BROKER":
			if c.MQTTBroker == "" {
				return fmt.Errorf("MQTT_BROKER is required")
			}
		}
	}
	return nil
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intVal, err := strconv.Atoi(value); err == nil {
			return intVal
		}
	}
	return defaultValue
}
