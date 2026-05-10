# ESP 控制平台 — 需求文档

## 简介

本项目将现有的 ESP32 电机控制原型改造为一个完整的、生产就绪的 IoT 控制平台。核心改造包括：引入 MQTT 作为主控制通道、添加 JWT 全局认证、构建 Node.js 后端服务（esp-server）、重构前端（esp-ui）并支持多设备管理，以及为 ESP32 固件添加 MQTT 支持。所有组件通过 Docker 部署在 Unraid 服务器上，连接已有的 PostgreSQL 17 数据库。

## 术语表

| 术语 | 定义 |
|------|------|
| esp-server | Node.js 后端服务，负责 MQTT 桥接、REST API、WS 推送和认证 |
| esp-ui | React 前端应用，原 react_frontend 重命名 |
| esp32_motor | ESP32 固件，控制电机并通过 MQTT 上报状态 |
| MQTT Broker | 消息中间件，运行在 Unraid 上（如 Mosquitto） |
| device_id | 设备唯一标识符，如 "motor-01" |
| JWT | JSON Web Token，用于 API 和 WS 认证 |
| NVS | ESP32 非易失性存储，用于保存 WiFi 和 MQTT 配置 |
| macvlan | Docker 网络模式，使容器获得独立 IP |

---

## 需求一：用户认证系统

**用户故事：** 作为管理员，我希望通过用户名和密码登录系统，以便安全地访问所有控制功能。

### 验收标准

1. WHEN 用户向 `POST /api/v1/auth/login` 发送有效的用户名和密码 THEN 系统 SHALL 返回一个有效期为 24 小时的 JWT access token。
2. WHEN 用户向 `POST /api/v1/auth/login` 发送无效凭据 THEN 系统 SHALL 返回 HTTP 401 状态码。
3. WHEN 系统首次启动时 THEN 系统 SHALL 读取环境变量 `ADMIN_USER` 和 `ADMIN_PASSWORD`，将 bcrypt 哈希后的密码存入 `users` 表（若用户不存在）。
4. WHEN 请求受保护的 API 端点时未携带有效 JWT THEN 系统 SHALL 返回 HTTP 401 状态码并拒绝请求。
5. WHEN 请求受保护的 API 端点时携带有效 JWT THEN 系统 SHALL 允许请求通过并处理。
6. WHERE `/api/v1/auth/login` 和 `/health` 端点 THEN 系统 SHALL 不要求 JWT 认证。
7. WHEN 用户在 esp-ui 登录成功后 THEN 前端 SHALL 将 JWT 存储在 `localStorage` 中，并在所有后续请求中自动附加 `Authorization: Bearer <token>` 头。
8. WHEN 前端收到 HTTP 401 响应时 THEN 前端 SHALL 清除本地 token 并自动跳转到 `/login` 页面。
9. WHEN 用户未登录时访问任何受保护路由 THEN 前端 SHALL 重定向到 `/login` 页面。

---

## 需求二：设备状态管理

**用户故事：** 作为系统，我希望持续追踪所有 ESP32 设备的最新状态，以便用户能实时了解设备运行情况。

### 验收标准

1. WHEN esp-server 收到 `esp/devices/{device_id}/status` MQTT 消息时 THEN 系统 SHALL 对 `devices` 表执行 UPSERT，更新 `last_seen`、`last_status` 和 `ip` 字段。
2. WHEN esp-server 收到 status 消息时 THEN 系统 SHALL 同时向 `device_events` 表插入一条记录，包含时间戳和完整 payload。
3. WHEN 调用 `GET /api/v1/devices` 时 THEN 系统 SHALL 返回所有设备列表，每个设备包含 `id`、`type`、`name`、`ip`、`last_seen` 和 `last_status` 字段。
4. WHEN 调用 `GET /api/v1/devices/:id/status` 时 THEN 系统 SHALL 返回指定设备的最新状态信息。
5. WHEN 调用 `GET /api/v1/devices/:id/history` 时 THEN 系统 SHALL 支持 `limit`（默认 50）和 `offset`（默认 0）查询参数，返回该设备的历史事件列表，按时间倒序排列。
6. WHEN 设备超过 30 秒未上报状态时 THEN `GET /api/v1/devices` 返回的该设备 SHALL 标记为离线状态（`online: false`）。

---

## 需求三：MQTT 指令下发

**用户故事：** 作为用户，我希望通过 Web 界面向 ESP32 设备发送控制指令，以便远程控制电机运行。

### 验收标准

1. WHEN 调用 `POST /api/v1/devices/:id/command` 并携带有效指令时 THEN 系统 SHALL 将指令发布到 `esp/devices/{device_id}/command` MQTT topic。
2. WHEN 下发指令时 THEN 请求体 SHALL 支持 `cmd`（run/stop/brake/coast）、`speed`（0-1023）、`direction`（forward/backward）和 `ramp_ms` 字段。
3. WHEN `cmd` 字段值不在 `run|stop|brake|coast` 范围内时 THEN 系统 SHALL 返回 HTTP 400 错误。
4. WHEN ESP32 收到 `esp/devices/{device_id}/command` 消息时 THEN 固件 SHALL 解析 JSON 并执行对应的电机操作。
5. WHEN MQTT 发布成功时 THEN `POST /api/v1/devices/:id/command` SHALL 返回 HTTP 200 和成功确认。
6. WHEN MQTT 连接断开时 THEN esp-server SHALL 返回 HTTP 503 错误，提示 MQTT 不可用。

