# 專案結構說明

```
go-services/
├── api-gateway/                    # API Gateway 服務
│   └── main.go                     # 主程序：路由、認證、代理
│
├── auth-service/                   # 認證服務
│   └── main.go                     # 主程序：登入、令牌生成
│
├── device-service/                 # 設備管理服務
│   └── main.go                     # 主程序：設備查詢、命令發送
│
├── mqtt-service/                   # MQTT 處理服務
│   └── main.go                     # 主程序：MQTT 訂閱、消息處理
│
├── websocket-service/              # WebSocket 服務
│   └── main.go                     # 主程序：WebSocket 連接、廣播
│
├── shared/                         # 共享套件
│   ├── config/                     # 配置管理
│   │   └── config.go               # 環境變數載入和驗證
│   ├── database/                   # 資料庫
│   │   └── database.go             # PostgreSQL 連接、遷移
│   ├── jwt/                        # JWT 管理
│   │   └── jwt.go                  # 令牌生成和驗證
│   ├── logger/                     # 日誌記錄
│   │   └── logger.go               # 結構化日誌
│   ├── middleware/                 # HTTP 中間件
│   │   └── middleware.go           # 認證、日誌、CORS、Recovery
│   └── models/                     # 數據模型
│       └── models.go               # 共享數據結構
│
├── Dockerfile.api-gateway          # API Gateway Docker 鏡像
├── Dockerfile.auth-service         # Auth Service Docker 鏡像
├── Dockerfile.device-service       # Device Service Docker 鏡像
├── Dockerfile.mqtt-service         # MQTT Service Docker 鏡像
├── Dockerfile.websocket-service    # WebSocket Service Docker 鏡像
│
├── docker-compose.yml              # Docker Compose 編排配置
├── mosquitto.conf                  # MQTT Broker 配置
│
├── go.mod                          # Go 模組定義
├── go.sum                          # Go 依賴校驗和
│
├── Makefile                        # 常用命令快捷方式
│
├── test-api.sh                     # API 自動化測試腳本
├── compare-responses.sh            # Node.js vs Go 響應比較
├── load-test.js                    # K6 負載測試腳本
│
├── .env.example                    # 環境變數模板
├── .gitignore                      # Git 忽略規則
│
├── README.md                       # 專案介紹和使用說明
├── QUICKSTART.md                   # 快速啟動指南
├── DEPLOYMENT.md                   # 生產環境部署指南
├── MIGRATION.md                    # 從 Node.js 遷移指南
├── PROJECT_SUMMARY.md              # 專案總結
└── STRUCTURE.md                    # 專案結構說明（本文件）
```

## 目錄說明

### 服務目錄

每個服務都是一個獨立的 Go 程序，包含：
- `main.go`: 主程序入口
- 服務特定的業務邏輯
- HTTP 路由處理
- 健康檢查端點

### shared/ 共享套件

所有服務共享的代碼，包括：

#### config/
- 環境變數管理
- 配置驗證
- 預設值處理

#### database/
- PostgreSQL 連接管理
- 連接池配置
- 資料庫遷移
- 健康檢查

#### jwt/
- JWT 令牌生成
- 令牌驗證
- 錯誤處理

#### logger/
- 結構化日誌（JSON 格式）
- 請求 ID 追蹤
- 日誌級別管理

#### middleware/
- 請求 ID 生成
- 日誌記錄
- Panic 恢復
- CORS 處理
- JWT 認證

#### models/
- 用戶模型
- 設備模型
- 事件模型
- 請求/響應模型

### Docker 文件

每個服務都有獨立的 Dockerfile：
- 多階段構建
- 最小化鏡像大小
- 非 root 用戶運行
- 安全最佳實踐

### 配置文件

#### docker-compose.yml
定義所有服務的編排：
- 服務依賴關係
- 環境變數
- 端口映射
- 網絡配置
- 健康檢查
- 資源限制

#### mosquitto.conf
MQTT Broker 配置：
- 監聽端口
- WebSocket 支援
- 持久化設置
- 日誌配置

### 工具和腳本

#### Makefile
常用命令快捷方式：
- `make build`: 構建所有服務
- `make docker-up`: 啟動 Docker 服務
- `make docker-down`: 停止 Docker 服務
- `make test`: 運行測試
- `make clean`: 清理構建產物

#### test-api.sh
自動化 API 測試：
- 健康檢查測試
- 登入測試
- 設備 API 測試
- 認證測試
- 錯誤處理測試

#### compare-responses.sh
比較 Node.js 和 Go 版本的 API 響應：
- 響應格式比較
- JSON 結構驗證
- 兼容性檢查

