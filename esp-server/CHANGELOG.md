# 變更日誌

本文件記錄專案的所有重要變更。

格式基於 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.0.0/)，
版本號遵循 [語義化版本](https://semver.org/lang/zh-TW/)。

## [1.0.0] - 2024-01-15

### 新增

#### 微服務架構
- ✅ API Gateway 服務（端口 8080）
  - 統一入口點和路由
  - JWT 令牌驗證
  - WebSocket 代理
  - CORS 處理
  - 健康檢查聚合

- ✅ Auth Service 服務（端口 8081）
  - 用戶登入認證
  - JWT 令牌生成和驗證
  - bcrypt 密碼哈希
  - 內部令牌驗證 API

- ✅ Device Service 服務（端口 8082）
  - 設備列表查詢
  - 設備狀態查詢
  - 設備歷史記錄查詢（支援分頁）
  - 設備命令發送
  - 在線狀態計算（60 秒心跳）

- ✅ MQTT Service 服務（端口 8083）
  - MQTT Broker 連接（指數退避重試）
  - 設備狀態訂閱（esp/devices/+/status）
  - 命令發布（esp/devices/:id/command）
  - 資料庫自動更新
  - WebSocket 廣播觸發

- ✅ WebSocket Service 服務（端口 8084）
  - WebSocket 連接管理
  - JWT 令牌認證
  - 實時消息廣播
  - 連接保活（ping/pong）
  - 客戶端計數

#### 共享套件
- ✅ config 套件：環境變數配置管理
- ✅ database 套件：PostgreSQL 連接和遷移
- ✅ jwt 套件：JWT 令牌管理
- ✅ logger 套件：結構化日誌記錄
- ✅ middleware 套件：HTTP 中間件
- ✅ models 套件：共享數據模型

#### 容器化
- ✅ 每個服務的獨立 Dockerfile
- ✅ 多階段構建優化
- ✅ 非 root 用戶運行
- ✅ Docker Compose 編排
- ✅ 健康檢查配置
- ✅ PostgreSQL 容器
- ✅ Mosquitto MQTT Broker 容器

#### 文檔
- ✅ README.md - 專案介紹和使用說明
- ✅ QUICKSTART.md - 5 分鐘快速啟動指南
- ✅ DEPLOYMENT.md - 生產環境部署指南
- ✅ MIGRATION.md - 從 Node.js 遷移指南
- ✅ PROJECT_SUMMARY.md - 專案總結
- ✅ STRUCTURE.md - 專案結構說明
- ✅ CHANGELOG.md - 變更日誌（本文件）

#### 工具和腳本
- ✅ Makefile - 常用命令快捷方式
- ✅ test-api.sh - API 自動化測試腳本
- ✅ compare-responses.sh - Node.js vs Go 響應比較
- ✅ load-test.js - K6 負載測試腳本
- ✅ .env.example - 環境變數模板

#### 功能特性
- ✅ 完全向後兼容 Node.js API
- ✅ JWT 令牌認證（3600 秒有效期）
- ✅ 資料庫連接池（2-10 連接）
- ✅ 請求超時控制（30 秒）
- ✅ 優雅關閉（30 秒等待）
- ✅ 結構化 JSON 日誌
- ✅ 請求 ID 追蹤
- ✅ Panic 恢復機制
- ✅ CORS 跨域支援
- ✅ 健康檢查端點
- ✅ 錯誤處理和重試

#### 安全性
- ✅ bcrypt 密碼哈希
- ✅ JWT 令牌簽名驗證
- ✅ 內部服務令牌認證
- ✅ SQL 注入防護（參數化查詢）
- ✅ 非 root 容器運行
- ✅ 環境變數敏感信息管理

#### 可觀測性
- ✅ 結構化日誌（JSON 格式）
- ✅ 請求 ID 追蹤
- ✅ 錯誤堆棧記錄
- ✅ 健康檢查端點
- ✅ 依賴項狀態檢查

### 技術棧
- Go 1.22
- PostgreSQL 16
- Eclipse Mosquitto 2
- Docker & Docker Compose
- Gorilla WebSocket
- Eclipse Paho MQTT
- golang-jwt/jwt v5

### 性能優化
- 編譯型語言，執行效率高
- 原生並發支援（goroutines）
- 連接池管理
- 超時控制
- 重試機制

### 測試覆蓋
- API 端點測試
- 認證流程測試
- 錯誤處理測試
- 負載測試腳本
- 響應比較測試

## [未來版本]

### 計劃新增

#### v1.1.0（短期 - 1-3 個月）
- [ ] 單元測試套件
- [ ] 集成測試套件
- [ ] Prometheus 指標端點
- [ ] OpenAPI/Swagger 文檔
- [ ] CI/CD 流水線（GitHub Actions）
- [ ] Rate limiting 中間件
- [ ] API 密鑰認證

#### v1.2.0（中期 - 3-6 個月）
- [ ] 分佈式追蹤（Jaeger/Zipkin）
- [ ] 服務網格支援（Istio）
- [ ] 配置中心集成（Consul/Etcd）
- [ ] 密鑰管理服務
- [ ] 審計日誌
- [ ] 多語言支援（i18n）

#### v2.0.0（長期 - 6-12 個月）
- [ ] GraphQL API
- [ ] gRPC 服務間通訊
- [ ] 事件溯源
- [ ] CQRS 模式
- [ ] 多租戶支援
- [ ] 實時分析儀表板

### 計劃改進
- [ ] 服務發現（Consul/Etcd）
- [ ] 配置熱重載
- [ ] 更細粒度的權限控制
- [ ] WebSocket 房間/頻道支援
- [ ] 消息隊列集成（RabbitMQ/Kafka）
- [ ] 緩存層（Redis）
- [ ] 全文搜索（Elasticsearch）

## 版本說明

### 版本號格式：主版本.次版本.修訂版本

- **主版本**：不兼容的 API 變更
- **次版本**：向後兼容的功能新增
- **修訂版本**：向後兼容的問題修正

### 變更類型

- **新增**：新功能
- **變更**：現有功能的變更
- **棄用**：即將移除的功能
- **移除**：已移除的功能
- **修復**：錯誤修復
- **安全**：安全性相關的修復

## 遷移指南

### 從 Node.js 遷移到 v1.0.0

請參閱 [MIGRATION.md](MIGRATION.md) 獲取詳細的遷移指南。

關鍵點：
- ✅ API 完全向後兼容
- ✅ 資料庫 schema 相同
- ✅ JWT 令牌格式相同
- ✅ MQTT 主題結構相同
- ✅ 無需修改前端代碼

## 已知問題

### v1.0.0
- 服務發現使用靜態配置（計劃在 v1.2.0 改進）
- 未實現分佈式追蹤（計劃在 v1.2.0 新增）
- 未實現 Prometheus 指標（計劃在 v1.1.0 新增）
- WebSocket 不支援房間/頻道（計劃在 v1.1.0 新增）

## 貢獻者

感謝所有為本專案做出貢獻的人！

## 支援

- 文檔：本目錄下的 Markdown 文件
- 問題追蹤：GitHub Issues
- 郵箱：support@your-domain.com

---

**格式說明**：
- 日期格式：YYYY-MM-DD
- 版本號：遵循語義化版本
- 變更分類：新增、變更、棄用、移除、修復、安全
