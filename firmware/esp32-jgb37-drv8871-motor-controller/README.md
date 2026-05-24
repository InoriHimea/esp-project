# ESP32 JGB37 DRV8871 马达控制器固件

基于 PlatformIO 的 ESP32 马达控制器，支持 WiFi / MQTT / HTTP / WebSocket 多协议控制。最终硬件方向为 4 路工业滑环、上部 800mm 大盘摩擦驱动、单蓝色 LED、蜂鸣器，以及电压/电流检测预留。

## 当前功能

- 马达控制：DRV8871 H 桥 + 1kHz PWM，支持正反转、平滑加减速、主动刹车、惰行。
- 状态指示：GPIO2 蓝色 LED，不同闪烁模式对应马达状态。
- 配网：首次启动进入 AP 模式（`ESP32-Motor` / `motorctrl`）。
- 协议：HTTP REST API、WebSocket、MQTT。
- 自检：支持 LED、马达、GPIO；数码管测试仍在固件遗留代码中，最终硬件不采购、不安装。

## 最终硬件方向

- 4 路工业滑环：CH1/CH2 走 220V L/N，CH3/CH4 走电机低压通道。
- ESP32/DRV8871 优先放下盘；空间不足时放外部控制盒。
- 电机固定在上部 800mm 大盘，通过挖孔沉降让摩擦轮接触桌面驱动旋转。
- 如果 ESP32/DRV8871 在下盘或外部控制盒，CH3/CH4 应接 DRV8871 OUT1/OUT2 到上盘电机，不应接固定侧原始 24V+/24V-。
- 仅安装一路蓝色 LED，预留红/绿/黄/RGB 灯位。
- 加入无源蜂鸣器，用于开机、自检、断联、堵转、过流等提示。
- 加入 24V 电压检测和 INA226 电流检测器件到 BOM。
- 霍尔、温度、湿度、防水检测只预留，等后期换 6 路或更多滑环再加。
- 3 位数码管已废弃：安装后不可见，且占用 GPIO。

## ESP32 GPIO 对应表

| 功能 | GPIO | 状态 | 说明 |
|------|------|------|------|
| DRV8871 IN1 | GPIO18 | 必需 | LEDC PWM 通道 0 |
| DRV8871 IN2 | GPIO19 | 必需 | LEDC PWM 通道 1 |
| 蓝色状态 LED | GPIO2 | 必需 | 高电平点亮 |
| 蜂鸣器 PWM | GPIO25 | 推荐 | S8050 低边驱动 |
| 24V 电压 ADC | GPIO34 | 推荐 | 100k/10k 分压后输入 |
| INA226 SDA | GPIO21 | 推荐 | I2C 电流检测 |
| INA226 SCL | GPIO22 | 推荐 | I2C 电流检测 |
| 红色 LED 预留 | GPIO13 | 预留 | 故障灯 |
| 绿色 LED 预留 | GPIO5 | 预留 | 正常/联网 |
| 黄色 LED 预留 | GPIO4 | 预留 | 警告/配网/自检 |
| RGB 数据预留 | GPIO32 | 预留 | WS2812B |
| 温湿度预留 | GPIO33 | 后期 | 需要更多滑环通道或外置传感器 |
| 防水/漏水预留 | GPIO35 | 后期 | 只能输入 |

避免使用 GPIO12，防止影响 ESP32 启动绑带配置。

## 蓝色 LED 状态对照

| 马达状态 | LED 行为 | 含义 |
|----------|----------|------|
| STOPPED / COASTING | 灭或低频心跳 | 停止/待机 |
| RAMPING | 慢闪 | 加减速中 |
| RUNNING | 常亮 | 运行中 |
| BRAKING | 快闪 | 主动刹车/堵转/过流 |
| 配网 / MQTT 未连接 | 慢闪或双闪 | 网络状态提示 |

## 蜂鸣器建议行为

