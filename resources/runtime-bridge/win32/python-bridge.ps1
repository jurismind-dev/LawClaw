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
$PythonCheckScript = @'
import importlib
modules = ["docx", "openpyxl", "lxml", "defusedxml", "pythoncom", "win32com.client"]
missing = []
for name in modules:
    try:
        importlib.import_module(name)
    except Exception as exc:
        missing.append(f"{name}: {exc}")
if missing:
    print("\n".join(missing))
    raise SystemExit(1)
'@

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

  $lines = & $UvExe python find 3.12 --managed-python 2>$null
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

function Get-ManagedPythonVenvRoot {
  return Join-Path $HOME '.LawClaw\support\managed-python\3.12\win32'
}

function Get-ManagedPythonVenvExe {
  return Join-Path (Get-ManagedPythonVenvRoot) 'Scripts\python.exe'
}

function Get-ManagedPythonReadyMarker {
  return Join-Path (Get-ManagedPythonVenvRoot) '.lawclaw-managed-python-ready.json'
}

function Set-ManagedPythonReadyMarker {
  try {
    Set-Content -LiteralPath (Get-ManagedPythonReadyMarker) -Value '{"version":"3.12"}' -Encoding utf8
  } catch {
    # best-effort cache marker
  }
}

function Test-ManagedPythonDependencies {
  param(
    [Parameter(Mandatory = $true)]
    [string]$PythonExe,
    [switch]$Quiet
  )

  if ($Quiet) {
    & $PythonExe -c $PythonCheckScript *> $null
  } else {
    & $PythonExe -c $PythonCheckScript
  }

  return $LASTEXITCODE -eq 0
}

$uvExe = Get-BundledUvPath
if (-not (Test-Path -LiteralPath $uvExe)) {
  [Console]::Error.WriteLine("Bundled uv runtime not found: $uvExe")
  exit 1
}

$pythonExe = Get-ManagedPythonVenvExe
$readyMarker = Get-ManagedPythonReadyMarker
if ((Test-Path -LiteralPath $pythonExe) -and (Test-Path -LiteralPath $readyMarker)) {
  & $pythonExe @PythonArgs
  exit $LASTEXITCODE
}

if ((Test-Path -LiteralPath $pythonExe) -and (Test-ManagedPythonDependencies -PythonExe $pythonExe -Quiet)) {
  Set-ManagedPythonReadyMarker
  & $pythonExe @PythonArgs
  exit $LASTEXITCODE
}

if (-not (Test-Path -LiteralPath $pythonExe)) {
  $basePythonExe = Find-ManagedPythonPath -UvExe $uvExe
  if (-not $basePythonExe) {
    & $uvExe python install 3.12
    if ($LASTEXITCODE -ne 0) {
      exit $LASTEXITCODE
    }

    $basePythonExe = Find-ManagedPythonPath -UvExe $uvExe
  }

  if (-not $basePythonExe) {
    [Console]::Error.WriteLine('Managed Python 3.12 is not available through bundled uv.')
    exit 1
  }

  if (-not (Test-Path -LiteralPath $basePythonExe)) {
    [Console]::Error.WriteLine("Managed Python executable not found: $basePythonExe")
    exit 1
  }

  & $uvExe venv --no-project --clear --python $basePythonExe (Get-ManagedPythonVenvRoot)
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

if (-not (Test-Path -LiteralPath $pythonExe)) {
  [Console]::Error.WriteLine("Managed Python venv executable not found: $pythonExe")
  exit 1
}

if (-not (Test-ManagedPythonDependencies -PythonExe $pythonExe -Quiet)) {
  & $uvExe pip install --python $pythonExe --strict python-docx openpyxl lxml defusedxml pywin32
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }

  if (-not (Test-ManagedPythonDependencies -PythonExe $pythonExe)) {
    exit $LASTEXITCODE
  }
}

Set-ManagedPythonReadyMarker
& $pythonExe @PythonArgs
exit $LASTEXITCODE
