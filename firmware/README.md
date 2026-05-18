# Firmware Projects

This directory contains ESP32 firmware projects maintained with PlatformIO.

| Project | Purpose | Notes |
|---------|---------|-------|
| `esp32-jgb37-drv8871-motor-controller` | ESP32 + DRV8871 + JGB37-520 motor controller | Existing motor firmware, WiFi provisioning, MQTT, HTTP, WebSocket, self-test |
| `esp32-epaper-display` | ESP32 e-paper display controller | Supports monochrome and color e-paper panels through separate PlatformIO environments |

## Build

```bash
pio run -d firmware/esp32-jgb37-drv8871-motor-controller
pio run -d firmware/esp32-epaper-display -e esp32dev-epaper-mono
pio run -d firmware/esp32-epaper-display -e esp32dev-epaper-color
```

## MQTT convention

All firmware projects use the same platform topics:

- Status: `esp/devices/{device_id}/status`
- Command: `esp/devices/{device_id}/command`

Each status payload must include `device_type` so the backend can route and display the device correctly.