---

## 需求四：WebSocket 实时推送

**用户故事：** 作为用户，我希望在 Dashboard 上实时看到所有设备的状态更新，无需手动刷新页面。

### 验收标准

1. WHEN 客户端连接 `ws://<server>:3000/ws?token=<jwt>` 时 THEN 系统 SHALL 验证 token 有效性，无效则立即关闭连接（code 4001）。
2. WHEN esp-server 收到任意设备的 MQTT status 消息时 THEN 系统 SHALL 向所有已认证的 WS 客户端广播消息，格式为 `{ "type": "status", "device_id": "...", "payload": {...} }`。
3. WHEN WS 客户端断开连接时 THEN 系统 SHALL 从广播列表中移除该客户端，不影响其他连接。
4. WHEN esp-ui Dashboard 页面加载时 THEN 前端 SHALL 自动建立 WS 连接，token 通过 query param 传入。
5. WHEN 前端收到 WS status 消息时 THEN Dashboard SHALL 实时更新对应设备卡片的状态显示，无需重新请求 API。

---

## 需求五：ESP32 固件 MQTT 支持

**用户故事：** 作为 ESP32 设备，我希望通过 MQTT 与服务端通信，以便接受远程控制并上报实时状态。

### 验收标准

1. WHEN ESP32 WiFi 连接成功后 THEN 固件 SHALL 自动连接 NVS 中配置的 MQTT Broker。
2. WHEN MQTT 连接成功后 THEN 固件 SHALL 订阅 `esp/devices/{device_id}/command` topic，其中 `device_id` 从 NVS 读取。
3. WHEN MQTT 连接成功后 THEN 固件 SHALL 每 500ms 向 `esp/devices/{device_id}/status` 发布一次状态消息，包含 `device_type`、`state`、`speed`、`speed_pct`、`direction`、`uptime_ms` 和 `ip` 字段。
4. WHEN MQTT 连接断开时 THEN 固件 SHALL 自动尝试重连，不影响电机的本地运行。
5. WHEN 用户通过 AP 模式配置页提交配置时 THEN 固件 SHALL 将 `mqtt_broker`、`mqtt_port` 和 `device_id` 保存到 NVS。
6. WHEN 固件运行时 THEN HTTP/WS API SHALL 保持可用，用于调试目的，但不作为主控制路径。

---

## 需求六：前端界面与导航

**用户故事：** 作为用户，我希望通过统一的 Web 界面管理所有设备，界面在桌面和移动端都能良好显示。

### 验收标准

1. WHEN 用户访问 Dashboard（`/`）时 THEN 页面 SHALL 显示所有设备卡片，每张卡片包含在线状态、设备类型图标和关键指标。
2. WHEN 用户点击设备卡片时 THEN 前端 SHALL 导航到对应的 Motor Control 页面（`/motor/:deviceId`）。
3. WHEN 用户访问 Motor Control 页面时 THEN 页面 SHALL 显示电机控制界面，指令通过 `POST /api/v1/devices/:id/command` 发送。
4. WHEN 用户访问 Debug 页面（`/debug/:deviceId`）时 THEN 页面 SHALL 从 API 动态获取设备 IP，提供直连 ESP32 HTTP API 的调试面板，并明确标注"调试模式"。
5. WHEN 在桌面端访问时 THEN 布局 SHALL 显示左侧固定侧边栏（含导航菜单）和顶栏（含用户名和登出按钮）。
6. WHEN 在移动端访问时 THEN 布局 SHALL 折叠侧边栏，显示底部 Tab Bar 导航。
7. WHEN 用户访问 Settings 页面（`/settings`）时 THEN 页面 SHALL 提供修改密码功能。

---

## 需求七：Docker 容器化部署

**用户故事：** 作为运维人员，我希望通过 Docker Compose 一键部署整个平台，并能连接到已有的基础设施。

### 验收标准

1. WHEN 执行 `docker compose up -d --build` 时 THEN 系统 SHALL 成功构建并启动 esp-server 和 esp-ui 两个容器。
2. WHEN 容器启动时 THEN esp-server 和 esp-ui SHALL 各自获得独立的静态 IP 地址（通过 macvlan 网络）。
3. WHEN 配置 `DATABASE_URL` 环境变量时 THEN esp-server SHALL 连接到 Unraid 上已有的 PostgreSQL 17，不新建数据库容器。
4. WHEN esp-ui 构建时 THEN `VITE_SERVER_API` 和 `VITE_SERVER_WS` SHALL 通过 Docker build args 注入，指向 esp-server 的 IP。
5. WHEN 容器异常退出时 THEN Docker SHALL 自动重启容器（`restart: unless-stopped`）。
6. WHEN 项目初始化时 THEN 应提供 `.env.example` 文件，包含所有必要的环境变量模板。
