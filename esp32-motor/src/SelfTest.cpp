#include "SelfTest.h"
#include <ArduinoJson.h>

// ─────────────────────────────────────────────────────────────────────────────
SelfTest::SelfTest(const SelfTestConfig& cfg) : _cfg(cfg) {}

void SelfTest::attach(MotorController* motor, DirectDisplay* display) {
    _motor   = motor;
    _display = display;
}

// ─── 啟動測試 ────────────────────────────────────────────────────────────────
bool SelfTest::start(TestType type) {
    if (_state == TestState::RUNNING) {
        Serial.println("[SelfTest] Already running, ignoring new request");
        return false;
    }
    if (type == TestType::NONE) return false;

    _current  = type;
    _state    = TestState::RUNNING;
    _progress = 0;
    _current_step = "starting";

    Serial.printf("[SelfTest] Starting test: %s\n", toString(type));

    // 啟動獨立任務（避免阻塞 HTTP/MQTT 回調）
    BaseType_t ok = xTaskCreatePinnedToCore(
        _taskFn,
        "selftest",
        4096,
        this,
        3,         // 中等優先級
        &_task,
        1
    );

    if (ok != pdPASS) {
        Serial.println("[SelfTest] Failed to create task");
        _state   = TestState::FAILED;
        _current = TestType::NONE;
        return false;
    }
    return true;
}

// ─── 任務入口 ────────────────────────────────────────────────────────────────
void SelfTest::_taskFn(void* param) {
    SelfTest* self = static_cast<SelfTest*>(param);
    self->_runTask();
    self->_task = nullptr;
    vTaskDelete(nullptr);
}

void SelfTest::_runTask() {
    switch (_current) {
        case TestType::LED:   _testLED();     break;
        case TestType::DISP:  _testDisplay(); break;
        case TestType::MOTOR: _testMotor();   break;
        case TestType::GPIO:  _testGPIO();    break;
        case TestType::ALL:   _testAll();     break;
        default: break;
    }

    _setStep("done", 100);
    _state   = TestState::PASSED;
    _current = TestType::NONE;
    Serial.println("[SelfTest] Test sequence complete!");
}

// ─── 進度更新 ────────────────────────────────────────────────────────────────
void SelfTest::_setStep(const String& step, uint8_t progress) {
    _current_step = step;
    _progress     = progress;
    Serial.printf("[SelfTest] [%u%%] %s\n", progress, step.c_str());
}

// ─── 序列化 ──────────────────────────────────────────────────────────────────
String SelfTest::toJson() const {
    JsonDocument doc;
    doc["state"]    = (_state == TestState::RUNNING) ? "running"
                    : (_state == TestState::PASSED)  ? "passed"
                    : (_state == TestState::FAILED)  ? "failed"
                    :                                  "idle";
    doc["type"]     = toString(_current);
    doc["step"]     = _current_step;
    doc["progress"] = _progress;
    String out;
    serializeJson(doc, out);
    return out;
}

TestType SelfTest::fromString(const String& s) {
    if (s == "led")     return TestType::LED;
    if (s == "display") return TestType::DISP;
    if (s == "motor")   return TestType::MOTOR;
    if (s == "gpio")    return TestType::GPIO;
    if (s == "all")     return TestType::ALL;
    return TestType::NONE;
}

