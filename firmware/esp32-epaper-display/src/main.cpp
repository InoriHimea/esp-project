#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClient.h>
#include <ESPAsyncWebServer.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <ESPmDNS.h>
#include <LittleFS.h>
#include <PubSubClient.h>

#include "EpaperDisplay.h"

static const char* HOSTNAME = "epaperctrl";
static const char* AP_SSID = "ESP32-Epaper";
static const char* AP_PASS = "epaperctrl";

static constexpr uint32_t WS_BROADCAST_INTERVAL = 500;
static constexpr uint32_t MQTT_STATUS_INTERVAL = 1000;

EpaperDisplay display(defaultPanelConfig());
AsyncWebServer httpServer(80);
AsyncWebSocket ws("/ws");
Preferences prefs;
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

String mqttBroker;
uint16_t mqttPort = 1883;
String deviceId;

static EpaperRefreshMode parseRefreshMode(const char* value) {
    return strcmp(value, "partial") == 0 ? EpaperRefreshMode::PARTIAL : EpaperRefreshMode::FULL;
}

static JsonArray addPalette(JsonDocument& doc) {
    JsonArray palette = doc["palette"].to<JsonArray>();
    String paletteString = display.config().palette;
    int start = 0;
    while (start < paletteString.length()) {
        int end = paletteString.indexOf(',', start);
        if (end < 0) end = paletteString.length();
        String token = paletteString.substring(start, end);
        token.trim();
        if (!token.isEmpty()) palette.add(token);
        start = end + 1;
    }
    return palette;
}

static String buildStatusJson() {
    JsonDocument doc;
    const PanelConfig& cfg = display.config();

    doc["device_type"] = "epaper";
    doc["panel_type"] = cfg.type == EpaperPanelType::COLOR ? "color" : "mono";
    doc["panel_model"] = cfg.model;
    doc["width"] = cfg.width;
    doc["height"] = cfg.height;
    doc["busy"] = display.busy();
    doc["state"] = display.stateString();
    doc["supports_partial"] = cfg.supportsPartial;
    doc["last_refresh_ms"] = display.lastRefreshMs();
    doc["refresh_count"] = display.refreshCount();
    doc["uptime_ms"] = millis();
    doc["ip"] = WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : WiFi.softAPIP().toString();
    if (cfg.type == EpaperPanelType::COLOR && strlen(cfg.accentColor) > 0) {
        doc["accent_color"] = cfg.accentColor;
    }
    if (!display.lastError().isEmpty()) {
        doc["error"] = display.lastError();
    }
    addPalette(doc);

    String out;
    serializeJson(doc, out);
    return out;
}

static void addCors(AsyncWebServerResponse* response) {
    response->addHeader("Access-Control-Allow-Origin", "*");
    response->addHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    response->addHeader("Access-Control-Allow-Headers", "Content-Type");
}

static void sendJson(AsyncWebServerRequest* request, int code, const String& body) {
    auto* response = request->beginResponse(code, "application/json", body);
    addCors(response);
    request->send(response);
}

static String jsonError(const char* error) {
    JsonDocument doc;
    doc["error"] = error;
    String out;
    serializeJson(doc, out);
    return out;
}

static bool executeCommand(JsonDocument& doc, String& error) {
    const char* cmd = doc["cmd"] | "";

    if (strcmp(cmd, "display_text") == 0) {
        EpaperTextCommand textCommand;
        textCommand.text = doc["text"] | "";
        textCommand.x = doc["x"] | 0;
        textCommand.y = doc["y"] | 0;
        textCommand.size = doc["size"] | 2;
        textCommand.color = doc["color"] | "black";
        textCommand.refreshMode = parseRefreshMode(doc["refresh"] | "full");

        if (textCommand.text.isEmpty()) {
            error = "text is required";
            return false;
        }
        if (textCommand.size == 0) textCommand.size = 1;
        if (!display.displayText(textCommand)) {
            error = display.lastError();
            return false;
        }
        return true;
    }

    if (strcmp(cmd, "clear") == 0) {
        const char* color = doc["color"] | "white";
        EpaperRefreshMode mode = parseRefreshMode(doc["refresh"] | "full");
        if (!display.clear(color, mode)) {
            error = display.lastError();
            return false;
        }
        return true;
    }

    if (strcmp(cmd, "refresh") == 0) {
        EpaperRefreshMode mode = parseRefreshMode(doc["mode"] | "full");
        if (!display.refresh(mode)) {
            error = display.lastError();
            return false;
        }
        return true;
    }

    if (strcmp(cmd, "sleep") == 0) {
        display.sleep();
        return true;
    }

    if (strcmp(cmd, "wake") == 0) {
        display.wake();
        return true;
    }

    error = "unknown command";
    return false;
}

