# ESP 控制平台 — 改造规格说明

> 版本: 0.3 · 日期: 2026-05-10

---

## 1. 核心架构原则

| 原则 | 说明 |
|------|------|
| **MQTT 为主** | 所有设备控制指令通过 MQTT 下发，ESP32 HTTP/WS 仅保留用于调试 |
| **IP 动态上报** | ESP32 通过 MQTT status 上报自身 IP，服务端存入 DB，前端从 API 读取，不写死 |
| **全局认证** | esp-server 所有 API 和 WS 连接均需 JWT 认证 |
| **已有 PostgreSQL 17** | 不在 Docker 中新建 DB 容器，直接连接 Unraid 上已有的 PG17 |

---

## 2. 目录结构

```
esp-project/
├── esp-server/
│   ├── src/
│   │   ├── auth/          # JWT 签发 + 验证中间件
│   │   ├── mqtt/          # MQTT 桥接 + topic 路由
│   │   ├── routes/        # REST 路由
│   │   ├── db/            # schema + queries (postgres.js)
│   │   └── index.ts
│   ├── Dockerfile
│   └── package.json
├── esp32_motor/
│   └── src/main.cpp       # 新增 MQTT + WiFi 配置页扩展
├── esp-ui/                # 原 react_frontend
│   ├── src/
│   │   ├── layout/        # Shell + 认证守卫
│   │   ├── modules/
│   │   │   ├── dashboard/ # 设备总览（WS 实时）
│   │   │   ├── motor/     # Motor 控制（指令走 esp-server → MQTT）
│   │   │   └── debug/     # 调试菜单（直连 ESP32 HTTP API）
│   │   ├── auth/          # 登录页 + token 管理
│   │   └── main.tsx
│   └── Dockerfile
└── docker/
    ├── docker-compose.yml
    └── .env.example
```

---

## 3. 数据流

```
┌─────────┐  MQTT status (500ms)   ┌─────────────┐  WS broadcast  ┌─────────┐
│ ESP32   │ ─────────────────────► │             │ ──────────────► │ esp-ui  │
│         │                        │  esp-server │                 │         │
│         │ ◄───────────────────── │             │ ◄────────────── │         │
└─────────┘  MQTT command          └─────────────┘  REST (authed)  └─────────┘
                                         │
                                         ▼
                                   PostgreSQL 17
                                   (devices, events)

调试路径（可选，需登录后在 Debug 菜单手动触发）：
esp-ui → 直连 ESP32 HTTP API（IP 从 DB 读取，非写死）
```

---

## 4. esp-server

### 4.1 技术栈

| 项目 | 选型 |
|------|------|
| Runtime | Node.js 22 LTS |
| Framework | Fastify v5 |
| MQTT | `mqtt` npm 包 |
| DB | `postgres` (postgres.js) → PG 17 |
| Auth | `@fastify/jwt` (HS256，secret 存 env) |
| Swagger | `@fastify/swagger` + `@fastify/swagger-ui` → `/docs` |
| WS | `@fastify/websocket` → `/ws` |
| 语言 | TypeScript |

### 4.2 认证

**登录**：`POST /api/v1/auth/login` → 返回 JWT (access token, 24h)

所有其他路由和 WS 连接均需 `Authorization: Bearer <token>` 头。

初始用户通过环境变量 `ADMIN_USER` / `ADMIN_PASSWORD` 配置（bcrypt hash 存 DB）。

### 4.3 MQTT Topic 约定

```
esp/devices/{device_id}/status      # ESP32 → Server
esp/devices/{device_id}/command     # Server → ESP32
```

**status payload**（ESP32 上报，每 500ms）：
```json
{
  "device_type": "motor",
  "state": "running",
  "speed": 800,
  "speed_pct": "78.2",
  "direction": "forward",
  "uptime_ms": 12345,
  "ip": "192.168.1.100"
}
```

Server 收到后：
1. UPSERT `devices`（更新 `last_seen`、`last_status`、`ip`）
2. INSERT `device_events`
3. 广播给所有已认证 WS 客户端

### 4.4 PostgreSQL Schema

```sql
CREATE TABLE users (
  id       SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL   -- bcrypt hash
);

CREATE TABLE devices (
  id          TEXT PRIMARY KEY,        -- device_id, e.g. "motor-01"
  type        TEXT NOT NULL,           -- "motor" | ...
  name        TEXT,
  ip          TEXT,                    -- 最新上报 IP（动态）
  last_seen   TIMESTAMPTZ,
  last_status JSONB
);

CREATE TABLE device_events (
  id        BIGSERIAL PRIMARY KEY,
  device_id TEXT NOT NULL REFERENCES devices(id),
  ts        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload   JSONB NOT NULL
);
CREATE INDEX ON device_events (device_id, ts DESC);
```

### 4.5 REST API（全部需 JWT）

Base: `/api/v1`

| Method | Path | 说明 |
|--------|------|------|
| POST | `/auth/login` | 登录，返回 JWT（**无需认证**） |
| GET | `/devices` | 设备列表（含 IP、在线状态） |
| GET | `/devices/:id/status` | 最新状态 |
| POST | `/devices/:id/command` | 下发指令 → MQTT |
| GET | `/devices/:id/history?limit=50&offset=0` | 历史事件 |
| GET | `/health` | 健康检查（**无需认证**） |

