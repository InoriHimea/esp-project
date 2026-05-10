# Requirements Document

## Introduction

This feature adds a physical LED status indicator to the ESP32 motor controller. The LED is wired to GPIO2 (via a 150Ω current-limiting resistor) and provides at-a-glance visual feedback of the motor's current operating state without requiring a serial monitor or network connection. The implementation is confined to `main.cpp` — no new files are needed.

Hardware wiring: GPIO2 → 150Ω resistor → LED anode → LED cathode → GND.

## Glossary

- **LED_Indicator**: The physical LED connected to GPIO2 with a 150Ω series resistor.
- **Motor_Controller**: The `MotorController` object (`motor`) that manages motor state and direction.
- **PIN_LED**: The compile-time constant `2` identifying GPIO2 as the LED output pin.
- **LED_State_Machine**: The non-blocking blink logic executed inside `loop()` using static timing variables.
- **Motor_State**: The value returned by `motor.state()`, one of: `STOPPED`, `RAMPING`, `RUNNING`, `BRAKING`, `COASTING`.
- **Motor_Direction**: The value returned by `motor.direction()`, either `FORWARD` or `REVERSE`.
- **Status_JSON**: The JSON object assembled by `buildStatusJson()` and broadcast over HTTP and WebSocket.

---

## Requirements

### Requirement 1: LED Pin Declaration

**User Story:** As a firmware developer, I want a named constant for the LED pin, so that the GPIO assignment is documented and easy to change.

#### Acceptance Criteria

1. THE `main.cpp` SHALL declare a compile-time constant of type `uint8_t` with value `2` in the Pins section alongside `PIN_IN1` and `PIN_IN2`, identifying GPIO2 as the LED output pin.
2. THE `main.cpp` SHALL reference the LED GPIO exclusively through `PIN_LED` at every call site where the LED pin is used — including `pinMode`, `digitalWrite`, and `digitalRead` calls targeting the LED — with no bare integer literal `2` appearing in LED-related code.

---

### Requirement 2: LED Initialization

**User Story:** As a firmware developer, I want the LED pin configured as an output and driven LOW at startup, so that the LED starts in the off state and does not float.

#### Acceptance Criteria

1. WHEN `setup()` executes, THE `LED_Indicator` SHALL be configured as a digital output via `pinMode(PIN_LED, OUTPUT)` unconditionally, independent of whether `motor.begin()` is called or succeeds.
2. WHEN `setup()` executes, THE `LED_Indicator` SHALL be driven LOW via `digitalWrite(PIN_LED, LOW)` unconditionally, independent of motor initialization status, and this call SHALL occur after `pinMode(PIN_LED, OUTPUT)`.

---

### Requirement 3: LED Behavior — STOPPED and COASTING States

**User Story:** As an operator, I want the LED to be off when the motor is stopped or coasting, so that no light means no motor activity.

#### Acceptance Criteria

1. WHEN `motor.state()` transitions to `STOPPED` or `COASTING`, THE `LED_Indicator` SHALL be driven LOW, AND WHILE `motor.state()` remains `STOPPED` or `COASTING`, THE `LED_Indicator` SHALL remain off (GPIO2 held LOW) with no toggling.

---

### Requirement 4: LED Behavior — RAMPING State (Slow Blink)

**User Story:** As an operator, I want the LED to blink slowly while the motor is accelerating, so that I can distinguish a ramp-up phase from steady running.

#### Acceptance Criteria

1. WHILE `motor.state()` is `RAMPING`, THE `LED_Indicator` SHALL blink with a period of 600 ms (300 ms on, 300 ms off), beginning with the LED driven HIGH on the first toggle after entering the `RAMPING` state.
2. WHILE `motor.state()` is `RAMPING`, THE `LED_State_Machine` SHALL toggle the LED output using elapsed-time comparison against `lastLedTick` without invoking `delay()` or any other call that suspends `loop()` execution.

---

### Requirement 5: LED Behavior — RUNNING FORWARD State (Solid On)

**User Story:** As an operator, I want the LED to stay solid on when the motor runs forward, so that steady illumination indicates normal forward operation.

