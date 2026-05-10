# 實作計畫：ESP32 LED 狀態指示燈

## 概述

本計畫將設計文件中的三處（加一處可選）改動轉換為可逐步執行的編碼任務，所有修改均限於 `esp32-motor/src/main.cpp`，無需新增任何文件。

---

## 任務

- [x] 1. 新增 LED 引腳常量
  - 在 `// ─── Pins ───` 區域的 `PIN_IN2` 宣告之後，新增 `static constexpr uint8_t PIN_LED = 2;`
  - 確認整個檔案中所有 LED 相關呼叫（`pinMode`、`digitalWrite`、`digitalRead`）均使用 `PIN_LED`，不出現裸整數 `2`
  - _需求：1.1, 1.2_

- [x] 2. 初始化 LED 輸出
  - [x] 2.1 在 `setup()` 的 `display.begin()` 之後新增 `pinMode(PIN_LED, OUTPUT)` 與 `digitalWrite(PIN_LED, LOW)`
    - 確保 `pinMode` 在 `digitalWrite` 之前呼叫
    - 初始化邏輯必須無條件執行，不依賴 `motor.begin()` 的成功與否
    - _需求：2.1, 2.2_

  - [ ]* 2.2 為 LED 初始化撰寫屬性測試（屬性 5）
    - **屬性 5：初始狀態確定性**
    - 使用 PlatformIO native 環境，mock `pinMode`、`digitalWrite`、`millis()`
    - 驗證 `setup()` 執行後 `PIN_LED` 必定被驅動為 LOW
    - **驗證：需求 2.1, 2.2**

- [x] 3. 實作 loop() LED 狀態機
  - [x] 3.1 在 `loop()` 的靜態變量宣告區域新增 `static uint32_t lastLedTick = 0` 與 `static bool ledState = false`
    - 靜態變量宣告位置與現有 `lastBroadcast`、`lastDisplayTick` 保持一致
    - _需求：8.1_

  - [x] 3.2 實作 `switch (motor.state())` 狀態機主體
    - `STOPPED` / `COASTING`：直接呼叫 `digitalWrite(PIN_LED, LOW)`，不進入閃爍路徑
    - `RUNNING FORWARD`：直接呼叫 `digitalWrite(PIN_LED, HIGH)`，不閃爍
    - `RUNNING REVERSE`：設定 `blinkPeriod = 150`（75ms 半週期）
    - `RAMPING`：設定 `blinkPeriod = 600`（300ms 半週期）
    - `BRAKING`：設定 `blinkPeriod = 50`（25ms 半週期）
    - _需求：3.1, 4.1, 5.1, 5.2, 6.1, 7.1_

  - [x] 3.3 實作非阻塞閃爍邏輯
    - 使用 `(uint32_t)(millis() - lastLedTick) >= blinkPeriod` 進行 overflow-safe 比較
    - 觸發切換時：更新 `lastLedTick = millis()`，翻轉 `ledState`，呼叫 `digitalWrite`
    - 未到期時跳過，不修改 LED 輸出
    - 不使用 `delay()` 或任何阻塞呼叫
    - _需求：4.2, 6.2, 7.2, 8.2, 8.3, 8.4, 8.5_

  - [ ]* 3.4 為狀態機撰寫屬性測試（屬性 1：狀態互斥性）
    - **屬性 1：狀態互斥性**
    - 對任意馬達狀態序列，LED 行為模式必須與當前狀態嚴格對應
    - Mock `motor.state()`、`motor.direction()`、`millis()`、`digitalWrite`
    - **驗證：需求 3.1, 5.1, 5.2, 6.1, 7.1**

  - [ ]* 3.5 為非阻塞邏輯撰寫屬性測試（屬性 2：非阻塞性）
    - **屬性 2：非阻塞性**
    - 量測 LED 狀態機單次執行時間，確認不超過 1ms
    - **驗證：需求 4.2, 6.2, 7.2, 8.2**

  - [ ]* 3.6 為閃爍精度撰寫屬性測試（屬性 3：閃爍週期精度）
    - **屬性 3：閃爍週期精度**
    - 模擬連續 10 次切換，驗證平均半週期誤差在 ±10ms 以內
    - 覆蓋 RAMPING（300ms）、RUNNING REVERSE（75ms）、BRAKING（25ms）三種週期
    - **驗證：需求 4.1, 6.1, 7.1**

  - [ ]* 3.7 為 millis() 溢位撰寫屬性測試（屬性 4：溢位安全性）
    - **屬性 4：溢位安全性**
    - 設定 `lastLedTick` 接近 `0xFFFFFFFF`，模擬 `millis()` 歸零後的計算
    - 驗證 `(uint32_t)(millis() - lastLedTick)` 仍能正確觸發切換
    - **驗證：需求 8.3, 8.4**

- [x] 4. 檢查點 — 確認核心功能正確
  - 確認所有測試通過，確認 `loop()` 中無 `delay()` 呼叫，如有疑問請向使用者確認。

- [x] 5. 新增 LED 狀態至 REST API（可選）
  - [x] 5.1 在 `buildStatusJson()` 中新增 `doc["led"] = (digitalRead(PIN_LED) == HIGH) ? "on" : "off"`
    - 使用 `digitalRead(PIN_LED)` 作為權威來源，不維護額外軟體變量
    - 確認 `"led"` 欄位出現在 JSON 輸出中
    - _需求：9.1_

  - [ ]* 5.2 為 JSON 欄位撰寫單元測試
    - 驗證 GPIO2 為 HIGH 時 `"led"` 欄位值為 `"on"`
    - 驗證 GPIO2 為 LOW 時 `"led"` 欄位值為 `"off"`
    - _需求：9.1, 9.2_

- [x] 6. 最終檢查點 — 確認所有測試通過
  - 確認所有測試通過，確認三處（或四處）改動均已整合至 `main.cpp`，如有疑問請向使用者確認。

---

## 備註

- 標有 `*` 的子任務為可選項，可跳過以加快 MVP 進度
- 所有任務均參照具體需求條款，確保可追溯性
- 屬性測試需在 PlatformIO native 環境中執行，mock 硬體相關函數
- 任務 5 整體為可選功能（需求 9），可依需求決定是否實作
- 所有改動均限於 `esp32-motor/src/main.cpp`，無需新增文件

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "3.1"] },
    { "id": 3, "tasks": ["3.2"] },
    { "id": 4, "tasks": ["3.3"] },
    { "id": 5, "tasks": ["3.4", "3.5", "3.6", "3.7"] },
    { "id": 6, "tasks": ["5.1"] },
    { "id": 7, "tasks": ["5.2"] }
  ]
}
```
