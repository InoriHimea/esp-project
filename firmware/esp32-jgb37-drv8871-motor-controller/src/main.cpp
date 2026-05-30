// ─────────────────────────────────────────────────────────────────────────────
//  ESP32 Motor Controller — main.cpp
//  Version: 1.3.10
//
//  Hardware:  ESP32 + DRV8871 + JGB37-520 + Mini 560 buck converter
//
//  REST API   (HTTP/80):
//    GET  /api/status          → motor status JSON
//    POST /api/motor/run       → start with ramp
//    POST /api/motor/stop      → decelerate to 0
//    POST /api/motor/brake     → active brake (instant)
//    POST /api/motor/coast     → free-wheel
//    POST /api/config          → update persistent config
//    GET  /api/config          → read current config
//
//  WebSocket  (:81, path /ws):
//    Server → Client: JSON status every 100 ms
//    Client → Server: same JSON as REST /run, /stop, /brake, /coast
//
//  mDNS:  motorctrl.local
// ─────────────────────────────────────────────────────────────────────────────

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClient.h>
#include <ESPAsyncWebServer.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <ESPmDNS.h>
#include <LittleFS.h>
#include <PubSubClient.h>

#include "MotorController.h"
#include "DirectDisplay.h"       // ← 替换 DisplayManager
#include "SelfTest.h"            // ← 綜合自檢模塊

// ─── WiFi ─────────────────────────────────────────────────────────────────────
// Credentials are stored in NVS (Preferences), never in source code.
// On first boot (no credentials saved) the device starts in AP mode:
//   SSID: ESP32-Motor   Password: motorctrl
// Then POST /api/wifi {"ssid":"...","password":"..."} to provision and reboot.
static const char* HOSTNAME      = "motorctrl";
static const char* AP_SSID       = "ESP32-Motor";
static const char* AP_PASS       = "motorctrl";

// ─── Pins ─────────────────────────────────────────────────────────────────────
static constexpr uint8_t PIN_IN1 = 18;
static constexpr uint8_t PIN_IN2 = 19;
static constexpr uint8_t PIN_LED = 2;
// TM1637 引脚已移除，直驱数码管引脚在 DirectDisplayConfig 中定义

// ─── Globals ──────────────────────────────────────────────────────────────────
MotorController motor;
DirectDisplay   display;         // ← 替换 DisplayManager
SelfTest        selfTest;        // ← 綜合自檢模塊
bool            autoStartEnabled = false;
AsyncWebServer  httpServer(80);
AsyncWebSocket  ws("/ws");
Preferences     prefs;

// MQTT
WiFiClient    wifiClient;
PubSubClient  mqttClient(wifiClient);
String        mqttBroker;
uint16_t      mqttPort = 1883;
String        deviceId;

// Status broadcast interval (ms)
static constexpr uint32_t WS_BROADCAST_INTERVAL       = 100;
static constexpr uint32_t MQTT_STATUS_INTERVAL        = 500;
static constexpr uint32_t AUTO_START_DELAY_MS        = 5000;
static constexpr uint8_t  AUTO_START_SPEED_PERCENT   = 70;

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────
static const char* stateStr(MotorState s) {
    switch (s) {
        case MotorState::STOPPED:  return "stopped";
        case MotorState::RAMPING:  return "ramping";
        case MotorState::RUNNING:  return "running";
        case MotorState::BRAKING:  return "braking";
        case MotorState::COASTING: return "coasting";
        default:                   return "unknown";
    }
}

static String buildStatusJson() {
    JsonDocument doc;
    doc["state"]         = stateStr(motor.state());
    doc["speed"]         = motor.currentSpeed();
    doc["speed_pct"]     = serialized(String(motor.speedPercent(), 1));
    doc["target_speed"]  = motor.targetSpeed();
    doc["direction"]     = (motor.direction() == MotorDirection::FORWARD) ? "forward" : "reverse";
    doc["max_speed"]     = motor.config().max_speed;
    doc["ramp_ms"]       = motor.config().default_ramp_ms;
    doc["estimated_rpm"] = display.estimateRPM(motor.currentSpeed(), motor.config().max_speed);
    doc["rated_rpm"]     = display.ratedRPM();
    doc["display_mode"]  = static_cast<uint8_t>(display.mode());
    doc["uptime_ms"]     = millis();
    doc["ip"]            = WiFi.localIP().toString();
    doc["led"]           = (digitalRead(PIN_LED) == HIGH) ? "on" : "off";

    // 自檢測試狀態
    JsonObject test = doc["test"].to<JsonObject>();
    test["state"]    = (selfTest.state() == TestState::RUNNING) ? "running"
                     : (selfTest.state() == TestState::PASSED)  ? "passed"
                     : (selfTest.state() == TestState::FAILED)  ? "failed"
                     :                                            "idle";
    test["type"]     = SelfTest::toString(selfTest.currentType());
    test["step"]     = selfTest.currentStep();
    test["progress"] = selfTest.progressPct();

    String out;
    serializeJson(doc, out);
    return out;
}

