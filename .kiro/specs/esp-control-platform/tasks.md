# ESP 控制平台 — 实施任务列表

## 任务依赖图

```
T1 (DB Schema)
  └─► T2 (esp-server 基础)
        ├─► T3 (认证模块)
        │     └─► T4 (设备 API)
        │           └─► T5 (MQTT 桥接)
        │                 └─► T6 (WS 推送)
        │                       └─► T10 (集成测试)
        └─► T7 (esp-ui 基础)
              ├─► T8 (esp-ui 模块)
              │     └─► T10
              └─► T9 (固件 MQTT)
                    └─► T10
T11 (Docker) ─► T12 (部署验证)
```

---

## T1：数据库 Schema 初始化

- [x] 创建 `esp-server/src/db/schema.sql`，包含 `users`、`devices`、`device_events` 三张表及索引
- [x] 创建 `esp-server/src/db/client.ts`，初始化 postgres.js 连接池（读取 `DATABASE_URL`）
- [x] 创建 `esp-server/src/db/queries.ts`，实现以下函数：
  - `upsertDevice(id, type, ip, lastStatus)`
  - `insertEvent(deviceId, payload)`
  - `getDevices()`
  - `getDeviceStatus(id)`
  - `getDeviceHistory(id, limit, offset)`
  - `findUserByUsername(username)`
  - `createUserIfNotExists(username, passwordHash)`
- [x] 编写 schema 迁移脚本，在 esp-server 启动时自动执行 `CREATE TABLE IF NOT EXISTS`

**验收**：连接 PG17 后三张表成功创建，查询函数单元测试通过。

---

## T2：esp-server 项目基础搭建

- [x] 初始化 `esp-server/` 目录，创建 `package.json`（依赖：fastify v5、@fastify/jwt、@fastify/websocket、@fastify/swagger、@fastify/swagger-ui、mqtt、postgres、bcrypt、typescript）
- [x] 配置 `tsconfig.json`（target: ES2022, module: NodeNext）
- [x] 创建 `esp-server/src/index.ts`：
  - 注册所有 Fastify 插件
  - 注册路由
  - 启动时执行 DB 迁移
  - 启动时创建初始管理员用户（读取 `ADMIN_USER`/`ADMIN_PASSWORD` 环境变量）
- [x] 配置 `GET /health` 端点（无需认证，返回 MQTT 和 DB 连接状态）
- [x] 配置 Swagger UI 在 `/docs` 可访问

**验收**：`npm run dev` 启动成功，`/health` 返回 200，`/docs` 可访问。

---

## T3：JWT 认证模块

- [x] 创建 `esp-server/src/auth/plugin.ts`：注册 `@fastify/jwt`，配置 `JWT_SECRET`，添加 `fastify.authenticate` preHandler
- [x] 创建 `esp-server/src/auth/routes.ts`：实现 `POST /api/v1/auth/login`
  - 验证请求体（username, password）
  - 查询 DB 验证 bcrypt hash
  - 签发 JWT（24h 有效期，payload 含 sub 和 username）
  - 返回 `{ token: "..." }`
- [x] 为所有受保护路由添加 `preHandler: [fastify.authenticate]`
- [x] 编写认证单元测试：
  - 有效凭据 → 返回 token
  - 无效凭据 → 401
  - 无 token 访问受保护路由 → 401
  - 有效 token 访问受保护路由 → 200

**验收**：认证测试全部通过，Swagger UI 中登录端点可正常调用。

---

## T4：设备 REST API

- [x] 创建 `esp-server/src/routes/devices.ts`，实现：
  - `GET /api/v1/devices`：返回设备列表，计算在线状态（`last_seen > NOW() - 30s`）
  - `GET /api/v1/devices/:id/status`：返回最新状态
  - `POST /api/v1/devices/:id/command`：验证 cmd 字段，发布到 MQTT
  - `GET /api/v1/devices/:id/history`：支持 limit/offset 分页