#### Acceptance Criteria

1. WHILE `motor.state()` is `RUNNING` AND `motor.direction()` is `FORWARD`, THE `LED_State_Machine` SHALL write `HIGH` to `PIN_LED` on every iteration without toggling, ensuring the LED remains continuously on with no LOW pulses.
2. WHEN `motor.state()` first becomes `RUNNING` AND `motor.direction()` is `FORWARD`, THE `LED_Indicator` SHALL be driven HIGH no later than the first `LED_State_Machine` evaluation after the transition.

---

### Requirement 6: LED Behavior — RUNNING REVERSE State (Fast Blink)

**User Story:** As an operator, I want the LED to blink rapidly when the motor runs in reverse, so that I can immediately distinguish reverse from forward operation.

#### Acceptance Criteria

1. WHILE `motor.state()` is `RUNNING` AND `motor.direction()` is `REVERSE`, THE `LED_Indicator` SHALL blink with a target half-period of 75 ms (150 ms full period), with a timing tolerance of ±10 ms per half-cycle due to system scheduling.
2. WHILE `motor.state()` is `RUNNING` AND `motor.direction()` is `REVERSE`, THE `LED_State_Machine` SHALL toggle the LED output using elapsed-time comparison against `lastLedTick` without invoking `delay()` or any other call that suspends `loop()` execution.
3. WHEN `motor.state()` exits `RUNNING REVERSE`, THE `LED_State_Machine` SHALL immediately apply the output behavior defined for the new state on the next `loop()` iteration, without completing any in-progress blink cycle.

---

### Requirement 7: LED Behavior — BRAKING State (Rapid Short Blink)

**User Story:** As an operator, I want the LED to flash very rapidly during braking, so that the braking state is visually distinct from all other states.

#### Acceptance Criteria

1. WHILE `motor.state()` is `BRAKING`, THE `LED_Indicator` SHALL blink with a target half-period of 25 ms (50 ms full period), with a timing tolerance of ±10 ms per half-cycle due to system scheduling.
2. WHILE `motor.state()` is `BRAKING`, THE `LED_State_Machine` SHALL toggle the LED output without using `delay()` or blocking calls.

---

### Requirement 8: Non-Blocking LED State Machine

**User Story:** As a firmware developer, I want the LED logic to be non-blocking, so that it does not interfere with motor control, WebSocket broadcasts, or MQTT processing.

#### Acceptance Criteria

1. THE `LED_State_Machine` SHALL use `static` variables `lastLedTick` (uint32_t) and `ledState` (bool) to track timing and output state between `loop()` iterations.
2. THE `LED_State_Machine` SHALL evaluate the current `motor.state()` and `motor.direction()` on every `loop()` iteration to determine the LED output behavior for that iteration.
3. WHEN the result of `millis() - lastLedTick` (computed using overflow-safe unsigned subtraction) is less than the current blink interval, THE `LED_State_Machine` SHALL skip toggling and leave the LED output unchanged.
4. WHEN the result of `millis() - lastLedTick` reaches or exceeds the current blink interval, THE `LED_State_Machine` SHALL toggle `ledState`, write it to `PIN_LED`, and set `lastLedTick = millis()`.
5. WHEN `motor.state()` is `STOPPED` or `COASTING`, THE `LED_State_Machine` SHALL write `LOW` to `PIN_LED` directly without entering the toggle path, regardless of `lastLedTick` or `ledState`.

---

### Requirement 9: LED State Exposed in Status JSON (Optional)

**User Story:** As a developer, I want the LED's current on/off state included in the REST API status response, so that remote clients can reflect the physical indicator state.

#### Acceptance Criteria

1. WHERE the LED status field is included, THE `Status_JSON` SHALL contain a field `"led"` with string value `"on"` when GPIO2 reads HIGH and `"off"` when GPIO2 reads LOW, using `digitalRead(PIN_LED)` as the authoritative source.
2. WHERE the LED status field is not included (disabled or omitted), THE `Status_JSON` SHALL not contain a `"led"` key, and clients SHALL treat the absence of the field as equivalent to an unknown LED state.
