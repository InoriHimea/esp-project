# ESP 控制平台 — 技术设计文档

## 概述

本文档描述 ESP 控制平台的技术架构和实现设计，涵盖 esp-server、esp-ui、esp32_motor 固件和 Docker 部署四个组件。

---

## 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         Unraid Server                           │
│                                                                 │
│  ┌──────────┐    MQTT     ┌─────────────┐   WS/REST  ┌───────┐ │
│  │ ESP32    │ ──────────► │             │ ──────────► │       │ │
│  │ motor-01 │ ◄────────── │  esp-server │             │esp-ui │ │
│  └──────────┘  command    │  :3000      │ ◄────────── │ :80   │ │
│                           └──────┬──────┘   REST      └───────┘ │
│  ┌──────────┐                    │                               │
│  │  MQTT    │                    ▼                               │
│  │ Broker   │             ┌─────────────┐                        │
│  │ :1883    │             │ PostgreSQL  │                        │
│  └──────────┘             │    17       │                        │
│                           └─────────────┘                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 一、esp-server

### 1.1 技术栈

| 项目 | 选型 | 版本 |
|------|------|------|
| Runtime | Node.js | 22 LTS |
| Framework | Fastify | v5 |
| 语言 | TypeScript | ~5.x |
| MQTT 客户端 | mqtt (npm) | ^5.x |
| 数据库客户端 | postgres.js | ^3.x |
| 认证 | @fastify/jwt | ^9.x |
| WebSocket | @fastify/websocket | ^10.x |
| API 文档 | @fastify/swagger + @fastify/swagger-ui | latest |
| 密码哈希 | bcrypt | ^5.x |

### 1.2 目录结构

```
esp-server/
├── src/
│   ├── index.ts              # 入口，注册插件和路由
│   ├── auth/
│   │   ├── plugin.ts         # @fastify/jwt 注册 + preHandler hook
│   │   └── routes.ts         # POST /api/v1/auth/login
│   ├── mqtt/
│   │   ├── client.ts         # MQTT 连接管理 + 重连逻辑
│   │   └── handler.ts        # status topic 处理：DB upsert + WS 广播
│   ├── routes/
│   │   ├── devices.ts        # GET /devices, GET /devices/:id/status, etc.
│   │   └── health.ts         # GET /health
│   ├── ws/
│   │   └── handler.ts        # WS 连接管理 + 广播
│   └── db/
│       ├── schema.sql        # 建表 SQL
│       ├── client.ts         # postgres.js 实例
│       └── queries.ts        # 所有 SQL 查询函数
├── Dockerfile
├── package.json
└── tsconfig.json
```

### 1.3 认证流程

```
POST /api/v1/auth/login
  → 查询 users 表验证 bcrypt hash
  → 签发 JWT (HS256, 24h, payload: { sub: userId, username })
  → 返回 { token: "..." }

受保护路由:
  → preHandler: fastify.authenticate
  → 验证 Authorization: Bearer <token>
  → 失败返回 401
```

### 1.4 MQTT 客户端设计

```typescript
// mqtt/client.ts
- 连接时订阅 esp/devices/+/status（通配符）
- 断线自动重连（指数退避，最大 30s）
- 暴露 publish(topic, payload) 方法供路由调用
- 连接状态暴露给健康检查端点

// mqtt/handler.ts
- 解析 topic 提取 device_id
- 解析 JSON payload
- 调用 db.upsertDevice() 和 db.insertEvent()
- 调用 wsManager.broadcast()
```

### 1.5 WebSocket 管理

```typescript
// ws/handler.ts
class WsManager {
  private clients: Set<WebSocket>
  
  add(ws, token)    // 验证 token，加入集合
  remove(ws)        // 从集合移除
  broadcast(msg)    // 向所有客户端发送
}
```

### 1.6 数据库 Schema

```sql
-- db/schema.sql

CREATE TABLE IF NOT EXISTS users (
  id       SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL  -- bcrypt hash
);

CREATE TABLE IF NOT EXISTS devices (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,
  name        TEXT,
  ip          TEXT,
  last_seen   TIMESTAMPTZ,
  last_status JSONB
);

CREATE TABLE IF NOT EXISTS device_events (
  id        BIGSERIAL PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES devices(id),
  ts        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload   JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_device_events_device_ts
  ON device_events (device_id, ts DESC);
```

