param(
  [string]$WebsiteUrl = 'https://norissbeautyquest.pythonanywhere.com/',
  [switch]$SkipTests
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$mobile = Join-Path $root 'mobile'
if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'Install Node.js LTS first.' }
if ($WebsiteUrl -notmatch '^https://[^/]+') { throw 'Use your deployed HTTPS Django website URL.' }
Push-Location $mobile
try {
  $env:EXPO_PUBLIC_WEB_URL = $WebsiteUrl.TrimEnd('/') + '/'
  Write-Host "Android website URL: $env:EXPO_PUBLIC_WEB_URL"
  if (-not (Test-Path 'node_modules')) { npm ci; if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' } }
  if (-not $SkipTests) {
    npm run verify
    if ($LASTEXITCODE -ne 0) { throw 'Mobile verification failed. Fix it before building.' }
  }
  Write-Host 'Signing in to Expo / EAS (browser login may be required)...'
  npx --yes eas-cli@latest whoami
  if ($LASTEXITCODE -ne 0) { npx --yes eas-cli@latest login; if ($LASTEXITCODE -ne 0) { throw 'EAS login failed' } }
  Write-Host 'Starting cloud APK build. Follow the printed EAS URL to download the APK.'
  npx --yes eas-cli@latest build --platform android --profile productionApk
  if ($LASTEXITCODE -ne 0) { throw 'EAS APK build failed' }
} finally { Pop-Location }
