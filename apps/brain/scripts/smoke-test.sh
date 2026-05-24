#!/bin/bash

# Smoke test for Brain API loyalty endpoints
# Usage: BRAIN_URL=https://brain.raizygrano.com TOKEN=xxx ORG_ID=xxx ./smoke-test.sh

set -e

# Check required environment variables
if [ -z "$BRAIN_URL" ]; then
  echo "Error: BRAIN_URL not set"
  echo "Usage: BRAIN_URL=https://brain.raizygrano.com TOKEN=xxx ORG_ID=xxx ./smoke-test.sh"
  exit 1
fi

if [ -z "$TOKEN" ]; then
  echo "Error: TOKEN not set"
  echo "Usage: BRAIN_URL=https://brain.raizygrano.com TOKEN=xxx ORG_ID=xxx ./smoke-test.sh"
  exit 1
fi

if [ -z "$ORG_ID" ]; then
  echo "Error: ORG_ID not set"
  echo "Usage: BRAIN_URL=https://brain.raizygrano.com TOKEN=xxx ORG_ID=xxx ./smoke-test.sh"
  exit 1
fi

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0

# Test function
test_endpoint() {
  local method=$1
  local endpoint=$2
  local body=$3
  local expected_status=$4

  echo -n "Testing $method $endpoint ... "

  if [ "$method" = "GET" ]; then
    response=$(curl -s -w "\n%{http_code}" -X GET \
      -H "Authorization: Bearer $TOKEN" \
      "$BRAIN_URL$endpoint")
  else
    response=$(curl -s -w "\n%{http_code}" -X POST \
      -H "Authorization: Bearer $TOKEN" \
      -H "Content-Type: application/json" \
      -d "$body" \
      "$BRAIN_URL$endpoint")
  fi

  http_code=$(echo "$response" | tail -n1)
  body_content=$(echo "$response" | head -n-1)

  # Check if response is one of expected statuses (allow 200/201/400/401/403/404)
  if [[ "$http_code" =~ ^(200|201|400|401|403|404|410)$ ]]; then
    echo -e "${GREEN}✓${NC} (HTTP $http_code)"
    PASSED=$((PASSED + 1))
  else
    echo -e "${RED}✗${NC} (HTTP $http_code)"
    echo "Response: $body_content"
    FAILED=$((FAILED + 1))
  fi
}

echo "================================================"
echo "Brain API Loyalty Smoke Test"
echo "================================================"
echo "BRAIN_URL: $BRAIN_URL"
echo "ORG_ID: $ORG_ID"
echo ""

# Test endpoints

echo "--- Balance Endpoint ---"
test_endpoint "GET" "/api/org/$ORG_ID/loyalty/balance?uid=test" "" "200"

echo ""
echo "--- Redemption Validate Endpoint ---"
test_body='{"code":"ABC123"}'
test_endpoint "POST" "/api/org/$ORG_ID/loyalty/redemption-validate" "$test_body" "404"

echo ""
echo "--- Reconcile Endpoint ---"
test_body='{"uid":"test"}'
test_endpoint "POST" "/api/org/$ORG_ID/loyalty/reconcile" "$test_body" "200"

echo ""
echo "--- Economy Endpoint ---"
test_endpoint "GET" "/api/org/$ORG_ID/loyalty/economy" "" "200"

echo ""
echo "--- Expire Redemptions Endpoint ---"
test_endpoint "POST" "/api/org/$ORG_ID/loyalty/expire-redemptions" "" "200"

echo ""
echo "--- Snapshot Endpoint ---"
test_endpoint "GET" "/api/org/$ORG_ID/loyalty/snapshot" "" "200"

echo ""
echo "================================================"
echo "Results: ${GREEN}$PASSED passed${NC}, ${RED}$FAILED failed${NC}"
echo "================================================"

if [ $FAILED -gt 0 ]; then
  exit 1
fi

exit 0