### 1.7 REST API 设计

| Method | Path | Auth | 说明 |
|--------|------|------|------|
| POST | `/api/v1/auth/login` | ❌ | 登录，返回 JWT |
| GET | `/api/v1/devices` | ✅ | 设备列表（含在线状态） |
| GET | `/api/v1/devices/:id/status` | ✅ | 最新状态 |
| POST | `/api/v1/devices/:id/command` | ✅ | 下发指令 → MQTT |
| GET | `/api/v1/devices/:id/history` | ✅ | 历史事件（分页） |
| GET | `/health` | ❌ | 健康检查 |

在线状态判断：`last_seen > NOW() - INTERVAL '30 seconds'`

### 1.8 环境变量

```env
PORT=3000
MQTT_BROKER=mqtt://192.168.1.x:1883
MQTT_USERNAME=
MQTT_PASSWORD=
DATABASE_URL=postgresql://user:pass@host:5432/espdb
JWT_SECRET=change-me-in-production
ADMIN_USER=admin
ADMIN_PASSWORD=changeme
```

---

## 二、esp-ui

### 2.1 技术栈

| 项目 | 选型 |
|------|------|
| 框架 | React 19 |
| 语言 | TypeScript |
| 构建工具 | Vite |
| 样式 | Tailwind CSS v4 |
| 图标 | lucide-react |
| 路由 | react-router-dom v7 |
| HTTP 客户端 | fetch API（封装） |

### 2.2 目录结构

```
esp-ui/
├── src/
│   ├── main.tsx
│   ├── App.tsx               # 路由配置 + AuthGuard
│   ├── auth/
│   │   ├── LoginPage.tsx
│   │   ├── AuthGuard.tsx     # 未登录重定向
│   │   └── tokenStore.ts     # localStorage 封装
│   ├── api/
│   │   └── client.ts         # fetch 封装，自动附加 Authorization 头
│   ├── ws/
│   │   └── useDeviceWs.ts    # WS hook，管理连接和消息
│   ├── layout/
│   │   ├── Shell.tsx         # 整体布局（侧边栏 + 顶栏）
│   │   ├── Sidebar.tsx       # 桌面侧边栏
│   │   └── BottomTabBar.tsx  # 移动端底部导航
│   └── modules/
│       ├── dashboard/
│       │   ├── DashboardPage.tsx
│       │   └── DeviceCard.tsx
│       ├── motor/
│       │   └── MotorPage.tsx  # 原 App.tsx 内容迁入
│       ├── debug/
│       │   └── DebugPage.tsx
│       └── settings/
│           └── SettingsPage.tsx
├── Dockerfile
├── vite.config.ts
└── package.json
```

### 2.3 路由结构

```typescript
// App.tsx
<Routes>
  <Route path="/login" element={<LoginPage />} />
  <Route element={<AuthGuard><Shell /></AuthGuard>}>
    <Route path="/" element={<DashboardPage />} />
    <Route path="/motor/:deviceId" element={<MotorPage />} />
    <Route path="/debug/:deviceId" element={<DebugPage />} />
    <Route path="/settings" element={<SettingsPage />} />
  </Route>
</Routes>
```

### 2.4 认证状态管理

```typescript
// auth/tokenStore.ts
export const getToken = () => localStorage.getItem('jwt')
export const setToken = (t: string) => localStorage.setItem('jwt', t)
export const clearToken = () => localStorage.removeItem('jwt')

// api/client.ts
// 所有请求自动附加 Authorization 头
// 收到 401 时调用 clearToken() 并跳转 /login
```

### 2.5 WS Hook

```typescript
// ws/useDeviceWs.ts
function useDeviceWs(): Map<string, DeviceStatus> {
  // 连接 VITE_SERVER_WS?token=<jwt>
  // 收到消息更新 Map<device_id, status>
  // 组件卸载时关闭连接
  // 返回实时状态 Map
}
```

