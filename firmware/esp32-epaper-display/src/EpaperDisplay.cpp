#include "EpaperDisplay.h"

#include <SPI.h>

EpaperDisplay::EpaperDisplay(const PanelConfig& config)
    : _config(config),
      _state(EpaperState::IDLE),
      _busy(false),
      _refreshStartedAt(0),
      _refreshDurationMs(0),
      _lastRefreshMs(0),
      _refreshCount(0),
      _lastError("") {}

void EpaperDisplay::begin() {
    pinMode(_config.statusLedPin, OUTPUT);
    pinMode(_config.busyPin, INPUT);
    pinMode(_config.resetPin, OUTPUT);
    pinMode(_config.dcPin, OUTPUT);
    pinMode(_config.csPin, OUTPUT);

    digitalWrite(_config.statusLedPin, LOW);
    digitalWrite(_config.resetPin, HIGH);
    digitalWrite(_config.dcPin, LOW);
    digitalWrite(_config.csPin, HIGH);

    SPI.begin(_config.sckPin, -1, _config.mosiPin, _config.csPin);
    _state = EpaperState::IDLE;

    Serial.printf("[EPD] init model=%s type=%s size=%ux%u partial=%s palette=%s\n",
                  _config.model,
                  _config.type == EpaperPanelType::COLOR ? "color" : "mono",
                  _config.width,
                  _config.height,
                  _config.supportsPartial ? "yes" : "no",
                  _config.palette);
}

void EpaperDisplay::tick() {
    if (!_busy) return;
    if (millis() - _refreshStartedAt < _refreshDurationMs) return;

    _busy = false;
    _lastRefreshMs = _refreshDurationMs;
    _refreshDurationMs = 0;
    _state = EpaperState::IDLE;
    digitalWrite(_config.statusLedPin, LOW);
    ++_refreshCount;
    Serial.printf("[EPD] refresh complete in %lu ms\n", _lastRefreshMs);
}

bool EpaperDisplay::displayText(const EpaperTextCommand& command) {
    if (_state == EpaperState::SLEEPING) {
        setError("display is sleeping");
        return false;
    }
    if (_busy) {
        setError("display is busy");
        return false;
    }

    String color = normalizeColor(command.color);
    if (!colorSupported(color)) {
        setError("unsupported color: " + command.color);
        return false;
    }

    _state = EpaperState::RENDERING;
    Serial.printf("[EPD] text x=%d y=%d size=%u color=%s text=%s\n",
                  command.x,
                  command.y,
                  command.size,
                  color.c_str(),
                  command.text.c_str());

    return startRefresh(command.refreshMode);
}

bool EpaperDisplay::clear(const String& color, EpaperRefreshMode refreshMode) {
    if (_state == EpaperState::SLEEPING) {
        setError("display is sleeping");
        return false;
    }
    if (_busy) {
        setError("display is busy");
        return false;
    }

    String normalized = normalizeColor(color);
    if (!colorSupported(normalized)) {
        setError("unsupported color: " + color);
        return false;
    }

    Serial.printf("[EPD] clear color=%s\n", normalized.c_str());
    return startRefresh(refreshMode);
}

bool EpaperDisplay::refresh(EpaperRefreshMode mode) {
    if (_state == EpaperState::SLEEPING) {
        setError("display is sleeping");
        return false;
    }
    if (_busy) {
        setError("display is busy");
        return false;
    }

    return startRefresh(mode);
}

void EpaperDisplay::sleep() {
    _busy = false;
    _refreshDurationMs = 0;
    _state = EpaperState::SLEEPING;
    digitalWrite(_config.statusLedPin, LOW);
    Serial.println("[EPD] sleep");
}

void EpaperDisplay::wake() {
    _busy = false;
    _refreshDurationMs = 0;
    _state = EpaperState::IDLE;
    _lastError = "";
    Serial.println("[EPD] wake");
}

const PanelConfig& EpaperDisplay::config() const {
    return _config;
}

EpaperState EpaperDisplay::state() const {
    return _state;
}

String EpaperDisplay::stateString() const {
    switch (_state) {
        case EpaperState::IDLE:       return "idle";
        case EpaperState::RENDERING:  return "rendering";
        case EpaperState::REFRESHING: return "refreshing";
        case EpaperState::SLEEPING:   return "sleeping";
        case EpaperState::ERROR:      return "error";
        default:                      return "unknown";
    }
}

bool EpaperDisplay::busy() const {
    return _busy;
}

uint32_t EpaperDisplay::lastRefreshMs() const {
    return _lastRefreshMs;
}

uint32_t EpaperDisplay::refreshCount() const {
    return _refreshCount;
}

String EpaperDisplay::lastError() const {
    return _lastError;
}

String EpaperDisplay::normalizeColor(const String& color) const {
    String normalized = color;
    normalized.toLowerCase();
    normalized.trim();

    if (normalized.isEmpty()) return "black";
    if (_config.type == EpaperPanelType::MONO && (normalized == "red" || normalized == "yellow")) {
        return "black";
    }
    return normalized;
}

bool EpaperDisplay::startRefresh(EpaperRefreshMode mode) {
    if (mode == EpaperRefreshMode::PARTIAL && !_config.supportsPartial) {
        setError("partial refresh is not supported by this panel");
        return false;
    }

    _lastError = "";
    _state = EpaperState::REFRESHING;
    _busy = true;
    _refreshStartedAt = millis();
    _refreshDurationMs = mode == EpaperRefreshMode::PARTIAL ? 450 : (_config.type == EpaperPanelType::COLOR ? 12000 : 1200);
    digitalWrite(_config.statusLedPin, HIGH);
    Serial.printf("[EPD] refresh mode=%s expected=%lu ms\n",
                  mode == EpaperRefreshMode::PARTIAL ? "partial" : "full",
                  _refreshDurationMs);
    return true;
}

bool EpaperDisplay::colorSupported(const String& color) const {
    if (_config.type == EpaperPanelType::MONO) {
        return color == "white" || color == "black";
    }
    return paletteContains(color);
}

bool EpaperDisplay::paletteContains(const String& color) const {
    String palette = _config.palette;
    palette.toLowerCase();
    String needle = color;
    needle.toLowerCase();
    needle.trim();

    int start = 0;
    while (start < palette.length()) {
        int end = palette.indexOf(',', start);
        if (end < 0) end = palette.length();
        String token = palette.substring(start, end);
        token.trim();
        if (token == needle) return true;
        start = end + 1;
    }
    return false;
}

void EpaperDisplay::setError(const String& error) {
    _lastError = error;
    _state = EpaperState::ERROR;
    _busy = false;
    _refreshDurationMs = 0;
    digitalWrite(_config.statusLedPin, LOW);
    Serial.printf("[EPD] error: %s\n", error.c_str());
}
