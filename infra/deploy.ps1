# Windows (PowerShell) version of deploy.sh, for when you're not in WSL.
# Run from anywhere:  powershell -ExecutionPolicy Bypass -File infra\deploy.ps1
$ErrorActionPreference = 'Stop'
$envFile = Join-Path $PSScriptRoot '..\.env'
$region = if (Test-Path $envFile) { ((Get-Content $envFile | Where-Object { $_ -match '^AWS_REGION=' }) -replace '^AWS_REGION=', '').Trim() } else { '' }
if (-not $region) { $region = 'us-east-1' }
Write-Host "Deploying saddle-gateway to $region"
Push-Location (Join-Path $PSScriptRoot 'lambda')
try {
  npm install --omit=dev --no-audit --no-fund
  if (Test-Path function.zip) { Remove-Item function.zip }
  # tar.exe ships with Windows 10+ and writes zip files much faster than Compress-Archive
  $files = @(Get-ChildItem -Filter *.mjs | ForEach-Object Name) + 'package.json', 'node_modules'
  tar.exe -a -cf function.zip @files
  aws lambda update-function-code --function-name saddle-gateway --zip-file fileb://function.zip --region $region --query '{fn:FunctionName,updated:LastModified,size:CodeSize}' --output table
} finally { Pop-Location }
