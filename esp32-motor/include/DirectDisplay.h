#pragma once
#include <Arduino.h>

// ─────────────────────────────────────────────────────────────────────────────
//  DirectDisplay
//
//  直接用 ESP32 GPIO 驱动 3 位共阴 7 段数码管，无需任何驱动芯片。
//
//  接线（共阴，低电平位选有效）：
//    段选（每根串联 220Ω 电阻）：
//      GPIO23 → a    GPIO25 → b    GPIO26 → c
//      GPIO27 → d    GPIO32 → e    GPIO33 → f
//      GPIO14 → g
//    位选（直连，低电平有效）：
//      GPIO13 → D1(百位)   GPIO12 → D2(十位)   GPIO4 → D3(个位)
//
//  扫描方式：FreeRTOS task，每位亮 1ms，三位循环 → 刷新率 ~333Hz
//
//  显示内容每 3 秒自动轮播：
//    模式 0 → 估算 RPM（0-999，超出显示 "---"）
//    模式 1 → 占空比 %（0-100）
//    模式 2 → 原始 duty（0-999）
//
//  注意：GPIO12 有 boot strapping 功能，烧录时请拔开 D2 连线。
//        或将 D2 改为 GPIO5（修改 DirectDisplayConfig::pin_d2 即可）。
// ─────────────────────────────────────────────────────────────────────────────

enum class DispMode : uint8_t { RPM = 0, PCT = 1, RAW = 2 };

struct DirectDisplayConfig {
    // 段选 GPIO（a~g，不含 dp）
    uint8_t seg_a = 23;
    uint8_t seg_b = 25;
    uint8_t seg_c = 26;
    uint8_t seg_d = 27;
    uint8_t seg_e = 32;
    uint8_t seg_f = 33;
    uint8_t seg_g = 14;

    // 位选 GPIO（低电平有效）
    uint8_t pin_d1 = 13;   // 百位（最左）
    uint8_t pin_d2 = 12;   // 十位
    uint8_t pin_d3 =  4;   // 个位（最右）

    uint16_t rated_rpm     = 100;   // 电机额定空载转速（按齿轮比填写）
    uint32_t mode_cycle_ms = 3000;  // 自动切换模式间隔
};

class DirectDisplay {
public:
    explicit DirectDisplay(const DirectDisplayConfig& cfg = DirectDisplayConfig{});

    void begin();

    // 主更新函数：在普通任务中调用，更新待显示数值
    // 扫描本身由独立 FreeRTOS 任务完成，调用频率 50ms 即可
    void update(uint16_t duty, uint16_t max_duty, bool stopped);

    void setMode(DispMode m)  { _mode = m; }
    DispMode mode() const     { return _mode; }
    void nextMode();

    void     setRatedRPM(uint16_t rpm) { _cfg.rated_rpm = rpm; }
    uint16_t ratedRPM()      const     { return _cfg.rated_rpm; }
    uint16_t estimateRPM(uint16_t duty, uint16_t max_duty) const;

    // ── 内部：由 FreeRTOS 扫描任务调用（public for task wrapper）──────────
    void _scanTick();

private:
    DirectDisplayConfig _cfg;
    DispMode            _mode = DispMode::RPM;

    // 扫描缓冲区：三位的段码（共阴，位为 HIGH 亮）
    // _digits[0]=百位, [1]=十位, [2]=个位
    volatile uint8_t _digits[3] = {0, 0, 0};
    volatile bool    _blink     = false;    // true → 全灭（停止闪烁）

    uint32_t _last_mode_switch = 0;
    uint32_t _last_blink_at    = 0;
    bool     _blink_state      = false;

    TaskHandle_t      _scan_task = nullptr;
    SemaphoreHandle_t _mutex     = nullptr;

    // 将 0-9 数字转为共阴 7 段段码
    // bit顺序：dp g f e d c b a（bit0=a）
    static const uint8_t DIGIT_MAP[10];

    // 将三位十进制拆分并填入 _digits[]
    void _setNumber(int val);
    void _setDashes();   // "---"
    void _setBlank();    // 全灭

    // 输出当前 digit 的段码到 GPIO
    void _writeSegments(uint8_t seg_byte);
    void _selectDigit(uint8_t idx);   // 拉低对应位选
    void _deselectAll();              // 所有位选拉高

    static void _scanTaskFn(void* param);
};
