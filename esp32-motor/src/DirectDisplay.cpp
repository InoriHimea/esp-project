#include "DirectDisplay.h"

// ─────────────────────────────────────────────────────────────────────────────
//  共阴/共阳 7 段段码表（bit0=a, bit1=b, bit2=c, bit3=d, bit4=e, bit5=f, bit6=g）
//  例：'8' = 所有段亮 = 0b0111 1111 = 0x7F
//  注意：实际输出时，共阳极会在 _writeSegments() 中反转
// ─────────────────────────────────────────────────────────────────────────────
const uint8_t DirectDisplay::DIGIT_MAP[10] = {
    0b00111111,  // 0: a b c d e f
    0b00000110,  // 1: b c
    0b01011011,  // 2: a b d e g
    0b01001111,  // 3: a b c d g
    0b01100110,  // 4: b c f g
    0b01101101,  // 5: a c d f g
    0b01111101,  // 6: a c d e f g
    0b00000111,  // 7: a b c
    0b01111111,  // 8: all
    0b01101111,  // 9: a b c d f g
};

static constexpr uint8_t SEG_DASH  = 0b01000000;  // '-'：只有 g 段
static constexpr uint8_t SEG_BLANK = 0b00000000;  // 全灭

// ─────────────────────────────────────────────────────────────────────────────
DirectDisplay::DirectDisplay(const DirectDisplayConfig& cfg) : _cfg(cfg) {}

void DirectDisplay::begin() {
    _mutex = xSemaphoreCreateMutex();

    // 配置段选引脚为输出
    // 共阳极：初始高电平（段灭），低电平点亮
    // 共阴极：初始低电平（段灭），高电平点亮
    const uint8_t segs[7] = {
        _cfg.seg_a, _cfg.seg_b, _cfg.seg_c, _cfg.seg_d,
        _cfg.seg_e, _cfg.seg_f, _cfg.seg_g
    };
    for (uint8_t p : segs) {
        pinMode(p, OUTPUT);
        digitalWrite(p, _cfg.common_anode ? HIGH : LOW);
    }

    // 配置位选引脚为输出
    // 共阳极：初始低电平（位灭），高电平有效
    // 共阴极：初始高电平（位灭），低电平有效
    const uint8_t digs[3] = {_cfg.pin_d1, _cfg.pin_d2, _cfg.pin_d3};
    for (uint8_t p : digs) {
        pinMode(p, OUTPUT);
        digitalWrite(p, _cfg.common_anode ? LOW : HIGH);
    }

    // 开机动画：从左到右依次点亮横杠
    for (int i = 0; i < 3; i++) {
        xSemaphoreTake(_mutex, portMAX_DELAY);
        _digits[0] = (i >= 0) ? SEG_DASH : SEG_BLANK;
        _digits[1] = (i >= 1) ? SEG_DASH : SEG_BLANK;
        _digits[2] = (i >= 2) ? SEG_DASH : SEG_BLANK;
        xSemaphoreGive(_mutex);
        delay(120);
    }
    delay(300);
    _setBlank();

    // 启动扫描任务（独立核心，高优先级，确保显示不抖动）
    xTaskCreatePinnedToCore(
        _scanTaskFn,
        "disp_scan",
        1536,      // 扫描任务栈很小
        this,
        6,         // 优先级高于电机 ramp task(5)，保证扫描时序稳定
        &_scan_task,
        1          // core 1
    );

    Serial.printf("[Display] begin() type=%s segs=23/25/26/27/32/33/14 coms=13/12/4 rated=%uRPM\n",
                  _cfg.common_anode ? "CA" : "CC", _cfg.rated_rpm);
}

// ─────────────────────────────────────────────────────────────────────────────
uint16_t DirectDisplay::estimateRPM(uint16_t duty, uint16_t max_duty) const {
    if (max_duty == 0 || duty == 0) return 0;
    return (uint32_t)duty * _cfg.rated_rpm / max_duty;
}

void DirectDisplay::nextMode() {
    _mode = static_cast<DispMode>((static_cast<uint8_t>(_mode) + 1) % 3);
}

// ─── 主更新（loop 中每 50ms 调用）───────────────────────────────────────────
void DirectDisplay::update(uint16_t duty, uint16_t max_duty, bool stopped) {
    uint32_t now = millis();

    // 自动轮播模式
    if (_cfg.mode_cycle_ms > 0 && now - _last_mode_switch >= _cfg.mode_cycle_ms) {
        _last_mode_switch = now;
        nextMode();
    }

    if (stopped) {
        // 停止状态：显示 "  0"，每 600ms 闪烁
        if (now - _last_blink_at >= 600) {
            _last_blink_at = now;
            _blink_state   = !_blink_state;
        }
        if (_blink_state) _setNumber(0);
        else              _setBlank();
        return;
    }

    switch (_mode) {
        case DispMode::RPM: {
            uint16_t rpm = estimateRPM(duty, max_duty);
            (rpm > 999) ? _setDashes() : _setNumber((int)rpm);
            break;
        }
        case DispMode::PCT: {
            int pct = max_duty ? ((int32_t)duty * 100 / max_duty) : 0;
            _setNumber(pct);
            break;
        }
        case DispMode::RAW: {
            _setNumber((int)min(duty, (uint16_t)999));
            break;
        }
    }
}