static void broadcastStatus() {
    if (ws.count() > 0) {
        ws.textAll(buildStatusJson());
    }
}

// ─── MQTT status payload ──────────────────────────────────────────────────────
static String buildMqttStatusJson() {
    JsonDocument doc;
    doc["device_type"] = "motor";
    doc["state"]       = stateStr(motor.state());
    doc["speed"]       = motor.currentSpeed();
    doc["speed_pct"]   = serialized(String(motor.speedPercent(), 1));
    doc["direction"]   = (motor.direction() == MotorDirection::FORWARD) ? "forward" : "reverse";
    doc["uptime_ms"]   = millis();
    doc["ip"]          = WiFi.localIP().toString();
    String out;
    serializeJson(doc, out);
    return out;
}

// ─── Load MQTT config from NVS ────────────────────────────────────────────────
static void loadMqttConfig() {
    prefs.begin("mqtt", true);
    mqttBroker = prefs.getString("mqtt_broker", "");
    mqttPort   = (uint16_t)prefs.getUInt("mqtt_port", 1883);
    deviceId   = prefs.getString("device_id", "motor-01");
    prefs.end();
    Serial.printf("[MQTT] broker=%s port=%u deviceId=%s\n",
                  mqttBroker.c_str(), mqttPort, deviceId.c_str());
}

// ─── MQTT message callback ────────────────────────────────────────────────────
static void onMqttMessage(char* topic, byte* payload, unsigned int length) {
    String body((char*)payload, length);
    Serial.printf("[MQTT] msg on %s: %s\n", topic, body.c_str());

    JsonDocument doc;
    if (deserializeJson(doc, body) != DeserializationError::Ok) {
        Serial.println("[MQTT] invalid JSON, ignored");
        return;
    }

    const char* cmd = doc["cmd"] | "";
    if (strcmp(cmd, "run") == 0) {
        uint16_t speed     = doc["speed"]     | motor.config().max_speed;
        uint32_t ramp_ms   = doc["ramp_ms"]   | motor.config().default_ramp_ms;
        const char* dirStr = doc["direction"] | "forward";
        MotorDirection dir = (strcmp(dirStr, "reverse") == 0)
                             ? MotorDirection::REVERSE
                             : MotorDirection::FORWARD;
        motor.setSpeed(speed, dir, ramp_ms);
    } else if (strcmp(cmd, "stop") == 0) {
        motor.stop();
    } else if (strcmp(cmd, "brake") == 0) {
        motor.brake();
    } else if (strcmp(cmd, "coast") == 0) {
        motor.coast();
    } else if (strcmp(cmd, "test") == 0) {
        // 觸發自檢測試
        // payload: {"cmd":"test", "type":"led|display|motor|gpio|all"}
        const char* typeStr = doc["type"] | "all";
        TestType type = SelfTest::fromString(typeStr);
        if (type == TestType::NONE) {
            Serial.printf("[MQTT] invalid test type: %s\n", typeStr);
            return;
        }
        bool ok = selfTest.start(type);
        Serial.printf("[MQTT] test '%s' start: %s\n", typeStr, ok ? "ok" : "busy");
    } else if (strcmp(cmd, "display_mode") == 0) {
        // 切換數碼管顯示模式（RPM → PCT → RAW → RPM…）
        display.nextMode();
        Serial.println("[MQTT] display mode switched");
    } else {
        Serial.printf("[MQTT] unknown cmd: %s\n", cmd);
    }
}

// ─── Connect to MQTT broker ───────────────────────────────────────────────────
static void connectMqtt() {
    if (mqttBroker.isEmpty()) {
        Serial.println("[MQTT] no broker configured, skipping");
        return;
    }
    mqttClient.setServer(mqttBroker.c_str(), mqttPort);
    mqttClient.setCallback(onMqttMessage);

    String clientId = deviceId;
    if (mqttClient.connect(clientId.c_str())) {
        String cmdTopic = "esp/devices/" + deviceId + "/command";
        mqttClient.subscribe(cmdTopic.c_str());
        Serial.printf("[MQTT] connected, subscribed to %s\n", cmdTopic.c_str());
    } else {
        Serial.printf("[MQTT] connect failed, rc=%d\n", mqttClient.state());
    }
}

// ─── Reconnect MQTT (non-blocking, one attempt per call) ─────────────────────
static void reconnectMqtt() {
    if (mqttBroker.isEmpty()) return;
    if (mqttClient.connected()) return;

    String clientId = deviceId;
    if (mqttClient.connect(clientId.c_str())) {
        String cmdTopic = "esp/devices/" + deviceId + "/command";
        mqttClient.subscribe(cmdTopic.c_str());
        Serial.printf("[MQTT] reconnected, subscribed to %s\n", cmdTopic.c_str());
    } else {
        Serial.printf("[MQTT] reconnect failed, rc=%d\n", mqttClient.state());
    }
}

