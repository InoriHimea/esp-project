# ESP 控制平台完成计划

## 当前状态

项目目前已包含三部分核心代码：

- `esp-server/`：Go 微服务后端
- `esp-ui/`：React + TypeScript 前端
- `esp32-motor/`：ESP32 固件

最新检查结果：

- 前端可以构建和 lint。
- ESP32 固件可以构建，但 PlatformIO 有 `data_dir` 配置警告。
- 后端 5 个服务目录已经存在，但当前无法通过 `go test ./...` 和 `make build`。
- Docker、CI、Release 配置仍依赖后端成功构建，因此当前也不能视为可用。

当前整体完成度估计：**50% - 60%**。

## 总目标

将项目推进到最小可交付状态：

1. 后端 5 个服务可以编译、启动、通过基础接口验证。
2. 前端可以通过 API Gateway 完成登录、设备状态展示、设备命令发送。
3. ESP32 可以通过 MQTT 上报状态并接收命令。
4. Docker Compose 可以一键启动后端平台。
5. CI 至少能完成后端构建、前端构建、固件构建。

## 阶段 1：修复后端编译

目标：让 `cd esp-server && go test ./...` 和 `cd esp-server && make build` 通过。

### 1.1 补齐 Go 依赖

当前缺失依赖：

- `github.com/gorilla/websocket`
- `golang.org/x/crypto/bcrypt`
- `github.com/eclipse/paho.mqtt.golang`

验收标准：

```bash
cd esp-server
go mod tidy
go test ./...
```

不再出现 `no required module provides package ...` 错误。

### 1.2 统一 config 接口

当前问题：

- 服务代码调用 `config.Load()`。
- `shared/config` 当前提供 `LoadConfig()`。

处理方案：

- 统一使用一个配置加载函数。
- 推荐保留 `LoadConfig()`，并修改服务代码调用。
- 或增加兼容函数 `Load()`，但不要长期保留重复抽象。

验收标准：

- 所有服务可以正常读取：
  - `PORT`
  - `DATABASE_URL`
  - `JWT_SECRET`
  - `MQTT_BROKER`
  - `AUTH_SERVICE_URL`
  - `DEVICE_SERVICE_URL`
  - `WEBSOCKET_SERVICE_URL`
  - `CORS_ORIGINS`

### 1.3 统一 database 接口

当前问题：

- 服务代码调用 `database.Connect(cfg.DatabaseURL)`。
- `shared/database.Connect` 当前签名是 `Connect(ctx context.Context, databaseURL string)`。

处理方案：

- 修改服务代码，传入 `context.Background()`。
- 统一使用 `*database.DB`，避免 `database.DB` 和 `*database.DB` 混用。

验收标准：

- `auth-service`、`device-service`、`mqtt-service` 可以编译。
- 数据库健康检查可以调用统一方法。

### 1.4 统一 JWT 接口

当前问题：

- 服务代码调用 `jwt.Init()`、`jwt.Generate()`、`jwt.Verify()`。
- `shared/jwt` 当前是 `Manager` 模式：`NewManager()`、`manager.Generate()`、`manager.Verify()`。

处理方案：

- 推荐使用 `Manager` 模式。
- 在 `api-gateway`、`auth-service` 中初始化 `jwtManager := jwt.NewManager(cfg.JWTSecret)`。
- 所有生成和验证都通过 `jwtManager` 调用。

验收标准：

- `auth-service` 登录成功时能生成 token。
- `api-gateway` 能验证 `Authorization: Bearer <token>`。
- `/ws?token=...` 能验证 token。

### 1.5 统一 middleware.CORS 调用

当前问题：

- 服务代码使用 `middleware.CORS(mux)`。
- 当前定义是 `middleware.CORS(origins []string)(handler)`。

处理方案：

服务应改成类似：

```go
handler := middleware.RequestID(
    middleware.Logger(
        middleware.Recovery(
            middleware.CORS(cfg.CORSOrigins)(mux),
        ),
    ),
)
```

验收标准：

- 所有服务编译通过。
- 前端来源能正常跨域访问 API Gateway。

### 1.6 补齐 logger.Fatal 或改写调用

当前问题：

- 服务代码调用 `logger.Fatal()`。
- `shared/logger` 没有 `Fatal()`。

处理方案：

二选一：

1. 在 `shared/logger` 增加 `Fatal(msg string, args ...any)`，内部记录错误后 `os.Exit(1)`。
2. 修改服务代码为 `logger.Error(...)` 后 `os.Exit(1)`。

推荐方案：增加 `Fatal()`，减少服务代码重复。

验收标准：

- 后端编译通过。

## 阶段 2：修复后端运行逻辑

目标：后端服务不仅能编译，还能通过基础 API 验证。

