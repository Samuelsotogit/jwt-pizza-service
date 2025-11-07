#!/bin/bash

# Usage: ./generateTraffic.sh <host>
if [ -z "$1" ]; then
  echo "Usage: $0 <host>"
  echo "Example: $0 http://localhost:3000"
  exit 1
fi

host=$1

# Trap SIGINT to clean up background processes
cleanup() {
  echo "Stopping traffic generator..."
  kill $pid1 $pid2 $pid3 $pid4 $pid5 2>/dev/null || true
  exit 0
}
trap cleanup SIGINT

execute_curl() {
  curl -s -o /dev/null -w "%{http_code}" "$@"
}

login() {
  response=$(curl -s -X PUT "$host/api/auth" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}")
  token=$(echo "$response" | jq -r '.token')
  [ "$token" = "null" ] && token=""
  echo "$token"
}

# --- 1) GET /api/order/menu every 3s ---
while true; do
  result=$(execute_curl GET "$host/api/order/menu")
  echo "[MENU] GET /menu"
  sleep 3
done &
pid1=$!

# --- 2) Random failed login every 5-15s ---
while true; do
  result=$(execute_curl -X PUT "$host/api/auth" \
    -H "Content-Type: application/json" \
    -d '{"email":"unknown@jwt.com","password":"bad"}')
  echo "[AUTH] Failed login -> $result"
  sleep $((RANDOM % 11 + 5))
done &
pid2=$!

# --- 3) Franchisee login/logout every ~2 minutes ---
while true; do
  token=$(login "f@jwt.com" "franchisee")
  echo "[AUTH] Franchisee login -> $( [ -z "$token" ] && echo "failed" || echo "success")"
  sleep 110
  if [ -n "$token" ]; then
    result=$(execute_curl -X DELETE "$host/api/auth" -H "Authorization: Bearer $token")
    echo "[AUTH] Franchisee logout -> $result"
  fi
  sleep 10
done &
pid3=$!

# --- 4) Diner orders a pizza every ~50s ---
while true; do
  token=$(login "d@jwt.com" "diner")
  echo "[AUTH] Diner login -> $( [ -z "$token" ] && echo "failed" || echo "success")"

  if [ -n "$token" ]; then
    payload='{"franchiseId":1,"storeId":1,"items":[{"menuId":1,"description":"Veggie","price":0.05}]}'
    result=$(execute_curl -X POST "$host/api/order" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $token" \
      -d "$payload")
    echo "[ORDER] Buy pizza -> $result"
    sleep 10
    result=$(execute_curl -X DELETE "$host/api/auth" -H "Authorization: Bearer $token")
    echo "[AUTH] Diner logout -> $result"
  fi
  sleep 30
done &
pid4=$!

# --- 5) Diner attempts failed pizza order (too many items) every ~5min ---
while true; do
  token=$(login "d@jwt.com" "diner")
  echo "[AUTH] Hungry diner login -> $( [ -z "$token" ] && echo "failed" || echo "success")"

  if [ -n "$token" ]; then
    items='{"menuId":1,"description":"Veggie","price":0.05}'
    for i in $(seq 1 21); do
      items="$items,{\"menuId\":1,\"description\":\"Veggie\",\"price\":0.05}"
    done
    payload="{\"franchiseId\":1,\"storeId\":1,\"items\":[$items]}"
    result=$(execute_curl -X POST "$host/api/order" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $token" \
      -d "$payload")
    echo "[ORDER] Failed bulk pizza -> $result"
    sleep 5
    result=$(execute_curl -X DELETE "$host/api/auth" -H "Authorization: Bearer $token")
    echo "[AUTH] Hungry diner logout -> $result"
  fi
  sleep 295
done &
pid5=$!

# Wait for background processes
wait $pid1 $pid2 $pid3 $pid4 $pid5
