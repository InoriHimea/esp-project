# Requirements Document

## Introduction

本文檔定義將現有 Node.js 實作的 ESP 控制平台伺服器重構為基於 Go 的微服務架構的需求。重構目標是採用 API Gateway + 獨立微服務的設計模式，以支援水平擴展和獨立部署，同時保持現有功能的完整性。

## Glossary

- **API_Gateway**: 統一入口點服務，負責路由請求到對應的微服務，處理認證和協議轉換
- **Auth_Service**: 認證微服務，負責用戶認證、JWT 令牌生成和驗證
- **Device_Service**: 設備管理微服務，負責設備狀態查詢、歷史記錄和命令發送
- **MQTT_Service**: MQTT 處理微服務，負責與 MQTT Broker 通訊和消息處理
- **WebSocket_Service**: WebSocket 微服務，負責實時推送設備狀態更新給客戶端
- **Database**: PostgreSQL 資料庫，儲存用戶、設備和事件數據
- **MQTT_Broker**: MQTT 消息代理，用於與 ESP32 設備通訊
- **Service_Registry**: 服務註冊與發現機制（如 Consul 或內建配置）
- **Inter_Service_Communication**: 微服務間通訊機制（gRPC 或 HTTP）
- **Client**: 前端應用程式（esp-ui）或其他 API 消費者

## Requirements

### Requirement 1: API Gateway 路由和認證

**User Story:** 作為系統架構師，我希望有一個統一的 API Gateway 入口點，以便集中處理路由、認證和協議轉換。

#### Acceptance Criteria

