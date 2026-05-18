# BOM — ESP32 JGB37 DRV8871 Motor Controller

This bill of materials covers the ESP32 motor controller firmware/hardware target: ESP32 DevKit + DRV8871 + JGB37-520 24V gear motor, with optional indicators, sensing, and the legacy 3-digit common-anode display circuit.

## Core power and motor control

| Item | Status | Component | Recommended model | Specs | Qty | Notes |
|------|--------|-----------|-------------------|-------|-----|-------|
| 1 | Required | ESP32 development board | ESP32 DevKit / WROOM-32 | 3.3V logic, WiFi | 1 | Main controller |
| 2 | Required | H-bridge motor driver | DRV8871 module | 24V input, >=1.5A load | 1 | Drives JGB37 motor through IN1/IN2 PWM |
| 3 | Required | DC gear motor | JGB37-520 | 24V, ~45 RPM | 1 | Rotation actuator |
| 4 | Required | DC power supply | Generic adapter | 24V / 2A | 1 | External motor supply |
| 5 | Required | Buck converter | Mini 560 | 24V to 5V/3A | 1 | Powers ESP32 VIN/5V rail |
| 6 | Required | Resettable fuse | MF-R050 | 500mA / 30V | 1 | 24V rail protection |
| 7 | Required | TVS diode | SMBJ24A | 24V bidirectional | 1 | Surge suppression across 24V rail |
| 8 | Required | Bulk capacitor | Nichicon UPW or equivalent | 1000uF / 35V, 105C preferred | 1 | Motor supply buffering |
| 9 | Required | Ceramic decoupling capacitor | X7R ceramic | 0.1uF / 100V | 2 | High-frequency decoupling near motor supply |
| 10 | Required | DC barrel jack | 5.5 x 2.1mm | Panel or PCB mount | 1 | 24V input |
| 11 | Required | Wire | Red/black copper wire | >=0.75mm² | 1 set | 24V current path |
| 12 | Required | Heat shrink tubing | 4mm / 8mm | High-temperature preferred | 1 set | Insulation and strain relief |
| 13 | Required | Dual thermostat coupler | Generic 5-contact coupler | 250V / 10A | 1 | Warm tray integration; keep mains spacing safe |
| 14 | Required | Mica insulation sheet | Original retained part | Heat-resistant | 1 | Must remain in the warm tray assembly |

## Optional sensing and alerting

| Item | Status | Component | Recommended model | Specs | Qty | Notes |
|------|--------|-----------|-------------------|-------|-----|-------|
| 15 | Optional | Temperature sensor | DS18B20 waterproof probe | -55C to 125C | 1-2 | DRV8871 and ambient temperature monitoring |
| 16 | Optional | Pull-up resistor | 4.7kΩ 1/4W | For DS18B20 data line | 1 | Required if DS18B20 is installed |
| 17 | Optional | Passive buzzer | 12mm generic | 3-5V | 1 | Audible fault indication |
| 18 | Optional | NPN transistor | S8050 | TO-92 | 1 | Buzzer driver |
| 19 | Optional | Base resistor | 1kΩ 1/4W | For S8050 base | 1 | Buzzer driver input limit |
| 20 | Optional | Flyback diode | 1N4148 | Small signal diode | 1 | Buzzer transient suppression |
| 21 | Optional | Hall sensor | AH3144 or equivalent | Digital Hall switch | 1 | Real RPM measurement |
| 22 | Optional | Status LED resistor | 470Ω | 1/4W | 1 | External LED current limit if used |

## Legacy 3-digit common-anode display circuit

The firmware still contains `DirectDisplay`, but the hardware design notes say the in-box 7-segment display was ultimately abandoned because it is hard to view in the installation. Treat these parts as optional/deprecated unless the display is intentionally kept.

| Item | Status | Component | Recommended model | Specs | Qty | Notes |
|------|--------|-----------|-------------------|-------|-----|-------|
| 23 | Optional / Deprecated | 3-digit 7-segment display | Common-anode module | 5V LED display | 1 | RPM / percent / raw PWM display |
| 24 | Optional / Deprecated | NPN transistor | S8050 | TO-92 | 3 | Low-side stage for digit high-side driver |
| 25 | Optional / Deprecated | PNP transistor | 2N5401 | TO-92 | 3 | High-side COM driver |
| 26 | Optional / Deprecated | GPIO/base resistor | 10kΩ 1/4W | Digit driver input and PNP pull-up | 6 | Three GPIO limit + three PNP pull-up |
| 27 | Optional / Deprecated | PNP base resistor | 1kΩ 1/4W | S8050 collector to PNP base | 3 | Digit driver |
| 28 | Optional / Deprecated | Segment resistor | 220Ω 1/4W | Segment current limit | 7 | One per segment a-g |
| 29 | Optional / Deprecated | Speed-up capacitor | 0.1uF ceramic | Across PNP pull-up | 3 | Reduces ghosting |
| 30 | Optional / Deprecated | GPIO pulldown resistor | 10kΩ 1/4W | Digit GPIO pulldown | 3 | Startup stability |
| 31 | Optional / Deprecated | Segment pulldown resistor | 10kΩ 1/4W | Segment GPIO pulldown | 7 | Prevents floating segment pins |
| 32 | Optional / Deprecated | 5V bulk capacitor | 100uF electrolytic | >=16V | 1 | Display/ESP32 5V rail decoupling |
| 33 | Optional / Deprecated | 5V ceramic capacitor | 0.1uF ceramic | >=50V | 1 | High-frequency 5V decoupling |
| 34 | Optional / Deprecated | Driver IC alternative | MIC2981 / UDN2981 | 8-channel high-side driver | 1 | Alternative to discrete high-side digit drivers |

## Safety notes

- Keep 220V mains wiring physically separated from 24V/logic wiring by at least 6mm.
- Use heat-resistant insulation and retain the mica sheet in the warm tray assembly.
- Verify no shorts with a multimeter before energizing mains or the 24V rail.
- Select 105C-rated electrolytic capacitors for the warm enclosure.
