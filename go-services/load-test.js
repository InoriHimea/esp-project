// K6 負載測試腳本
// 使用方法: k6 run load-test.js

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// 自定義指標
const errorRate = new Rate('errors');

// 測試配置
export const options = {
  stages: [
    { duration: '30s', target: 10 },  // 預熱：30秒內增加到10個用戶
    { duration: '1m', target: 50 },   // 負載：1分鐘內增加到50個用戶
    { duration: '2m', target: 100 },  // 高負載：2分鐘內增加到100個用戶
    { duration: '1m', target: 50 },   // 降低：1分鐘內降到50個用戶
    { duration: '30s', target: 0 },   // 冷卻：30秒內降到0
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% 的請求應在 500ms 內完成
    errors: ['rate<0.1'],              // 錯誤率應低於 10%
  },
};

const BASE_URL = __ENV.API_URL || 'http://localhost:8080';
const USERNAME = __ENV.USERNAME || 'admin';
const PASSWORD = __ENV.PASSWORD || 'changeme';

let authToken = null;

// 設置階段：獲取認證令牌
export function setup() {
  const loginRes = http.post(
    `${BASE_URL}/api/v1/auth/login`,
    JSON.stringify({
      username: USERNAME,
      password: PASSWORD,
    }),
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );

  check(loginRes, {
    'login successful': (r) => r.status === 200,
    'token received': (r) => r.json('token') !== undefined,
  });

  return { token: loginRes.json('token') };
}

// 主測試函數
export default function (data) {
  const token = data.token;
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // 測試 1: 獲取設備列表
  const devicesRes = http.get(`${BASE_URL}/api/v1/devices`, { headers });
  const devicesCheck = check(devicesRes, {
    'devices status 200': (r) => r.status === 200,
    'devices response time < 200ms': (r) => r.timings.duration < 200,
  });
  errorRate.add(!devicesCheck);

  sleep(1);

  // 測試 2: 健康檢查
  const healthRes = http.get(`${BASE_URL}/health`);
  const healthCheck = check(healthRes, {
    'health status 200': (r) => r.status === 200,
    'health response time < 100ms': (r) => r.timings.duration < 100,
  });
  errorRate.add(!healthCheck);

  sleep(1);

  // 測試 3: 獲取設備狀態（如果有設備）
  if (devicesRes.status === 200) {
    const devices = devicesRes.json();
    if (Array.isArray(devices) && devices.length > 0) {
      const deviceId = devices[0].id;
      const statusRes = http.get(
        `${BASE_URL}/api/v1/devices/${deviceId}/status`,
        { headers }
      );
      const statusCheck = check(statusRes, {
        'status status 200': (r) => r.status === 200,
        'status response time < 200ms': (r) => r.timings.duration < 200,
      });
      errorRate.add(!statusCheck);
    }
  }

  sleep(2);
}

// 清理階段
export function teardown(data) {
  console.log('負載測試完成');
}