// ─── Publish status to MQTT ───────────────────────────────────────────────────
static void publishStatus() {
    if (!mqttClient.connected()) return;
    String topic   = "esp/devices/" + deviceId + "/status";
    String payload = buildMqttStatusJson();
    mqttClient.publish(topic.c_str(), payload.c_str());
}

// ─── Parse a "run" command from JSON body ─────────────────────────────────────
static bool parseRunCommand(const String& body, uint16_t& speed,
                            MotorDirection& dir, uint32_t& ramp_ms) {
    JsonDocument doc;
    if (deserializeJson(doc, body) != DeserializationError::Ok) return false;

    speed   = doc["speed"]   | motor.config().max_speed;
    ramp_ms = doc["ramp_ms"] | motor.config().default_ramp_ms;

    const char* dirStr = doc["direction"] | "forward";
    dir = (strcmp(dirStr, "reverse") == 0)
          ? MotorDirection::REVERSE
          : MotorDirection::FORWARD;

    return true;
}

static void slowStopBeforeRestart(uint32_t wait_ms = 5000) {
    MotorState s = motor.state();
    if (s == MotorState::RUNNING || s == MotorState::RAMPING) {
        Serial.println("[WiFi] provisioning requested; slowing motor before restart");
        motor.setSpeed(0, motor.direction(), wait_ms);
        uint32_t start = millis();
        while ((millis() - start) < wait_ms + 500) {
            if (motor.state() == MotorState::STOPPED || motor.state() == MotorState::COASTING) break;
            delay(50);
        }
    }
}

// ─── WiFi config portal HTML (served at GET /) ────────────────────────────────
static const char WIFI_PORTAL_HTML[] PROGMEM = R"rawhtml(<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Motor Controller — WiFi 配置</title>
<style>
body{margin:0;min-height:100vh;background:#0f172a;color:#e5e7eb;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box}.card{width:100%;max-width:390px;background:#1e293b;border:1px solid #334155;border-radius:18px;padding:24px;box-shadow:0 18px 50px #0008}.header{display:flex;gap:12px;align-items:center;margin-bottom:24px}.icon{width:40px;height:40px;border-radius:12px;background:#2563eb;display:flex;align-items:center;justify-content:center;font-size:22px}h1{font-size:18px;margin:0}.muted{color:#94a3b8;font-size:13px;margin:4px 0 0}.section{border-top:1px solid #334155;padding-top:16px;margin-top:18px}.label{display:block;color:#cbd5e1;font-size:14px;margin:0 0 6px}input{width:100%;box-sizing:border-box;background:#0f172a;border:1px solid #475569;color:white;border-radius:10px;padding:11px 12px;margin-bottom:14px;font-size:15px}.btn{width:100%;border:0;border-radius:10px;color:white;padding:12px 10px;font-size:15px;font-weight:600;margin-top:8px}.primary{background:#2563eb}.run{background:#059669}.stop{background:#d97706}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.hint{font-size:12px;color:#94a3b8;line-height:1.5}.ok{background:#064e3b;color:#6ee7b7;border:1px solid #047857;border-radius:10px;padding:10px;margin-top:14px}.err{background:#7f1d1d;color:#fca5a5;border:1px solid #b91c1c;border-radius:10px;padding:10px;margin-top:14px}
</style>
</head>
<body>
<div class="card">

  <div class="header">
    <div class="icon">⚙️</div>
    <div><h1>Motor Controller</h1><p class="muted">WiFi 网络配置 / 电机测试</p></div>
  </div>

  <form method="POST" action="/api/wifi-form">
    <label class="label">WiFi 名称 (SSID)</label>
    <input name="ssid" required placeholder="输入网络名称">
    <label class="label">密码</label>
    <input name="password" type="password" placeholder="留空则为开放网络">
    <div class="section">
      <p class="hint">MQTT 配置（可选）</p>
      <label class="label">Broker 地址</label>
      <input name="mqtt_broker" placeholder="192.168.1.50">
      <label class="label">端口</label>
      <input name="mqtt_port" type="number" min="1" max="65535" value="1883">
      <label class="label">设备 ID</label>
      <input name="device_id" value="motor-01">
    </div>
    <button class="btn primary" type="submit">保存并重启</button>
  </form>

  <div class="section">
    <p class="hint">电机测试控制：手机可直接点击，不依赖 JavaScript。</p>
    <div class="grid">
      <form method="POST" action="/api/motor/run70"><button class="btn run" type="submit">启动 70%</button></form>
      <form method="POST" action="/api/motor/slow-stop"><button class="btn stop" type="submit">缓慢停止</button></form>
    </div>
  </div>

</div>
</body></html>)rawhtml";

