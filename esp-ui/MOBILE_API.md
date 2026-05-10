# ESP32 Motor Controller — Mobile App API Reference

Base URL: `http://<esp32-ip>/api`  
WebSocket: `ws://<esp32-ip>/ws`   (port 81 on firmware, proxied through 80 in future)  
mDNS: `http://motorctrl.local`

---

## REST Endpoints

### GET /api/status
Returns current motor state. Poll at ≤ 5 Hz; prefer WebSocket for real-time.

**Response 200**
```json
{
  "state":        "running",
  "speed":        800,
  "speed_pct":    "78.2",
  "target_speed": 800,
  "direction":    "forward",
  "max_speed":    1023,
  "ramp_ms":      2000,
  "uptime_ms":    94321,
  "ip":           "192.168.1.100"
}
```

`state` values: `stopped` | `ramping` | `running` | `braking` | `coasting`  
`direction` values: `forward` | `reverse`  
`speed` range: 0 – `max_speed` (PWM duty, 10-bit, 0–1023)

---

### POST /api/motor/run
Start or update motor. All fields optional except `speed`.

**Request body**
```json
{
  "speed":     800,
  "direction": "forward",
  "ramp_ms":   1500
}
```

| Field | Type | Default | Notes |
|---|---|---|---|
| `speed` | int | max_speed | Target PWM duty 0–1023 |
| `direction` | string | `"forward"` | `"forward"` or `"reverse"` |
| `ramp_ms` | int | config.ramp_ms | 0 = instant |

**Response 200** — same as `/api/status`

---

### POST /api/motor/stop
Decelerates to 0 over `ramp_ms`. No body required.

---

### POST /api/motor/brake
Active short-circuit brake (instant stop). No body required.

---

### POST /api/motor/coast
Cut drive signal, free-wheel. No body required.

---

### GET /api/config
```json
{
  "max_speed":   1023,
  "min_speed":   0,
  "ramp_ms":     2000,
  "pwm_freq_hz": 20000
}
```

### POST /api/config
Persisted to NVS flash (survives reboot).
```json
{
  "max_speed": 900,
  "ramp_ms":   3000
}
```
**Response 200** `{ "ok": true }`

---

## WebSocket — Real-time Stream

Connect to `ws://<ip>/ws`.  
The device broadcasts a status JSON every **100 ms** to all connected clients.

### Server → Client (broadcast, 10 Hz)
Same schema as `GET /api/status`.

### Client → Server (commands)
Same as REST bodies, plus a `cmd` field:

```json
{ "cmd": "run",   "speed": 700, "direction": "reverse", "ramp_ms": 1000 }
{ "cmd": "stop" }
{ "cmd": "brake" }
{ "cmd": "coast" }
```

---

## Android (Kotlin) — Quick Start

```kotlin
// Retrofit REST
interface MotorApi {
    @GET("api/status")
    suspend fun status(): MotorStatus

    @POST("api/motor/run")
    suspend fun run(@Body cmd: RunCommand): MotorStatus

    @POST("api/motor/stop")
    suspend fun stop(): MotorStatus

    @POST("api/motor/brake")
    suspend fun brake(): MotorStatus
}

data class RunCommand(
    val speed: Int,
    val direction: String = "forward",
    val ramp_ms: Int? = null
)

// OkHttp WebSocket
val request = Request.Builder().url("ws://192.168.1.100/ws").build()
val ws = OkHttpClient().newWebSocket(request, object : WebSocketListener() {
    override fun onMessage(ws: WebSocket, text: String) {
        val status = Gson().fromJson(text, MotorStatus::class.java)
        // update UI
    }
})

// Send command
ws.send("""{"cmd":"run","speed":800,"direction":"forward"}""")
```

---

## iOS (Swift) — Quick Start

```swift
// URLSession REST
struct RunCommand: Encodable {
    var speed: Int
    var direction: String = "forward"
    var ramp_ms: Int?
}

func runMotor(speed: Int, direction: String) async throws -> MotorStatus {
    var req = URLRequest(url: URL(string: "http://motorctrl.local/api/motor/run")!)
    req.httpMethod = "POST"
    req.httpBody   = try JSONEncoder().encode(RunCommand(speed: speed, direction: direction))
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    let (data, _) = try await URLSession.shared.data(for: req)
    return try JSONDecoder().decode(MotorStatus.self, from: data)
}

// URLSessionWebSocketTask
let task = URLSession.shared.webSocketTask(with: URL(string: "ws://motorctrl.local/ws")!)
task.resume()

// Receive loop
func receive() {
    task.receive { result in
        if case .success(.string(let txt)) = result,
           let data = txt.data(using: .utf8),
           let status = try? JSONDecoder().decode(MotorStatus.self, from: data) {
            DispatchQueue.main.async { self.status = status }
        }
        self.receive()
    }
}

// Send
task.send(.string(#"{"cmd":"run","speed":800,"direction":"forward"}"#)) { _ in }
```
