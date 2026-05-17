# ESP32 馬達控制器韌體

基於 PlatformIO 的 ESP32 馬達控制器，支援 WiFi / MQTT / HTTP / WebSocket 多協議控制。

## 🎯 核心功能

- **馬達控制**：DRV8871 H 橋 + 1kHz PWM，正反轉、平滑加減速
- **顯示**：3 位共陽極數碼管，RPM / 占空比 / 原始值三模式自動輪播
- **狀態指示**：板載 LED 不同閃爍模式對應馬達狀態
- **WiFi 配網**：首次啟動進入 AP 模式（`ESP32-Motor` / `motorctrl`）
- **協議支援**：HTTP REST API、WebSocket、MQTT
- **綜合自檢**：開機自動測試 LED / 數碼管 / 馬達 / GPIO

## 🔌 硬件接線

### ESP32 GPIO 對應表

| 功能 | GPIO | 說明 |
|------|------|------|
| **馬達控制** | | |
| DRV8871 IN1 | GPIO18 | LEDC PWM 通道 0 |
| DRV8871 IN2 | GPIO19 | LEDC PWM 通道 1 |
| **狀態指示** | | |
| 板載 LED | GPIO2 | 高電平點亮（外接 470Ω 限流）|
| **數碼管段選 (a~g)** | | |
| 段 a | GPIO23 | 220Ω 限流 |
| 段 b | GPIO25 | 220Ω 限流 |
| 段 c | GPIO26 | 220Ω 限流 |
| 段 d | GPIO27 | 220Ω 限流 |
| 段 e | GPIO32 | 220Ω 限流 |
| 段 f | GPIO33 | 220Ω 限流 |
| 段 g | GPIO14 | 220Ω 限流 |
| **數碼管位選（高邊驅動）** | | |
| COM1（百位） | GPIO13 | NPN+PNP 達林頓對管 |
| COM2（十位） | GPIO5  | NPN+PNP 達林頓對管 |
| COM3（個位） | GPIO4  | NPN+PNP 達林頓對管 |

### 詳細電路圖

數碼管的位選驅動電路採用 NPN + PNP 達林頓對管實現高邊驅動（5V 推送 COM）。

⚠️ **重要**：為了消除鬼影/殘影，每個 PNP 三極管的基極上拉電阻（10kΩ）兩端必須並聯一個 **0.1μF 速度補償電容**。

🛡️ **24V 馬達環境**還需要：
- **5V 電源去耦**（100μF + 0.1μF 並聯到 GND）
- **段選/位選下拉電阻**（10kΩ × 10，每個 GPIO 對 GND）

📐 完整電路圖、原理分析和替代方案請參閱：
- [**數碼管驅動電路設計**](docs/display-driver-circuit.md)
  - 詳細電路圖（基礎版 + 抗干擾增強版）
  - 速度補償電容原理
  - 5V 電源去耦 + GPIO 下拉電阻
  - 完整改造步驟（按優先級）
  - ULN2803 / MIC2981 專用驅動 IC 替代方案

## 🚀 快速開始

### 編譯與上傳

```bash
# 編譯
pio run

# 上傳到 ESP32
pio run -t upload

# 串口監視
pio device monitor --baud 115200
```

### 首次配網

1. 上電後，ESP32 啟動 AP 模式
2. 手機/電腦連接熱點 `ESP32-Motor`，密碼 `motorctrl`
3. 打開瀏覽器訪問 `http://192.168.4.1`
4. 填寫 WiFi 帳號密碼、MQTT broker 信息，提交
5. ESP32 自動重啟並連接 WiFi

### 常用 API

```bash
# 獲取狀態
curl http://motorctrl.local/api/status

# 啟動馬達（正轉 80% 速度，1.5 秒平滑加速）
curl -X POST http://motorctrl.local/api/motor/run \
  -H 'Content-Type: application/json' \
  -d '{"speed":800,"direction":"forward","ramp_ms":1500}'

# 停止
curl -X POST http://motorctrl.local/api/motor/stop

# 主動剎車
curl -X POST http://motorctrl.local/api/motor/brake

# 觸發完整自檢
curl -X POST http://motorctrl.local/api/test \
  -H 'Content-Type: application/json' \
  -d '{"type":"all"}'
```

## 🧪 自檢測試系統

預設**開機自動執行完整自檢**（約 45 秒），可通過以下方式關閉或重新觸發。

### 測試類型

| 類型 | 說明 | 約耗時 |
|------|------|--------|
| `led` | LED 6 種狀態演示 | 16s |
| `display` | 數碼管 5 階段測試 | 13s |
| `motor` | 馬達 PWM 正反轉 | 10s |
| `gpio` | GPIO 直接控制（不用 PWM）| 6s |
| `all` | 完整綜合測試 | 45s |

### 觸發方式

#### HTTP

```bash
# 啟動測試
POST /api/test
Body: {"type":"led|display|motor|gpio|all"}

# 查詢進度
GET /api/test
Response: {"state":"running","type":"led","step":"...","progress":40}

# 設置開機自檢開關
POST /api/boot-test
Body: {"enabled":true|false}
```

#### MQTT

下發到 `esp/devices/{device_id}/command`：
```json
{"cmd":"test", "type":"all"}
{"cmd":"display_mode"}
```

#### WebSocket

連接 `ws://motorctrl.local/ws`，發送：
```json
{"cmd":"test", "type":"led"}
```

## 💡 LED 狀態對照

| 馬達狀態 | LED 行為 | 含義 |
|---------|---------|------|
| STOPPED / COASTING | 滅 | 停止 |
| RAMPING | 慢閃 600ms | 加減速中 |
| RUNNING + FORWARD | 常亮 | 正轉穩定 |
| RUNNING + REVERSE | 快閃 150ms | 反轉穩定 |
| BRAKING | 急閃 50ms | 主動剎車 |

## 📚 模塊結構

```
esp32-motor/
├── include/
│   ├── MotorController.h    # 馬達控制器（DRV8871 + LEDC PWM）
│   ├── DirectDisplay.h      # 直驅數碼管（FreeRTOS 動態掃描）
│   └── SelfTest.h           # 綜合自檢系統
├── src/
│   ├── main.cpp             # 主程序（WiFi/HTTP/MQTT/WS）
│   ├── MotorController.cpp
│   ├── DirectDisplay.cpp
│   └── SelfTest.cpp
├── docs/
│   └── display-driver-circuit.md   # 數碼管驅動電路文檔
├── data/                    # LittleFS 內容（HTML/JS/CSS）
├── platformio.ini
└── README.md
```

## 🔗 相關文檔

- [數碼管驅動電路設計](docs/display-driver-circuit.md)
- [專案根 README](../README.md)
- [後端微服務](../esp-server/README.md)
- [前端 UI](../esp-ui/README.md)
