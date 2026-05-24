# ESP32 马达控制器外围电路与绘图说明

本文描述最终硬件方案下 ESP32 外围电路。默认布局为：ESP32、DRV8871、电源保护、检测、LED、蜂鸣器位于下盘或外部控制盒；上部 800mm 大盘只放原厂暖菜板、电机和必要线缆。

## 1. 总体方框图

```text
                   ┌──────────── 上部 800mm 大盘（旋转） ────────────┐
                   │                                                │
220V L ─ Slip CH1 ─┤  原厂暖菜板 L                                   │
220V N ─ Slip CH2 ─┤  原厂暖菜板 N                                   │
MOTOR_A ─ CH3 ─────┤  JGB37 电机 A                                   │
MOTOR_B ─ CH4 ─────┤  JGB37 电机 B                                   │
                   │  电机固定在上盘，摩擦轮下探接触桌面             │
                   └────────────────────────────────────────────────┘

                   ┌──────────── 下盘 / 外部控制盒（固定） ───────────┐
24V IN + ─ F1 ─ TVS/CAP ─ INA226 ─ DRV8871 VM                         │
24V IN - ───────────────────────── GND                                │
                              │                                       │
                              ├─ Mini560 24V→5V ─ ESP32 VIN/5V        │
                              ├─ 分压 → ESP32 GPIO34 ADC              │
                              ├─ DRV8871 OUT1 → Slip CH3 → Motor A    │
                              ├─ DRV8871 OUT2 → Slip CH4 → Motor B    │
                              ├─ 蓝色 LED ← GPIO2                     │
                              └─ 蜂鸣器驱动 ← GPIO25                  │
                   └──────────────────────────────────────────────────┘
```

## 2. ESP32 引脚分配

| 功能 | ESP32 GPIO | 方向 | 首版状态 | 说明 |
|------|------------|------|----------|------|
| DRV8871 IN1 | GPIO18 | 输出 | 必需 | LEDC PWM CH0 |
| DRV8871 IN2 | GPIO19 | 输出 | 必需 | LEDC PWM CH1 |
| 蓝色状态 LED | GPIO2 | 输出 | 必需 | 高电平点亮 |
| 蜂鸣器 PWM | GPIO25 | 输出 | 必需 | 无源蜂鸣器，多音调 |
| 24V 电压 ADC | GPIO34 | 输入 | 推荐 | 只能输入，适合 ADC |
| INA226 SDA | GPIO21 | I2C | 推荐 | 电流检测 |
| INA226 SCL | GPIO22 | I2C | 推荐 | 电流检测 |
| 红色 LED 预留 | GPIO13 | 输出 | 预留 | 故障灯 |
| 绿色 LED 预留 | GPIO5 | 输出 | 预留 | 正常/联网 |
| 黄色 LED 预留 | GPIO4 | 输出 | 预留 | 警告/配网/自检 |
| RGB 数据预留 | GPIO32 | 输出 | 预留 | WS2812B |
| 温湿度预留 | GPIO33 | I/O | 后期 | 需要更多滑环通道/外置传感器 |
| 防水/漏水预留 | GPIO35 | 输入 | 后期 | 只能输入 |

避免使用 GPIO12，防止影响 ESP32 启动绑带配置。

## 3. 24V 输入、保护与供电

```text
24V DC JACK +
    │
   F1  自恢复保险丝，推荐 1.1A hold / 2.2A trip，或 2A 可更换保险丝
    │
    ├─────────────── +24V_PROT ────────────────┬─────────────┐
    │                                          │             │
   TVS SMBJ24A                                 │             │
    │                                          │             │
GND ┴── C1 1000µF/35V/105°C ─ C2 0.1µF/100V ──┘             │
                                                               │
                                         ┌─────────────────────┘
                                         │
                                  INA226 VIN+
                                  INA226 VIN- ─── +24V_MOTOR ─── DRV8871 VM

24V DC JACK - ──────────────────────────────────────────────── GND

+24V_PROT ─ Mini560 IN+
GND       ─ Mini560 IN-
Mini560 OUT+ 5V ─ ESP32 VIN/5V
Mini560 OUT- GND ─ ESP32 GND
```

说明：

- F1 不建议继续用 500mA hold 型号，800mm 大盘摩擦驱动可能启动电流更高。
- TVS 放在保险丝后、24V 主轨与 GND 之间。
- 1000µF 电解靠近 DRV8871 VM。
- Mini560 输出 5V 给 ESP32 VIN/5V，所有 GND 共地。

## 4. DRV8871 电机驱动与滑环

```text
ESP32 GPIO18 ───────────── DRV8871 IN1
ESP32 GPIO19 ───────────── DRV8871 IN2

+24V_MOTOR ─────────────── DRV8871 VM
GND ────────────────────── DRV8871 GND

DRV8871 OUT1 ───────────── 滑环 CH3 ───────────── JGB37 Motor A
DRV8871 OUT2 ───────────── 滑环 CH4 ───────────── JGB37 Motor B
```