static void handleCommandBody(AsyncWebServerRequest* request, uint8_t* data, size_t len) {
    JsonDocument doc;
    if (deserializeJson(doc, data, len) != DeserializationError::Ok || !doc["cmd"].is<const char*>()) {
        sendJson(request, 400, jsonError("invalid_command"));
        return;
    }

    String error;
    if (!executeCommand(doc, error)) {
        JsonDocument err;
        err["error"] = error;
        String out;
        serializeJson(err, out);
        sendJson(request, 409, out);
        return;
    }

    sendJson(request, 200, buildStatusJson());
}

static void loadMqttConfig() {
    prefs.begin("mqtt", true);
    mqttBroker = prefs.getString("mqtt_broker", "");
    mqttPort = (uint16_t)prefs.getUInt("mqtt_port", 1883);
    deviceId = prefs.getString("device_id", "epaper-01");
    prefs.end();
    Serial.printf("[MQTT] broker=%s port=%u deviceId=%s\n", mqttBroker.c_str(), mqttPort, deviceId.c_str());
}

static void onMqttMessage(char* topic, byte* payload, unsigned int length) {
    String body((char*)payload, length);
    Serial.printf("[MQTT] msg on %s: %s\n", topic, body.c_str());

    JsonDocument doc;
    if (deserializeJson(doc, body) != DeserializationError::Ok || !doc["cmd"].is<const char*>()) {
        Serial.println("[MQTT] invalid command JSON, ignored");
        return;
    }

    String error;
    if (!executeCommand(doc, error)) {
        Serial.printf("[MQTT] command failed: %s\n", error.c_str());
    }
}

static void connectMqtt() {
    if (mqttBroker.isEmpty()) {
        Serial.println("[MQTT] no broker configured, skipping");
        return;
    }

    mqttClient.setServer(mqttBroker.c_str(), mqttPort);
    mqttClient.setCallback(onMqttMessage);

    if (mqttClient.connect(deviceId.c_str())) {
        String cmdTopic = "esp/devices/" + deviceId + "/command";
        mqttClient.subscribe(cmdTopic.c_str());
        Serial.printf("[MQTT] connected, subscribed to %s\n", cmdTopic.c_str());
    } else {
        Serial.printf("[MQTT] connect failed, rc=%d\n", mqttClient.state());
    }
}

static void reconnectMqtt() {
    if (mqttBroker.isEmpty() || mqttClient.connected()) return;

    if (mqttClient.connect(deviceId.c_str())) {
        String cmdTopic = "esp/devices/" + deviceId + "/command";
        mqttClient.subscribe(cmdTopic.c_str());
        Serial.printf("[MQTT] reconnected, subscribed to %s\n", cmdTopic.c_str());
    } else {
        Serial.printf("[MQTT] reconnect failed, rc=%d\n", mqttClient.state());
    }
}

static void publishStatus() {
    if (!mqttClient.connected()) return;
    String topic = "esp/devices/" + deviceId + "/status";
    String payload = buildStatusJson();
    mqttClient.publish(topic.c_str(), payload.c_str());
}