1. THE API_Gateway SHALL 監聽 HTTP 連接（端口 8080）和 WebSocket 連接（端口 8080，路徑 /ws）
2. WHEN 收到 HTTP 請求，THE API_Gateway SHALL 根據路徑前綴路由到對應的微服務：/api/v1/auth/* 路由到 Auth_Service，/api/v1/devices/* 路由到 Device_Service
3. WHEN 收到路徑為 /api/v1/auth/login 的請求，THE API_Gateway SHALL 轉發請求到 Auth_Service 而不驗證 JWT 令牌
4. WHEN 收到路徑不為 /api/v1/auth/login 的請求，THE API_Gateway SHALL 驗證 Authorization 標頭中的 JWT 令牌
5. IF JWT 令牌缺失，THEN THE API_Gateway SHALL 拒絕請求並指示缺少令牌
6. IF JWT 令牌格式錯誤（不符合 "Bearer <token>" 格式），THEN THE API_Gateway SHALL 拒絕請求並指示令牌格式無效
7. IF JWT 令牌已過期，THEN THE API_Gateway SHALL 拒絕請求並指示令牌已過期
8. IF JWT 令牌簽名無效，THEN THE API_Gateway SHALL 拒絕請求並指示令牌簽名無效
9. WHEN JWT 令牌有效，THE API_Gateway SHALL 在 30 秒內將請求轉發到目標微服務，並在請求標頭中包含用戶 ID（X-User-ID）和用戶名（X-Username）
10. THE API_Gateway SHALL 支援 CORS 配置，允許來自配置的前端域名的跨域請求
11. WHEN 目標微服務在 5 秒內未響應健康檢查端點，THE API_Gateway SHALL 視為該微服務不可用並拒絕路由到該服務的請求

### Requirement 2: 認證服務

**User Story:** 作為用戶，我希望能夠登入系統並獲得訪問令牌，以便安全地使用 API。

#### Acceptance Criteria

1. THE Auth_Service SHALL 提供用戶登入功能
2. WHEN 收到包含用戶名和密碼的登入請求，IF 用戶名或密碼欄位為空，THEN THE Auth_Service SHALL 拒絕請求並指示缺少必需欄位
3. WHEN 收到有效格式的登入請求，THE Auth_Service SHALL 從 Database 查詢用戶憑證
4. IF Database 在 5 秒內無響應或返回錯誤，THEN THE Auth_Service SHALL 拒絕請求並指示服務暫時不可用
5. WHEN 用戶名存在於 Database 中，THE Auth_Service SHALL 驗證提供的密碼與儲存的密碼哈希是否匹配
6. IF 密碼不匹配或用戶名不存在，THEN THE Auth_Service SHALL 拒絕請求並指示憑證無效
7. WHEN 憑證驗證成功，THE Auth_Service SHALL 生成包含用戶 ID 和用戶名的 JWT 令牌，令牌有效期為 3600 秒（1 小時）
8. THE Auth_Service SHALL 提供令牌驗證功能供其他服務調用
9. WHEN 收到令牌驗證請求，THE Auth_Service SHALL 驗證令牌簽名和過期時間，並返回包含用戶 ID 和用戶名的驗證結果

### Requirement 3: 設備管理服務

**User Story:** 作為用戶，我希望能夠查詢設備列表、狀態和歷史記錄，以便監控和管理 ESP32 設備。

#### Acceptance Criteria

1. THE Device_Service SHALL 提供設備列表查詢功能
2. WHEN 查詢設備列表，THE Device_Service SHALL 從 Database 讀取所有設備記錄
3. WHEN 計算設備在線狀態，IF 設備的最後心跳時間距當前時間超過 60 秒，THEN THE Device_Service SHALL 將該設備標記為離線，否則標記為在線
4. IF 設備狀態計算失敗或無法確定在線/離線狀態，THEN THE Device_Service SHALL 允許設備保持未定義狀態
4. WHEN 返回設備列表，THE Device_Service SHALL 包含每個設備的設備 ID、設備名稱、在線狀態和最後心跳時間
5. THE Device_Service SHALL 提供設備狀態查詢功能
6. WHEN 查詢設備狀態，THE Device_Service SHALL 從 Database 讀取指定設備的最新狀態記錄
7. WHEN 返回設備狀態，THE Device_Service SHALL 包含設備 ID、在線狀態、最後心跳時間和最新的設備狀態數據（如速度、方向等）
8. IF 查詢的設備 ID 不存在於 Database 中，THEN THE Device_Service SHALL 拒絕請求並指示設備不存在
9. THE Device_Service SHALL 提供設備歷史查詢功能
10. WHEN 查詢設備歷史，THE Device_Service SHALL 支援分頁參數 limit（有效範圍 1-1000）和 offset（有效範圍 0-1000000）
11. IF limit 或 offset 超出有效範圍，THEN THE Device_Service SHALL 拒絕請求並指示參數無效
12. WHEN 返回設備歷史，THE Device_Service SHALL 從 Database 讀取指定設備的歷史事件記錄，按時間倒序排列，並返回包含事件 ID、設備 ID、事件類型、事件數據和時間戳的記錄
13. THE Device_Service SHALL 提供設備命令發送功能
14. WHEN 收到設備命令請求，IF 命令負載缺少必需欄位（如 command 類型），THEN THE Device_Service SHALL 拒絕請求並指示命令格式無效
15. WHEN 收到設備命令請求，IF 命令負載包含必需欄位但存在其他格式問題，THEN THE Device_Service SHALL 允許請求通過並轉發到 MQTT_Service
15. WHEN 收到設備命令請求，IF 命令負載包含必需欄位但存在其他格式問題，THEN THE Device_Service SHALL 允許請求通過並轉發到 MQTT_Service
16. WHEN 收到有效的設備命令請求，THE Device_Service SHALL 在 10 秒內調用 MQTT_Service 發送命令到設備
17. IF MQTT_Service 在 10 秒內無響應或返回錯誤，THEN THE Device_Service SHALL 拒絕請求並指示命令發送失敗

### Requirement 4: MQTT 消息處理服務

**User Story:** 作為系統，我希望能夠與 MQTT Broker 通訊，以便接收設備狀態更新和發送命令到設備。

#### Acceptance Criteria

1. WHEN MQTT_Service 啟動時，THE MQTT_Service SHALL 嘗試連接到 MQTT_Broker，連接超時時間為 10 秒
2. IF 初始連接失敗，THEN THE MQTT_Service SHALL 使用指數退避策略重試連接，初始延遲為 1 秒，每次失敗後延遲時間翻倍，最大延遲為 30 秒，無限次重試直到連接成功
3. WHEN MQTT_Service 成功連接到 MQTT_Broker 時，THE MQTT_Service SHALL 訂閱主題 esp/devices/+/status
4. WHEN 收到設備狀態消息時，IF JSON 負載解析失敗或缺少必需字段（device_id, state），THEN THE MQTT_Service SHALL 記錄錯誤日誌並丟棄該消息，不更新 Database
5. WHEN 收到有效的設備狀態消息時，THE MQTT_Service SHALL 解析 JSON 負載並更新 Database
6. IF Database 更新失敗，THEN THE MQTT_Service SHALL 記錄錯誤日誌並繼續處理後續消息
7. WHEN 收到有效的設備狀態消息且 Database 更新成功時，THE MQTT_Service SHALL 通知 WebSocket_Service 廣播更新
8. IF WebSocket_Service 通知失敗，THEN THE MQTT_Service SHALL 記錄錯誤日誌但不影響消息處理流程
9. THE MQTT_Service SHALL 提供命令發布端點供 Device_Service 調用
10. WHEN 收到命令發布請求時，IF device_id 對應的設備不存在於 Database 中，THEN THE MQTT_Service SHALL 返回錯誤響應指示設備不存在
11. WHEN 收到有效設備的命令發布請求時，THE MQTT_Service SHALL 發布消息到主題 esp/devices/:id/command
12. IF 命令發布到 MQTT_Broker 失敗，THEN THE MQTT_Service SHALL 返回錯誤響應指示發布失敗
13. IF 與 MQTT_Broker 連接斷開，THEN THE MQTT_Service SHALL 使用指數退避策略重新連接，初始延遲為 1 秒，每次失敗後延遲時間翻倍，最大延遲為 30 秒

### Requirement 5: WebSocket 實時推送服務

**User Story:** 作為前端應用，我希望能夠通過 WebSocket 接收實時設備狀態更新，以便即時顯示給用戶。

#### Acceptance Criteria

1. THE WebSocket_Service SHALL 提供 WebSocket 端點 /ws 支持 WebSocket 協議版本 13
2. WHEN 收到 WebSocket 連接請求，THE WebSocket_Service SHALL 在 5 秒內驗證查詢參數中的 JWT 令牌
3. IF JWT 令牌缺失，THEN THE WebSocket_Service SHALL 在 1 秒內關閉連接並返回 WebSocket 關閉碼 4001 和關閉原因指示缺少令牌
4. IF JWT 令牌格式錯誤，THEN THE WebSocket_Service SHALL 在 1 秒內關閉連接並返回 WebSocket 關閉碼 4001 和關閉原因指示令牌格式無效
5. IF JWT 令牌已過期，THEN THE WebSocket_Service SHALL 在 1 秒內關閉連接並返回 WebSocket 關閉碼 4001 和關閉原因指示令牌已過期
6. IF JWT 令牌簽名無效，THEN THE WebSocket_Service SHALL 在 1 秒內關閉連接並返回 WebSocket 關閉碼 4001 和關閉原因指示令牌簽名無效
7. WHEN JWT 令牌有效且客戶端註冊成功且連接仍然活躍，THE WebSocket_Service SHALL 在 2 秒內發送 JSON 格式的確認消息包含連接狀態為 "connected"
8. IF JWT 令牌有效但客戶端註冊失敗或連接已斷開，THEN THE WebSocket_Service SHALL 不發送確認消息
8. IF JWT 令牌有效但客戶端註冊失敗或連接已斷開，THEN THE WebSocket_Service SHALL 不發送確認消息
9. THE WebSocket_Service SHALL 提供內部 HTTP POST 端點 /internal/broadcast 供 MQTT_Service 調用，該端點需要有效的內部服務令牌進行身份驗證
10. WHEN 收到廣播請求，THE WebSocket_Service SHALL 在 3 秒內發送 JSON 格式消息到所有已連接的客戶端，消息包含設備 ID、狀態類型和狀態值
11. IF 向任何客戶端發送消息失敗，THEN THE WebSocket_Service SHALL 記錄失敗但繼續向其他客戶端發送
12. WHEN 客戶端連接關閉，THE WebSocket_Service SHALL 在 2 秒內移除客戶端註冊

### Requirement 6: 資料庫訪問和遷移

**User Story:** 作為開發者，我希望微服務能夠安全地訪問資料庫，以便儲存和查詢數據。

#### Acceptance Criteria

1. WHEN Auth_Service 啟動時，THE Auth_Service SHALL 在 10 秒內連接到 Database
2. IF Database 連接在 10 秒內失敗，THEN THE Auth_Service SHALL 記錄錯誤並終止啟動
3. WHEN Device_Service 啟動時，THE Device_Service SHALL 在 10 秒內連接到 Database
4. IF Database 連接在 10 秒內失敗，THEN THE Device_Service SHALL 記錄錯誤並終止啟動
5. WHEN MQTT_Service 啟動時，THE MQTT_Service SHALL 在 10 秒內連接到 Database
6. IF Database 連接在 10 秒內失敗，THEN THE MQTT_Service SHALL 記錄錯誤並終止啟動
7. WHEN 微服務啟動時，THE 微服務 SHALL 使用連接池管理資料庫連接，連接池最小連接數為 2，最大連接數為 10
8. WHEN 微服務執行資料庫查詢時，THE 微服務 SHALL 使用參數化查詢防止 SQL 注入
9. WHEN API_Gateway 啟動時，THE API_Gateway SHALL 執行資料庫遷移腳本
10. THE 資料庫遷移腳本 SHALL 是冪等的，可以安全地重複執行而不產生錯誤或重複數據

### Requirement 7: 服務發現和配置

**User Story:** 作為運維人員，我希望微服務能夠自動發現彼此，以便簡化部署和擴展。

#### Acceptance Criteria

1. WHEN 微服務啟動時，THE 微服務 SHALL 從環境變數讀取配置，環境變數名稱格式為 `<SERVICE_NAME>_URL`（例如：DEVICE_SERVICE_URL、MQTT_SERVICE_URL、WEBSOCKET_SERVICE_URL）
2. IF 必需的環境變數未設置且無配置文件可用，THEN THE 微服務 SHALL 記錄錯誤訊息並終止啟動，返回非零退出碼
3. WHEN 微服務從環境變數或配置文件讀取端點地址時，THE 微服務 SHALL 驗證格式為有效的 HTTP/HTTPS URL（格式：`http(s)://host:port` 或 `host:port`）
4. IF 端點地址格式無效，THEN THE 微服務 SHALL 記錄錯誤訊息並終止啟動，返回非零退出碼
5. WHERE 使用服務註冊中心，WHEN 微服務啟動時，THE 微服務 SHALL 在啟動後 30 秒內向 Service_Registry 註冊自己的端點地址和健康檢查 URL
6. WHERE 使用服務註冊中心，IF Service_Registry 在 10 秒內無響應或註冊失敗，THEN THE 微服務 SHALL 記錄警告訊息並繼續啟動，使用靜態配置的端點地址
7. WHERE 使用服務註冊中心，WHEN API_Gateway 需要調用其他微服務時，THE API_Gateway SHALL 從 Service_Registry 查詢目標微服務的端點地址，查詢超時時間為 5 秒
8. WHERE 使用服務註冊中心，IF Service_Registry 查詢失敗或超時，THEN THE API_Gateway SHALL 回退到環境變數中配置的靜態端點地址
9. WHEN 微服務啟動時，THE 微服務 SHALL 從環境變數 `PORT` 讀取監聽端口（有效範圍：1024-65535），若未設置則使用服務預設端口
10. WHEN 微服務需要連接資料庫時，THE 微服務 SHALL 從環境變數 `DATABASE_URL` 讀取 PostgreSQL 連接字串（格式：`postgresql://user:password@host:port/database`）
11. IF 資料庫連接字串格式無效或資料庫在 10 秒內無法連接，THEN THE 微服務 SHALL 記錄錯誤訊息並終止啟動，返回非零退出碼

### Requirement 8: 健康檢查和可觀測性

**User Story:** 作為運維人員，我希望能夠監控微服務的健康狀態，以便及時發現和解決問題。

#### Acceptance Criteria

1. THE 微服務 SHALL 提供健康檢查接口
2. IF 微服務及其所有依賴項（數據庫連接、MQTT 連接）均可用，THEN THE 健康檢查接口 SHALL 指示服務健康
3. IF 微服務可用但至少一個依賴項不可用，THEN THE 健康檢查接口 SHALL 指示服務降級
4. IF 微服務不可用，THEN THE 健康檢查接口 SHALL 指示服務故障
5. THE 健康檢查接口 SHALL 返回服務狀態（健康、降級、故障）和各依賴項的可用性狀態
6. THE 微服務 SHALL 記錄結構化日誌，包含時間戳、日誌級別、請求 ID、服務名稱和消息內容
7. WHEN 請求到達 API_Gateway 且請求頭中不包含請求 ID，THE API_Gateway SHALL 生成唯一請求 ID
8. WHEN 請求到達 API_Gateway 且請求頭中已包含請求 ID，THE API_Gateway SHALL 保留並傳遞該請求 ID
9. THE API_Gateway SHALL 在轉發請求時將請求 ID 包含在請求頭中
10. WHEN 微服務處理請求時，THE 微服務 SHALL 從請求頭中提取請求 ID 並在該請求的所有日誌中包含該 ID
11. WHEN 錯誤或異常發生時，THE 微服務 SHALL 記錄錯誤日誌，包含錯誤類型、錯誤消息、堆棧跟蹤和發生錯誤的上下文信息

### Requirement 9: 優雅關閉和錯誤處理

**User Story:** 作為運維人員，我希望微服務能夠優雅地關閉，以便在更新或重啟時不丟失請求。

#### Acceptance Criteria

1. WHEN 收到 SIGTERM 或 SIGINT 信號，THE 微服務 SHALL 在 1 秒內停止接受新請求
2. WHEN 收到 SIGTERM 或 SIGINT 信號且停止接受新請求後，IF 有新請求到達，THEN THE 微服務 SHALL 拒絕該請求並指示服務正在關閉
3. WHEN 收到關閉信號，THE 微服務 SHALL 等待現有請求完成處理，最長等待時間為 30 秒
4. WHEN 收到關閉信號，THE 微服務 SHALL 在 5 秒內關閉資料庫連接，IF 資料庫無響應或網絡問題阻止及時關閉，THEN THE 微服務 SHALL 在 5 秒後強制關閉連接，無論是否有進行中的事務
5. WHEN 收到關閉信號，THE MQTT_Service SHALL 在 5 秒內斷開與 MQTT_Broker 的連接
6. IF 現有請求在 30 秒內未完成處理，THEN THE 微服務 SHALL 強制終止並退出
7. IF 所有現有請求在 30 秒內成功完成處理，THEN THE 微服務 SHALL 正常退出而不強制終止
7. IF 所有現有請求在 30 秒內成功完成處理，THEN THE 微服務 SHALL 正常退出而不強制終止
8. WHEN 發生未捕獲的錯誤，THE 微服務 SHALL 記錄錯誤詳情（包含錯誤類型、錯誤消息和堆棧跟蹤）並指示內部服務器錯誤
9. THE 微服務 SHALL 使用 panic recovery 機制捕獲 panic
10. WHEN 捕獲到 panic，THE 微服務 SHALL 記錄 panic 詳情（包含 panic 值和堆棧跟蹤）並指示內部服務器錯誤
11. WHEN 捕獲到 panic，THE 微服務 SHALL 繼續運行而不崩潰

### Requirement 10: 微服務間通訊

**User Story:** 作為系統架構師，我希望微服務之間能夠高效通訊，以便實現功能協作。

#### Acceptance Criteria

1. WHEN Device_Service 需要發布命令時，THE Device_Service SHALL 通過 HTTP 調用 MQTT_Service 的命令發布端點
2. WHEN MQTT_Service 需要廣播消息時，THE MQTT_Service SHALL 通過 HTTP 調用 WebSocket_Service 的廣播端點
3. WHEN API_Gateway 需要驗證令牌時，THE API_Gateway SHALL 通過 HTTP 調用 Auth_Service 的令牌驗證端點
4. WHEN 微服務調用其他微服務時，THE 微服務 SHALL 設置 5 秒的請求超時時間
5. WHEN 微服務調用其他微服務時，IF 調用因網絡錯誤或超時失敗，THEN THE 微服務 SHALL 重試最多 3 次，每次重試間隔 1 秒
6. WHEN 微服務調用失敗，THE 調用方 SHALL 記錄錯誤（包含目標服務、錯誤類型和錯誤消息）並返回錯誤狀態指示
7. WHEN 微服務調用其他微服務時，THE 微服務 SHALL 在請求頭中傳遞請求 ID
8. IF 微服務調用在 5 秒內超時，THEN THE 調用方 SHALL 記錄超時錯誤並返回錯誤狀態指示
9. IF 微服務調用重試 3 次後仍然失敗，THEN THE 調用方 SHALL 記錄重試耗盡錯誤並返回錯誤狀態指示

### Requirement 11: 容器化和部署

**User Story:** 作為運維人員，我希望微服務能夠容器化部署，以便簡化部署和擴展。

#### Acceptance Criteria

1. THE API_Gateway、Auth_Service、Device_Service、MQTT_Service 和 WebSocket_Service SHALL 各自有獨立的 Dockerfile
2. THE Dockerfile SHALL 使用多階段構建，包含構建階段和運行階段
3. THE Dockerfile 的運行階段 SHALL 使用非 root 用戶（UID >= 1000）運行服務
4. THE Dockerfile SHALL 暴露服務監聽的端口
5. WHEN 從 Dockerfile 構建的容器啟動時，THE 容器 SHALL 在 30 秒內通過健康檢查端點驗證服務正常運行
6. THE 項目 SHALL 提供 docker-compose.yml 配置文件用於本地開發
7. THE docker-compose.yml SHALL 定義 API_Gateway、Auth_Service、Device_Service、MQTT_Service、WebSocket_Service、Database（PostgreSQL）和 MQTT_Broker 服務
8. THE docker-compose.yml SHALL 配置所有微服務在同一個 Docker 網絡中以便相互通訊
9. THE 微服務 SHALL 支援通過環境變數 MQTT_BROKER、DATABASE_URL 和 JWT_SECRET 配置外部依賴
10. IF 必需的環境變數（MQTT_BROKER、DATABASE_URL、JWT_SECRET）未設置，THEN THE 微服務 SHALL 記錄錯誤並以非零退出碼終止
11. IF Dockerfile 構建失敗，THEN THE 構建過程 SHALL 以非零退出碼終止

### Requirement 12: 向後兼容性

**User Story:** 作為前端開發者，我希望 API 接口保持兼容，以便無需修改前端代碼。

#### Acceptance Criteria

1. THE API_Gateway SHALL 保持以下 REST API 端點路徑和 HTTP 方法不變：POST /api/v1/auth/login、GET /api/v1/devices、GET /api/v1/devices/:id/status、GET /api/v1/devices/:id/history、POST /api/v1/devices/:id/command
2. THE API_Gateway SHALL 保持 WebSocket 端點路徑 /ws 不變，並支援通過查詢參數 token 傳遞 JWT 令牌
3. WHEN 收到 POST /api/v1/auth/login 請求，THE API_Gateway SHALL 接受 JSON 格式請求體包含 username（字串）和 password（字串）欄位
4. WHEN 登入成功，THE API_Gateway SHALL 返回 JSON 格式響應包含 token（字串）和 expiresIn（整數，秒）欄位
5. WHEN 收到 GET /api/v1/devices 請求，THE API_Gateway SHALL 返回 JSON 格式響應包含 devices 陣列，每個設備包含 id（字串）、name（字串）、online（布林）和 lastHeartbeat（ISO 8601 時間戳字串）欄位
6. WHEN 收到 GET /api/v1/devices/:id/status 請求，THE API_Gateway SHALL 返回 JSON 格式響應包含 id（字串）、online（布林）、lastHeartbeat（ISO 8601 時間戳字串）和 state（物件）欄位
7. WHEN 收到 GET /api/v1/devices/:id/history 請求，THE API_Gateway SHALL 返回 JSON 格式響應包含 events 陣列，每個事件包含 id（整數）、deviceId（字串）、type（字串）、data（物件）和 timestamp（ISO 8601 時間戳字串）欄位
8. WHEN 收到 POST /api/v1/devices/:id/command 請求，THE API_Gateway SHALL 接受 JSON 格式請求體包含 command（字串）欄位
9. THE API_Gateway SHALL 在 Authorization 標頭中接受格式為 "Bearer <token>" 的 JWT 令牌
10. THE API_Gateway SHALL 生成有效期為 3600 秒（1 小時）的 JWT 令牌
11. WHEN 發生錯誤，THE API_Gateway SHALL 返回 JSON 格式錯誤響應包含 error（字串）和 message（字串）欄位
12. THE Database SHALL 使用現有的資料庫 schema，包含 users 表（id, username, password_hash）、devices 表（id, name, last_heartbeat）和 events 表（id, device_id, type, data, timestamp）
13. THE Database schema SHALL 不修改現有表的欄位名稱和數據類型
14. THE MQTT_Service SHALL 使用現有的 MQTT 主題結構：esp/devices/:id/status（用於接收設備狀態）和 esp/devices/:id/command（用於發送命令到設備）