- [x] 为所有设备路由添加 Fastify Schema 验证（请求体和响应体）
- [x] 编写 API 集成测试（使用 fastify.inject）

**验收**：所有设备 API 端点测试通过，Swagger 文档自动生成。

---

## T5：MQTT 桥接模块

- [x] 创建 `esp-server/src/mqtt/client.ts`：
  - 连接 MQTT Broker（读取 `MQTT_BROKER`、`MQTT_USERNAME`、`MQTT_PASSWORD`）
  - 订阅 `esp/devices/+/status`
  - 实现指数退避重连（初始 1s，最大 30s）
  - 暴露 `publish(topic, payload)` 方法
  - 暴露 `isConnected()` 状态
- [x] 创建 `esp-server/src/mqtt/handler.ts`：
  - 解析 topic 提取 device_id
  - 解析 JSON payload（异常时记录日志，不崩溃）
  - 调用 `db.upsertDevice()` 和 `db.insertEvent()`
  - 调用 `wsManager.broadcast()`
- [x] 将 MQTT 连接状态暴露给 `/health` 端点

**验收**：模拟 MQTT 消息后，DB 中 devices 和 device_events 表有对应记录。

---

## T6：WebSocket 推送模块

- [x] 创建 `esp-server/src/ws/handler.ts`：
  - 实现 `WsManager` 类（Set 管理已连接客户端）
  - `add(ws, token)`：验证 JWT，失败则关闭连接（code 4001）
  - `remove(ws)`：从集合移除
  - `broadcast(msg)`：向所有客户端发送 JSON 消息
- [x] 注册 `GET /ws` WebSocket 路由（通过 `@fastify/websocket`）
  - 从 query param 读取 token 并验证
  - 连接成功后加入 WsManager
  - 断开时从 WsManager 移除
- [x] 编写 WS 测试：
  - 无效 token → 连接被关闭
  - 有效 token → 连接成功，能收到广播消息

**验收**：WS 连接测试通过，MQTT 消息触发后 WS 客户端收到广播。

---

## T7：esp-ui 项目基础搭建

- [x] 将 `react_frontend/` 重命名为 `esp-ui/`
- [x] 安装新依赖：`react-router-dom@^7`
- [x] 创建 `esp-ui/src/auth/tokenStore.ts`（localStorage 封装）
- [x] 创建 `esp-ui/src/api/client.ts`：
  - 封装 fetch，自动附加 `Authorization: Bearer <token>` 头
  - 收到 401 时清除 token 并跳转 `/login`
- [x] 创建 `esp-ui/src/auth/AuthGuard.tsx`（未登录重定向到 `/login`）
- [x] 创建 `esp-ui/src/auth/LoginPage.tsx`（调用 `POST /api/v1/auth/login`，成功后存 token 并跳转 `/`）
- [x] 配置 `esp-ui/src/App.tsx` 路由结构（见设计文档 2.3）

**验收**：未登录访问 `/` 自动跳转 `/login`，登录成功后跳转首页。

---

## T8：esp-ui 页面模块

- [x] 创建 `esp-ui/src/layout/Shell.tsx`（侧边栏 + 顶栏布局）
- [x] 创建 `esp-ui/src/layout/Sidebar.tsx`（桌面端导航菜单）
- [x] 创建 `esp-ui/src/layout/BottomTabBar.tsx`（移动端底部导航）
- [x] 创建 `esp-ui/src/ws/useDeviceWs.ts` hook（管理 WS 连接，返回实时设备状态 Map）
- [x] 创建 `esp-ui/src/modules/dashboard/DashboardPage.tsx`：
  - 使用 `useDeviceWs` 获取实时状态
  - 渲染设备卡片列表