// ─── CORS headers ─────────────────────────────────────────────────────────────
static void addCors(AsyncWebServerResponse* res) {
    res->addHeader("Access-Control-Allow-Origin",  "*");
    res->addHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res->addHeader("Access-Control-Allow-Headers", "Content-Type");
}

// ─────────────────────────────────────────────────────────────────────────────
//  REST Endpoints
// ─────────────────────────────────────────────────────────────────────────────
static void setupRoutes() {

    // Static files from LittleFS (/alpine.min.js, /style.css)
    httpServer.serveStatic("/alpine.min.js", LittleFS, "/alpine.min.js")
              .setCacheControl("max-age=86400");
    httpServer.serveStatic("/style.css",     LittleFS, "/style.css")
              .setCacheControl("max-age=86400");

    // Preflight for browsers
    httpServer.on("/*", HTTP_OPTIONS, [](AsyncWebServerRequest* req) {
        auto* res = req->beginResponse(204);
        addCors(res);
        req->send(res);
    });

    // GET / — WiFi config portal (useful in AP mode)
    httpServer.on("/", HTTP_GET, [](AsyncWebServerRequest* req) {
        req->send(200, "text/html", WIFI_PORTAL_HTML);
    });

    // GET /api/status
    httpServer.on("/api/status", HTTP_GET, [](AsyncWebServerRequest* req) {
        auto* res = req->beginResponse(200, "application/json", buildStatusJson());
        addCors(res);
        req->send(res);
    });

    // POST /api/motor/run
    // Body: { "speed": 800, "direction": "forward", "ramp_ms": 1500 }
    httpServer.on("/api/motor/run", HTTP_POST,
        [](AsyncWebServerRequest* req) {
            // body is handled in onBody callback below
        },
        nullptr,
        [](AsyncWebServerRequest* req, uint8_t* data, size_t len, size_t, size_t) {
            String body((char*)data, len);
            uint16_t speed; MotorDirection dir; uint32_t ramp_ms;
            if (!parseRunCommand(body, speed, dir, ramp_ms)) {
                auto* res = req->beginResponse(400, "application/json",
                                               "{\"error\":\"invalid JSON\"}");
                addCors(res);
                req->send(res);
                return;
            }
            motor.setSpeed(speed, dir, ramp_ms);
            auto* res = req->beginResponse(200, "application/json", buildStatusJson());
            addCors(res);
            req->send(res);
        }
    );

    // POST /api/motor/run70 — form-friendly phone test button
    httpServer.on("/api/motor/run70", HTTP_POST, [](AsyncWebServerRequest* req) {
        uint16_t targetSpeed = (motor.config().max_speed * AUTO_START_SPEED_PERCENT) / 100;
        motor.setSpeed(targetSpeed, MotorDirection::FORWARD, 8000);
        req->send(200, "text/html; charset=utf-8",
            "<meta name='viewport' content='width=device-width,initial-scale=1'>"
            "<body style='background:#0f172a;color:#e5e7eb;font-family:sans-serif;padding:24px'>"
            "<h2>电机已启动</h2><p>正向缓慢加速到 70%。</p>"
            "<p><a style='color:#38bdf8' href='/'>返回控制页</a></p></body>");
    });

    // POST /api/motor/stop
    httpServer.on("/api/motor/stop", HTTP_POST, [](AsyncWebServerRequest* req) {
        motor.stop();
        auto* res = req->beginResponse(200, "application/json", buildStatusJson());
        addCors(res);
        req->send(res);
    });

    // POST /api/motor/slow-stop — form-friendly phone stop button
    httpServer.on("/api/motor/slow-stop", HTTP_POST, [](AsyncWebServerRequest* req) {
        motor.stop();
        req->send(200, "text/html; charset=utf-8",
            "<meta name='viewport' content='width=device-width,initial-scale=1'>"
            "<body style='background:#0f172a;color:#e5e7eb;font-family:sans-serif;padding:24px'>"
            "<h2>电机正在缓慢停止</h2><p>已发送减速停止指令。</p>"
            "<p><a style='color:#38bdf8' href='/'>返回控制页</a></p></body>");
    });

    // POST /api/motor/brake
    httpServer.on("/api/motor/brake", HTTP_POST, [](AsyncWebServerRequest* req) {
        motor.brake();
        auto* res = req->beginResponse(200, "application/json", buildStatusJson());
        addCors(res);
        req->send(res);
    });

    // POST /api/motor/coast
    httpServer.on("/api/motor/coast", HTTP_POST, [](AsyncWebServerRequest* req) {
        motor.coast();
        auto* res = req->beginResponse(200, "application/json", buildStatusJson());
        addCors(res);
        req->send(res);
    });

    // GET /api/config
    httpServer.on("/api/config", HTTP_GET, [](AsyncWebServerRequest* req) {
        JsonDocument doc;
        doc["max_speed"]    = motor.config().max_speed;
        doc["min_speed"]    = motor.config().min_speed;
        doc["ramp_ms"]      = motor.config().default_ramp_ms;
        doc["pwm_freq_hz"]  = motor.config().pwm_freq_hz;
        doc["rated_rpm"]    = display.ratedRPM();          // ← 新增
        doc["display_mode"] = static_cast<uint8_t>(display.mode());  // ← 新增
        String out; serializeJson(doc, out);
        auto* res = req->beginResponse(200, "application/json", out);
        addCors(res);
        req->send(res);
    });

    // POST /api/config
    // Body: { "max_speed": 900, "ramp_ms": 3000 }
    httpServer.on("/api/config", HTTP_POST,
        [](AsyncWebServerRequest* req) {},
        nullptr,
        [](AsyncWebServerRequest* req, uint8_t* data, size_t len, size_t, size_t) {
            JsonDocument doc;
            if (deserializeJson(doc, (char*)data, len) != DeserializationError::Ok) {
                req->send(400, "application/json", "{\"error\":\"invalid JSON\"}");
                return;
            }
            if (doc["max_speed"].is<int>())
                motor.setMaxSpeed(doc["max_speed"].as<uint16_t>());
            if (doc["ramp_ms"].is<int>())
                motor.setRampTime(doc["ramp_ms"].as<uint32_t>());
            if (doc["rated_rpm"].is<int>())
                display.setRatedRPM(doc["rated_rpm"].as<uint16_t>());
            if (doc["display_mode"].is<int>())
                display.setMode(static_cast<DispMode>(doc["display_mode"].as<uint8_t>()));

            // Persist
            prefs.begin("motor", false);
            prefs.putUInt("max_speed", motor.config().max_speed);
            prefs.putUInt("ramp_ms",   motor.config().default_ramp_ms);
            prefs.putUInt("rated_rpm", display.ratedRPM());          // ← 新增
            prefs.end();

            auto* res = req->beginResponse(200, "application/json",
                                           "{\"ok\":true}");
            addCors(res);
            req->send(res);
        }
    );

    // POST /api/display/mode  (切换数码管显示内容，无需 body)
    // 每调一次切换到下一个模式：RPM → % → raw → RPM …
    httpServer.on("/api/display/mode", HTTP_POST, [](AsyncWebServerRequest* req) {
        display.nextMode();
        auto* res = req->beginResponse(200, "application/json", buildStatusJson());
        addCors(res);
        req->send(res);
    });

    // ─── 自檢測試 API ─────────────────────────────────────────────────────────
    // GET /api/test  → 返回當前測試狀態
    httpServer.on("/api/test", HTTP_GET, [](AsyncWebServerRequest* req) {
        auto* res = req->beginResponse(200, "application/json", selfTest.toJson());
        addCors(res);
        req->send(res);
    });

    // POST /api/test  body={"type":"led|display|motor|gpio|all"}
    httpServer.on("/api/test", HTTP_POST,
        [](AsyncWebServerRequest* req) {},
        nullptr,
        [](AsyncWebServerRequest* req, uint8_t* data, size_t len, size_t, size_t) {
            JsonDocument doc;
            if (deserializeJson(doc, data, len)) {
                auto* res = req->beginResponse(400, "application/json",
                    "{\"error\":\"invalid JSON\"}");
                addCors(res);
                req->send(res);
                return;
            }
            String typeStr = doc["type"] | "all";
            TestType type = SelfTest::fromString(typeStr);
            if (type == TestType::NONE) {
                auto* res = req->beginResponse(400, "application/json",
                    "{\"error\":\"invalid test type. Use led|display|motor|gpio|all\"}");
                addCors(res);
                req->send(res);
                return;
            }
            bool ok = selfTest.start(type);
            String body = "{\"started\":" + String(ok ? "true" : "false") +
                          ",\"type\":\"" + typeStr + "\"}";
            auto* res = req->beginResponse(ok ? 202 : 409,
                "application/json", body);
            addCors(res);
            req->send(res);
        }
    );

    // POST /api/test/cancel  → 雖然測試是異步的，但我們不直接中斷任務，
    // 此端點用於提示用戶（測試會自然結束）
    httpServer.on("/api/test/cancel", HTTP_POST, [](AsyncWebServerRequest* req) {
        String body = "{\"info\":\"test will finish naturally; no abort supported\"}";
        auto* res = req->beginResponse(200, "application/json", body);
        addCors(res);
        req->send(res);
    });

    // POST /api/boot-test  body={"enabled":true|false}
    // 設置開機自檢開關（持久化到 NVS）
    httpServer.on("/api/boot-test", HTTP_POST,
        [](AsyncWebServerRequest* req) {},
        nullptr,
        [](AsyncWebServerRequest* req, uint8_t* data, size_t len, size_t, size_t) {
            JsonDocument doc;
            if (deserializeJson(doc, data, len)) {
                auto* res = req->beginResponse(400, "application/json",
                    "{\"error\":\"invalid JSON\"}");
                addCors(res);
                req->send(res);
                return;
            }
            bool enabled = doc["enabled"] | false;
            prefs.begin("motor", false);
            prefs.putBool("boot_test", enabled);
            prefs.end();
            String body = "{\"boot_test\":" + String(enabled ? "true" : "false") + "}";
            auto* res = req->beginResponse(200, "application/json", body);
            addCors(res);
            req->send(res);
        }
    );

    // GET /api/wifi — return current SSID (no password)
    httpServer.on("/api/wifi", HTTP_GET, [](AsyncWebServerRequest* req) {
        prefs.begin("wifi", true);
        String ssid = prefs.getString("ssid", "");
        prefs.end();
        String body = "{\"ssid\":\"" + ssid + "\",\"connected\":" +
                      (WiFi.status() == WL_CONNECTED ? "true" : "false") + "}";
        auto* res = req->beginResponse(200, "application/json", body);
        addCors(res);
        req->send(res);
    });

    // POST /api/wifi — save credentials and reboot
    // Body: { "ssid": "MyNetwork", "password": "secret", "mqtt_broker": "...", "mqtt_port": 1883, "device_id": "motor-01" }
    httpServer.on("/api/wifi", HTTP_POST,
        [](AsyncWebServerRequest* req) {},
        nullptr,
        [](AsyncWebServerRequest* req, uint8_t* data, size_t len, size_t, size_t) {
            JsonDocument doc;
            if (deserializeJson(doc, (char*)data, len) != DeserializationError::Ok ||
                !doc["ssid"].is<const char*>()) {
                req->send(400, "application/json", "{\"error\":\"invalid JSON\"}");
                return;
            }
            prefs.begin("wifi", false);
            prefs.putString("ssid",     doc["ssid"].as<const char*>());
            prefs.putString("password", doc["password"] | "");
            prefs.end();

            // Save MQTT config if provided
            prefs.begin("mqtt", false);
            if (doc["mqtt_broker"].is<const char*>())
                prefs.putString("mqtt_broker", doc["mqtt_broker"].as<const char*>());
            prefs.putUInt("mqtt_port",
                          doc["mqtt_port"].is<int>()
                              ? (uint32_t)doc["mqtt_port"].as<int>()
                              : 1883u);
            const char* did = doc["device_id"] | "motor-01";
            prefs.putString("device_id", did);
            prefs.end();

            req->send(200, "application/json", "{\"ok\":true,\"rebooting\":true}");
            slowStopBeforeRestart();
            delay(300);
            ESP.restart();
        }
    );

    // POST /api/wifi-form — HTML form fallback for phones without JavaScript
    httpServer.on("/api/wifi-form", HTTP_POST, [](AsyncWebServerRequest* req) {
        if (!req->hasParam("ssid", true)) {
            req->send(400, "text/html; charset=utf-8", "<h2>缺少 SSID</h2><p><a href='/'>返回</a></p>");
            return;
        }

        String ssid = req->getParam("ssid", true)->value();
        String password = req->hasParam("password", true) ? req->getParam("password", true)->value() : "";
        String mqttBrokerForm = req->hasParam("mqtt_broker", true) ? req->getParam("mqtt_broker", true)->value() : "";
        uint32_t mqttPortForm = req->hasParam("mqtt_port", true) ? req->getParam("mqtt_port", true)->value().toInt() : 1883;
        String deviceIdForm = req->hasParam("device_id", true) ? req->getParam("device_id", true)->value() : "motor-01";
        if (mqttPortForm == 0) mqttPortForm = 1883;
        if (deviceIdForm.isEmpty()) deviceIdForm = "motor-01";

        prefs.begin("wifi", false);
        prefs.putString("ssid", ssid);
        prefs.putString("password", password);
        prefs.end();

        prefs.begin("mqtt", false);
        prefs.putString("mqtt_broker", mqttBrokerForm);
        prefs.putUInt("mqtt_port", mqttPortForm);
        prefs.putString("device_id", deviceIdForm);
        prefs.end();

        req->send(200, "text/html; charset=utf-8",
            "<meta name='viewport' content='width=device-width,initial-scale=1'>"
            "<body style='background:#0f172a;color:#e5e7eb;font-family:sans-serif;padding:24px'>"
            "<h2>已保存 WiFi</h2><p>如果电机正在旋转，设备会先缓慢停止，然后重启。</p>"
            "<p>请稍后连接到家庭 WiFi 或重新搜索设备。</p></body>");
        slowStopBeforeRestart();
        delay(300);
        ESP.restart();
    });

    // 404
    httpServer.onNotFound([](AsyncWebServerRequest* req) {
        req->send(404, "application/json", "{\"error\":\"not found\"}");
    });
}

