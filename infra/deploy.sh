#!/usr/bin/env bash
# Packages infra/lambda and pushes it to the saddle-gateway Lambda (us-west-2).
set -euo pipefail
cd "$(dirname "$0")/lambda"
npm install --omit=dev --no-audit --no-fund
rm -f function.zip
zip -qr function.zip ./*.mjs package.json node_modules
aws lambda update-function-code \
  --function-name saddle-gateway \
  --zip-file fileb://function.zip \
  --region us-west-2 \
  --query '{fn:FunctionName,updated:LastModified,size:CodeSize}' --output table
