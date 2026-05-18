#pragma once

#include <Arduino.h>
#include "PanelConfig.h"

enum class EpaperState {
    IDLE,
    RENDERING,
    REFRESHING,
    SLEEPING,
    ERROR,
};

enum class EpaperRefreshMode {
    FULL,
    PARTIAL,
};

struct EpaperTextCommand {
    String text;
    int16_t x;
    int16_t y;
    uint8_t size;
    String color;
    EpaperRefreshMode refreshMode;
};

class EpaperDisplay {
public:
    explicit EpaperDisplay(const PanelConfig& config = defaultPanelConfig());

    void begin();
    void tick();

    bool displayText(const EpaperTextCommand& command);
    bool clear(const String& color, EpaperRefreshMode refreshMode);
    bool refresh(EpaperRefreshMode mode);
    void sleep();
    void wake();

    const PanelConfig& config() const;
    EpaperState state() const;
    String stateString() const;
    bool busy() const;
    uint32_t lastRefreshMs() const;
    uint32_t refreshCount() const;
    String lastError() const;
    String normalizeColor(const String& color) const;

private:
    PanelConfig _config;
    EpaperState _state;
    bool _busy;
    uint32_t _refreshStartedAt;
    uint32_t _refreshDurationMs;
    uint32_t _lastRefreshMs;
    uint32_t _refreshCount;
    String _lastError;

    bool startRefresh(EpaperRefreshMode mode);
    bool colorSupported(const String& color) const;
    bool paletteContains(const String& color) const;
    void setError(const String& error);
};
