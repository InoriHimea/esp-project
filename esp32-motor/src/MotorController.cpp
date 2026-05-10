#include "MotorController.h"

// ─────────────────────────────────────────────────────────────────────────────
MotorController::MotorController(const MotorConfig& cfg) : _cfg(cfg) {}

void MotorController::begin() {
    _mutex = xSemaphoreCreateMutex();

    // Configure LEDC channels
    ledcSetup(_cfg.ledc_ch_in1, _cfg.pwm_freq_hz, _cfg.pwm_resolution);
    ledcSetup(_cfg.ledc_ch_in2, _cfg.pwm_freq_hz, _cfg.pwm_resolution);
    ledcAttachPin(_cfg.pin_in1, _cfg.ledc_ch_in1);
    ledcAttachPin(_cfg.pin_in2, _cfg.ledc_ch_in2);

    coast(); // safe initial state

    // Launch ramp task on core 1 (Arduino loop is on core 1, but this task
    // has higher priority so it pre-empts cleanly)
    xTaskCreatePinnedToCore(
        _rampTaskFn,
        "motor_ramp",
        2048,          // stack words
        this,
        5,             // priority (higher than loop's 1)
        &_ramp_task,
        1              // core
    );

    Serial.printf("[Motor] begin() — IN1=GPIO%d IN2=GPIO%d PWM=%uHz\n",
                  _cfg.pin_in1, _cfg.pin_in2, _cfg.pwm_freq_hz);
}

// ─── Speed control ────────────────────────────────────────────────────────────
void MotorController::setSpeed(uint16_t target, MotorDirection dir, uint32_t ramp_ms) {
    xSemaphoreTake(_mutex, portMAX_DELAY);

    target = min(target, _cfg.max_speed);
    _target_duty = target;
    _dir         = dir;
    _state       = (target == 0) ? MotorState::STOPPED : MotorState::RAMPING;

    uint32_t effective_ramp = (ramp_ms == 0) ? _cfg.default_ramp_ms : ramp_ms;
    _computeRampStep(_current_duty, target, effective_ramp);

    xSemaphoreGive(_mutex);
    Serial.printf("[Motor] setSpeed target=%u dir=%s ramp=%ums step=%u\n",
                  target, dir == MotorDirection::FORWARD ? "FWD" : "REV",
                  effective_ramp, _ramp_step);
}

void MotorController::stop() {
    setSpeed(0, _dir, _cfg.default_ramp_ms);
}

void MotorController::brake() {
    xSemaphoreTake(_mutex, portMAX_DELAY);
    _target_duty  = 0;
    _current_duty = 0;
    _state        = MotorState::BRAKING;
    // Both IN1 and IN2 high → active brake
    ledcWrite(_cfg.ledc_ch_in1, (1 << _cfg.pwm_resolution) - 1);
    ledcWrite(_cfg.ledc_ch_in2, (1 << _cfg.pwm_resolution) - 1);
    xSemaphoreGive(_mutex);
}

void MotorController::coast() {
    xSemaphoreTake(_mutex, portMAX_DELAY);
    _target_duty  = 0;
    _current_duty = 0;
    _state        = MotorState::COASTING;
    ledcWrite(_cfg.ledc_ch_in1, 0);
    ledcWrite(_cfg.ledc_ch_in2, 0);
    xSemaphoreGive(_mutex);
}

// ─── Config setters ───────────────────────────────────────────────────────────
void MotorController::setMaxSpeed(uint16_t max_spd) {
    _cfg.max_speed = min(max_spd, (uint16_t)((1 << _cfg.pwm_resolution) - 1));
}

void MotorController::setRampTime(uint32_t ms) {
    _cfg.default_ramp_ms = ms;
}

float MotorController::speedPercent() const {
    if (_cfg.max_speed == 0) return 0.0f;
    return (_current_duty * 100.0f) / _cfg.max_speed;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────
void MotorController::_computeRampStep(uint16_t from, uint16_t to, uint32_t ramp_ms) {
    uint16_t delta = (to > from) ? (to - from) : (from - to);
    if (delta == 0 || ramp_ms == 0) {
        _ramp_step = delta;
        return;
    }
    uint32_t ticks = ramp_ms / _cfg.ramp_tick_ms;
    _ramp_step = max((uint16_t)1, (uint16_t)(delta / ticks));
}

void MotorController::_applyDuty(uint16_t duty, MotorDirection dir) {
    // Clamp
    duty = min(duty, _cfg.max_speed);
    if (dir == MotorDirection::FORWARD) {
        ledcWrite(_cfg.ledc_ch_in1, duty);
        ledcWrite(_cfg.ledc_ch_in2, 0);
    } else {
        ledcWrite(_cfg.ledc_ch_in1, 0);
        ledcWrite(_cfg.ledc_ch_in2, duty);
    }
}

void MotorController::_rampTick() {
    xSemaphoreTake(_mutex, portMAX_DELAY);

    if (_state == MotorState::RAMPING) {
        if (_current_duty < _target_duty) {
            _current_duty = min((uint16_t)(_current_duty + _ramp_step), _target_duty);
        } else if (_current_duty > _target_duty) {
            _current_duty = (_current_duty >= _ramp_step)
                            ? _current_duty - _ramp_step
                            : 0;
            _current_duty = max(_current_duty, _target_duty);
        }

        _applyDuty(_current_duty, _dir);

        if (_current_duty == _target_duty) {
            _state = (_target_duty == 0) ? MotorState::STOPPED : MotorState::RUNNING;
        }
    }

    xSemaphoreGive(_mutex);
}

// ─── FreeRTOS task ────────────────────────────────────────────────────────────
void MotorController::_rampTaskFn(void* param) {
    MotorController* self = static_cast<MotorController*>(param);
    TickType_t lastWake = xTaskGetTickCount();
    while (true) {
        self->_rampTick();
        vTaskDelayUntil(&lastWake, pdMS_TO_TICKS(self->_cfg.ramp_tick_ms));
    }
}
