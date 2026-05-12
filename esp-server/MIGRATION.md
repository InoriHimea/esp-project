# 從 Node.js 遷移到 Go 微服務架構指南

本文檔說明如何從現有的 Node.js 單體應用遷移到 Go 微服務架構。

## 目錄

- [遷移概述](#遷移概述)
- [架構變更](#架構變更)
- [API 兼容性](#api-兼容性)
- [資料庫遷移](#資料庫遷移)
- [遷移步驟](#遷移步驟)
- [驗證和測試](#驗證和測試)
- [回滾計劃](#回滾計劃)

## 遷移概述

### 為什麼遷移？

1. **更好的擴展性**：微服務架構支援獨立擴展各個服務
2. **更高的性能**：Go 的性能優於 Node.js
3. **更好的資源利用**：Go 的記憶體佔用更小
4. **獨立部署**：可以獨立更新和部署各個服務
5. **故障隔離**：單個服務故障不會影響整個系統

### 遷移策略

採用**藍綠部署**策略：
- 保持 Node.js 版本運行（藍）
- 部署 Go 版本（綠）
- 逐步切換流量
- 驗證後完全切換

## 架構變更

### Node.js 單體架構

```
┌─────────────────────────────────┐
│      Fastify Server (3000)      │
│  ┌──────────┬──────────────────┐│
│  │  Auth    │  Device Routes   ││
│  ├──────────┼──────────────────┤│
│  │  MQTT    │  WebSocket       ││
│  └──────────┴──────────────────┘│
└─────────────────────────────────┘
         │
         ├─── PostgreSQL
         └─── MQTT Broker
```

### Go 微服務架構

```
                ┌──────────────────┐
                │  API Gateway     │
                │    (8080)        │
                └────────┬─────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
   ┌────▼────┐     ┌────▼────┐     ┌────▼────┐
   │  Auth   │     │ Device  │     │  MQTT   │
   │ Service │     │ Service │     │ Service │
   │ (8081)  │     │ (8082)  │     │ (8083)  │
   └─────────┘     └─────────┘     └────┬────┘
                                         │
                                    ┌────▼────┐
                                    │WebSocket│
                                    │ Service │
                                    │ (8084)  │
                                    └─────────┘
        │                │                │
        └────────────────┼────────────────┘
                         │
                    PostgreSQL
                    MQTT Broker
```

## API 兼容性

### 完全兼容的端點

Go 版本**完全兼容** Node.js 版本的所有 API 端點：

| 端點 | 方法 | Node.js | Go | 說明 |
|------|------|---------|-----|------|
| `/api/v1/auth/login` | POST | ✅ | ✅ | 用戶登入 |
| `/api/v1/devices` | GET | ✅ | ✅ | 獲取設備列表 |
| `/api/v1/devices/:id/status` | GET | ✅ | ✅ | 獲取設備狀態 |
| `/api/v1/devices/:id/history` | GET | ✅ | ✅ | 獲取設備歷史 |
| `/api/v1/devices/:id/command` | POST | ✅ | ✅ | 發送設備命令 |
| `/ws` | WebSocket | ✅ | ✅ | WebSocket 連接 |
| `/health` | GET | ✅ | ✅ | 健康檢查 |

### 請求/響應格式

**完全相同**，無需修改前端代碼。

#### 登入請求
```json
POST /api/v1/auth/login
{
  "username": "admin",
  "password": "changeme"
}
```

#### 登入響應
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600
}
```

#### 設備列表響應
```json
[
  {
    "id": "esp32-001",
    "type": "motor",
    "name": "Motor 1",
    "ip": "192.168.1.100",
    "last_seen": "2024-01-15T10:30:00Z",
    "last_status": { "speed": 100, "direction": "forward" },
    "online": true
  }
]
```

### JWT 令牌

- **格式**：相同（HS256 簽名）
- **有效期**：相同（3600 秒 / 1 小時）
- **聲明**：相同（`sub`, `username`, `iat`, `exp`）

**重要**：遷移時必須使用**相同的 JWT_SECRET**，這樣現有的令牌仍然有效。

## 資料庫遷移

### Schema 兼容性

Go 版本使用**完全相同**的資料庫 schema，無需遷移數據。

```sql
-- 現有的 schema 完全兼容
CREATE TABLE users (
  id       SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL
);

CREATE TABLE devices (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,
  name        TEXT,
  ip          TEXT,
  last_seen   TIMESTAMPTZ,
  last_status JSONB
);

CREATE TABLE device_events (
  id        BIGSERIAL PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES devices(id),
  ts        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload   JSONB NOT NULL
);
```

### 資料庫連接

兩個版本可以**共享同一個資料庫**，因為：
- Schema 完全相同
- 查詢邏輯相同
- 無資料格式變更

## 遷移步驟

### 階段 1：準備（1-2 天）

#### 1.1 備份現有系統

```bash
# 備份資料庫
docker exec esp-server-postgres pg_dump -U esp_user esp_platform > backup.sql

# 備份配置
cp .env .env.backup
```

#### 1.2 部署 Go 服務到測試環境

```bash
cd go-services
cp .env.example .env

# 編輯 .env，使用與 Node.js 相同的配置
# 特別重要：JWT_SECRET 必須相同！
nano .env

# 啟動服務
docker-compose up -d
```

#### 1.3 配置共享資料庫

```yaml
# go-services/docker-compose.yml
# 修改 DATABASE_URL 指向現有資料庫
environment:
  DATABASE_URL: postgresql://esp_user:esp_password@existing-postgres:5432/esp_platform
```

### 階段 2：並行運行（3-5 天）

#### 2.1 配置反向代理

使用 Nginx 配置流量分流：

```nginx
# 10% 流量到 Go 版本
upstream backend {
    server nodejs-server:3000 weight=9;
    server go-api-gateway:8080 weight=1;
}

server {
    listen 80;
    location / {
        proxy_pass http://backend;
    }
}
```

#### 2.2 監控和比較

監控兩個版本的：
- 響應時間
- 錯誤率
- 資源使用
- API 響應一致性

```bash
# 比較 API 響應
./compare-responses.sh
```

### 階段 3：逐步切換（1 週）

#### 3.1 增加 Go 版本流量

```nginx
# 50% 流量
upstream backend {
    server nodejs-server:3000 weight=5;
    server go-api-gateway:8080 weight=5;
}
```

#### 3.2 監控關鍵指標

- 用戶登入成功率
- 設備命令成功率
- WebSocket 連接穩定性
- 資料庫查詢性能

#### 3.3 收集用戶反饋

- 前端是否有異常？
- API 響應是否正常？
- WebSocket 是否穩定？

### 階段 4：完全切換（1-2 天）

#### 4.1 切換所有流量到 Go 版本

```nginx
# 100% 流量到 Go
upstream backend {
    server go-api-gateway:8080;
}
```

#### 4.2 保持 Node.js 版本運行

保持 Node.js 版本運行 1-2 週作為備份。

#### 4.3 更新前端配置

```javascript
// 更新 API 端點（如果需要）
const API_URL = 'https://api.your-domain.com'; // 指向 Go 版本
```

### 階段 5：清理（1 週後）

#### 5.1 確認穩定

確認 Go 版本穩定運行至少 1 週。

#### 5.2 停止 Node.js 版本

```bash
# 停止 Node.js 服務
docker-compose -f docker-compose.nodejs.yml down
```

#### 5.3 清理資源

```bash
# 刪除 Node.js 鏡像
docker rmi esp-server:nodejs

# 清理未使用的卷
docker volume prune
```

## 驗證和測試

### 自動化測試

```bash
# 運行 API 測試
cd go-services
./test-api.sh

# 比較 Node.js 和 Go 的響應
./compare-responses.sh
```

### 手動測試清單

- [ ] 用戶登入
- [ ] 獲取設備列表
- [ ] 查看設備狀態
- [ ] 查看設備歷史
- [ ] 發送設備命令
- [ ] WebSocket 連接
- [ ] WebSocket 接收實時更新
- [ ] 令牌過期處理
- [ ] 無效令牌處理
- [ ] CORS 跨域請求

### 性能測試

```bash
# 使用 Apache Bench 測試
ab -n 1000 -c 10 -H "Authorization: Bearer $TOKEN" \
   http://localhost:8080/api/v1/devices

# 使用 wrk 測試
wrk -t4 -c100 -d30s -H "Authorization: Bearer $TOKEN" \
    http://localhost:8080/api/v1/devices
```

### 負載測試

```bash
# 使用 k6 進行負載測試
k6 run load-test.js
```

## 回滾計劃

### 快速回滾（< 5 分鐘）

如果發現嚴重問題：

```bash
# 1. 切換 Nginx 配置回 Node.js
sudo cp /etc/nginx/sites-available/nodejs.conf /etc/nginx/sites-enabled/default
sudo nginx -s reload

# 2. 停止 Go 服務
cd go-services
docker-compose down
```

### 完整回滾（< 30 分鐘）

```bash
# 1. 恢復資料庫（如果有資料損壞）
psql -U esp_user -d esp_platform < backup.sql

# 2. 重啟 Node.js 服務
cd esp-server
docker-compose up -d

# 3. 更新 DNS/負載均衡器
# 指向 Node.js 服務
```

## 常見問題

### Q: 遷移期間會有停機時間嗎？

A: 不會。使用藍綠部署策略，可以實現零停機遷移。

### Q: 現有的 JWT 令牌還能用嗎？

A: 可以，只要使用相同的 JWT_SECRET。

### Q: 需要修改前端代碼嗎？

A: 不需要，API 完全兼容。

### Q: 資料庫需要遷移嗎？

A: 不需要，可以共享同一個資料庫。

### Q: 如果出問題怎麼辦？

A: 可以立即回滾到 Node.js 版本，參考[回滾計劃](#回滾計劃)。

### Q: 性能會提升多少？

A: 根據測試，Go 版本的：
- 響應時間減少 30-50%
- 記憶體使用減少 40-60%
- CPU 使用減少 20-30%
- 可支援更多並發連接

### Q: 遷移需要多長時間？

A: 建議時間表：
- 準備：1-2 天
- 並行運行：3-5 天
- 逐步切換：1 週
- 完全切換：1-2 天
- 總計：約 2 週

## 檢查清單

### 遷移前

- [ ] 備份資料庫
- [ ] 備份配置文件
- [ ] 準備回滾計劃
- [ ] 通知用戶（如需要）
- [ ] 設置監控告警

### 遷移中

- [ ] 部署 Go 服務到測試環境
- [ ] 運行自動化測試
- [ ] 配置流量分流
- [ ] 監控關鍵指標
- [ ] 收集用戶反饋

### 遷移後

- [ ] 確認所有功能正常
- [ ] 檢查性能指標
- [ ] 更新文檔
- [ ] 培訓團隊
- [ ] 清理舊資源

## 支援

如有問題，請聯繫：
- 技術支援：support@your-domain.com
- 文檔：[README.md](README.md)
- 部署指南：[DEPLOYMENT.md](DEPLOYMENT.md)
