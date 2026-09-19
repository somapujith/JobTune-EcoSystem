<#
.SYNOPSIS
  Sets the production secrets on the deployed Cloudflare Worker (name: jobtune-ecosystem) with `wrangler secret put`.

.DESCRIPTION
  Values are read from environment variables or a hidden prompt and are piped to wrangler on STDIN: they never appear on
  a command line, in a file or in this script's output (only the secret NAMES are printed).

  Secrets set (see backend/wrangler.toml for the non-secret [vars]):
    JWT_SECRET      generated here: 48 random bytes, base64url (64 chars). A NEW value on purpose: the previous one is in
                    git history. Consequence: access tokens issued before the switch stop verifying (they live 15 minutes);
                    refresh tokens are random values checked against the database, so signed-in users just refresh.
                    Pass -KeepExistingJwtSecret to skip it.
    DATABASE_URL    the Neon connection string (env NEON_DATABASE_URL, else a hidden prompt). Use the "-pooler" host.
    GEMINI_API_KEY  (env GEMINI_API_KEY, else prompt; press Enter to skip)
    ADZUNA_APP_ID / ADZUNA_APP_KEY  (env or prompt; Enter to skip)

  Run from the backend/ directory:   pwsh -File scripts/migration/set-worker-secrets.ps1   (or powershell -File ...)
  Preview without changing anything: add -DryRun
#>
param(
  [switch]$DryRun,
  [switch]$KeepExistingJwtSecret,
  [string]$WorkerName = 'jobtune-ecosystem'
)

$ErrorActionPreference = 'Stop'

function Read-Secret([string]$prompt) {
  $s = Read-Host -Prompt $prompt -AsSecureString
  $b = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($b) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b) }
}

function New-JwtSecret {
  $bytes = New-Object byte[] 48
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return ([Convert]::ToBase64String($bytes)).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function Put-Secret([string]$name, [string]$value) {
  if ([string]::IsNullOrEmpty($value)) { Write-Host "skip  $name (empty)"; return }
  if ($DryRun) { Write-Host "would set  $name  (length $($value.Length))"; return }
  $value | npx wrangler secret put $name --name $WorkerName | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "wrangler secret put $name failed" }
  Write-Host "set   $name"
}

$db = $env:NEON_DATABASE_URL
if (-not $db) { $db = Read-Secret 'Neon DATABASE_URL (postgresql://...neon.tech/...)' }
if ($db -notmatch '^postgres(ql)?://[^/]+\.neon\.tech/') { throw 'DATABASE_URL does not look like a Neon connection string (host must end in .neon.tech)' }
# Everything is validated above; only now is anything set (a bad DATABASE_URL must not leave a half-configured Worker).
if (-not $KeepExistingJwtSecret) { Put-Secret 'JWT_SECRET' (New-JwtSecret) }
Put-Secret 'DATABASE_URL' $db

foreach ($n in 'GEMINI_API_KEY', 'ADZUNA_APP_ID', 'ADZUNA_APP_KEY') {
  $v = [Environment]::GetEnvironmentVariable($n)
  if (-not $v) { $v = Read-Secret "$n (Enter to skip)" }
  Put-Secret $n $v
}

Write-Host ''
Write-Host 'Secret names now on the Worker:'
if (-not $DryRun) { npx wrangler secret list --name $WorkerName }
