#!/bin/bash

# ESP 控制平台 API 測試腳本

set -e

API_URL="${API_URL:-http://localhost:8080}"
USERNAME="${USERNAME:-admin}"
PASSWORD="${PASSWORD:-changeme}"

echo "========================================="
echo "ESP 控制平台 API 測試"
echo "========================================="
echo ""

# 顏色定義
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 測試健康檢查
echo -e "${YELLOW}1. 測試健康檢查...${NC}"
HEALTH_RESPONSE=$(curl -s "$API_URL/health")
echo "響應: $HEALTH_RESPONSE"
if echo "$HEALTH_RESPONSE" | grep -q "healthy"; then
    echo -e "${GREEN}✓ 健康檢查通過${NC}"
else
    echo -e "${RED}✗ 健康檢查失敗${NC}"
    exit 1
fi
echo ""

# 測試登入
echo -e "${YELLOW}2. 測試用戶登入...${NC}"
LOGIN_RESPONSE=$(curl -s -X POST "$API_URL/api/v1/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}")
echo "響應: $LOGIN_RESPONSE"

TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*' | cut -d'"' -f4)
if [ -z "$TOKEN" ]; then
    echo -e "${RED}✗ 登入失敗${NC}"
    exit 1
fi
echo -e "${GREEN}✓ 登入成功${NC}"
echo "Token: ${TOKEN:0:20}..."
echo ""

# 測試獲取設備列表
echo -e "${YELLOW}3. 測試獲取設備列表...${NC}"
DEVICES_RESPONSE=$(curl -s "$API_URL/api/v1/devices" \
    -H "Authorization: Bearer $TOKEN")
echo "響應: $DEVICES_RESPONSE"
echo -e "${GREEN}✓ 獲取設備列表成功${NC}"
echo ""

# 測試無效令牌
echo -e "${YELLOW}4. 測試無效令牌...${NC}"
INVALID_RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/api/v1/devices" \
    -H "Authorization: Bearer invalid_token")
HTTP_CODE=$(echo "$INVALID_RESPONSE" | tail -n1)
if [ "$HTTP_CODE" = "401" ]; then
    echo -e "${GREEN}✓ 無效令牌正確被拒絕${NC}"
else
    echo -e "${RED}✗ 無效令牌測試失敗 (HTTP $HTTP_CODE)${NC}"
fi
echo ""

# 測試缺少令牌
echo -e "${YELLOW}5. 測試缺少令牌...${NC}"
NO_TOKEN_RESPONSE=$(curl -s -w "\n%{http_code}" "$API_URL/api/v1/devices")
HTTP_CODE=$(echo "$NO_TOKEN_RESPONSE" | tail -n1)
if [ "$HTTP_CODE" = "401" ]; then
    echo -e "${GREEN}✓ 缺少令牌正確被拒絕${NC}"
else
    echo -e "${RED}✗ 缺少令牌測試失敗 (HTTP $HTTP_CODE)${NC}"
fi
echo ""

echo "========================================="
echo -e "${GREEN}所有測試完成！${NC}"
echo "========================================="