### 2.6 环境变量

```env
VITE_SERVER_API=http://192.168.1.21:3000/api/v1
VITE_SERVER_WS=ws://192.168.1.21:3000/ws
```

---

## 三、esp32_motor 固件

### 3.1 新增依赖

```ini
; platformio.ini
lib_deps =
  knolleary/PubSubClient @ ^2.8
  bblanchon/ArduinoJson @ ^7.x   ; 已有
```

### 3.2 NVS 新增 Key

| Key | 类型 | 说明 |
|-----|------|------|
| `mqtt_broker` | String | MQTT Broker IP，如 "192.168.1.50" |
| `mqtt_port` | UInt16 | MQTT 端口，默认 1883 |
| `device_id` | String | 设备 ID，如 "motor-01" |

### 3.3 主循环设计

```cpp
// main.cpp 新增逻辑

void setup() {
  // ... 现有初始化 ...
  loadMqttConfig();      // 从 NVS 读取 mqtt_broker, mqtt_port, device_id
  connectWifi();
  connectMqtt();         // 连接并订阅 command topic
}

void loop() {
  // ... 现有逻辑 ...
  mqttClient.loop();     // 处理 MQTT 消息
  
  if (millis() - lastStatusMs >= 500) {
    publishStatus();     // 每 500ms 发布状态
    lastStatusMs = millis();
  }
  
  if (!mqttClient.connected()) {
    reconnectMqtt();     // 断线重连
  }
}
```

### 3.4 Status Payload

```json
{
  "device_type": "motor",
  "state": "running|stopped|braking|coasting",
  "speed": 800,
  "speed_pct": "78.2",
  "direction": "forward|backward",
  "uptime_ms": 12345,
  "ip": "192.168.1.100"
}
```

### 3.5 WiFi 配置页扩展

AP 模式下 `POST /api/wifi` 请求体新增字段：

```json
{
  "ssid": "MyNet",
  "password": "secret",
  "mqtt_broker": "192.168.1.50",
  "mqtt_port": 1883,
  "device_id": "motor-01"
}
```

---

## 四、Docker 部署

### 4.1 网络架构

使用 Unraid 已有 macvlan 网络，两个容器各获得独立 IP：
- esp-server: `${ESP_SERVER_IP}` (如 192.168.1.21)
- esp-ui: `${ESP_UI_IP}` (如 192.168.1.22)

不新建 PostgreSQL 容器，直接连接 Unraid 上已有的 PG17。

### 4.2 esp-server Dockerfile

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### 4.3 esp-ui Dockerfile

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
ARG VITE_SERVER_API
ARG VITE_SERVER_WS
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

### 4.4 docker-compose.yml

```yaml
networks:
  unraid_macvlan:
    external: true
    name: ${MACVLAN_NETWORK}

services:
  esp-server:
    build: ../esp-server
    restart: unless-stopped
    networks:
      unraid_macvlan:
        ipv4_address: ${ESP_SERVER_IP}
    env_file: .env

  esp-ui:
    build:
      context: ../esp-ui
      args:
        VITE_SERVER_API: http://${ESP_SERVER_IP}:3000/api/v1
        VITE_SERVER_WS: ws://${ESP_SERVER_IP}:3000/ws
    restart: unless-stopped
    networks:
      unraid_macvlan:
        ipv4_address: ${ESP_UI_IP}
    depends_on: [esp-server]
```

---

## 五、正确性属性（用于属性测试）

1. **认证不变量**：任何未携带有效 JWT 的请求（除 `/auth/login` 和 `/health`）必须返回 401。
2. **MQTT 路由正确性**：发布到 `esp/devices/X/command` 的消息必须且仅被 device_id 为 X 的设备接收。
3. **状态单调性**：`devices.last_seen` 只能随时间增大，不能回退。
4. **WS 广播完整性**：每条 MQTT status 消息必须广播给所有当前已连接的已认证 WS 客户端。
5. **事件持久性**：每条 MQTT status 消息必须在 `device_events` 表中产生恰好一条记录。
6. **IP 动态性**：`devices.ip` 必须始终反映设备最近一次上报的 IP 地址。