// ─────────────────────────────────────────────────────────────────────────────
//  WebSocket
// ─────────────────────────────────────────────────────────────────────────────
static void onWsEvent(AsyncWebSocket*, AsyncWebSocketClient* client,
                      AwsEventType type, void* arg, uint8_t* data, size_t len) {
    if (type == WS_EVT_CONNECT) {
        Serial.printf("[WS] client #%u connected\n", client->id());
        client->text(buildStatusJson()); // immediate status on connect
    } else if (type == WS_EVT_DISCONNECT) {
        Serial.printf("[WS] client #%u disconnected\n", client->id());
    } else if (type == WS_EVT_DATA) {
        AwsFrameInfo* info = (AwsFrameInfo*)arg;
        if (info->opcode == WS_TEXT) {
            String body((char*)data, len);
            JsonDocument doc;
            if (deserializeJson(doc, body) == DeserializationError::Ok) {
                const char* cmd = doc["cmd"] | "";
                if      (strcmp(cmd, "run")   == 0) {
                    uint16_t speed; MotorDirection dir; uint32_t ramp_ms;
                    if (parseRunCommand(body, speed, dir, ramp_ms))
                        motor.setSpeed(speed, dir, ramp_ms);
                }
                else if (strcmp(cmd, "stop")  == 0) motor.stop();
                else if (strcmp(cmd, "brake") == 0) motor.brake();
                else if (strcmp(cmd, "coast") == 0) motor.coast();
                else if (strcmp(cmd, "test")  == 0) {
                    const char* typeStr = doc["type"] | "all";
                    TestType type = SelfTest::fromString(typeStr);
                    if (type != TestType::NONE) {
                        selfTest.start(type);
                    }
                }
                else if (strcmp(cmd, "display_mode") == 0) {
                    display.nextMode();
                }
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
//  setup() / loop()
// ─────────────────────────────────────────────────────────────────────────────
void setup() {
    Serial.begin(115200);
    delay(100);  // 等待串口穩定
    Serial.println("\n\n========================================");
    Serial.println("[Boot] ESP32 Motor Controller v1.3.10");
    Serial.println("========================================");

    if (!LittleFS.begin(true)) {
        Serial.println("[LittleFS] mount failed!");
    } else {
        Serial.println("[LittleFS] mounted");
    }

    // ── Load persisted config ─────────────────────────────────────────────────
    prefs.begin("motor", true);
    MotorConfig cfg;
    cfg.pin_in1          = PIN_IN1;
    cfg.pin_in2          = PIN_IN2;
    cfg.max_speed        = prefs.getUInt("max_speed", 1023);
    cfg.default_ramp_ms  = prefs.getUInt("ramp_ms",   2000);

    DirectDisplayConfig dcfg;
    dcfg.rated_rpm = prefs.getUInt("rated_rpm", 100);

    bool boot_self_test = prefs.getBool("boot_test", true);  // 預設啟用開機自檢
    prefs.end();

    motor   = MotorController(cfg);
    display = DirectDisplay(dcfg);
    motor.begin();
    display.begin();

    // LED 初始化
    pinMode(PIN_LED, OUTPUT);
    digitalWrite(PIN_LED, LOW);

    // SelfTest 初始化
    SelfTestConfig stcfg;
    stcfg.pin_led = PIN_LED;
    stcfg.pin_in1 = PIN_IN1;
    stcfg.pin_in2 = PIN_IN2;
    selfTest = SelfTest(stcfg);
    selfTest.attach(&motor, &display);

    // ── WiFi ──────────────────────────────────────────────────────────────────
    prefs.begin("wifi", true);
    String wifiSsid = prefs.getString("ssid", "");
    String wifiPass = prefs.getString("password", "");
    prefs.end();
    autoStartEnabled = (wifiSsid.length() == 0);

    WiFi.setHostname(HOSTNAME);
    if (wifiSsid.length() > 0) {
        WiFi.begin(wifiSsid.c_str(), wifiPass.c_str());
        Serial.print("[WiFi] connecting");
        uint8_t retries = 0;
        while (WiFi.status() != WL_CONNECTED && retries++ < 20) {
            delay(500); Serial.print('.');
        }
    }
    if (WiFi.status() == WL_CONNECTED) {
        Serial.printf("\n[WiFi] connected → http://%s.local  %s\n",
                      HOSTNAME, WiFi.localIP().toString().c_str());
        loadMqttConfig();
        connectMqtt();
    } else {
        Serial.println(wifiSsid.length() == 0
            ? "\n[WiFi] no credentials → starting AP mode"
            : "\n[WiFi] STA failed → starting AP mode");
        WiFi.softAP(AP_SSID, AP_PASS);
        Serial.printf("[WiFi] AP IP: %s  POST /api/wifi to provision\n",
                      WiFi.softAPIP().toString().c_str());
    }

    // ── mDNS ──────────────────────────────────────────────────────────────────
    if (MDNS.begin(HOSTNAME)) {
        MDNS.addService("http", "tcp", 80);
        Serial.printf("[mDNS] http://%s.local\n", HOSTNAME);
    }

    // ── WebSocket + HTTP ──────────────────────────────────────────────────────
    ws.onEvent(onWsEvent);
    httpServer.addHandler(&ws);
    setupRoutes();
    httpServer.begin();
    Serial.println("[HTTP] server started on port 80");
    Serial.println(autoStartEnabled
        ? "[Boot] Auto-start armed: 5s after self-test completes, forward to 70%"
        : "[Boot] Auto-start disabled: WiFi credentials already provisioned");

    // ── 開機自檢（可選，由 NVS 配置控制）──────────────────────────────────────
    if (boot_self_test) {
        Serial.println("[Boot] Running boot self-test (boot_test=true)");
        selfTest.start(TestType::ALL);
    } else {
        Serial.println("[Boot] Boot self-test disabled. Trigger via:");
        Serial.println("  HTTP:  POST /api/test  body={\"type\":\"all\"}");
        Serial.println("  MQTT:  esp/devices/<id>/command  payload={\"cmd\":\"test\",\"type\":\"all\"}");
    }
}

void loop() {
    static uint32_t lastBroadcast       = 0;
    static uint32_t lastDisplayTick     = 0;   // ← 新增
    static uint32_t lastMqttStatus      = 0;
    static uint32_t lastLedTick         = 0;   // 上次 LED 切換的時間戳
    static bool     ledState            = false; // 當前 LED 輸出狀態
    static bool     autoStartCountdown  = false;
    static bool     autoStartDone       = false;
    static uint32_t autoStartReadyAt    = 0;
    uint32_t now = millis();

    // ── LED 指示燈 ────────────────────────────────────────────────────────────
    // 注意：自檢測試運行時，由 SelfTest 任務直接控制 LED，loop 不干擾
    uint32_t blinkPeriod = 0;   // 0 = 不閃爍（由各 case 直接控制輸出）

    bool selfTestRunning = selfTest.isRunning();
    if (autoStartEnabled) {
        if (!autoStartDone && selfTestRunning) {
            autoStartCountdown = false;
        } else if (!autoStartDone && !autoStartCountdown) {
            autoStartCountdown = true;
            autoStartReadyAt   = now + AUTO_START_DELAY_MS;
            Serial.printf("[Boot] Self-test complete; auto-start in %ums\n", AUTO_START_DELAY_MS);
        }

        if (!autoStartDone && autoStartCountdown && !selfTestRunning &&
            (int32_t)(now - autoStartReadyAt) >= 0) {
            uint16_t targetSpeed = (motor.config().max_speed * AUTO_START_SPEED_PERCENT) / 100;
            motor.setSpeed(targetSpeed, MotorDirection::FORWARD, motor.config().default_ramp_ms);
            autoStartDone = true;
            Serial.printf("[Boot] Auto-start forward speed=%u (%u%%)\n",
                          targetSpeed, AUTO_START_SPEED_PERCENT);
        }
    }

    if (selfTestRunning) {
        // 測試進行中，跳過 LED 狀態更新（測試任務會控制 LED）
        goto skip_led_update;
    }

    switch (motor.state()) {
        case MotorState::RUNNING:
            if (motor.direction() == MotorDirection::FORWARD) {
                // 正轉：常亮
                digitalWrite(PIN_LED, HIGH);
            } else {
                // 反轉：快閃 150ms
                blinkPeriod = 150;
            }
            break;
        case MotorState::RAMPING:
            blinkPeriod = 600;   // 慢閃
            break;
        case MotorState::BRAKING:
            blinkPeriod = 50;    // 急促閃
            break;
        case MotorState::STOPPED:
        case MotorState::COASTING:
        default:
            digitalWrite(PIN_LED, LOW);
            break;
    }

    // 非零 period 才執行閃爍邏輯
    if (blinkPeriod > 0 && (uint32_t)(millis() - lastLedTick) >= blinkPeriod) {
        lastLedTick = millis();
        ledState    = !ledState;
        digitalWrite(PIN_LED, ledState ? HIGH : LOW);
    }

skip_led_update:

    if (now - lastBroadcast >= WS_BROADCAST_INTERVAL) {
        lastBroadcast = now;
        broadcastStatus();
        ws.cleanupClients();
    }

    if (now - lastDisplayTick >= 50) {
        lastDisplayTick = now;
        // 測試運行時，由測試任務直接控制 display
        if (!selfTest.isRunning()) {
            bool stopped = (motor.state() == MotorState::STOPPED
                         || motor.state() == MotorState::COASTING);
            display.update(motor.currentSpeed(),
                           motor.config().max_speed,
                           stopped);
        }
    }

    // MQTT: process incoming messages
    mqttClient.loop();

    // MQTT: publish status every 500ms
    if (now - lastMqttStatus >= MQTT_STATUS_INTERVAL) {
        lastMqttStatus = now;
        publishStatus();
    }

    // MQTT: reconnect if disconnected
    if (!mqttBroker.isEmpty() && !mqttClient.connected()) {
        reconnectMqtt();
    }
}
