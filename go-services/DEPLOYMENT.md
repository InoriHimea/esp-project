# 部署指南

本文檔說明如何將 ESP 控制平台 Go 微服務部署到生產環境。

## 目錄

- [前置要求](#前置要求)
- [本地開發部署](#本地開發部署)
- [生產環境部署](#生產環境部署)
- [監控和日誌](#監控和日誌)
- [故障排除](#故障排除)

## 前置要求

### 軟體要求

- Docker 20.10+
- Docker Compose 2.0+
- Go 1.22+ (僅用於本地開發)

### 硬體要求

**最小配置：**
- CPU: 2 核心
- 記憶體: 4GB RAM
- 磁碟: 20GB

**推薦配置：**
- CPU: 4 核心
- 記憶體: 8GB RAM
- 磁碟: 50GB SSD

## 本地開發部署

### 1. 克隆專案

```bash
git clone <repository-url>
cd go-services
```

### 2. 配置環境變數

```bash
cp .env.example .env
```

編輯 `.env` 文件：

```env
JWT_SECRET=your-random-secret-key-here
INTERNAL_TOKEN=your-internal-token-here
CORS_ORIGINS=http://localhost:5173
ADMIN_USER=admin
ADMIN_PASSWORD=your-secure-password
```

### 3. 啟動服務

```bash
# 使用 Docker Compose
docker-compose up -d

# 或使用 Makefile
make docker-up
```

### 4. 驗證部署

```bash
# 檢查服務狀態
docker-compose ps

# 檢查健康狀態
curl http://localhost:8080/health

# 運行 API 測試
./test-api.sh
```

## 生產環境部署

### 1. 安全配置

#### 1.1 生成強密鑰

```bash
# 生成 JWT 密鑰
openssl rand -base64 32

# 生成內部令牌
openssl rand -base64 32
```

將生成的密鑰更新到 `.env` 文件。

#### 1.2 更改預設密碼

```env
ADMIN_USER=your-admin-username
ADMIN_PASSWORD=your-strong-password
```

#### 1.3 配置資料庫密碼

編輯 `docker-compose.yml`，更改 PostgreSQL 密碼：

```yaml
postgres:
  environment:
    POSTGRES_PASSWORD: your-secure-db-password
```

同時更新所有服務的 `DATABASE_URL`。

### 2. 網絡配置

#### 2.1 配置 CORS

```env
CORS_ORIGINS=https://your-frontend-domain.com,https://app.your-domain.com
```

#### 2.2 配置反向代理

使用 Nginx 作為反向代理：

```nginx
# /etc/nginx/sites-available/esp-platform

upstream api_gateway {
    server localhost:8080;
}

server {
    listen 80;
    server_name api.your-domain.com;
    
    # 重定向到 HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    # SSL 配置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # 代理設置
    location / {
        proxy_pass http://api_gateway;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket 支援
        proxy_read_timeout 86400;
    }
}
```

啟用配置：

```bash
sudo ln -s /etc/nginx/sites-available/esp-platform /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 3. 持久化數據

#### 3.1 配置 Docker 卷

確保 `docker-compose.yml` 中定義了持久化卷：

```yaml
volumes:
  postgres_data:
    driver: local
  mosquitto_data:
    driver: local
  mosquitto_logs:
    driver: local
```

#### 3.2 備份策略

創建備份腳本 `backup.sh`：

```bash
#!/bin/bash

BACKUP_DIR="/var/backups/esp-platform"
DATE=$(date +%Y%m%d_%H%M%S)

# 創建備份目錄
mkdir -p $BACKUP_DIR

# 備份資料庫
docker exec esp-postgres pg_dump -U esp_user esp_platform | gzip > $BACKUP_DIR/db_$DATE.sql.gz

# 保留最近 7 天的備份
find $BACKUP_DIR -name "db_*.sql.gz" -mtime +7 -delete

echo "備份完成: $BACKUP_DIR/db_$DATE.sql.gz"
```

設置定時備份：

```bash
# 添加到 crontab
0 2 * * * /path/to/backup.sh
```

### 4. 啟動生產服務

```bash
# 構建鏡像
docker-compose build

# 啟動服務
docker-compose up -d

# 查看日誌
docker-compose logs -f
```

### 5. 健康檢查

設置外部監控服務（如 UptimeRobot、Pingdom）監控：

- `https://api.your-domain.com/health`

## 監控和日誌

### 日誌管理

所有服務輸出結構化 JSON 日誌到 stdout。

#### 查看日誌

```bash
# 查看所有服務日誌
docker-compose logs -f

# 查看特定服務日誌
docker-compose logs -f api-gateway

# 查看最近 100 行日誌
docker-compose logs --tail=100 mqtt-service
```

#### 日誌聚合

使用 ELK Stack 或 Loki 進行日誌聚合：

```yaml
# docker-compose.yml 添加日誌驅動
services:
  api-gateway:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

### 性能監控

#### Prometheus + Grafana

可以添加 Prometheus 指標端點到各個服務。

#### 資源監控

```bash
# 查看容器資源使用
docker stats

# 查看特定容器
docker stats esp-api-gateway
```

## 擴展部署

### 水平擴展

可以擴展任何微服務：

```bash
# 擴展設備服務到 3 個實例
docker-compose up -d --scale device-service=3

# 擴展 MQTT 服務到 2 個實例
docker-compose up -d --scale mqtt-service=2
```

### 負載均衡

使用 Nginx 或 HAProxy 進行負載均衡：

```nginx
upstream device_service {
    least_conn;
    server device-service-1:8082;
    server device-service-2:8082;
    server device-service-3:8082;
}
```

## 故障排除

### 服務無法啟動

1. 檢查日誌：
```bash
docker-compose logs <service-name>
```

2. 檢查環境變數：
```bash
docker-compose config
```

3. 檢查端口衝突：
```bash
netstat -tulpn | grep <port>
```

### 資料庫連接失敗

1. 檢查 PostgreSQL 狀態：
```bash
docker-compose ps postgres
docker-compose logs postgres
```

2. 測試連接：
```bash
docker exec -it esp-postgres psql -U esp_user -d esp_platform
```

### MQTT 連接問題

1. 檢查 Mosquitto 狀態：
```bash
docker-compose logs mosquitto
```

2. 測試 MQTT 連接：
```bash
# 訂閱測試
mosquitto_sub -h localhost -p 1883 -t "test/#" -v

# 發布測試
mosquitto_pub -h localhost -p 1883 -t "test/topic" -m "hello"
```

### 記憶體不足

1. 增加 Docker 記憶體限制：
```yaml
services:
  api-gateway:
    deploy:
      resources:
        limits:
          memory: 512M
```

2. 優化資料庫連接池：
```env
# 減少最大連接數
MAX_DB_CONNECTIONS=5
```

### 性能問題

1. 檢查資源使用：
```bash
docker stats
```

2. 分析慢查詢：
```sql
-- PostgreSQL 慢查詢日誌
SELECT * FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;
```

3. 優化資料庫索引：
```sql
-- 檢查缺失的索引
SELECT * FROM pg_stat_user_tables WHERE idx_scan = 0;
```

## 安全最佳實踐

1. **定期更新**
   - 定期更新 Docker 鏡像
   - 更新依賴套件

2. **網絡隔離**
   - 使用 Docker 網絡隔離服務
   - 只暴露必要的端口

3. **密鑰管理**
   - 使用環境變數或密鑰管理服務
   - 定期輪換密鑰

4. **訪問控制**
   - 配置防火牆規則
   - 使用 VPN 或 IP 白名單

5. **審計日誌**
   - 記錄所有認證嘗試
   - 監控異常活動

## 回滾策略

如果部署出現問題：

```bash
# 停止當前版本
docker-compose down

# 切換到上一個版本
git checkout <previous-tag>

# 重新部署
docker-compose up -d
```

## 支援

如有問題，請查看：
- [README.md](README.md) - 基本使用說明
- [GitHub Issues](https://github.com/your-repo/issues) - 報告問題
