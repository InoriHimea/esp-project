# ESP32 Motor Controller

**硬件**: ESP32 + DRV8871 + JGB37-520 减速电机 + Mini 560 降压模块 + 摩擦轮

---

## 接线

```
12V 电源
  ├─── Mini 560 IN+    →  Mini 560 OUT+ (5V) → ESP32 VIN
  │                       Mini 560 OUT− (GND)→ ESP32 GND
  │
  └─── DRV8871 VM (12V)
       DRV8871 GND    → 公共 GND
       DRV8871 IN1    ← ESP32 GPIO18
       DRV8871 IN2    ← ESP32 GPIO19
       DRV8871 OUT1/OUT2 → JGB37-520 电机两端

摩擦轮直接固定在电机输出轴上。
```

> **所有 GND 必须共地**（Mini 560 / ESP32 / DRV8871 三处 GND 接在一起）。

---

## 固件 (PlatformIO)

```bash
# 1. 安装 PlatformIO CLI
pip install platformio

# 2. 修改 WiFi 凭证
# 编辑 src/main.cpp 第 30–31 行:
#   static const char* WIFI_SSID = "YOUR_SSID";
#   static const char* WIFI_PASS = "YOUR_PASSWORD";

# 3. 烧录
cd esp32_motor
pio run --target upload

# 4. 查看串口
pio device monitor
# 输出示例:
# [WiFi] connected → http://motorctrl.local  192.168.1.100
# [HTTP] server started on port 80
```

### WiFi 连不上时 (AP 模式自动启动)
设备会自动开启热点：  
- SSID: `ESP32-Motor`  
- 密码: `motorctrl`  
- 访问: `http://192.168.4.1`

---

## 前端 (React 19 + Tailwind v4)

```bash
cd react_frontend

# 复制环境变量
cp .env.example .env
# 编辑 .env 中的 ESP32_HOST 为你的 ESP32 IP

# 安装依赖
pnpm install   # 或 bun install

# 开发 (含 Vite proxy, 无跨域问题)
pnpm dev

# 生产构建
pnpm build
# dist/ 可直接部署到 Nginx / Caddy
# 也可以将 dist/ 上传进 ESP32 的 LittleFS (SPIFFS) 作为嵌入式 Web UI
```

---

## API 速查

| Method | Path | Body |
|--------|------|------|
| GET  | `/api/status` | — |
| POST | `/api/motor/run` | `{ speed, direction, ramp_ms }` |
| POST | `/api/motor/stop` | — |
| POST | `/api/motor/brake` | — |
| POST | `/api/motor/coast` | — |
| GET  | `/api/config` | — |
| POST | `/api/config` | `{ max_speed, ramp_ms }` |

WebSocket: `ws://<ip>/ws` — 100 ms 广播，详见 `MOBILE_API.md`

---

## 架构说明

```
┌──────────────────────────────────────────────────┐
│  ESP32                                           │
│                                                  │
│  FreeRTOS Task: motor_ramp (core 1, prio 5)     │
│    └─ 每 10ms tick → 平滑调整 PWM duty           │
│                                                  │
│  ESPAsyncWebServer (event-driven, non-blocking)  │
│    ├─ HTTP :80  REST API                         │
│    └─ WS   /ws  实时广播 (100ms)                 │
│                                                  │
│  LEDC PWM — 20kHz / 10-bit                      │
│    ├─ CH0 → GPIO18 → DRV8871 IN1               │
│    └─ CH1 → GPIO19 → DRV8871 IN2               │
│                                                  │
│  Preferences (NVS) — 掉电保存 max_speed/ramp_ms │
└──────────────────────────────────────────────────┘
         │ 12V PWM
         ▼
    DRV8871 H-Bridge
         │
         ▼
    JGB37-520 减速电机
         │
         ▼
       摩擦轮
```

### DRV8871 控制逻辑

| IN1 | IN2 | 效果 |
|-----|-----|------|
| PWM | 0   | 正转 |
| 0   | PWM | 反转 |
| 1   | 1   | 主动刹车 |
| 0   | 0   | 惰行 |

### 匀速加速实现
`MotorController::_rampTick()` 每 10ms 执行一次：  
- 计算每 tick 步长 = `Δduty / (ramp_ms / 10)`  
- 逐步逼近 `_target_duty`，到达后状态转为 `RUNNING`  
- 方向切换时先减速到 0，再反向加速（避免电机浪涌）

---

## 已知限制 / TODO

- [ ] 方向切换未强制先减速到 0（当前版本直接切换，DRV8871 内部有保护但电流会有毛刺）
- [ ] 没有编码器反馈，无法做闭环转速控制
- [ ] LittleFS 嵌入前端资产（目前前端需单独部署）
- [ ] BLE 配网（当前 WiFi 凭证硬编码）
