# BOM — ESP32 E-Paper Display Controller

This bill of materials covers an ESP32 e-paper display controller that can be built for monochrome or color panels. Pick one panel option for a concrete build, then keep the shared controller/power parts common.

## Shared base hardware

| Item | Status | Component | Recommended model | Specs | Qty | Notes |
|------|--------|-----------|-------------------|-------|-----|-------|
| 1 | Required | ESP32 development board | ESP32 DevKit / WROOM-32 | 3.3V logic, WiFi | 1 | Main controller |
| 2 | Required | E-paper adapter/HAT | Waveshare-style ESP32/Universal e-Paper Driver HAT or panel-matched adapter | 3.3V SPI | 1 | Simplifies level shifting and FPC connection |
| 3 | Required | Jumper wires | Dupont female-female / breadboard wires | SPI + control pins | 1 set | Keep SPI wires short |
| 4 | Required | Decoupling capacitor | X7R ceramic | 0.1uF / 50V | 2 | Near ESP32 and display adapter power pins |
| 5 | Required | Bulk capacitor | Low-ESR electrolytic or tantalum | 100uF / >=10V | 1 | Helps during refresh current spikes |
| 6 | Required | 3.3V power source | ESP32 onboard regulator or external LDO | >=500mA recommended | 1 | Confirm panel adapter current requirement |
| 7 | Recommended | Status LED resistor | 470Ω | 1/4W | 1 | Optional external status LED |
| 8 | Recommended | User button | Momentary tactile switch | Normally open | 1 | Manual refresh/config input |
| 9 | Recommended | Pull-up/pull-down resistor | 10kΩ | 1/4W | 1-2 | Button and boot-safe input biasing |
| 10 | Optional | Battery module | Li-ion charger + boost/LDO board | 3.7V Li-ion to 3.3V/5V | 1 | Portable display builds |
| 11 | Optional | Power switch | Slide/toggle switch | Rated for board current | 1 | Battery or service disconnect |
| 12 | Optional | microSD module | SPI microSD module | 3.3V logic | 1 | Local bitmap/image asset storage |
| 13 | Optional | External flash | SPI flash breakout | 3.3V | 1 | Alternative local asset storage |
| 14 | Optional | Enclosure | 3D printed or project box | Sized for panel and ESP32 | 1 | Protects fragile glass panel |
| 15 | Optional | Fasteners/spacers | M2/M2.5 nylon hardware | Panel-safe mounting | 1 set | Avoid mechanical stress on panel glass |

## Suggested ESP32 pin map

| Signal | ESP32 GPIO | Notes |
|--------|------------|-------|
| EPD_BUSY | GPIO4 | Input from panel; avoid blocking forever, enforce timeout |
| EPD_RST | GPIO16 | Output reset line |
| EPD_DC | GPIO17 | Data/command select |
| EPD_CS | GPIO5 | SPI chip select; boot-safe for this use on common ESP32 DevKit |
| SPI_SCK | GPIO18 | VSPI SCK |
| SPI_MOSI | GPIO23 | VSPI MOSI |
| SPI_MISO | Not required | Most e-paper panels are write-only |
| STATUS_LED | GPIO2 | Board LED or external LED |
| USER_BUTTON | GPIO0 / GPIO32 | Prefer GPIO32 if avoiding boot button behavior |

Avoid GPIO12 for panel wiring because it can affect ESP32 boot strapping.

## Monochrome panel option

| Item | Status | Component | Recommended model | Specs | Qty | Notes |
|------|--------|-----------|-------------------|-------|-----|-------|
| M1 | Choose one panel | Monochrome e-paper panel | Waveshare 2.9 inch e-Paper Module | 296x128, black/white, SPI | 1 | Good default for first firmware target |
| M2 | Alternative | Monochrome e-paper panel | Waveshare 4.2 inch e-Paper Module | 400x300, black/white, SPI | 1 | Larger UI/status display |
| M3 | Alternative | Monochrome e-paper panel | Waveshare 7.5 inch e-Paper Module | 800x480, black/white, SPI | 1 | Requires careful power and refresh timing |

Monochrome firmware mode should advertise:

```json
{
  "device_type": "epaper",
  "panel_type": "mono",
  "palette": ["white", "black"]
}
```

## Color panel option

| Item | Status | Component | Recommended model | Specs | Qty | Notes |
|------|--------|-----------|-------------------|-------|-----|-------|
| C1 | Choose one panel | Tri-color e-paper panel | Waveshare 2.9 inch e-Paper Module (B/C variant) | 296x128, black/white/red or black/white/yellow | 1 | Good first color target |
| C2 | Alternative | Tri-color e-paper panel | Waveshare 4.2 inch e-Paper Module (B/C variant) | 400x300, black/white/red or yellow | 1 | Slower full refresh than mono |
| C3 | Alternative | Seven-color e-paper panel | Waveshare 5.65 inch 7-color e-Paper | 600x448, 7-color palette | 1 | Full refresh only, slow update, larger framebuffer needs care |

Color firmware mode should advertise the exact palette, for example:

```json
{
  "device_type": "epaper",
  "panel_type": "color",
  "accent_color": "red",
  "palette": ["white", "black", "red"]
}
```

## Firmware and driver dependencies

| Component | Firmware implication |
|-----------|----------------------|
| GxEPD2-supported panel | Preferred driver path for PlatformIO Arduino builds |
| Tri-color panel | Full refresh default; partial refresh only if the exact driver supports it |
| Seven-color panel | Palette quantization required; avoid large MQTT image payloads |
| microSD/external flash | Enables local images without sending base64 over MQTT |
| Battery power | Add deep sleep strategy and publish battery voltage if ADC hardware is present |

## Procurement notes

- Confirm the exact panel SKU before wiring; many similar e-paper panels use different controllers and init sequences.
- Confirm whether the adapter board already includes level shifting and a booster circuit.
- E-paper glass is fragile. Use spacers and avoid bending the FPC.
- For image rendering, prefer URL/download or local storage over MQTT base64 payloads.
