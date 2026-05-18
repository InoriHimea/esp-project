# ESP 控制平台

[![Version](https://img.shields.io/badge/version-1.4.0-blue.svg)](https://github.com/InoriHimea/esp-project/releases/tag/v1.4.0)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](esp-server/LICENSE)
[![Go](https://img.shields.io/badge/Go-1.22-00ADD8.svg)](https://go.dev/)
[![React](https://img.shields.io/badge/React-18-61DAFB.svg)](https://react.dev/)

完整的 ESP32 設備控制平台，包含後端微服務、前端 UI 和 ESP32 韌體。

**當前版本：v1.4.0**

## 📋 專案概述

本專案是一個完整的物聯網控制平台，用於管理和控制 ESP32 設備。採用現代化的微服務架構，提供實時設備監控、命令控制和歷史數據查詢功能。

### 🎯 主要特性

- 🚀 **微服務架構** - 基於 Go 的高性能微服務後端
- 📱 **現代化 UI** - React + TypeScript 前端應用
- 🔌 **ESP32 支援** - 完整的 ESP32 韌體實現
- 🔄 **實時通訊** - WebSocket 實時推送 + MQTT 設備通訊
- 🔒 **安全認證** - JWT 令牌認證機制
- 🐳 **容器化部署** - 完整的 Docker 支援
- 📊 **設備監控** - 實時狀態監控和歷史記錄
- ⚡ **高性能** - 相比 Node.js 版本性能提升 30-50%

## 🏗️ 專案結構

```
esp-project/
├── esp-server/          # Go 微服務後端
│   ├── api-gateway/     # API Gateway 服務
│   ├── auth-service/    # 認證服務
│   ├── device-service/  # 設備管理服務
│   ├── mqtt-service/    # MQTT 處理服務
│   ├── websocket-service/ # WebSocket 服務
│   └── shared/          # 共享套件
├── esp-ui/              # React 前端應用
├── firmware/            # ESP32 韌體（PlatformIO）
│   ├── esp32-jgb37-drv8871-motor-controller/
│   └── esp32-epaper-display/
└── docker/              # Docker 配置
```

## 🚀 快速開始

### 前置要求

- Docker 和 Docker Compose
- Go 1.22+ (僅用於本地開發)
- Node.js 18+ (僅用於前端開發)
- PlatformIO (僅用於 ESP32 開發)

### 使用 Docker Compose 啟動（推薦）

1. **克隆專案**
   ```bash
   git clone https://github.com/InoriHimea/esp-project.git
   cd esp-project
   ```

2. **配置環境變數**
   ```bash
   cd esp-server
   cp .env.example .env
   # 編輯 .env 設置 JWT_SECRET 等
   ```

3. **啟動所有服務**
   ```bash
   docker compose up -d
   ```

4. **驗證部署**
   ```bash
   curl http://localhost:8080/health
   ```

5. **訪問應用**
   - 後端 API: http://localhost:8080
   - 前端 UI: http://localhost:5173
   - 預設帳號: admin / changeme

### 本地開發

詳細的開發指南請參閱各個子專案的 README：

- [後端開發指南](esp-server/README.md)
- [前端開發指南](esp-ui/README.md)
- [ESP32 韌體開發](firmware/README.md)

## 📦 專案組件

### 後端微服務 (esp-server/)

基於 Go 1.22 的微服務架構，包含 5 個獨立服務：

| 服務 | 端口 | 說明 |
|------|------|------|
| API Gateway | 8080 | 統一入口、路由、認證 |
| Auth Service | 8081 | 用戶認證、JWT 管理 |
| Device Service | 8082 | 設備管理、狀態查詢 |
| MQTT Service | 8083 | MQTT 消息處理 |
| WebSocket Service | 8084 | 實時推送 |

**技術棧**：
- Go 1.22
- PostgreSQL 16
- Eclipse Mosquitto 2
- Docker & Docker Compose

**文檔**：
- [快速啟動](esp-server/QUICKSTART.md)
- [部署指南](esp-server/DEPLOYMENT.md)
- [API 文檔](esp-server/README.md)

### 前端應用 (esp-ui/)

基於 React + TypeScript 的現代化 Web 應用。

**技術棧**：
- React 18
- TypeScript
- Vite
- TailwindCSS

**功能**：
- 設備列表和狀態監控
- 實時數據更新
- 設備命令控制
- 歷史記錄查詢
- 響應式設計

### ESP32 韌體 (firmware/)

基於 PlatformIO 的 ESP32 韌體實現，包含電機控制器與電子墨水屏控制器。

**功能**：
- 馬達控制（DRV8871 H 橋 + PWM 速度控制）
- 3 位共陽極數碼管顯示（RPM / 占空比 / 原始值 三模式輪播）
- LED 狀態指示（多種閃爍模式對應不同馬達狀態）
- WiFi 配網（AP 模式 + 設定頁面）
- MQTT 通訊（與後端平台對接）
- HTTP API + WebSocket 實時控制
- **綜合自檢系統**（LED / 數碼管 / 馬達 / GPIO 五類測試）

**硬件構成**：
| 元件 | 用途 |
|------|------|
| ESP32 DevKit | 主控 |
| DRV8871 | H 橋馬達驅動（24V / 1.5A）|
| JGB37-520 直流減速馬達 | 24V，可正反轉 |
| 3 位共陽極數碼管 | 顯示速度/RPM |
| S8050 + 2N5401 + 速度補償電容 | 數碼管位選高邊驅動（含抗鬼影設計）|
| 5V 電源去耦電容（100μF + 0.1μF）| 抗 24V 馬達 PWM 干擾 |
| GPIO 下拉電阻（10kΩ）| 段選/位選邏輯電平穩定 |
| Mini 560 降壓模塊 | 24V → 5V/3.3V |

**重要硬件文檔**：
- 📐 [數碼管驅動電路設計與鬼影消除](firmware/esp32-jgb37-drv8871-motor-controller/docs/display-driver-circuit.md)
- 📋 [馬達控制器 BOM](firmware/esp32-jgb37-drv8871-motor-controller/BOM.md)
- 📋 [電子墨水屏 BOM](firmware/esp32-epaper-display/BOM.md)
  - 完整電路圖（NPN + PNP 達林頓對管）
  - **速度補償電容方案**（解決殘影 / 鬼影）
  - ULN2803 / MIC2981 專用驅動 IC 替代方案說明

**自檢測試**：
韌體預設開機自動執行完整自檢（LED → 數碼管 → GPIO → 馬達 PWM），約耗時 45 秒。  
也可以隨時通過 HTTP / MQTT / WebSocket 觸發單項或完整測試：

```bash
# HTTP 觸發（需要先連接 WiFi）
curl -X POST http://motorctrl.local/api/test \
  -H 'Content-Type: application/json' \
  -d '{"type":"all"}'

# 查詢測試進度
curl http://motorctrl.local/api/test

# 關閉開機自檢（持久化）
curl -X POST http://motorctrl.local/api/boot-test \
  -H 'Content-Type: application/json' \
  -d '{"enabled":false}'
```

支援的測試類型：`led` / `display` / `motor` / `gpio` / `all`

## 🔧 API 端點

### 認證
- `POST /api/v1/auth/login` - 用戶登入

### 設備管理
- `GET /api/v1/devices` - 獲取設備列表
- `GET /api/v1/devices/:id/status` - 獲取設備狀態
- `GET /api/v1/devices/:id/history` - 獲取設備歷史
- `POST /api/v1/devices/:id/command` - 發送設備命令

### WebSocket
- `WS /ws?token=<jwt>` - WebSocket 連接

### 健康檢查
- `GET /health` - 服務健康狀態

詳細 API 文檔請參閱 [esp-server/README.md](esp-server/README.md)

## 🐳 Docker 部署

### 標準部署（推薦）

適用於大多數環境，使用 Docker 內部網絡：

```bash
cd esp-server
cp .env.example .env
# 編輯 .env 設置 JWT_SECRET 等
docker compose up -d
```

服務將在以下端口啟動：
- API Gateway: http://localhost:8080
- 前端 UI: 需要單獨構建或使用開發模式

### Unraid macvlan 部署

適用於 Unraid 環境，為每個服務分配獨立 IP：

```bash
cd docker
cp .env.example .env
# 編輯 .env 配置 IP 地址和密鑰
docker compose up -d
```

詳細配置說明請參閱 `docker/.env.example`。

### 使用預構建鏡像

```bash
# 拉取鏡像
docker pull ghcr.io/inorihimea/esp-platform-api-gateway:v1.1.0

# 使用 docker-compose
cd esp-server
docker compose up -d
```

## 📊 架構圖

```
┌─────────────┐
│   前端 UI   │
│ (React App) │
└──────┬──────┘
       │ HTTP/WebSocket
       ▼
┌─────────────────────────────────────┐
│         API Gateway (8080)          │
│  ┌──────────┬──────────────────┐   │
│  │  路由    │  JWT 認證        │   │
│  └──────────┴──────────────────┘   │
└────┬────────┬────────┬─────────┬───┘
     │        │        │         │
     ▼        ▼        ▼         ▼
┌─────────┐ ┌────────┐ ┌──────┐ ┌──────────┐
│  Auth   │ │ Device │ │ MQTT │ │WebSocket │
│ Service │ │Service │ │Service│ │ Service  │
│ (8081)  │ │ (8082) │ │(8083) │ │  (8084)  │
└────┬────┘ └───┬────┘ └───┬───┘ └──────────┘
     │          │           │
     └──────────┴───────────┘
                │
     ┌──────────┴──────────┐
     ▼                     ▼
┌──────────┐        ┌──────────┐
│PostgreSQL│        │Mosquitto │
│   (DB)   │        │  (MQTT)  │
└──────────┘        └────┬─────┘
                         │
                         ▼
                    ┌─────────┐
                    │  ESP32  │
                    │ Devices │
                    └─────────┘
```

## 🔐 安全性

- ✅ JWT 令牌認證
- ✅ bcrypt 密碼哈希
- ✅ SQL 注入防護
- ✅ CORS 跨域控制
- ✅ 環境變數管理敏感信息
- ✅ 非 root 容器運行

**生產環境建議**：
- 更改預設密碼
- 使用強 JWT 密鑰
- 啟用 HTTPS
- 配置防火牆
- 定期更新依賴

## 📈 性能

相比 Node.js 版本的性能提升：

| 指標 | 提升幅度 |
|------|---------|
| 響應時間 | ↓ 30-50% |
| 記憶體使用 | ↓ 40-60% |
| CPU 使用 | ↓ 20-30% |
| 並發連接 | ↑ 2-3x |

## 🧪 測試

```bash
# 後端測試
cd esp-server
go test ./...

# API 測試
./test-api.sh

# 負載測試
k6 run load-test.js

# 前端測試
cd esp-ui
npm test
```

## 📝 版本歷史

### v1.3.0 (2024-05-17)
- ✨ ESP32 韌體新增 SelfTest 綜合自檢系統
- 🔧 DRV8871 PWM 頻率從 20kHz 降至 1kHz（修復馬達不轉）
- 🔧 GPIO12 改為 GPIO5（避免啟動問題）
- 📚 新增完整硬件設計文檔（暖菜旋轉盤方案）
- 📚 新增數碼管驅動電路設計文檔
- 📚 新增 ESP32 馬達控制器韌體使用指南

### v1.2.0 (2024-05-15)
- 前端集成改進：統一 Dashboard 數據來源
- Docker 部署優化：支持 Unraid macvlan 網絡
- 完善部署文檔和配置說明

### v1.1.0 (2024-05-15)
- 🐛 修復後端編譯問題
  - 補齊 Go 依賴（websocket, bcrypt, mqtt）
  - 統一 config、database、JWT、middleware 接口
  - 添加 logger.Fatal() 函數
- ✨ 完善後端運行邏輯
  - 數據庫自動遷移和初始化
  - 默認管理員賬號自動創建（admin/changeme）
  - 改進 Device Service 路由解析
  - 實現密碼修改端點
  - 修復 WebSocket 消息類型（匹配前端協議）
- 🔧 修正 ESP32 數碼管配置
  - 支持共陽極數碼管（Common Anode）
  - 修正段選和位選邏輯
  - 向後兼容共陰極配置
- 📚 添加 plan.md 開發計劃文檔

### v1.0.0 (2024-01-15)
- ✨ 初始發布
- 🚀 完整的 Go 微服務架構
- 📱 React 前端應用
- 🔌 ESP32 韌體支援
- 🐳 Docker 容器化部署
- 📚 完整的文檔

詳細變更請查看 [CHANGELOG.md](esp-server/CHANGELOG.md)

## 🤝 貢獻

歡迎貢獻！請遵循以下步驟：

1. Fork 本專案
2. 創建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 開啟 Pull Request

## 📄 授權

本專案採用 MIT 授權 - 詳見 [LICENSE](esp-server/LICENSE) 文件

## 📞 聯繫方式

- 作者: InoriHimea
- Email: icarus347@gmail.com
- GitHub: [@InoriHimea](https://github.com/InoriHimea)
- 專案連結: [https://github.com/InoriHimea/esp-project](https://github.com/InoriHimea/esp-project)

## 🙏 致謝

- [Go](https://go.dev/) - 高性能後端語言
- [React](https://react.dev/) - 前端框架
- [PlatformIO](https://platformio.org/) - ESP32 開發平台
- [PostgreSQL](https://www.postgresql.org/) - 資料庫
- [Eclipse Mosquitto](https://mosquitto.org/) - MQTT Broker
- [Docker](https://www.docker.com/) - 容器化平台

## 📚 相關資源

- [Go 官方文檔](https://go.dev/doc/)
- [React 官方文檔](https://react.dev/)
- [ESP32 文檔](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/)
- [MQTT 協議](https://mqtt.org/)
- [Docker 文檔](https://docs.docker.com/)

---

**⭐ 如果這個專案對您有幫助，請給個星星！**