### 2.1 确认数据库迁移执行位置

当前 `shared/database` 有 `RunMigrations()`，但需要确认实际服务启动时会调用。

推荐方案：

- 在 `api-gateway` 或独立初始化流程中执行迁移。
- 更合理的是在专门的迁移步骤中执行，但当前最小可交付可以放在 `api-gateway` 启动时。

验收标准：

数据库自动创建：

- `users`
- `devices`
- `device_events`

### 2.2 初始化默认管理员账号

文档声明默认账号为：

- `admin`
- `changeme`

需要确保数据库中会自动创建该账号，且密码使用 bcrypt。

验收标准：

```bash
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"changeme"}'
```

返回 JWT token。

### 2.3 修复 Device Service 路由解析

当前 `device-service` 使用字符串长度判断路径后缀，容易出错。

需要稳定支持：

- `GET /devices`
- `GET /devices/{id}/status`
- `GET /devices/{id}/history`
- `POST /devices/{id}/command`

验收标准：

所有 API 通过 API Gateway 可访问：

- `GET /api/v1/devices`
- `GET /api/v1/devices/{id}/status`
- `GET /api/v1/devices/{id}/history`
- `POST /api/v1/devices/{id}/command`

### 2.4 修复 MQTT 配置传递

当前 `device-service` 直接需要 MQTT broker，但 compose 中主要给了 `MQTT_SERVICE_URL`，需要统一架构。

可选方案：

- 方案 A：`device-service` 直接连接 MQTT，发送设备命令。
- 方案 B：`device-service` 调用 `mqtt-service` HTTP API，由 `mqtt-service` 发布命令。

推荐先用方案 A，最小改动，让命令链路先跑通。

验收标准：

`POST /api/v1/devices/{id}/command` 能发布到：

```text
esp/devices/{id}/command
```

### 2.5 修复 WebSocket 消息类型

当前问题：

- 后端发送 `device_status`。
- 前端期望 `status`。

处理方案：

二选一：

1. 修改后端发送 `status`。
2. 修改前端同时接受 `status` 和 `device_status`。

推荐修改后端，保持前端当前协议。

验收标准：

前端 dashboard 能收到设备状态并显示设备卡片。

### 2.6 处理 `/auth/change-password`

当前前端调用：

```text
POST /auth/change-password
```

但后端未实现。

处理方案：

二选一：

1. 后端实现 `POST /api/v1/auth/change-password`。
2. 前端暂时隐藏或移除该功能。

推荐先实现后端接口，因为 Settings 页面已经存在。

验收标准：

登录后可以修改当前用户密码，旧密码错误时返回 401 或 400。

## 阶段 3：修复前端集成

目标：前端通过 API Gateway 完整使用平台能力。

### 3.1 更新 `.env.example`

需要补充：

```env
VITE_SERVER_API=http://localhost:8080/api/v1
VITE_SERVER_WS=ws://localhost:8080/ws
```

保留 ESP32 直连变量，但明确用途：

```env
VITE_ESP32_API=http://192.168.1.100/api
VITE_ESP32_WS=ws://192.168.1.100/ws
```

验收标准：

新开发者按 `.env.example` 配置后可以启动前端并连接后端。

### 3.2 统一 Dashboard 数据来源

当前 Dashboard 只依赖 WebSocket 状态。

建议：

- 页面加载时先请求 `GET /devices`。
- WebSocket 后续增量更新设备状态。

验收标准：

刷新页面后，即使 WebSocket 尚未收到新消息，也能显示数据库中已有设备。

### 3.3 明确直连 ESP32 页面和平台页面边界

当前前端有两套 API：

- `src/api/client.ts`：平台后端 API
- `src/lib/api.ts`：直连 ESP32 API

需要明确：

- 平台模式：登录、Dashboard、设备控制走 API Gateway。
- 调试/本地模式：允许直连 ESP32。

验收标准：

代码中调用路径清晰，不混用同一页面内的两套协议。

## 阶段 4：修复 Docker 与部署配置

目标：Docker Compose 可以启动完整平台。

### 4.1 修复 `esp-server/docker-compose.yml`

需要确保每个服务环境变量完整：

- `auth-service`：`DATABASE_URL`、`JWT_SECRET`
- `device-service`：`DATABASE_URL`、`MQTT_BROKER`
- `mqtt-service`：`DATABASE_URL`、`MQTT_BROKER`
- `websocket-service`：`MQTT_BROKER`
- `api-gateway`：服务 URL、`JWT_SECRET`、`CORS_ORIGINS`

验收标准：

```bash
cd esp-server
docker compose up --build
```

所有服务 healthcheck 通过。

### 4.2 处理根目录 `docker/docker-compose.yml`

当前它把 `../esp-server` 当成单体服务构建，和微服务架构冲突。

