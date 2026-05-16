# Docker 部署配置（Unraid macvlan）

此目錄包含用於 Unraid 環境的 Docker Compose 配置，使用 macvlan 網絡為每個服務分配獨立的 IP 地址。

## 📋 概述

與標準 Docker 部署（`esp-server/docker-compose.yml`）不同，此配置：

- ✅ 使用 macvlan 網絡為每個服務分配獨立 IP
- ✅ 適用於 Unraid 或需要服務直接暴露在局域網的環境
- ✅ 完整部署所有微服務和前端 UI
- ✅ 支持自定義網絡拓撲

## 🚀 快速開始

### 1. 配置環境變數

```bash
cp .env.example .env
```

編輯 `.env` 文件，配置以下內容：

```env
# macvlan 網絡名稱（通常是 br0）
MACVLAN_NETWORK=br0

# 為每個服務分配可用的 IP 地址
POSTGRES_IP=192.168.1.201
MOSQUITTO_IP=192.168.1.202
AUTH_SERVICE_IP=192.168.1.203
DEVICE_SERVICE_IP=192.168.1.204
MQTT_SERVICE_IP=192.168.1.205
WEBSOCKET_SERVICE_IP=192.168.1.206
API_GATEWAY_IP=192.168.1.207
ESP_UI_IP=192.168.1.208

# 資料庫配置
POSTGRES_USER=esp_user
POSTGRES_PASSWORD=your-secure-password-here
POSTGRES_DB=esp_platform

# 安全配置
JWT_SECRET=your-jwt-secret-key-change-in-production
INTERNAL_TOKEN=your-internal-token-change-in-production

# 管理員賬號
ADMIN_USER=admin
ADMIN_PASSWORD=changeme

# CORS 配置
CORS_ORIGINS=http://192.168.1.208,http://localhost:5173
```

### 2. 啟動服務

```bash
docker compose up -d
```

### 3. 驗證部署

```bash
# 檢查 API Gateway 健康狀態
curl http://192.168.1.207:8080/health

# 測試登入
curl -X POST http://192.168.1.207:8080/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"changeme"}'
```

### 4. 訪問前端

在瀏覽器中打開：`http://192.168.1.208`

## 📊 服務架構

```
┌─────────────────────────────────────────────────────────────┐
│                    Unraid macvlan 網絡                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  PostgreSQL          192.168.1.201:5432                     │
│  Mosquitto MQTT      192.168.1.202:1883                     │
│  Auth Service        192.168.1.203:8081                     │
│  Device Service      192.168.1.204:8082                     │
│  MQTT Service        192.168.1.205:8083                     │
│  WebSocket Service   192.168.1.206:8084                     │
│  API Gateway         192.168.1.207:8080  ← 主要入口         │
│  Frontend UI         192.168.1.208:80                       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## 🔧 配置說明

### macvlan 網絡

macvlan 網絡允許容器直接連接到物理網絡，獲得獨立的 MAC 地址和 IP 地址。

**前置要求**：
- Unraid 或支持 macvlan 的 Docker 環境
- 可用的 IP 地址範圍
- 正確配置的網絡橋接

### IP 地址分配

確保分配的 IP 地址：
- ✅ 在同一子網內
- ✅ 不與其他設備衝突
- ✅ 不在 DHCP 分配範圍內（建議使用靜態 IP 範圍）

### 安全配置

**生產環境必須修改**：
- `JWT_SECRET` - 用於簽名用戶令牌
- `INTERNAL_TOKEN` - 用於服務間通訊
- `POSTGRES_PASSWORD` - 資料庫密碼
- `ADMIN_PASSWORD` - 管理員密碼

## 🆚 與標準部署的區別

| 特性 | 標準部署 | Unraid macvlan 部署 |
|------|---------|-------------------|
| 網絡模式 | Docker 內部網絡 | macvlan 外部網絡 |
| IP 地址 | localhost + 端口映射 | 獨立 IP 地址 |
| 適用環境 | 開發、測試、一般生產 | Unraid、特殊網絡需求 |
| 配置複雜度 | 簡單 | 中等 |
| 網絡隔離 | 高 | 低（直接暴露在局域網） |

## 📝 常見問題

### Q: 如何選擇部署方式？

- **標準部署**（`esp-server/docker-compose.yml`）：適用於大多數情況
- **Unraid 部署**（此目錄）：僅在需要獨立 IP 或使用 Unraid 時使用

### Q: 容器無法啟動？

檢查：
1. macvlan 網絡是否正確配置
2. IP 地址是否可用且不衝突
3. 環境變數是否正確設置
4. 查看容器日誌：`docker compose logs <service-name>`

### Q: 如何更新服務？

```bash
# 拉取最新代碼
git pull

# 重新構建並啟動
docker compose up -d --build
```

### Q: 如何備份資料？

```bash
# 備份 PostgreSQL 資料
docker exec esp-postgres pg_dump -U esp_user esp_platform > backup.sql

# 備份 volumes
docker run --rm -v docker_postgres_data:/data -v $(pwd):/backup \
  alpine tar czf /backup/postgres_data.tar.gz -C /data .
```

## 🔗 相關文檔

- [標準 Docker 部署](../esp-server/README.md)
- [快速啟動指南](../esp-server/QUICKSTART.md)
- [部署指南](../esp-server/DEPLOYMENT.md)
- [專案總覽](../README.md)

## 📞 支援

如有問題，請：
1. 查看 [專案文檔](../README.md)
2. 檢查 [已知問題](../esp-server/CHANGELOG.md)
3. 提交 [GitHub Issue](https://github.com/InoriHimea/esp-project/issues)