static void setupRoutes() {
    httpServer.serveStatic("/style.css", LittleFS, "/style.css").setCacheControl("max-age=86400");

    httpServer.on("/*", HTTP_OPTIONS, [](AsyncWebServerRequest* request) {
        auto* response = request->beginResponse(204);
        addCors(response);
        request->send(response);
    });

    httpServer.on("/", HTTP_GET, [](AsyncWebServerRequest* request) {
        static const char html[] PROGMEM = R"html(<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ESP32 E-Paper</title><link rel="stylesheet" href="/style.css"></head><body><form class="card" id="f"><div class="header"><div class="icon">EPD</div><div><h1>ESP32 E-Paper</h1><p>WiFi / MQTT 配置</p></div></div><div class="field"><label>WiFi SSID</label><input name="ssid" required></div><div class="field"><label>WiFi 密码</label><input name="password" type="password"></div><div class="section"><div class="section-title">MQTT</div><div class="field"><label>Broker 地址</label><input name="mqtt_broker" placeholder="192.168.1.50"></div><div class="field"><label>端口</label><input name="mqtt_port" type="number" value="1883"></div><div class="field"><label>设备 ID</label><input name="device_id" value="epaper-01"></div></div><button>保存并重启</button><div id="s" class="status"></div></form><script>f.onsubmit=async e=>{e.preventDefault();const b=Object.fromEntries(new FormData(f));b.mqtt_port=Number(b.mqtt_port||1883);const r=await fetch('/api/wifi',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});s.className='status '+(r.ok?'ok':'err');s.textContent=r.ok?'已保存，设备重启中':'保存失败'};</script></body></html>)html";
        request->send(200, "text/html", html);
    });

    httpServer.on("/api/status", HTTP_GET, [](AsyncWebServerRequest* request) {
        sendJson(request, 200, buildStatusJson());
    });

    httpServer.on("/api/config", HTTP_GET, [](AsyncWebServerRequest* request) {
        JsonDocument doc;
        doc["device_id"] = deviceId;
        doc["mqtt_broker"] = mqttBroker;
        doc["mqtt_port"] = mqttPort;
        doc["panel_model"] = display.config().model;
        doc["panel_type"] = display.config().type == EpaperPanelType::COLOR ? "color" : "mono";
        doc["width"] = display.config().width;
        doc["height"] = display.config().height;
        doc["supports_partial"] = display.config().supportsPartial;
        String out;
        serializeJson(doc, out);
        sendJson(request, 200, out);
    });

    httpServer.on("/api/config", HTTP_POST,
        [](AsyncWebServerRequest*) {},
        nullptr,
        [](AsyncWebServerRequest* request, uint8_t* data, size_t len, size_t, size_t) {
            JsonDocument doc;
            if (deserializeJson(doc, data, len) != DeserializationError::Ok) {
                sendJson(request, 400, jsonError("invalid_json"));
                return;
            }
            prefs.begin("mqtt", false);
            if (doc["mqtt_broker"].is<const char*>()) prefs.putString("mqtt_broker", doc["mqtt_broker"].as<const char*>());
            if (doc["mqtt_port"].is<int>()) prefs.putUInt("mqtt_port", doc["mqtt_port"].as<uint32_t>());
            if (doc["device_id"].is<const char*>()) prefs.putString("device_id", doc["device_id"].as<const char*>());
            prefs.end();
            loadMqttConfig();
            connectMqtt();
            sendJson(request, 200, "{\"ok\":true}");
        }
    );

    httpServer.on("/api/command", HTTP_POST,
        [](AsyncWebServerRequest*) {},
        nullptr,
        [](AsyncWebServerRequest* request, uint8_t* data, size_t len, size_t, size_t) {
            handleCommandBody(request, data, len);
        }
    );

    httpServer.on("/api/wifi", HTTP_GET, [](AsyncWebServerRequest* request) {
        prefs.begin("wifi", true);
        String ssid = prefs.getString("ssid", "");
        prefs.end();
        JsonDocument doc;
        doc["ssid"] = ssid;
        doc["connected"] = WiFi.status() == WL_CONNECTED;
        doc["ip"] = WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : WiFi.softAPIP().toString();
        String out;
        serializeJson(doc, out);
        sendJson(request, 200, out);
    });

    httpServer.on("/api/wifi", HTTP_POST,
        [](AsyncWebServerRequest*) {},
        nullptr,
        [](AsyncWebServerRequest* request, uint8_t* data, size_t len, size_t, size_t) {
            JsonDocument doc;
            if (deserializeJson(doc, data, len) != DeserializationError::Ok || !doc["ssid"].is<const char*>()) {
                sendJson(request, 400, jsonError("invalid_json"));
                return;
            }

            prefs.begin("wifi", false);
            prefs.putString("ssid", doc["ssid"].as<const char*>());
            prefs.putString("password", doc["password"] | "");
            prefs.end();

            prefs.begin("mqtt", false);
            if (doc["mqtt_broker"].is<const char*>()) prefs.putString("mqtt_broker", doc["mqtt_broker"].as<const char*>());
            prefs.putUInt("mqtt_port", doc["mqtt_port"].is<int>() ? (uint32_t)doc["mqtt_port"].as<int>() : 1883u);
            prefs.putString("device_id", doc["device_id"] | "epaper-01");
            prefs.end();

            sendJson(request, 200, "{\"ok\":true,\"rebooting\":true}");
            delay(300);
            ESP.restart();
        }
    );

    httpServer.onNotFound([](AsyncWebServerRequest* request) {
        sendJson(request, 404, jsonError("not_found"));
    });
}