| 场景 | 蜂鸣器模式 |
|------|------------|
| 开机 | 短 beep 一次 |
| 配网成功 | 上升双音 |
| MQTT 断开 | 每 10s 短 beep，可配置关闭 |
| 过流/堵转 | 急促三连 beep |
| 自检完成 | 两短一长 |
| 严重故障 | 持续间歇报警 |

## 快速开始

### 编译与上传

```bash
# 编译
pio run

# 上传到 ESP32
pio run -t upload

# 串口监视
pio device monitor --baud 115200
```

### 首次配网

1. 上电后，ESP32 启动 AP 模式。
2. 手机/电脑连接热点 `ESP32-Motor`，密码 `motorctrl`。
3. 打开浏览器访问 `http://192.168.4.1`。
4. 填写 WiFi 账号密码、MQTT broker 信息，提交。
5. ESP32 自动重启并连接 WiFi。

### 常用 API

```bash
# 获取状态
curl http://motorctrl.local/api/status

# 启动马达（正转 80% 速度，1.5 秒平滑加速）
curl -X POST http://motorctrl.local/api/motor/run \
  -H 'Content-Type: application/json' \
  -d '{"speed":800,"direction":"forward","ramp_ms":1500}'

# 停止
curl -X POST http://motorctrl.local/api/motor/stop

# 主动刹车
curl -X POST http://motorctrl.local/api/motor/brake

# 触发完整自检
curl -X POST http://motorctrl.local/api/test \
  -H 'Content-Type: application/json' \
  -d '{"type":"all"}'
```

## 自检测试系统

默认开机自动执行完整自检，可通过以下方式关闭或重新触发。

| 类型 | 说明 | 状态 |
|------|------|------|
| `led` | LED 状态演示 | 当前可用 |
| `motor` | 马达 PWM 正反转 | 当前可用 |
| `gpio` | GPIO 直接控制 | 当前可用 |
| `all` | 综合测试 | 当前可用，仍包含遗留 display 流程 |
| `display` | 数码管测试 | 遗留代码，最终硬件不安装 |

### HTTP

```bash
# 启动测试
POST /api/test
Body: {"type":"led|motor|gpio|all"}

# 查询进度
GET /api/test
Response: {"state":"running","type":"led","step":"...","progress":40}

# 设置开机自检开关
POST /api/boot-test
Body: {"enabled":true|false}
```

### MQTT

下发到 `esp/devices/{device_id}/command`：

```json
{"cmd":"test", "type":"all"}
```

### WebSocket

连接 `ws://motorctrl.local/ws`，发送：

```json
{"cmd":"test", "type":"led"}
```

## 模块结构

```text
firmware/esp32-jgb37-drv8871-motor-controller/
├── include/
│   ├── MotorController.h    # 马达控制器（DRV8871 + LEDC PWM）
│   ├── DirectDisplay.h      # 遗留数码管模块，最终硬件不安装
│   └── SelfTest.h           # 综合自检系统
├── src/
│   ├── main.cpp             # 主程序（WiFi/HTTP/MQTT/WS）
│   ├── MotorController.cpp
│   ├── DirectDisplay.cpp    # 遗留数码管模块，待后续固件清理
│   └── SelfTest.cpp
├── docs/
│   ├── hardware-design.md
│   └── display-driver-circuit.md   # 遗留数码管参考
├── data/                    # LittleFS 内容（HTML/JS/CSS）
├── BOM.md
├── bom.csv
├── platformio.ini
└── README.md
```

## 相关文档

- [BOM 清单](BOM.md)
- [固件侧硬件设计索引](docs/hardware-design.md)
- [最终硬件设计文档](../../esp32-motor/docs/hardware-design.md)
- [ESP32 外围电路与绘图说明](../../esp32-motor/docs/esp32-peripheral-circuits.md)
- [数码管驱动电路设计（遗留参考，不进入采购）](docs/display-driver-circuit.md)
- [固件项目索引](../README.md)
- [项目根 README](../../README.md)
- [后端微服务](../../esp-server/README.md)
- [前端 UI](../../esp-ui/README.md)
