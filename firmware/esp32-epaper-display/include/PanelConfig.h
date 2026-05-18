#pragma once

#include <Arduino.h>

#ifndef EPD_BUSY
#define EPD_BUSY 4
#endif
#ifndef EPD_RST
#define EPD_RST 16
#endif
#ifndef EPD_DC
#define EPD_DC 17
#endif
#ifndef EPD_CS
#define EPD_CS 5
#endif
#ifndef EPD_SCK
#define EPD_SCK 18
#endif
#ifndef EPD_MOSI
#define EPD_MOSI 23
#endif
#ifndef STATUS_LED
#define STATUS_LED 2
#endif
#ifndef EPAPER_WIDTH
#define EPAPER_WIDTH 296
#endif
#ifndef EPAPER_HEIGHT
#define EPAPER_HEIGHT 128
#endif
#ifndef EPAPER_PANEL_MODEL
#define EPAPER_PANEL_MODEL "waveshare_2in9_bw"
#endif
#ifndef EPAPER_PALETTE
#define EPAPER_PALETTE "white,black"
#endif
#ifndef EPAPER_ACCENT_COLOR
#define EPAPER_ACCENT_COLOR ""
#endif
#ifndef EPAPER_SUPPORTS_PARTIAL
#define EPAPER_SUPPORTS_PARTIAL 0
#endif

enum class EpaperPanelType {
    MONO,
    COLOR,
};

struct PanelConfig {
    const char* model;
    EpaperPanelType type;
    uint16_t width;
    uint16_t height;
    bool supportsPartial;
    const char* palette;
    const char* accentColor;
    uint8_t busyPin;
    uint8_t resetPin;
    uint8_t dcPin;
    uint8_t csPin;
    uint8_t sckPin;
    uint8_t mosiPin;
    uint8_t statusLedPin;
};

inline PanelConfig defaultPanelConfig() {
    return {
        EPAPER_PANEL_MODEL,
#if defined(EPAPER_PANEL_COLOR)
        EpaperPanelType::COLOR,
#else
        EpaperPanelType::MONO,
#endif
        EPAPER_WIDTH,
        EPAPER_HEIGHT,
        EPAPER_SUPPORTS_PARTIAL == 1,
        EPAPER_PALETTE,
        EPAPER_ACCENT_COLOR,
        EPD_BUSY,
        EPD_RST,
        EPD_DC,
        EPD_CS,
        EPD_SCK,
        EPD_MOSI,
        STATUS_LED,
    };
}
