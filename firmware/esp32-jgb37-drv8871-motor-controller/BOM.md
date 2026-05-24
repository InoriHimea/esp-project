# BOM — ESP32 JGB37 DRV8871 Motor Controller

This BOM follows the final v3 hardware direction: 4-channel industrial slip ring, upper 800mm tray friction drive, ESP32/DRV8871 in the lower tray or an external control box, one blue LED initially, buzzer, and voltage/current sensing. The legacy 3-digit 7-segment display is no longer part of the purchase plan.

## Core power, slip ring, and motor control

| Item | Status | Component | Recommended model | Specs | Qty | Notes |
|------|--------|-----------|-------------------|-------|-----|-------|
| 1 | Required / acquired | Industrial slip ring | Capsule slip ring | 4-channel, >=5A/channel, >=240V rating | 1 | CH1/CH2 for 220V L/N, CH3/CH4 for motor low-voltage channel |
| 2 | Required / existing | ESP32 development board | ESP32 DevKit / WROOM-32 | 3.3V logic, WiFi | 1 | Main controller; lower tray or external control box |
| 3 | Required / existing | H-bridge motor driver | DRV8871 module | 24V input, >=3A peak preferred | 1 | Drives JGB37 through IN1/IN2 PWM |
| 4 | Required / existing | DC gear motor | JGB37-520 | 24V, ~45 RPM, 6mm shaft | 1 | Fixed on upper 800mm tray, drives friction wheel |
| 5 | Required / existing | DC power supply | Generic adapter | 24V / 2A | 1 | External motor/control supply |
| 6 | Required / existing | Buck converter | Mini 560 | 24V to 5V/3A | 1 | Powers ESP32 VIN/5V rail |
| 7 | Required | DC barrel jack | 5.5 x 2.1mm | Panel or PCB mount | 1 | 24V input to lower tray/control box |
| 8 | Required | Resettable fuse or fuse holder | MF-R110 or 2A fuse | ~1.1A hold / 2.2A trip, or replaceable 2A | 1 | 500mA hold may trip too easily with friction load |
| 9 | Required | TVS diode | SMBJ24A | 24V bidirectional | 1 | Surge suppression across protected 24V rail |
| 10 | Required | Bulk capacitor | Nichicon UPW or equivalent | 1000uF / 35V, 105C | 1 | Near DRV8871 VM/GND |
| 11 | Required | Ceramic decoupling capacitor | X7R ceramic | 0.1uF / 100V | 2 | 24V high-frequency decoupling |
| 12 | Required | Wire | Red/black copper wire | >=0.75mm² for power | 1 set | 220V and low voltage must use separate colors/bundles |
| 13 | Required | Heat shrink tubing | 4mm / 8mm / mixed | High-temperature preferred | 1 set | Insulation and strain relief |
| 14 | Recommended | Terminal block / connector | KF301 / XT30 / locking connector | Rated for current and voltage | 1 set | Serviceable wiring between control box, slip ring, and motor |

## Friction-drive mechanical parts

| Item | Status | Component | Recommended model | Specs | Qty | Notes |
|------|--------|-----------|-------------------|-------|-----|-------|
| M1 | Required | Friction wheel | Rubber / silicone wheel | 20-35mm diameter, 8-15mm width | 1-2 | Choose high-friction, heat-tolerant material |
| M2 | Required | Motor bracket | JGB37 bracket | Metal bracket | 1 | Fixes motor to underside of 800mm upper tray |
| M3 | Required | Fasteners | M3/M2 screws, washers | Short screws, spring washers | 1 set | Use threadlocker where vibration exists |
| M4 | Recommended | Height shims / elastic pad | Silicone pad / spring shim | 0.5-2mm adjustment | 1 set | Sets friction wheel contact pressure |
| M5 | Recommended | Cable bridge / ramp | TPU / silicone / rubber | 150-180mm long, <=8-10 degree slope | 1+ | Only if cables cannot avoid friction-wheel path |
| M6 | Recommended | Anti-slip strip | Rubber tape | Heat-tolerant | 1 set | Can be used on ramp surface if printed plastic is too smooth |
| M7 | Recommended | Mica insulation board | Mica sheet | 0.5-1mm, cuttable, >=500C | 1-2 | Add between hot upper area and motor/bracket/wiring |

## Indicator and buzzer

