# 技術設計文檔：ESP32 LED 狀態指示燈

## 概述

本功能在現有 ESP32 馬達控制器的 `main.cpp` 中加入 LED 狀態指示燈，僅需三處改動，無需新增文件。LED 接於 GPIO2，透過 150Ω 限流電阻驅動，以不同閃爍模式反映馬達的即時運行狀態。

---

## 硬體設計

### 接線方式

```
GPIO2 → 150Ω 電阻 → LED 陽極 → LED 陰極 → GND
```

### 引腳選擇理由

| 項目 | 說明 |
|------|------|
| GPIO2 | WROOM-32 上的常見板載 LED 引腳，目前方案未佔用 |
| 150Ω 電阻 | 3.3V 驅動，限流約 22mA，在 LED 安全範圍內 |
| 無需外部電源 | 直接由 ESP32 GPIO 驅動，電流足夠 |

> **注意**：GPIO2 在 ESP32 啟動時為 Boot Strapping 引腳，上電時若為 HIGH 可能影響燒錄模式。本方案在 `setup()` 中初始化為 LOW，不影響正常啟動流程。

---

## 軟體設計

### 改動範圍

所有改動僅限於 `esp32-motor/src/main.cpp`，共三處，約新增 20 行代碼。

---

### 改動 1：引腳常量宣告

**位置**：`// ─── Pins ───` 區域

```cpp
// ─── Pins ─────────────────────────────────────────────────────────────────────
static constexpr uint8_t PIN_IN1 = 18;
static constexpr uint8_t PIN_IN2 = 19;
static constexpr uint8_t PIN_LED = 2;   // ← 新增，接 150Ω + LED
```

---

### 改動 2：setup() 初始化

**位置**：`motor.begin()` 之後

```cpp
motor.begin();
display.begin();

// LED 初始化
pinMode(PIN_LED, OUTPUT);
digitalWrite(PIN_LED, LOW);   // 上電預設滅
```

**設計決策**：
- `pinMode` 必須在 `digitalWrite` 之前呼叫
- 初始化與 `motor.begin()` 是否成功無關，無條件執行
- 上電預設 LOW，避免 GPIO 浮接造成 LED 隨機亮起

---

### 改動 3：loop() LED 狀態機

**位置**：`loop()` 函數內，現有計時變量宣告區域之後

#### 靜態變量

```cpp
static uint32_t lastLedTick = 0;   // 上次 LED 切換的時間戳
static bool     ledState    = false; // 當前 LED 輸出狀態
```

#### 狀態機邏輯

```cpp
// ── LED 指示燈 ────────────────────────────────────────────────────────────
uint32_t blinkPeriod = 0;   // 0 = 不閃爍（由各 case 直接控制輸出）

switch (motor.state()) {
    case MotorState::RUNNING:
        if (motor.direction() == MotorDirection::FORWARD) {
            // 正轉：常亮
            digitalWrite(PIN_LED, HIGH);
        } else {
            // 反轉：快閃 150ms
            blinkPeriod = 150;
        }
        break;
    case MotorState::RAMPING:
        blinkPeriod = 600;   // 慢閃
        break;
    case MotorState::BRAKING:
        blinkPeriod = 50;    // 急促閃
        break;
    case MotorState::STOPPED:
    case MotorState::COASTING:
    default:
        digitalWrite(PIN_LED, LOW);
        break;
}

// 非零 period 才執行閃爍邏輯
if (blinkPeriod > 0 && (uint32_t)(millis() - lastLedTick) >= blinkPeriod) {
    lastLedTick = millis();
    ledState    = !ledState;
    digitalWrite(PIN_LED, ledState ? HIGH : LOW);
}
```

#### 狀態對應表

| 馬達狀態 | 方向 | LED 行為 | 週期 |
|----------|------|----------|------|
| STOPPED | — | 滅（LOW） | — |
| COASTING | — | 滅（LOW） | — |
| RAMPING | — | 慢閃 | 600ms（300ms on / 300ms off） |
| RUNNING | FORWARD | 常亮（HIGH） | — |
| RUNNING | REVERSE | 快閃 | 150ms（75ms on / 75ms off） |
| BRAKING | — | 急促閃 | 50ms（25ms on / 25ms off） |

