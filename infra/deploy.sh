#!/usr/bin/env bash
# Packages infra/lambda and pushes it to the saddle-gateway Lambda (region = AWS_REGION in .env).
set -euo pipefail
cd "$(dirname "$0")/lambda"
REGION=$(grep -E '^AWS_REGION=' ../../.env 2>/dev/null | cut -d= -f2 | tr -d '\r ' || true)
REGION=${REGION:-us-east-1}
echo "Deploying saddle-gateway to $REGION"
npm install --omit=dev --no-audit --no-fund
rm -f function.zip
zip -qr function.zip ./*.mjs package.json node_modules
aws lambda update-function-code \
  --function-name saddle-gateway \
  --zip-file fileb://function.zip \
  --region "$REGION" \
  --query '{fn:FunctionName,updated:LastModified,size:CodeSize}' --output table