- [x] 创建 `esp-ui/src/modules/dashboard/DeviceCard.tsx`（显示在线状态、类型图标、关键指标）
- [x] 将原 `App.tsx` 电机控制内容迁入 `esp-ui/src/modules/motor/MotorPage.tsx`：
  - 指令通过 `POST /api/v1/devices/:id/command` 发送
  - 实时状态通过 WS 接收
- [x] 创建 `esp-ui/src/modules/debug/DebugPage.tsx`：
  - 从 API 动态获取设备 IP
  - 提供直连 ESP32 HTTP API 的调试面板
  - 明确标注"调试模式，绕过服务端"
- [x] 创建 `esp-ui/src/modules/settings/SettingsPage.tsx`（修改密码）
- [x] 实现响应式布局（桌面侧边栏 / 移动底部 Tab Bar）

**验收**：所有页面可正常访问，Dashboard 实时更新，Motor 控制指令可发送。

---

## T9：esp32_motor 固件 MQTT 支持

- [x] 在 `platformio.ini` 的 `lib_deps` 中追加 `knolleary/PubSubClient @ ^2.8`
- [x] 在 `esp32_motor/src/main.cpp` 中新增：
  - NVS 读取函数：`loadMqttConfig()`（读取 mqtt_broker、mqtt_port、device_id）
  - MQTT 连接函数：`connectMqtt()`（连接并订阅 command topic）
  - MQTT 重连函数：`reconnectMqtt()`（断线自动重连）
  - 状态发布函数：`publishStatus()`（每 500ms 发布含 ip 的 status JSON）
  - 指令处理回调：`onMqttMessage()`（解析 JSON，执行电机操作）
- [x] 扩展 AP 模式配置页 HTML，新增 MQTT 配置区块（mqtt_broker、mqtt_port、device_id 输入框）
- [x] 扩展 `POST /api/wifi` 处理函数，解析并保存新增的 MQTT 配置字段到 NVS
- [x] 保留现有 HTTP/WS API，不删除

**验收**：固件编译通过，ESP32 上电后自动连接 MQTT，每 500ms 可在 Broker 上看到 status 消息，发送 command 消息后电机响应。

---

## T10：端到端集成测试

- [x] 编写集成测试脚本，验证完整数据流：
  - 模拟 ESP32 发布 MQTT status → 验证 DB 记录 + WS 广播
  - 前端发送 command → 验证 MQTT 消息发布
- [x] 验证认证流程：登录 → 获取 token → 访问受保护 API
- [x] 验证 WS 连接：有效 token 连接 → 收到实时广播
- [x] 验证设备离线检测：停止 MQTT 上报 30s 后，API 返回 `online: false`

**验收**：所有集成测试通过，数据流端到端验证完整。

---

## T11：Docker 容器化

- [x] 创建 `esp-server/Dockerfile`（多阶段构建，Node.js 22 Alpine）
- [x] 创建 `esp-ui/Dockerfile`（多阶段构建，Vite build + Nginx Alpine）
- [x] 创建 `esp-ui/nginx.conf`（SPA 路由支持，`try_files $uri /index.html`）
- [x] 创建 `docker/docker-compose.yml`（macvlan 网络，两个服务）
- [x] 创建 `docker/.env.example`（所有环境变量模板）
- [x] 验证 `VITE_SERVER_API` 和 `VITE_SERVER_WS` 通过 build args 正确注入

**验收**：`docker compose up -d --build` 成功，两个容器运行，各自 IP 可访问。

---

## T12：部署验证

- [x] 在 Unraid 上执行完整部署流程
- [x] 验证 esp-server 能连接 PostgreSQL 17
- [x] 验证 esp-server 能连接 MQTT Broker
- [x] 验证 esp-ui 可通过 `ESP_UI_IP` 访问
- [x] 验证 ESP32 固件连接 MQTT 后，Dashboard 实时显示设备状态
- [x] 验证从 Dashboard 发送指令后电机响应

**验收**：完整系统在 Unraid 上运行，ESP32 → MQTT → esp-server → WS → esp-ui 全链路验证通过。