---

### 改動 4（可選）：REST API 狀態欄位

**位置**：`buildStatusJson()` 函數內

```cpp
static String buildStatusJson() {
    JsonDocument doc;
    // ... 現有欄位 ...
    doc["led"] = (digitalRead(PIN_LED) == HIGH) ? "on" : "off";  // ← 新增
    // ...
}
```

**設計決策**：使用 `digitalRead(PIN_LED)` 讀取實際 GPIO 狀態作為權威來源，而非維護額外的軟體變量，確保 API 回應與硬體實際狀態一致。

---

## 非阻塞設計

LED 狀態機採用「elapsed-time 比較」模式，與現有的 `lastBroadcast`、`lastDisplayTick`、`lastMqttStatus` 計時器設計完全一致：

```
loop() 每次迭代
    ├── WS 廣播（每 100ms）
    ├── 數碼管刷新（每 50ms）
    ├── LED 狀態機（每 50ms / 150ms / 600ms，依狀態而定）
    ├── MQTT 訊息處理
    └── MQTT 狀態發布（每 500ms）
```

**關鍵特性**：
- 不使用 `delay()`，不阻塞 `loop()`
- `uint32_t` 無符號減法天然處理 `millis()` 溢位（約 49.7 天後歸零）
- `lastLedTick = millis()` 在每次切換時更新，避免累積誤差

---

## 狀態轉換行為

### 進入新狀態時

當馬達狀態改變，`switch` 在下一次 `loop()` 迭代立即評估新狀態：

- **進入 STOPPED/COASTING**：直接呼叫 `digitalWrite(PIN_LED, LOW)`，立即熄滅
- **進入 RUNNING FORWARD**：直接呼叫 `digitalWrite(PIN_LED, HIGH)`，立即常亮
- **進入閃爍狀態**：`blinkPeriod` 設為對應值，等待下次計時到期後開始閃爍

### 離開閃爍狀態時

不等待當前閃爍週期完成，下一次 `loop()` 迭代直接套用新狀態行為（符合需求 6.3）。

---

## 正確性屬性（Property-Based Testing）

以下屬性可用於驗證實作正確性：

### 屬性 1：狀態互斥性
對於任意馬達狀態序列，LED 的行為模式必須與當前狀態嚴格對應，不得出現跨狀態的行為混用。

### 屬性 2：非阻塞性
`loop()` 的單次執行時間不得因 LED 邏輯而增加超過 1ms（不含 `digitalWrite` 本身的硬體延遲）。

### 屬性 3：閃爍週期精度
在穩定閃爍狀態下，連續 10 次切換的平均半週期誤差應在 ±10ms 以內。

### 屬性 4：溢位安全性
在 `millis()` 接近 `0xFFFFFFFF` 時，`(uint32_t)(millis() - lastLedTick)` 的計算結果仍應正確觸發切換。

### 屬性 5：初始狀態確定性
上電後，LED 必須在 `setup()` 完成前被驅動為 LOW，不得出現浮接狀態。

---

## 測試策略

由於本功能為嵌入式韌體，測試分為兩層：

### 單元測試（Host 端模擬）
使用 PlatformIO 的 native 環境，mock `digitalWrite`、`digitalRead`、`millis()` 函數，驗證狀態機邏輯：

```cpp
// 測試案例：BRAKING 狀態下 50ms 後 LED 切換
mockMotorState(MotorState::BRAKING);
mockMillis(0);
runLedStateMachine();  // 初始化
mockMillis(51);
runLedStateMachine();  // 應觸發切換
assert(mockLedState == HIGH);
```

### 硬體整合測試
使用邏輯分析儀或示波器量測 GPIO2 波形，驗證：
- BRAKING：50ms 週期方波
- RUNNING REVERSE：150ms 週期方波
- RAMPING：600ms 週期方波
- RUNNING FORWARD：持續 HIGH
- STOPPED/COASTING：持續 LOW

---

## 文件變更清單

| 文件 | 變更類型 | 說明 |
|------|----------|------|
| `esp32-motor/src/main.cpp` | 修改 | 新增 PIN_LED 常量、初始化、LED 狀態機，可選新增 JSON 欄位 |

無需新增任何文件。
