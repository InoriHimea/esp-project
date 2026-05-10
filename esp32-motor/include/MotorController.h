#pragma once
#include <Arduino.h>

// ─────────────────────────────────────────────────────────────────────────────
//  MotorController
//  Drives a DRV8871 H-bridge via two LEDC PWM channels.
//
//  DRV8871 Truth Table:
//    IN1=PWM  IN2=0   → Forward (speed proportional to duty)
//    IN1=0    IN2=PWM → Reverse
//    IN1=1    IN2=1   → Brake (active short)
//    IN1=0    IN2=0   → Coast (free-wheel)
// ─────────────────────────────────────────────────────────────────────────────

enum class MotorState : uint8_t {
    STOPPED  = 0,
    RAMPING  = 1,
    RUNNING  = 2,
    BRAKING  = 3,
    COASTING = 4,
};

enum class MotorDirection : int8_t {
    FORWARD = 1,
    REVERSE = -1,
};

struct MotorConfig {
    uint8_t  pin_in1        = 18;      // GPIO for DRV8871 IN1
    uint8_t  pin_in2        = 19;      // GPIO for DRV8871 IN2
    uint8_t  ledc_ch_in1    = 0;       // LEDC channel for IN1
    uint8_t  ledc_ch_in2    = 1;       // LEDC channel for IN2
    uint32_t pwm_freq_hz    = 20000;   // 20 kHz — above audible range
    uint8_t  pwm_resolution = 10;      // bits (0–1023)
    uint16_t max_speed      = 1023;    // max duty cycle (100 %)
    uint16_t min_speed      = 0;       // minimum moving speed
    uint32_t default_ramp_ms = 2000;   // time to reach target from 0
    uint32_t ramp_tick_ms   = 10;      // ramp task tick interval
};

class MotorController {
public:
    explicit MotorController(const MotorConfig& cfg = MotorConfig{});

    // ── Lifecycle ─────────────────────────────────────────────────────────────
    void begin();   // call once in setup()
    void stop();    // graceful deceleration to 0, then coast
    void brake();   // active short-circuit brake (immediate)
    void coast();   // cut drive (free-wheel)

    // ── Speed control ─────────────────────────────────────────────────────────
    // target: 0 – max_speed
    // ramp_ms: duration to reach target; 0 = instant
    void setSpeed(uint16_t target, MotorDirection dir, uint32_t ramp_ms = 0);
    void setMaxSpeed(uint16_t max_spd);
    void setRampTime(uint32_t ms);

    // ── Getters ───────────────────────────────────────────────────────────────
    uint16_t        currentSpeed()     const { return _current_duty; }
    uint16_t        targetSpeed()      const { return _target_duty; }
    MotorDirection  direction()        const { return _dir; }
    MotorState      state()            const { return _state; }
    float           speedPercent()     const;
    MotorConfig&    config()                 { return _cfg; }
    const MotorConfig& config()        const { return _cfg; }

    // ── Internal: called by FreeRTOS task (public for task wrapper) ───────────
    void _rampTick();

private:
    MotorConfig   _cfg;
    uint16_t      _current_duty = 0;
    uint16_t      _target_duty  = 0;
    uint16_t      _ramp_step    = 1;
    MotorDirection _dir          = MotorDirection::FORWARD;
    MotorState    _state         = MotorState::STOPPED;
    TaskHandle_t  _ramp_task     = nullptr;
    SemaphoreHandle_t _mutex     = nullptr;

    void _applyDuty(uint16_t duty, MotorDirection dir);
    void _computeRampStep(uint16_t from, uint16_t to, uint32_t ramp_ms);
    static void _rampTaskFn(void* param);
};
