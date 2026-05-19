# ESP 控制平台 - Go 微服務架構

這是將 Node.js ESP 控制平台重構為 Go 微服務架構的實現。

## 架構概述

系統採用 API Gateway + 微服務架構，包含以下服務：

- **API Gateway** (端口 8080): 統一入口點，處理路由、認證和 WebSocket 代理
- **Auth Service** (端口 8081): 用戶認證和 JWT 令牌管理
- **Device Service** (端口 8082): 設備管理、狀態查詢和歷史記錄
- **MQTT Service** (端口 8083): MQTT 消息處理和設備通訊
- **WebSocket Service** (端口 8084): 實時推送設備狀態更新
- **PostgreSQL**: 資料庫
- **Mosquitto**: MQTT Broker

## 快速開始

### 前置要求

- Docker 和 Docker Compose
- Go 1.26.3+ (僅用於本地開發)

### 使用 Docker Compose 啟動

1. 複製環境變數文件：
```bash
cp .env.example .env
```

2. 編輯 `.env` 文件，設置 JWT 密鑰和其他配置

3. 啟動所有服務：
```bash
docker-compose up -d
```

4. 查看日誌：
```bash
docker-compose logs -f
```

5. 檢查服務健康狀態：
```bash
curl http://localhost:8080/health
```

### 本地開發

1. 安裝依賴：
```bash
go mod download
```

2. 啟動 PostgreSQL 和 Mosquitto：
```bash
docker-compose up -d postgres mosquitto
```

3. 設置環境變數：
```bash
export DATABASE_URL="postgresql://esp_user:esp_password@localhost:5432/esp_platform?sslmode=disable"
export JWT_SECRET="your-secret-key"
export MQTT_BROKER="tcp://localhost:1883"
export INTERNAL_TOKEN="internal-secret-token"
```

4. 啟動各個服務（在不同的終端）：
```bash
# 認證服務
PORT=8081 go run ./auth-service

# 設備服務
PORT=8082 MQTT_SERVICE_URL=http://localhost:8083 go run ./device-service

# MQTT 服務
PORT=8083 WEBSOCKET_SERVICE_URL=http://localhost:8084 go run ./mqtt-service

# WebSocket 服務
PORT=8084 go run ./websocket-service

# API Gateway
PORT=8080 AUTH_SERVICE_URL=http://localhost:8081 \
  DEVICE_SERVICE_URL=http://localhost:8082 \
  MQTT_SERVICE_URL=http://localhost:8083 \
  WEBSOCKET_SERVICE_URL=http://localhost:8084 \
  go run ./api-gateway
```

## API 端點

### 認證

- `POST /api/v1/auth/login` - 用戶登入
  ```json
  {
    "username": "admin",
    "password": "changeme"
  }
  ```

### 設備管理

所有設備端點需要 JWT 令牌認證（`Authorization: Bearer <token>`）

- `GET /api/v1/devices` - 獲取所有設備列表
- `GET /api/v1/devices/:id/status` - 獲取設備狀態
- `GET /api/v1/devices/:id/history?limit=50&offset=0` - 獲取設備歷史記錄
- `POST /api/v1/devices/:id/command` - 發送命令到設備
  ```json
  {
    "cmd": "run",
    "speed": 100,
    "direction": "forward"
  }
  ```

### WebSocket

- `WS /ws?token=<jwt_token>` - WebSocket 連接，接收實時設備狀態更新

### 健康檢查

- `GET /health` - 服務健康狀態

## 環境變數

### 通用配置

- `PORT` - 服務監聽端口
- `DATABASE_URL` - PostgreSQL 連接字串
- `JWT_SECRET` - JWT 簽名密鑰
- `INTERNAL_TOKEN` - 內部服務通訊令牌

### API Gateway 特定

- `AUTH_SERVICE_URL` - 認證服務地址
- `DEVICE_SERVICE_URL` - 設備服務地址
- `MQTT_SERVICE_URL` - MQTT 服務地址
- `WEBSOCKET_SERVICE_URL` - WebSocket 服務地址
- `CORS_ORIGINS` - CORS 允許的來源（逗號分隔）
- `ADMIN_USER` - 管理員用戶名
- `ADMIN_PASSWORD` - 管理員密碼

### MQTT Service 特定

- `MQTT_BROKER` - MQTT Broker 地址（例如：tcp://localhost:1883）

## 資料庫 Schema

系統使用以下資料表：

- `users` - 用戶帳號
- `devices` - 設備信息
- `device_events` - 設備事件歷史

資料庫遷移會在 API Gateway 啟動時自動執行。

## MQTT 主題

- `esp/devices/+/status` - 設備狀態更新（訂閱）
- `esp/devices/:id/command` - 設備命令（發布）

## 向後兼容性

此 Go 實現完全兼容原有的 Node.js API，前端無需修改即可使用。

## 測試

```bash
# 運行所有測試
go test ./...

# 運行特定服務的測試
go test ./auth-service/...
```

## 生產部署

1. 設置強密碼和密鑰：
   - 更改 `JWT_SECRET`
   - 更改 `INTERNAL_TOKEN`
   - 更改 `ADMIN_PASSWORD`
   - 更改資料庫密碼

2. 配置 CORS：
   - 設置 `CORS_ORIGINS` 為實際的前端域名

3. 使用 HTTPS：
   - 在 API Gateway 前配置反向代理（如 Nginx）
   - 配置 SSL 證書

4. 監控和日誌：
   - 所有服務輸出結構化 JSON 日誌
   - 可以使用 ELK Stack 或其他日誌聚合工具

5. 擴展：
   - 可以水平擴展任何微服務
   - 使用負載均衡器分發流量

## 故障排除

### 服務無法啟動

檢查環境變數是否正確設置：
```bash
docker-compose config
```

### 資料庫連接失敗

確保 PostgreSQL 已啟動並可訪問：
```bash
docker-compose ps postgres
docker-compose logs postgres
```

### MQTT 連接失敗

檢查 Mosquitto 狀態：
```bash
docker-compose ps mosquitto
docker-compose logs mosquitto
```

### 查看服務日誌

```bash
# 查看所有服務日誌
docker-compose logs -f

# 查看特定服務日誌
docker-compose logs -f api-gateway
docker-compose logs -f mqtt-service
```

## 授權

MIT License