控制逻辑：

| IN1 | IN2 | 效果 |
|-----|-----|------|
| PWM | 0 | 正转 |
| 0 | PWM | 反转 |
| 1 | 1 | 主动刹车 |
| 0 | 0 | 惰行 |

注意：若 ESP32/DRV8871 在下盘或外部控制盒，滑环 CH3/CH4 是电机输出线；不要把固定 24V+/24V- 直接接到电机，否则无法调速/反转/刹车。

## 5. 24V 电压检测

```text
+24V_PROT ── R1 100kΩ 1% ──┬── R3 1kΩ ── ESP32 GPIO34 ADC
                           │
                           ├── C3 0.1µF ── GND
                           │
                          R2 10kΩ 1%
                           │
                          GND
```

计算：

```text
V_ADC = V_IN × R2 / (R1 + R2)
24V → 2.18V
30V → 2.73V
```

建议在固件中做多次采样平均，并设置欠压/过压阈值。

## 6. 电流检测 INA226

```text
+24V_PROT ───────────── INA226 VIN+
INA226 VIN- ─────────── +24V_MOTOR → DRV8871 VM

INA226 VCC ──────────── ESP32 3V3
INA226 GND ──────────── GND
INA226 SDA ──────────── ESP32 GPIO21
INA226 SCL ──────────── ESP32 GPIO22

若模块无上拉：
SDA ─ 4.7kΩ ─ 3V3
SCL ─ 4.7kΩ ─ 3V3
```

用途：

- 检测堵转。
- 检测摩擦轮跨越线缆斜坡时的电流尖峰。
- 检测滑环接触不良导致的电流异常。
- 做软件限流：持续过流 → 降速 → 停机 → 蜂鸣器报警。

## 7. 蓝色 LED 与多灯位预留

### 7.1 首版蓝色 LED

```text
ESP32 GPIO2 ── R_LED 330Ω ──|>|── GND
                             蓝色 LED
```

GPIO2 输出 HIGH 时点亮。

### 7.2 多色 LED 预留

```text
GPIO13 ── 330~470Ω ── 红 LED ── GND
GPIO5  ── 330~470Ω ── 绿 LED ── GND
GPIO4  ── 330~470Ω ── 黄 LED ── GND
```

### 7.3 WS2812B RGB 预留

```text
5V ───────────── WS2812B VDD
GND ──────────── WS2812B GND
GPIO32 ─ 330Ω ── WS2812B DIN
5V ─ 1000µF/6.3V ─ GND  （靠近 LED）
```

WS2812B 是可选扩展，不进入首版必焊。

## 8. 无源蜂鸣器驱动

```text
                    +5V
                     │
                 BZ1 无源蜂鸣器
                     │
                     ├───────────────┐
                     │               │
                 S8050 C             │
ESP32 GPIO25 ─ Rb 1kΩ ─ S8050 B      │ D1 1N4148/1N4007（磁式蜂鸣器建议）
                 S8050 E             │ 阴极接 +5V，阳极接 C
                     │               │
                    GND ─────────────┘

S8050 B ─ 100kΩ ─ GND  （可选下拉，防止上电误响）
```

无源蜂鸣器可用 ESP32 LEDC 输出不同频率，实现多功能提示音。若使用压电无源蜂鸣片，D1 可不装；若使用磁式蜂鸣器，建议装 D1。

## 9. 外部接口建议

| 接口 | 引脚 | 说明 |
|------|------|------|
| J1 24V 输入 | 24V+, 24V- | DC 母座或带锁端子 |
| J2 220V 输入 | L, N | 与低压端子分区 |
| J3 滑环 | CH1, CH2, CH3, CH4 | 到旋转端 |
| J4 LED/蜂鸣器面板 | 5V, GND, LED_BLUE, BUZZER | 外置控制盒面板 |
| J5 扩展灯位 | GND, GPIO13, GPIO5, GPIO4, GPIO32 | 红/绿/黄/RGB 预留 |
| J6 I2C 扩展 | 3V3, GND, SDA, SCL | INA226 或后续模块 |
| J7 传感预留 | 3V3, GND, GPIO33, GPIO35 | 温湿度/漏水后续扩展 |

## 10. 给 Gemini / Codex Image 的电路图绘制提示词

复制以下提示词给绘图模型：