#### load-test.js
K6 負載測試腳本：
- 並發用戶模擬
- 性能指標收集
- 閾值驗證
- 錯誤率統計

### 文檔

#### README.md
- 專案介紹
- 架構概述
- API 端點說明
- 環境變數配置
- 使用指南

#### QUICKSTART.md
- 5 分鐘快速啟動
- 基本驗證步驟
- 常用命令
- 故障排除

#### DEPLOYMENT.md
- 生產環境部署
- 安全配置
- 網絡配置
- 監控和日誌
- 擴展部署
- 故障排除

#### MIGRATION.md
- 從 Node.js 遷移
- 架構變更說明
- API 兼容性
- 遷移步驟
- 驗證和測試
- 回滾計劃

#### PROJECT_SUMMARY.md
- 專案總結
- 完成的工作
- 技術棧
- 架構特點
- 性能優化
- 未來改進

## 代碼組織原則

### 1. 關注點分離
- 每個服務專注於單一職責
- 共享代碼提取到 shared 套件
- 業務邏輯與基礎設施分離

### 2. 依賴管理
- 使用 Go modules
- 明確的依賴版本
- 最小化外部依賴

### 3. 配置管理
- 環境變數優先
- 合理的預設值
- 配置驗證

### 4. 錯誤處理
- 明確的錯誤類型
- 結構化錯誤響應
- 錯誤日誌記錄

### 5. 測試
- 單元測試
- 集成測試
- 負載測試
- API 兼容性測試

## 開發工作流

### 1. 本地開發
```bash
# 啟動依賴服務
docker-compose up -d postgres mosquitto

# 運行特定服務
make dev-api-gateway
```

### 2. 構建
```bash
# 構建所有服務
make build

# 構建 Docker 鏡像
make docker-build
```

### 3. 測試
```bash
# 運行測試
make test

# API 測試
./test-api.sh

# 負載測試
k6 run load-test.js
```

### 4. 部署
```bash
# 啟動所有服務
make docker-up

# 查看日誌
make docker-logs

# 停止服務
make docker-down
```

## 擴展指南

### 添加新服務

1. 創建服務目錄：
```bash
mkdir new-service
```

2. 創建 main.go：
```go
package main

import (
    "github.com/inorihimea/esp-platform/shared/config"
    "github.com/inorihimea/esp-platform/shared/logger"
)

func main() {
    logger.Init("new-service")
    // 服務邏輯
}
```

3. 創建 Dockerfile：
```dockerfile
FROM golang:1.22-alpine AS builder
# 構建邏輯
```

4. 更新 docker-compose.yml：
```yaml
new-service:
  build:
    context: .
    dockerfile: Dockerfile.new-service
  # 配置
```

### 添加新端點

在相應的服務中添加路由處理器：

```go
mux.HandleFunc("/api/v1/new-endpoint", handleNewEndpoint)
```

### 添加新中間件

在 shared/middleware/ 中添加：

```go
func NewMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        // 中間件邏輯
        next.ServeHTTP(w, r)
    })
}
```

## 維護指南

### 日誌查看
```bash
# 所有服務
docker-compose logs -f

# 特定服務
docker-compose logs -f api-gateway
```

### 健康檢查
```bash
# API Gateway
curl http://localhost:8080/health

# 各個服務
curl http://localhost:8081/health  # Auth
curl http://localhost:8082/health  # Device
curl http://localhost:8083/health  # MQTT
curl http://localhost:8084/health  # WebSocket
```

### 資料庫管理
```bash
# 連接資料庫
docker exec -it esp-postgres psql -U esp_user -d esp_platform

# 備份
docker exec esp-postgres pg_dump -U esp_user esp_platform > backup.sql

# 恢復
docker exec -i esp-postgres psql -U esp_user -d esp_platform < backup.sql
```

### 更新依賴
```bash
# 更新所有依賴
go get -u ./...
go mod tidy

# 更新特定依賴
go get -u github.com/gorilla/websocket
```

## 最佳實踐

1. **始終使用環境變數進行配置**
2. **記錄所有錯誤和重要事件**
3. **實現健康檢查端點**
4. **使用結構化日誌**
5. **設置合理的超時時間**
6. **實現優雅關閉**
7. **使用連接池**
8. **參數化 SQL 查詢**
9. **驗證輸入數據**
10. **編寫測試**

## 參考資源

- [Go 官方文檔](https://go.dev/doc/)
- [Docker 文檔](https://docs.docker.com/)
- [PostgreSQL 文檔](https://www.postgresql.org/docs/)
- [MQTT 協議](https://mqtt.org/)
- [微服務模式](https://microservices.io/)