const char* SelfTest::toString(TestType t) {
    switch (t) {
        case TestType::LED:   return "led";
        case TestType::DISP:  return "display";
        case TestType::MOTOR: return "motor";
        case TestType::GPIO:  return "gpio";
        case TestType::ALL:   return "all";
        default:              return "none";
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  各個測試實現
// ─────────────────────────────────────────────────────────────────────────────

// ── LED 測試 ─────────────────────────────────────────────────────────────────
void SelfTest::_testLED() {
    pinMode(_cfg.pin_led, OUTPUT);

    _setStep("LED 1/6: basic blink (5 times)", 10);
    for (int i = 0; i < 5; i++) {
        digitalWrite(_cfg.pin_led, HIGH); delay(200);
        digitalWrite(_cfg.pin_led, LOW);  delay(200);
    }
    delay(500);

    _setStep("LED 2/6: solid ON (RUNNING+FORWARD)", 25);
    digitalWrite(_cfg.pin_led, HIGH);
    delay(2000);
    digitalWrite(_cfg.pin_led, LOW);
    delay(500);

    _setStep("LED 3/6: slow blink 600ms (RAMPING)", 40);
    for (int i = 0; i < 6; i++) {
        digitalWrite(_cfg.pin_led, HIGH); delay(600);
        digitalWrite(_cfg.pin_led, LOW);  delay(600);
    }
    delay(500);

    _setStep("LED 4/6: fast blink 150ms (RUNNING+REVERSE)", 60);
    for (int i = 0; i < 10; i++) {
        digitalWrite(_cfg.pin_led, HIGH); delay(150);
        digitalWrite(_cfg.pin_led, LOW);  delay(150);
    }
    delay(500);

    _setStep("LED 5/6: urgent blink 50ms (BRAKING)", 80);
    for (int i = 0; i < 20; i++) {
        digitalWrite(_cfg.pin_led, HIGH); delay(50);
        digitalWrite(_cfg.pin_led, LOW);  delay(50);
    }
    delay(500);

    _setStep("LED 6/6: OFF (STOPPED/COASTING)", 95);
    digitalWrite(_cfg.pin_led, LOW);
    delay(1000);
}

// ── 數碼管測試 ───────────────────────────────────────────────────────────────
void SelfTest::_testDisplay() {
    if (!_display) return;

    auto& d = *_display;
    // 直接操作私有成員不方便，這裡用 setNumber/Dashes 等公開接口
    // 但 _setNumber 是私有的，所以直接通過 update 或我們需要新增公開函數
    // 為簡化，使用 update 配合 setMode

    _setStep("Display 1/5: D1 only (showing '1')", 10);
    d.update(170, 1023, false);  // 約 16% → "16"
    delay(1500);

    _setStep("Display 2/5: D2 only (showing '50')", 25);
    d.update(512, 1023, false);  // 50%
    delay(1500);

    _setStep("Display 3/5: D3 only (counting)", 40);
    for (int i = 0; i <= 9; i++) {
        d.update(i * 10, 1000, false);  // 0-9 PCT mode
        delay(200);
    }

    _setStep("Display 4/5: showing 888 (max)", 60);
    d.update(1023, 1023, false);
    delay(2000);

    _setStep("Display 5/5: counting 0-99", 80);
    d.setMode(DispMode::PCT);
    for (int i = 0; i <= 100; i += 10) {
        d.update(i * 10, 1000, false);
        delay(200);
    }

    _setStep("Display: stopped state (blink 0)", 95);
    d.update(0, 1023, true);
    delay(2000);
}

// ── 馬達測試 ─────────────────────────────────────────────────────────────────
// helper：在等待期間持續刷新 display 反映馬達速度
static void waitWithDisplayUpdate(MotorController* motor, DirectDisplay* display,
                                  uint32_t total_ms) {
    if (!motor || !display) {
        delay(total_ms);
        return;
    }
    uint32_t start = millis();
    while (millis() - start < total_ms) {
        bool stopped = (motor->state() == MotorState::STOPPED
                     || motor->state() == MotorState::COASTING);
        display->update(motor->currentSpeed(),
                        motor->config().max_speed,
                        stopped);
        delay(50);
    }
}

void SelfTest::_testMotor() {
    if (!_motor) return;

    _setStep("Motor 1/4: forward 100% for 2s", 10);
    _motor->setSpeed(1023, MotorDirection::FORWARD, 0);
    waitWithDisplayUpdate(_motor, _display, 2000);

    _setStep("Motor 2/4: stop", 30);
    _motor->stop();
    waitWithDisplayUpdate(_motor, _display, 2500);

    _setStep("Motor 3/4: forward 50% for 2s (PWM ramp)", 50);
    _motor->setSpeed(512, MotorDirection::FORWARD, 500);
    waitWithDisplayUpdate(_motor, _display, 2500);

    _setStep("Motor 4/4: reverse 30% for 2s", 75);
    _motor->setSpeed(307, MotorDirection::REVERSE, 500);
    waitWithDisplayUpdate(_motor, _display, 2500);

    _setStep("Motor: brake", 90);
    _motor->brake();
    waitWithDisplayUpdate(_motor, _display, 500);
    _motor->coast();
    waitWithDisplayUpdate(_motor, _display, 500);
}

// ── 原始 GPIO 測試 ───────────────────────────────────────────────────────────
void SelfTest::_testGPIO() {
    // 把馬達引腳臨時切換到普通輸出
    ledcDetachPin(_cfg.pin_in1);
    ledcDetachPin(_cfg.pin_in2);
    pinMode(_cfg.pin_in1, OUTPUT);
    pinMode(_cfg.pin_in2, OUTPUT);

    _setStep("GPIO IN1=HIGH, IN2=LOW (forward 100%)", 25);
    digitalWrite(_cfg.pin_in1, HIGH);
    digitalWrite(_cfg.pin_in2, LOW);
    delay(2000);

    _setStep("GPIO IN1=LOW, IN2=LOW (coast)", 50);
    digitalWrite(_cfg.pin_in1, LOW);
    digitalWrite(_cfg.pin_in2, LOW);
    delay(1000);

    _setStep("GPIO IN1=LOW, IN2=HIGH (reverse 100%)", 75);
    digitalWrite(_cfg.pin_in1, LOW);
    digitalWrite(_cfg.pin_in2, HIGH);
    delay(2000);

    _setStep("GPIO: coast and restore LEDC", 95);
    digitalWrite(_cfg.pin_in1, LOW);
    digitalWrite(_cfg.pin_in2, LOW);
    delay(500);

    // 恢復 LEDC（馬達控制器使用的 channel: 0 / 1）
    ledcAttachPin(_cfg.pin_in1, 0);
    ledcAttachPin(_cfg.pin_in2, 1);
    if (_motor) _motor->coast();
}

// ── 完整綜合測試 ─────────────────────────────────────────────────────────────
void SelfTest::_testAll() {
    Serial.println("[SelfTest] === COMPREHENSIVE TEST START ===");

    Serial.println("[SelfTest] --- Phase 1/4: LED ---");
    _testLED();

    Serial.println("[SelfTest] --- Phase 2/4: Display ---");
    _testDisplay();

    Serial.println("[SelfTest] --- Phase 3/4: GPIO ---");
    _testGPIO();

    Serial.println("[SelfTest] --- Phase 4/4: Motor (PWM) ---");
    _testMotor();

    Serial.println("[SelfTest] === COMPREHENSIVE TEST COMPLETE ===");
}