static void onWsEvent(AsyncWebSocket*, AsyncWebSocketClient* client, AwsEventType type, void* arg, uint8_t* data, size_t len) {
    if (type == WS_EVT_CONNECT) {
        Serial.printf("[WS] client #%u connected\n", client->id());
        client->text(buildStatusJson());
        return;
    }
    if (type == WS_EVT_DISCONNECT) {
        Serial.printf("[WS] client #%u disconnected\n", client->id());
        return;
    }
    if (type != WS_EVT_DATA) return;

    AwsFrameInfo* info = (AwsFrameInfo*)arg;
    if (info->opcode != WS_TEXT) return;

    JsonDocument doc;
    if (deserializeJson(doc, data, len) != DeserializationError::Ok || !doc["cmd"].is<const char*>()) return;
    String error;
    executeCommand(doc, error);
}

void setup() {
    Serial.begin(115200);
    delay(100);
    Serial.println("\n\n========================================");
    Serial.println("[Boot] ESP32 E-Paper Display Controller");
    Serial.println("========================================");

    if (!LittleFS.begin(true)) {
        Serial.println("[LittleFS] mount failed");
    } else {
        Serial.println("[LittleFS] mounted");
    }

    display.begin();

    prefs.begin("wifi", true);
    String wifiSsid = prefs.getString("ssid", "");
    String wifiPass = prefs.getString("password", "");
    prefs.end();

    WiFi.setHostname(HOSTNAME);
    if (!wifiSsid.isEmpty()) {
        WiFi.begin(wifiSsid.c_str(), wifiPass.c_str());
        Serial.print("[WiFi] connecting");
        uint8_t retries = 0;
        while (WiFi.status() != WL_CONNECTED && retries++ < 20) {
            delay(500);
            Serial.print('.');
        }
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.printf("\n[WiFi] connected -> http://%s.local  %s\n", HOSTNAME, WiFi.localIP().toString().c_str());
        loadMqttConfig();
        connectMqtt();
    } else {
        Serial.println(wifiSsid.isEmpty() ? "\n[WiFi] no credentials -> starting AP mode" : "\n[WiFi] STA failed -> starting AP mode");
        WiFi.softAP(AP_SSID, AP_PASS);
        Serial.printf("[WiFi] AP IP: %s\n", WiFi.softAPIP().toString().c_str());
        loadMqttConfig();
    }

    if (MDNS.begin(HOSTNAME)) {
        MDNS.addService("http", "tcp", 80);
        Serial.printf("[mDNS] http://%s.local\n", HOSTNAME);
    }

    ws.onEvent(onWsEvent);
    httpServer.addHandler(&ws);
    setupRoutes();
    httpServer.begin();
    Serial.println("[HTTP] server started on port 80");
}

void loop() {
    static uint32_t lastBroadcast = 0;
    static uint32_t lastMqttStatus = 0;
    uint32_t now = millis();

    display.tick();

    if (now - lastBroadcast >= WS_BROADCAST_INTERVAL) {
        lastBroadcast = now;
        ws.textAll(buildStatusJson());
        ws.cleanupClients();
    }

    mqttClient.loop();

    if (now - lastMqttStatus >= MQTT_STATUS_INTERVAL) {
        lastMqttStatus = now;
        publishStatus();
    }

    if (!mqttBroker.isEmpty() && !mqttClient.connected()) {
        reconnectMqtt();
    }
}