// ─── 私有：设置显示缓冲区 ──────────────────────────────────────────────────────
void DirectDisplay::_setNumber(int val) {
    val = constrain(val, 0, 999);
    xSemaphoreTake(_mutex, portMAX_DELAY);
    _blink = false;
    _digits[0] = (val >= 100) ? DIGIT_MAP[val / 100]       : SEG_BLANK;
    _digits[1] = (val >=  10) ? DIGIT_MAP[(val / 10) % 10] : SEG_BLANK;
    _digits[2] =                DIGIT_MAP[val % 10];
    xSemaphoreGive(_mutex);
}

void DirectDisplay::_setDashes() {
    xSemaphoreTake(_mutex, portMAX_DELAY);
    _blink     = false;
    _digits[0] = SEG_DASH;
    _digits[1] = SEG_DASH;
    _digits[2] = SEG_DASH;
    xSemaphoreGive(_mutex);
}

void DirectDisplay::_setBlank() {
    xSemaphoreTake(_mutex, portMAX_DELAY);
    _blink     = false;
    _digits[0] = SEG_BLANK;
    _digits[1] = SEG_BLANK;
    _digits[2] = SEG_BLANK;
    xSemaphoreGive(_mutex);
}

// ─── GPIO 操作 ────────────────────────────────────────────────────────────────
void DirectDisplay::_writeSegments(uint8_t s) {
    // bit0=a bit1=b bit2=c bit3=d bit4=e bit5=f bit6=g
    const uint8_t pins[7] = {
        _cfg.seg_a, _cfg.seg_b, _cfg.seg_c, _cfg.seg_d,
        _cfg.seg_e, _cfg.seg_f, _cfg.seg_g
    };
    for (int i = 0; i < 7; i++) {
        bool bit_on = (s >> i) & 0x01;
        // 共阳极：反转逻辑（低电平点亮）
        // 共阴极：正常逻辑（高电平点亮）
        digitalWrite(pins[i], _cfg.common_anode ? !bit_on : bit_on);
    }
}

void DirectDisplay::_selectDigit(uint8_t idx) {
    // 共阳极：拉高对应位选，其余拉低
    // 共阴极：拉低对应位选，其余拉高
    if (_cfg.common_anode) {
        digitalWrite(_cfg.pin_d1, idx == 0);
        digitalWrite(_cfg.pin_d2, idx == 1);
        digitalWrite(_cfg.pin_d3, idx == 2);
    } else {
        digitalWrite(_cfg.pin_d1, idx != 0);
        digitalWrite(_cfg.pin_d2, idx != 1);
        digitalWrite(_cfg.pin_d3, idx != 2);
    }
}

void DirectDisplay::_deselectAll() {
    // 共阳极：所有位选拉低
    // 共阴极：所有位选拉高
    bool off_level = _cfg.common_anode ? LOW : HIGH;
    digitalWrite(_cfg.pin_d1, off_level);
    digitalWrite(_cfg.pin_d2, off_level);
    digitalWrite(_cfg.pin_d3, off_level);
    _writeSegments(SEG_BLANK);
}

// ─── FreeRTOS 扫描任务 ────────────────────────────────────────────────────────
//  每位显示 1ms，三位轮换 → 刷新率 ~333Hz
//  关键：切换位之前必须先关段，再切位，再开段，防止"鬼影"（ghost）
void DirectDisplay::_scanTick() {
    for (uint8_t i = 0; i < 3; i++) {
        xSemaphoreTake(_mutex, portMAX_DELAY);
        uint8_t seg = _digits[i];
        xSemaphoreGive(_mutex);

        _deselectAll();          // 1. 所有段清零 + 所有位关断
        _writeSegments(seg);     // 2. 写入本位段码
        _selectDigit(i);         // 3. 打开本位

        vTaskDelay(pdMS_TO_TICKS(1));   // 亮 1ms
    }
    _deselectAll();              // 循环结束时关断，防止最后一位残留
}

void DirectDisplay::_scanTaskFn(void* param) {
    DirectDisplay* self = static_cast<DirectDisplay*>(param);
    while (true) {
        self->_scanTick();
        // _scanTick 内部已经 delay(1ms × 3)，无需额外延迟
    }
}
