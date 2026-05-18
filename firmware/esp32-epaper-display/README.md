# ESP32 E-Paper Display Controller

ESP32 firmware skeleton for e-paper display devices on the shared ESP platform. It supports monochrome and color panel builds through PlatformIO environments and uses the same MQTT topic convention as the motor controller.

## Environments

```bash
pio run -e esp32dev-epaper-mono
pio run -e esp32dev-epaper-color
```

| Environment | Panel type | Default model | Resolution | Partial refresh |
|-------------|------------|---------------|------------|-----------------|
| `esp32dev-epaper-mono` | Monochrome | `waveshare_2in9_bw` | 296×128 | Enabled |
| `esp32dev-epaper-color` | Color / tri-color | `waveshare_2in9_tri_color` | 296×128 | Disabled |

Panel metadata and pins are configured in `platformio.ini` with build flags and normalized by `include/PanelConfig.h`.

## MQTT

Status topic:

```text
esp/devices/{device_id}/status
```

Command topic:

```text
esp/devices/{device_id}/command
```

Status payload example:

```json
{
  "device_type": "epaper",
  "panel_type": "mono",
  "panel_model": "waveshare_2in9_bw",
  "width": 296,
  "height": 128,
  "busy": false,
  "state": "idle",
  "palette": ["white", "black"],
  "last_refresh_ms": 1200,
  "refresh_count": 3,
  "uptime_ms": 10000,
  "ip": "192.168.1.50"
}
```

Supported commands:

```json
{"cmd":"display_text","text":"Hello","x":0,"y":24,"size":2,"color":"black","refresh":"full"}
{"cmd":"clear","color":"white","refresh":"full"}
{"cmd":"refresh","mode":"full"}
{"cmd":"sleep"}
{"cmd":"wake"}
```

## Local HTTP API

- `GET /api/status`
- `GET /api/config`
- `POST /api/config`
- `GET /api/wifi`
- `POST /api/wifi`
- `POST /api/command`

First boot starts an AP:

```text
SSID: ESP32-Epaper
Password: epaperctrl
```

Open the device IP and submit WiFi/MQTT settings. The device stores configuration in NVS and reboots.

## Display driver integration

`EpaperDisplay` currently provides the command/state abstraction and logs render operations. Add the concrete panel driver inside `src/EpaperDisplay.cpp` for the selected hardware model, keeping the MQTT and HTTP command contract unchanged.

## BOM

See:

- [BOM.md](BOM.md)
- [bom.csv](bom.csv)