处理方案：

二选一：

1. 删除或废弃根目录单体 compose。
2. 改成引用微服务架构。

推荐：统一到 `esp-server/docker-compose.yml`，避免双配置漂移。

验收标准：

README 只推荐一种 Docker 启动方式。

### 4.3 修复前端 Docker build args

当前根 compose 指向 `3000`，但 API Gateway 是 `8080`。

需要统一：

```yaml
VITE_SERVER_API: http://<gateway-host>:8080/api/v1
VITE_SERVER_WS: ws://<gateway-host>:8080/ws
```

验收标准：

容器化前端可以连接容器化后端。

## 阶段 5：修复 CI/CD

目标：CI 能真实证明项目可构建。

### 5.1 后端 CI

CI 应执行：

```bash
cd esp-server
go mod verify
go test ./...
make build
```

验收标准：

CI 后端 job 通过。

### 5.2 前端 CI

CI 应执行：

```bash
cd esp-ui
pnpm install --frozen-lockfile
pnpm lint
pnpm build
```

当前 README 写了 `npm test`，但项目没有 test script，需要修正文档或补测试。

验收标准：

CI 前端 job 通过。

### 5.3 固件 CI

CI 应执行：

```bash
pio run -d esp32-motor
```

验收标准：

固件构建通过，且没有 PlatformIO 配置警告。

### 5.4 Docker CI

后端能编译后，再启用 Docker build：

- `Dockerfile.api-gateway`
- `Dockerfile.auth-service`
- `Dockerfile.device-service`
- `Dockerfile.mqtt-service`
- `Dockerfile.websocket-service`
- `esp-ui/Dockerfile`

验收标准：

所有镜像可以构建。

## 阶段 6：修正文档

目标：README 与真实代码状态一致。

### 6.1 修正版本声明

当前存在不一致：

- README 写 Go 1.22，但实际 `go.mod` 是 Go 1.26.3。
- README 写 React 18，但实际是 React 19.2.6。
- README 声称生产就绪，但当前还未跑通后端。

验收标准：

文档中的版本、端口、启动方式和实际配置一致。

### 6.2 修复 ESP32 文档位置

根 README 链接 `esp32-motor/README.md`，但当前文件不存在。

处理方案：

- 将 ESP32 固件说明移动或复制到 `esp32-motor/README.md`。
- 或修正根 README 链接到实际文档。

验收标准：

所有 README 链接有效。

### 6.3 更新已知限制

需要明确仍未完成的能力：

- OTA
- BLE 配网
- 编码器闭环控制
- 完整 React 前端嵌入 ESP32 LittleFS
- 监控指标
- OpenAPI 文档
- 单元测试和集成测试

## 最小验收清单

项目达到最小可交付前，至少应全部通过：

```bash
cd esp-server
go mod tidy
go test ./...
make build
```

```bash
cd esp-ui
pnpm lint
pnpm build
```

```bash
pio run -d esp32-motor
```

```bash
cd esp-server
docker compose up --build
curl http://localhost:8080/health
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"changeme"}'
```

ESP32 实机验证：

1. 首次启动进入 AP 配网。
2. 保存 WiFi / MQTT 配置后重启并联网。
3. 固件向 `esp/devices/{id}/status` 上报状态。
4. 后端数据库出现设备记录。
5. 前端 dashboard 显示设备在线。
6. 前端发送 RUN / STOP / BRAKE / COAST。
7. ESP32 收到 MQTT command 并执行。

## 推荐执行顺序

1. 后端依赖和接口对齐。
2. 后端编译通过。
3. 后端本地服务启动通过。
4. 登录和默认管理员账号跑通。
5. MQTT 状态上报进入数据库。
6. WebSocket 消息推送到前端。
7. 前端环境变量和协议修复。
8. Docker Compose 跑通。
9. CI/CD 修复。
10. 文档更新。

## 当前风险

- 后端服务代码可能是快速补齐的初版，存在编译以外的运行时问题。
- 文档多处超前于代码，容易误导部署和验收。
- Docker 配置有两套方向，后续如果不统一会持续漂移。
- 前端与后端 WebSocket 协议不一致，会导致 UI 看似正常但没有数据。
- 缺少自动化测试，修复过程中容易引入回归。

## 完成度目标

修复到以下状态后，可将项目完成度提升到约 **75% - 85%**：

- 后端 5 服务可构建、可启动。
- API Gateway 登录和设备 API 可用。
- MQTT 状态上报和命令下发闭环。
- 前端能显示设备并控制设备。
- Docker Compose 可启动完整平台。

剩余未完成项主要会是生产级能力：

- OTA
- BLE
- 监控指标
- OpenAPI
- 单元/集成测试覆盖
- Kubernetes / 生产部署细节
