[CmdletBinding()]
param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$PythonArgs
)

$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$BridgeDir = Split-Path -Parent $PSCommandPath

if (-not $env:PYTHONIOENCODING) {
  $env:PYTHONIOENCODING = 'utf-8'
}

if (-not $env:PYTHONUTF8) {
  $env:PYTHONUTF8 = '1'
}

function Get-BundledUvPath {
  if ($env:LAWCLAW_BUNDLED_UV_EXE) {
    return $env:LAWCLAW_BUNDLED_UV_EXE
  }

  return Join-Path $BridgeDir '..\bin\uv.exe'
}

function Find-ManagedPythonPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$UvExe
  )

  $lines = & $UvExe python find 3.12 2>$null
  if ($LASTEXITCODE -ne 0) {
    return $null
  }

  foreach ($line in @($lines)) {
    $candidate = "$line".Trim()
    if ($candidate) {
      return $candidate
    }
  }

  return $null
}

$uvExe = Get-BundledUvPath
if (-not (Test-Path -LiteralPath $uvExe)) {
  [Console]::Error.WriteLine("Bundled uv runtime not found: $uvExe")
  exit 1
}

$pythonExe = Find-ManagedPythonPath -UvExe $uvExe
if (-not $pythonExe) {
  & $uvExe python install 3.12
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }

  $pythonExe = Find-ManagedPythonPath -UvExe $uvExe
}

if (-not $pythonExe) {
  [Console]::Error.WriteLine('Managed Python 3.12 is not available through bundled uv.')
  exit 1
}

if (-not (Test-Path -LiteralPath $pythonExe)) {
  [Console]::Error.WriteLine("Managed Python executable not found: $pythonExe")
  exit 1
}

& $pythonExe @PythonArgs
exit $LASTEXITCODE
