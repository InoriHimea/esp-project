.PHONY: help build run test clean docker-build docker-up docker-down docker-logs

help: ## 顯示幫助信息
	@echo "可用的命令："
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

build: ## 構建所有服務
	@echo "構建 API Gateway..."
	@go build -o bin/api-gateway ./api-gateway
	@echo "構建 Auth Service..."
	@go build -o bin/auth-service ./auth-service
	@echo "構建 Device Service..."
	@go build -o bin/device-service ./device-service
	@echo "構建 MQTT Service..."
	@go build -o bin/mqtt-service ./mqtt-service
	@echo "構建 WebSocket Service..."
	@go build -o bin/websocket-service ./websocket-service
	@echo "所有服務構建完成！"

test: ## 運行測試
	@go test -v ./...

clean: ## 清理構建產物
	@rm -rf bin/
	@echo "清理完成！"

docker-build: ## 構建 Docker 鏡像
	@docker-compose build

docker-up: ## 啟動所有服務
	@docker-compose up -d
	@echo "所有服務已啟動！"
	@echo "API Gateway: http://localhost:8080"
	@echo "健康檢查: http://localhost:8080/health"

docker-down: ## 停止所有服務
	@docker-compose down

docker-logs: ## 查看服務日誌
	@docker-compose logs -f

docker-restart: ## 重啟所有服務
	@docker-compose restart

docker-clean: ## 清理 Docker 資源
	@docker-compose down -v
	@echo "Docker 資源清理完成！"

deps: ## 下載依賴
	@go mod download
	@go mod tidy

fmt: ## 格式化代碼
	@go fmt ./...

lint: ## 運行 linter
	@golangci-lint run ./...

dev-api-gateway: ## 本地運行 API Gateway
	@PORT=8080 go run ./api-gateway

dev-auth: ## 本地運行 Auth Service
	@PORT=8081 go run ./auth-service

dev-device: ## 本地運行 Device Service
	@PORT=8082 go run ./device-service

dev-mqtt: ## 本地運行 MQTT Service
	@PORT=8083 go run ./mqtt-service

dev-websocket: ## 本地運行 WebSocket Service
	@PORT=8084 go run ./websocket-service
