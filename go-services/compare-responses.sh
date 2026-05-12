#!/bin/bash

# API 響應比較腳本
# 用於比較 Node.js 和 Go 版本的 API 響應

set -e

NODEJS_URL="${NODEJS_URL:-http://localhost:3000}"
GO_URL="${GO_URL:-http://localhost:8080}"
USERNAME="${USERNAME:-admin}"
PASSWORD="${PASSWORD:-changeme}"

echo "========================================="
echo "API 響應比較測試"
echo "Node.js: $NODEJS_URL"
echo "Go:      $GO_URL"
echo "========================================="
echo ""

# 顏色定義
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# 測試計數
TOTAL=0
PASSED=0
FAILED=0

# 比較函數
compare_response() {
    local test_name=$1
    local endpoint=$2
    local method=${3:-GET}
    local data=${4:-}
    local auth=${5:-}
    
    TOTAL=$((TOTAL + 1))
    echo -e "${YELLOW}測試 $TOTAL: $test_name${NC}"
    
    # 構建 curl 命令
    local curl_opts="-s -X $method"
    if [ -n "$data" ]; then
        curl_opts="$curl_opts -H 'Content-Type: application/json' -d '$data'"
    fi
    if [ -n "$auth" ]; then
        curl_opts="$curl_opts -H 'Authorization: Bearer $auth'"
    fi
    
    # 獲取響應
    local nodejs_response=$(eval "curl $curl_opts $NODEJS_URL$endpoint" 2>/dev/null || echo "ERROR")
    local go_response=$(eval "curl $curl_opts $GO_URL$endpoint" 2>/dev/null || echo "ERROR")
    
    # 比較響應（忽略時間戳等動態字段）
    if [ "$nodejs_response" = "ERROR" ] || [ "$go_response" = "ERROR" ]; then
        echo -e "${RED}✗ 請求失敗${NC}"
        FAILED=$((FAILED + 1))
    elif [ "$nodejs_response" = "$go_response" ]; then
        echo -e "${GREEN}✓ 響應完全一致${NC}"
        PASSED=$((PASSED + 1))
    else
        # 檢查 JSON 結構是否相似
        local nodejs_keys=$(echo "$nodejs_response" | jq -r 'keys | sort | @json' 2>/dev/null || echo "")
        local go_keys=$(echo "$go_response" | jq -r 'keys | sort | @json' 2>/dev/null || echo "")
        
        if [ "$nodejs_keys" = "$go_keys" ] && [ -n "$nodejs_keys" ]; then
            echo -e "${GREEN}✓ JSON 結構一致（值可能不同）${NC}"
            PASSED=$((PASSED + 1))
        else
            echo -e "${RED}✗ 響應不一致${NC}"
            echo "Node.js: ${nodejs_response:0:100}..."
            echo "Go:      ${go_response:0:100}..."
            FAILED=$((FAILED + 1))
        fi
    fi
    echo ""
}

# 測試 1: 健康檢查
compare_response "健康檢查" "/health"

# 測試 2: 登入（Node.js）
echo -e "${YELLOW}獲取 Node.js 令牌...${NC}"
NODEJS_TOKEN=$(curl -s -X POST "$NODEJS_URL/api/v1/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}" | \
    jq -r '.token' 2>/dev/null || echo "")

# 測試 3: 登入（Go）
echo -e "${YELLOW}獲取 Go 令牌...${NC}"
GO_TOKEN=$(curl -s -X POST "$GO_URL/api/v1/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$USERNAME\",\"password\":\"$PASSWORD\"}" | \
    jq -r '.token' 2>/dev/null || echo "")

if [ -z "$NODEJS_TOKEN" ] || [ "$NODEJS_TOKEN" = "null" ]; then
    echo -e "${RED}無法獲取 Node.js 令牌，跳過認證測試${NC}"
    echo ""
else
    echo -e "${GREEN}Node.js 令牌: ${NODEJS_TOKEN:0:20}...${NC}"
fi

if [ -z "$GO_TOKEN" ] || [ "$GO_TOKEN" = "null" ]; then
    echo -e "${RED}無法獲取 Go 令牌，跳過認證測試${NC}"
    echo ""
else
    echo -e "${GREEN}Go 令牌: ${GO_TOKEN:0:20}...${NC}"
fi
echo ""

# 如果有令牌，繼續測試
if [ -n "$GO_TOKEN" ] && [ "$GO_TOKEN" != "null" ]; then
    # 測試 4: 獲取設備列表
    compare_response "獲取設備列表" "/api/v1/devices" "GET" "" "$GO_TOKEN"
    
    # 測試 5: 無效令牌
    compare_response "無效令牌測試" "/api/v1/devices" "GET" "" "invalid_token"
fi

# 總結
echo "========================================="
echo "測試總結"
echo "========================================="
echo -e "總計: $TOTAL"
echo -e "${GREEN}通過: $PASSED${NC}"
echo -e "${RED}失敗: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}所有測試通過！✓${NC}"
    exit 0
else
    echo -e "${RED}部分測試失敗！✗${NC}"
    exit 1
fi
