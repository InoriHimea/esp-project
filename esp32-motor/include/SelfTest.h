#pragma once
#include <Arduino.h>
#include "MotorController.h"
#include "DirectDisplay.h"

// ─────────────────────────────────────────────────────────────────────────────
//  SelfTest
//
//  集成設備自檢功能，可在開機時或運行時通過 HTTP/MQTT 觸發。
//
//  測試類型：
//    - led      → LED 狀態演示（6 種狀態）
//    - display  → 數碼管測試（5 個階段）
//    - motor    → 馬達測試（正反轉）
//    - gpio     → 原始 GPIO 輸出測試
//    - all      → 完整綜合測試（依次執行所有）
//
//  特點：
//    - 異步執行（FreeRTOS task），不阻塞主循環
//    - 同一時間只能運行一個測試
//    - 通過 isRunning() 查詢狀態
//    - 通過 lastResult() 查詢結果
// ─────────────────────────────────────────────────────────────────────────────

enum class TestType : uint8_t {
    NONE      = 0,
    LED       = 1,
    DISP      = 2,   // 注意：避免與 Arduino DISPLAY 宏衝突
    MOTOR     = 3,
    GPIO      = 4,
    ALL       = 5,
};

enum class TestState : uint8_t {
    IDLE    = 0,
    RUNNING = 1,
    PASSED  = 2,
    FAILED  = 3,
};

struct SelfTestConfig {
    uint8_t pin_led = 2;
    uint8_t pin_in1 = 18;
    uint8_t pin_in2 = 19;
};

class SelfTest {
public:
    explicit SelfTest(const SelfTestConfig& cfg = SelfTestConfig{});

    // 注入依賴
    void attach(MotorController* motor, DirectDisplay* display);

    // 啟動測試（異步），返回 true 表示成功啟動
    bool start(TestType type);

    // 查詢狀態
    bool        isRunning()    const { return _state == TestState::RUNNING; }
    TestState   state()        const { return _state; }
    TestType    currentType()  const { return _current; }
    String      currentStep()  const { return _current_step; }
    uint8_t     progressPct()  const { return _progress; }

    // 序列化為 JSON
    String toJson() const;

    // 將 TestType 與字串互轉
    static TestType  fromString(const String& s);
    static const char* toString(TestType t);

    // ── 內部：由 FreeRTOS 任務調用 ──
    void _runTask();

private:
    SelfTestConfig    _cfg;
    MotorController*  _motor   = nullptr;
    DirectDisplay*    _display = nullptr;

    volatile TestState _state    = TestState::IDLE;
    volatile TestType  _current  = TestType::NONE;
    volatile uint8_t   _progress = 0;
    String             _current_step;

    TaskHandle_t       _task = nullptr;

    // 各個測試實現
    void _testLED();
    void _testDisplay();
    void _testMotor();
    void _testGPIO();
    void _testAll();

    void _setStep(const String& step, uint8_t progress);

    static void _taskFn(void* param);
};
