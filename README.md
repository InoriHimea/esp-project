# ESP 控制平台

[![Version](https://img.shields.io/badge/version-1.3.5-blue.svg)](https://github.com/InoriHimea/esp-project/releases/tag/v1.3.5)
[![License](https://img.shields.io/badge/license-AGPL--3.0--only-green.svg)](LICENSE)
[![Go](https://img.shields.io/badge/Go-1.26.3-00ADD8.svg)](https://go.dev/)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg)](https://react.dev/)

面向 ESP32 设备的控制平台，包含 Go 微服务后端、React 管理界面、MQTT/WebSocket 实时通道，以及两个 PlatformIO 固件项目：JGB37/DRV8871 马达控制器与电子墨水屏控制器。

**当前版本：v1.3.5**

## 项目概览

本项目把设备接入、状态采集、命令下发和 Web 管理拆分为几个清晰的层次：

- 后端通过 API Gateway 暴露统一 HTTP/WebSocket 入口。
- ESP32 设备通过 MQTT 上报状态并接收命令。
- PostgreSQL 保存设备信息、最后状态和事件历史。
- 前端根据设备上报的 `device_type` 自动进入马达、电子墨水屏或调试页面。
- CI 覆盖 Go 测试/构建/lint、React lint/build、PlatformIO 固件构建和 Docker 镜像构建。
- tag `vX.Y.Z` 会触发 Docker publish workflow，发布 GHCR 镜像并生成 release compose artifact。

## 当前能力

### 后端平台

- Go 1.26.3 微服务架构。
- JWT 登录认证和受保护 API。
- PostgreSQL 自动迁移和默认管理员初始化。
- MQTT 设备状态订阅：`esp/devices/+/status`。
- MQTT 设备命令发布：`esp/devices/{device_id}/command`。
- WebSocket 状态广播：`/ws?token=<jwt>`。
- 设备状态使用 JSONB 保存，可兼容不同类型设备的自定义状态字段。

### 前端 UI

- React 19 + TypeScript + Vite + TailwindCSS。
- 登录页、Dashboard、设置页和设备调试页。
- 马达设备页面：运行、停止、刹车、惰行、速度与方向控制。
- 电子墨水屏页面：文本显示、清屏、刷新、睡眠、唤醒。
- WebSocket 实时状态更新。
- 设备卡片根据 `motor` / `epaper` / `unknown` 路由到对应页面。

### ESP32 固件

| 固件项目 | PlatformIO env | 状态 |
|----------|----------------|------|
| `firmware/esp32-jgb37-drv8871-motor-controller` | `esp32dev` | 马达控制器，可控制 DRV8871 + JGB37-520，包含 AP 配网、HTTP API、WebSocket、MQTT、自检系统和 GPIO2 蓝色 LED 状态指示；最终硬件方案已改为单蓝灯 + 蜂鸣器 + 电压/电流检测预留，数码管不再采购 |
| `firmware/esp32-epaper-display` | `esp32dev-epaper-mono` | 电子墨水屏黑白屏构建，已实现配置、状态、命令和 MQTT/HTTP 协议骨架 |
| `firmware/esp32-epaper-display` | `esp32dev-epaper-color` | 电子墨水屏彩色/三色屏构建，已实现配置、状态、命令和 MQTT/HTTP 协议骨架 |

电子墨水屏固件目前的 `EpaperDisplay` 是命令/状态抽象层，会记录渲染操作并模拟刷新状态；真实屏幕驱动仍需在确认具体 panel 型号、控制器、库和接线后接入。

## 目录结构

```text
esp-project/
├── .github/workflows/          # CI 与 Docker publish workflow
├── docker/                     # Unraid/macvlan 部署 compose
├── esp-server/                 # Go 微服务后端
│   ├── api-gateway/            # API Gateway、认证校验、WebSocket 代理
│   ├── auth-service/           # 登录、JWT、密码修改
│   ├── device-service/         # 设备列表、状态、历史、命令下发
│   ├── mqtt-service/           # MQTT 状态消费与设备 upsert
│   ├── websocket-service/      # MQTT 状态转 WebSocket 广播
│   └── shared/                 # 配置、数据库、JWT、logger、middleware、models
├── esp-ui/                     # React 前端
├── firmware/
│   ├── esp32-jgb37-drv8871-motor-controller/
│   └── esp32-epaper-display/
└── scripts/                    # 版本 bump 等维护脚本
```

## 快速开始

### 前置要求

- Docker 与 Docker Compose
- Go 1.26.3+（后端本地开发）
- Node.js 24+ 与 Corepack/pnpm 10（前端本地开发）
- Python 3 + PlatformIO（固件开发）

### 后端 Docker 启动

```bash
cd esp-server
cp .env.example .env
# 编辑 .env，至少设置 JWT_SECRET / INTERNAL_TOKEN / 数据库密码等生产密钥
docker compose up -d
curl http://localhost:8080/health
```

默认入口：

- API Gateway: `http://localhost:8080`
- PostgreSQL: `localhost:5432`
- MQTT: `localhost:1883`
- Mosquitto WebSocket: `localhost:9001`
- 默认管理员：`admin` / `changeme`

### 前端本地开发

```bash
cd esp-ui
corepack enable
corepack prepare pnpm@10 --activate
pnpm install --frozen-lockfile
pnpm dev
```

Vite 开发服务默认运行在 `http://localhost:5173`。

### 固件构建

```bash
# 马达控制器
pio run -d firmware/esp32-jgb37-drv8871-motor-controller -e esp32dev

# 电子墨水屏黑白屏
pio run -d firmware/esp32-epaper-display -e esp32dev-epaper-mono

# 电子墨水屏彩色/三色屏
pio run -d firmware/esp32-epaper-display -e esp32dev-epaper-color
```

烧录时追加 `-t upload`，串口监控使用 `pio device monitor`。

## API 速查

### 认证

```http
POST /api/v1/auth/login
POST /api/v1/auth/change-password
```

登录请求示例：

```json
{
  "username": "admin",
  "password": "changeme"
}
```

### 设备

以下接口需要 `Authorization: Bearer <jwt>`：

```http
GET  /api/v1/devices
GET  /api/v1/devices/{device_id}/status
GET  /api/v1/devices/{device_id}/history?limit=50&offset=0
POST /api/v1/devices/{device_id}/command
```

马达命令示例：

```json
{
  "cmd": "run",
  "speed": 100,
  "direction": "forward"
}
```

电子墨水屏命令示例：

```json
{
  "cmd": "display_text",
  "text": "Hello ESP32",
  "x": 0,
  "y": 24,
  "size": 2,
  "color": "black",
  "refresh": "full"
}
```

### WebSocket

```text
/ws?token=<jwt>
```

广播消息包含设备 ID、消息类型和设备状态 payload。

## MQTT 协议

设备状态上报：

```text
esp/devices/{device_id}/status
```

设备命令下发：

```text
esp/devices/{device_id}/command
```

所有设备状态建议包含：

```json
{
  "device_type": "motor",
  "ip": "192.168.1.50",
  "uptime_ms": 10000
}
```

`device_type` 当前支持：

- `motor`
- `epaper`
- `unknown`

电子墨水屏状态示例：

```json
{
  "device_type": "epaper",
  "panel_type": "mono",
  "panel_model": "waveshare_2in9_bw",
  "width": 296,
  "height": 128,
  "busy": false,
  "state": "idle",
  "palette": ["white", "black"],
  "refresh_count": 3,
  "ip": "192.168.1.50"
}
```

## Docker 与发布

### 本地 compose

`esp-server/docker-compose.yml` 会启动：

- PostgreSQL 18.3
- Eclipse Mosquitto 2.1.2
- API Gateway
- Auth Service
- Device Service
- MQTT Service
- WebSocket Service

### Unraid/macvlan compose

`docker/docker-compose.yml` 提供按独立 IP 部署的 compose 模板，配置见 `docker/.env.example`。

### GHCR 镜像发布

推送 tag `vX.Y.Z` 会触发 `.github/workflows/docker-publish.yml`：

- 构建并推送 5 个后端服务镜像到 GHCR。
- 镜像 tag 使用不带 `v` 的 semver，例如 `1.4.4`。
- 生成 `docker-compose.release.yml` 和 `mosquitto.conf` artifact。

镜像命名格式：

```text
ghcr.io/inorihimea/esp-platform-api-gateway:<version>
ghcr.io/inorihimea/esp-platform-auth-service:<version>
ghcr.io/inorihimea/esp-platform-device-service:<version>
ghcr.io/inorihimea/esp-platform-mqtt-service:<version>
ghcr.io/inorihimea/esp-platform-websocket-service:<version>
```

## CI 检查

GitHub Actions 的 CI 覆盖：

- Go dependency verify、`go vet`、race test 和 coverage。
- Go 多平台构建：linux/darwin/windows × amd64/arm64（排除 windows/arm64）。
- `golangci-lint`。
- 前端 `pnpm lint` 与 `pnpm build`。
- PlatformIO 固件构建：马达、e-paper mono、e-paper color。
- Docker buildx 构建 5 个后端服务镜像。

本地常用检查：

```bash
# 后端
cd esp-server
go test ./...

go vet ./...

# 前端
cd ../esp-ui
pnpm lint
pnpm build

# 固件
cd ..
pio run -d firmware/esp32-jgb37-drv8871-motor-controller -e esp32dev
pio run -d firmware/esp32-epaper-display -e esp32dev-epaper-mono
pio run -d firmware/esp32-epaper-display -e esp32dev-epaper-color
```

## 版本管理

项目使用 semver，当前规范版本文件为 `esp-server/VERSION`。

`.githooks/commit-msg` 会调用 `scripts/bump-version.mjs`：

- `feat:` → minor
- `fix:` / `chore:` / 其他提交类型 → patch
- `BREAKING CHANGE:` 或 `type!:` → major

脚本会同步更新：

- `README.md`
- `esp-server/VERSION`
- `esp-ui/package.json`
- `firmware/esp32-jgb37-drv8871-motor-controller/src/main.cpp`

如果 hook 更新了版本文件，它会要求重新执行同一条 `git commit`，确保版本变更进入提交。

## 硬件与 BOM

- [马达控制器 BOM](firmware/esp32-jgb37-drv8871-motor-controller/BOM.md)
- [马达控制器硬件设计](esp32-motor/docs/hardware-design.md)
- [ESP32 外围电路与绘图说明](esp32-motor/docs/esp32-peripheral-circuits.md)
- [马达控制器固件侧硬件索引](firmware/esp32-jgb37-drv8871-motor-controller/docs/hardware-design.md)
- [数码管驱动电路与鬼影消除（遗留参考，不进入采购）](firmware/esp32-jgb37-drv8871-motor-controller/docs/display-driver-circuit.md)
- [电子墨水屏 BOM](firmware/esp32-epaper-display/BOM.md)

## 已知限制与后续事项

- 电子墨水屏真实驱动尚未接入，需要先确认具体 panel 型号、控制器、驱动库和接线。
- 马达方向切换当前仍直接切换，后续可改为先减速到 0 再反向加速以降低电流毛刺。
- 马达控制器没有编码器反馈，当前不是闭环转速控制。
- 前端构建产物尚未嵌入 ESP32 LittleFS，当前以前端独立部署为主。
- CI 中 `errcheck` 暂时禁用，后续可逐步补齐历史未检查错误。

## 安全建议

生产环境部署前至少完成：

- 修改默认管理员密码。
- 使用强 `JWT_SECRET` 和 `INTERNAL_TOKEN`。
- 修改数据库密码。
- 配置 `CORS_ORIGINS` 为实际前端域名。
- 在 API Gateway 前放置 HTTPS 反向代理。
- 不要将 `.env`、密钥或真实 WiFi/MQTT 凭据提交到仓库。

## 文档入口

- [后端 README](esp-server/README.md)
- [后端快速启动](esp-server/QUICKSTART.md)
- [后端部署指南](esp-server/DEPLOYMENT.md)
- [前端 README](esp-ui/README.md)
- [固件 README](firmware/README.md)
- [马达控制器固件 README](firmware/esp32-jgb37-drv8871-motor-controller/README.md)
- [电子墨水屏固件 README](firmware/esp32-epaper-display/README.md)
- [后端 CHANGELOG](esp-server/CHANGELOG.md)

## 授权

本项目采用 GNU Affero General Public License v3.0 only（AGPL-3.0-only）授权，详见 [LICENSE](LICENSE)。

## 联系方式

- 作者: InoriHimea
- Email: icarus347@gmail.com
- GitHub: [@InoriHimea](https://github.com/InoriHimea)
- 项目链接: [https://github.com/InoriHimea/esp-project](https://github.com/InoriHimea/esp-project)
