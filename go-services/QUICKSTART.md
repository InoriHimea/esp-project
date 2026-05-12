# 快速啟動指南

5 分鐘內啟動 ESP 控制平台 Go 微服務！

## 前置要求

- Docker 和 Docker Compose 已安裝
- 端口 8080、5432、1883 可用

## 步驟 1: 克隆並進入目錄

```bash
cd go-services
```

## 步驟 2: 配置環境變數

```bash
cp .env.example .env
```

**重要**：如果要與現有 Node.js 版本共存，請確保 `JWT_SECRET` 相同！

## 步驟 3: 啟動服務

```bash
docker-compose up -d
```

等待所有服務啟動（約 30-60 秒）。

## 步驟 4: 驗證部署

```bash
# 檢查服務狀態
docker-compose ps

# 檢查健康狀態
curl http://localhost:8080/health
```

應該看到類似輸出：
```json
{
  "status": "healthy",
  "service": "api-gateway",
  "dependencies": {
    "auth-service": "healthy",
    "database": "healthy",
    "device-service": "healthy",
    "mqtt-service": "healthy",
    "websocket-service": "healthy"
  }
}
```

## 步驟 5: 測試 API

```bash
# 運行測試腳本
./test-api.sh
```

## 完成！

現在你可以：

1. **訪問 API**：`http://localhost:8080`
2. **登入**：
   ```bash
   curl -X POST http://localhost:8080/api/v1/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username":"admin","password":"changeme"}'
   ```
3. **連接前端**：將前端的 API URL 改為 `http://localhost:8080`

## 常用命令

```bash
# 查看日誌
docker-compose logs -f

# 查看特定服務日誌
docker-compose logs -f api-gateway

# 重啟服務
docker-compose restart

# 停止服務
docker-compose down

# 停止並刪除數據
docker-compose down -v
```

## 預設帳號

- **用戶名**：`admin`
- **密碼**：`changeme`

**生產環境請務必修改！**

## 端口說明

- `8080` - API Gateway（主要入口）
- `8081` - Auth Service
- `8082` - Device Service
- `8083` - MQTT Service
- `8084` - WebSocket Service
- `5432` - PostgreSQL
- `1883` - MQTT Broker

## 故障排除

### 服務無法啟動

```bash
# 查看詳細日誌
docker-compose logs

# 檢查端口佔用
lsof -i :8080
```

### 資料庫連接失敗

```bash
# 檢查 PostgreSQL
docker-compose logs postgres

# 重啟資料庫
docker-compose restart postgres
```

### 清理並重新開始

```bash
# 停止並刪除所有資源
docker-compose down -v

# 重新啟動
docker-compose up -d
```

## 下一步

- 閱讀 [README.md](README.md) 了解詳細功能
- 閱讀 [DEPLOYMENT.md](DEPLOYMENT.md) 了解生產部署
- 閱讀 [MIGRATION.md](MIGRATION.md) 了解從 Node.js 遷移

## 需要幫助？

- 查看日誌：`docker-compose logs -f`
- 檢查健康狀態：`curl http://localhost:8080/health`
- 運行測試：`./test-api.sh`