**POST /devices/:id/command body**：
```json
{ "cmd": "run|stop|brake|coast", "speed": 800, "direction": "forward", "ramp_ms": 2000 }
```

### 4.6 WS 推送

`ws://<server>:3000/ws?token=<jwt>`

连接时验证 token，失败则关闭连接。

广播消息格式：
```json
{ "type": "status", "device_id": "motor-01", "payload": { ...status } }
```

### 4.7 环境变量

```env
PORT=3000
MQTT_BROKER=mqtt://192.168.1.x:1883
MQTT_USERNAME=
MQTT_PASSWORD=
DATABASE_URL=postgresql://user:pass@192.168.1.x:5432/espdb
JWT_SECRET=change-me-in-production
ADMIN_USER=admin
ADMIN_PASSWORD=changeme
```

---

## 5. esp32_motor 固件改造

### 5.1 新增依赖

```ini
lib_deps 追加：
  knolleary/PubSubClient @ ^2.8
```

### 5.2 WiFi 配置页扩展（AP 模式门户）

现有配置页新增 MQTT 配置区块，`POST /api/wifi` body 扩展：

```json
{
  "ssid": "MyNet",
  "password": "secret",
  "mqtt_broker": "192.168.1.50",
  "mqtt_port": 1883,
  "device_id": "motor-01"
}
```

NVS 新增 key：`mqtt_broker`、`mqtt_port`、`device_id`

### 5.3 MQTT 行为

- WiFi 连接成功后自动连接 MQTT Broker
- 订阅 `esp/devices/{device_id}/command`，收到后执行电机操作
- 每 500ms 发布 status（含 `ip` 字段）
- HTTP/WS API **保留**，仅用于调试，不作为主控制路径
- MQTT 断线自动重连

---

## 6. esp-ui 前端

### 6.1 改名

`react_frontend/` → `esp-ui/`

### 6.2 技术栈

保持现有：React 19 + TypeScript + Vite + Tailwind CSS v4 + lucide-react

新增：`react-router-dom` v7

### 6.3 认证流程

- 未登录时所有路由重定向到 `/login`
- 登录成功后 JWT 存 `localStorage`，axios/fetch 拦截器自动附加 `Authorization` 头
- Token 过期（401 响应）自动跳回登录页

### 6.4 布局 Shell

```
桌面端：
┌──────────┬────────────────────────────────┐
│  侧边栏  │  顶栏（用户名 + 登出）           │
│          ├────────────────────────────────┤
│ Dashboard│         页面内容区              │
│ Motor ▶  │                                │
│ Debug    │                                │
│ Settings │                                │
└──────────┴────────────────────────────────┘

移动端：侧边栏折叠，底部 Tab Bar
```

### 6.5 模块说明

**Dashboard** (`/`)
- WS 实时接收所有设备状态（token 通过 query param 传入）
- 设备卡片：在线状态、类型图标、关键指标、点击进入控制页

**Motor Control** (`/motor/:deviceId`)
- 现有 App.tsx 全部内容迁入
- 指令通过 `POST /api/v1/devices/:id/command` 发送（→ MQTT → ESP32）
- 实时状态通过 WS 接收

**Debug** (`/debug/:deviceId`)
- 从 `GET /api/v1/devices/:id/status` 读取设备 IP（动态，非写死）
- 提供直连 ESP32 HTTP API 的调试面板（手动触发 GET/POST）
- 明确标注"调试模式，绕过服务端"

**Settings** (`/settings`)
- 修改密码

### 6.6 环境变量

```env
VITE_SERVER_API=http://192.168.1.21:3000/api/v1
VITE_SERVER_WS=ws://192.168.1.21:3000/ws
```

不再有 ESP32 直连地址（IP 从 API 动态获取）。

---

## 7. Docker 部署

### 7.1 网络

引用 Unraid 已有 macvlan 网络，不新建。不新建 PostgreSQL 容器（使用已有 PG17）。

### 7.2 docker-compose.yml

```yaml
networks:
  unraid_macvlan:
    external: true
    name: ${MACVLAN_NETWORK}   # Unraid 中的 macvlan 网络名，如 br0

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

### 7.3 .env.example

```env
MACVLAN_NETWORK=br0
ESP_SERVER_IP=192.168.1.21
ESP_UI_IP=192.168.1.22

MQTT_BROKER=mqtt://192.168.1.20:1883
MQTT_USERNAME=
MQTT_PASSWORD=

DATABASE_URL=postgresql://esp:password@192.168.1.23:5432/espdb

JWT_SECRET=change-me-in-production
ADMIN_USER=admin
ADMIN_PASSWORD=changeme
```

### 7.4 启动

```bash
cd docker && cp .env.example .env
# 编辑 .env
docker compose up -d --build
```

---

## 8. 实施顺序

1. `esp-ui/` — 重命名 + react-router-dom + 认证 + Shell + Motor 模块迁入 + Debug 模块
2. `esp-server/` — DB schema → 认证 → MQTT 桥接 → REST → WS 推送
3. `esp32_motor/` — WiFi 配置页扩展 + PubSubClient
4. `docker/` — docker-compose + Dockerfile × 2 + .env.example