| Item | Status | Component | Recommended model | Specs | Qty | Notes |
|------|--------|-----------|-------------------|-------|-----|-------|
| I1 | Required | Blue status LED | 5mm or panel LED | Blue, high-brightness | 1 | First-build visible status indicator |
| I2 | Required | LED resistor | 330Ω | 1/4W | 1 | GPIO2 -> resistor -> blue LED -> GND |
| I3 | Recommended / reserved | Red LED | 5mm or panel LED | Red | 1 | Fault indicator expansion |
| I4 | Recommended / reserved | Green LED | 5mm or panel LED | Green | 1 | Normal/network indicator expansion |
| I5 | Recommended / reserved | Yellow LED | 5mm or panel LED | Yellow | 1 | Warning/config/self-test indicator expansion |
| I6 | Recommended / reserved | LED resistors | 330Ω or 470Ω | 1/4W | 3 | One per reserved discrete LED |
| I7 | Optional / reserved | Addressable RGB LED | WS2812B | 5V data LED | 1 | Future single-wire RGB status light |
| I8 | Optional / reserved | RGB data resistor | 330Ω | 1/4W | 1 | GPIO32 -> DIN |
| I9 | Optional / reserved | RGB bulk capacitor | Electrolytic | 1000uF / >=6.3V | 1 | Across 5V/GND near WS2812B |
| I10 | Required | Passive buzzer | 12mm passive buzzer | 3-5V | 1 | Multi-tone alerts via PWM |
| I11 | Required | NPN transistor | S8050 | TO-92 | 1 | Buzzer low-side driver |
| I12 | Required | Base resistor | 1kΩ | 1/4W | 1 | ESP32 GPIO to S8050 base |
| I13 | Recommended | Base pulldown resistor | 100kΩ | 1/4W | 1 | Prevents boot-time false beep |
| I14 | Recommended | Flyback diode | 1N4148 / 1N4007 | For magnetic buzzer | 1 | Optional for piezo, recommended for magnetic buzzer |

## Voltage and current sensing

| Item | Status | Component | Recommended model | Specs | Qty | Notes |
|------|--------|-----------|-------------------|-------|-----|-------|
| S1 | Recommended | Current sensor | INA226 module | >=36V high-side current/voltage sensor, I2C | 1 | Preferred over INA219 for 24V systems |
| S2 | Optional | I2C pull-up resistor | 4.7kΩ | 1/4W | 2 | Only if INA226 module lacks pull-ups |
| S3 | Recommended | Voltage divider high resistor | 100kΩ | 1%, 1/4W | 1 | 24V_PROT to ADC node |
| S4 | Recommended | Voltage divider low resistor | 10kΩ | 1%, 1/4W | 1 | ADC node to GND |
| S5 | Recommended | ADC series resistor | 1kΩ | 1/4W | 1 | ADC node to GPIO34 |
| S6 | Recommended | ADC filter capacitor | X7R ceramic | 0.1uF / 50V | 1 | ADC node to GND |

## Future reserved sensors, not first-build purchases

| Item | Status | Component | Recommended model | Specs | Qty | Notes |
|------|--------|-----------|-------------------|-------|-----|-------|
| F1 | Future / reserved | Temperature sensor | DS18B20 waterproof probe | -55C to 125C | 1-2 | Add after upgrading to 6+ channel slip ring or external sensor path |
| F2 | Future / reserved | Temp sensor pull-up | 4.7kΩ | 1/4W | 1 | For DS18B20 data line |
| F3 | Future / reserved | Humidity sensor | SHT31 / SHT35 module | I2C | 1 | Use only if sensor can be placed away from heater |
| F4 | Future / reserved | Leak/water sensor | Waterproof probe / leak board | Digital or analog | 1 | Requires safe low-voltage routing |
| F5 | Not planned now | Hall sensor | AH3144 + magnet | Digital Hall switch | 0 | Not practical for all faces; upper side near heating wire |

## Deprecated / do not purchase for final build

| Component | Reason |
|-----------|--------|
| 3-digit 7-segment display | Not visible in final installation; consumes GPIO; had ghosting issue |
| 2N5401/S8050 digit high-side display driver set | Only needed for deprecated 7-segment display |
| 220Ω segment resistor x7 | Only needed for deprecated 7-segment display |
| MIC2981 / UDN2981 display driver | Only needed if retaining deprecated display |
| Hall RPM measurement kit | Deferred; mechanical placement not suitable now |

## Notes

- Keep 220V wiring physically separated from low-voltage wiring.
- Use heat-resistant insulation around heater and motor area.
- Retain the original mica sheet and add mica board near motor/bracket if heat exposure is possible.
- Use voltage/current sensing for software protection: undervoltage, overcurrent, stall, cable-ramp impact detection.