```text
Draw a clean electrical schematic, not a PCB layout, for an ESP32 motor controller used in a heated rotating tray. Use clear block labels and standard schematic symbols. Use Chinese labels where possible.

Architecture:
- The control electronics are in a fixed lower tray or external control box.
- The upper rotating 800mm tray contains the original 220V heater and a JGB37 DC gear motor.
- A 4-channel industrial slip ring connects the fixed side to the rotating side.

Slip ring channels:
- CH1: 220V L from fixed side to upper heater L.
- CH2: 220V N from fixed side to upper heater N.
- CH3: DRV8871 OUT1 / MOTOR_A to JGB37 motor terminal A.
- CH4: DRV8871 OUT2 / MOTOR_B to JGB37 motor terminal B.
- Add a warning note: if ESP32 and DRV8871 are on the fixed side, CH3/CH4 must be motor driver outputs, not raw 24V rails.

Power input and protection:
- 24V DC jack input.
- F1 resettable fuse, 1.1A hold / 2.2A trip or 2A fuse.
- TVS diode SMBJ24A from protected 24V to GND.
- C1 1000uF/35V electrolytic and C2 0.1uF/100V ceramic across protected 24V and GND.
- Mini560 buck converter from protected 24V to 5V.
- ESP32 DevKit powered from 5V/VIN and GND.
- All low-voltage grounds common.

Motor driver:
- DRV8871 module powered by +24V_MOTOR and GND.
- ESP32 GPIO18 to DRV8871 IN1.
- ESP32 GPIO19 to DRV8871 IN2.
- DRV8871 OUT1 to slip ring CH3, then motor A.
- DRV8871 OUT2 to slip ring CH4, then motor B.

Voltage sensing:
- +24V_PROT to R1 100k 1%, then ADC node.
- ADC node to R2 10k 1% to GND.
- ADC node through R3 1k to ESP32 GPIO34.
- C3 0.1uF from ADC node to GND.
- Label equation: Vadc = Vin * 10k / (100k + 10k), 24V -> 2.18V.

Current sensing:
- INA226 high-side current sensor.
- +24V_PROT to INA226 VIN+.
- INA226 VIN- to +24V_MOTOR / DRV8871 VM.
- INA226 VCC to ESP32 3V3, GND to GND.
- INA226 SDA to ESP32 GPIO21, SCL to ESP32 GPIO22.
- Show optional 4.7k pull-ups from SDA/SCL to 3V3 if not on the module.

Indicators:
- Blue LED: ESP32 GPIO2 -> 330 ohm resistor -> blue LED -> GND.
- Reserved red LED: GPIO13 -> 330/470 ohm -> red LED -> GND.
- Reserved green LED: GPIO5 -> 330/470 ohm -> green LED -> GND.
- Reserved yellow LED: GPIO4 -> 330/470 ohm -> yellow LED -> GND.
- Optional WS2812B: GPIO32 -> 330 ohm -> DIN, VDD to 5V, GND to GND, 1000uF capacitor across 5V/GND near LED.

Buzzer:
- Passive buzzer BZ1 positive to +5V.
- BZ1 negative to S8050 NPN collector.
- S8050 emitter to GND.
- ESP32 GPIO25 through 1k resistor to S8050 base.
- Optional 100k base pulldown to GND.
- Optional flyback diode 1N4148 or 1N4007 across buzzer for magnetic buzzer, cathode to +5V, anode to collector.

Layout requirements for the drawing:
- Separate the 220V mains area visually from the low-voltage 24V/5V/3.3V area.
- Use thick or red lines for 220V L/N and mark them dangerous.
- Use a dashed boundary for the 4-channel slip ring.
- Use a dashed boundary for the rotating upper tray and another for the fixed control box.
- Include notes: keep 220V and low voltage physically separated, use heat shrink on 220V solder joints, retain/add mica insulation near heater and motor, use leakage protection at wall outlet.
- Do not draw PCB traces or physical placement; draw an electrical schematic with blocks and connections.
```

## 11. 给机械结构图模型的提示词

```text
Draw a mechanical cross-section diagram of a heated rotating tray system.

Key elements:
- Large upper rotating tray, diameter 800mm.
- Original heater layer and glass heating surface on the upper tray.
- A JGB37 DC gear motor is mounted to the underside of the upper tray.
- The upper tray has a cutout/recess hole. A rubber friction wheel attached to the motor shaft protrudes downward through the cutout and contacts the tabletop.
- The friction wheel drives the upper tray by pushing against the stationary tabletop.
- A 4-channel industrial slip ring is installed near the center to route 220V L/N for the heater and two low-voltage motor wires.
- Fixed lower tray or external control box contains ESP32, DRV8871, Mini560 buck converter, protection circuit, blue LED, buzzer, voltage/current sensing.
- Show a cable bridge/ramp on the tabletop for unavoidable cables: long shallow ramp, cable groove, low angle under 8-10 degrees.
- Show mica insulation sheet between heater/upper hot area and electrical/mechanical parts.

Style:
- Technical exploded/cross-section diagram, clean labels, no photorealism.
- Use arrows to show rotation and friction wheel force.
- Use color coding: red for 220V, blue for 24V/motor, green for signal/control, gray for mechanical parts.
- Add safety callouts: retain mica sheet, separate 220V and low voltage, fix cables, avoid steep cable ramps.
```
