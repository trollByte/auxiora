# ---------------------------------------------------------------------------
# install.ps1 — Install Auxiora on Windows
# ---------------------------------------------------------------------------

#Requires -Version 5.1

[CmdletBinding()]
param(
    [switch]$Uninstall,
    [switch]$NoDesktopShortcut,
    [switch]$NoStartMenu
)

$ErrorActionPreference = "Stop"

$Version         = "2.0.0"
$ReleaseUrl      = "https://github.com/auxiora/auxiora/releases/download/v$Version"
$MinNodeMajor    = 22
$InstallDir      = Join-Path $env:LOCALAPPDATA "Auxiora"
$TarballName     = "auxiora-$Version-windows-x64.tar.gz"
$DownloadUrl     = "$ReleaseUrl/$TarballName"

# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------
function Write-Info    { param([string]$Msg) Write-Host "[*] $Msg" -ForegroundColor Cyan }
function Write-Success { param([string]$Msg) Write-Host "[+] $Msg" -ForegroundColor Green }
function Write-Warn    { param([string]$Msg) Write-Host "[!] $Msg" -ForegroundColor Yellow }
function Write-Err     { param([string]$Msg) Write-Host "[x] $Msg" -ForegroundColor Red }
function Write-Fatal   { param([string]$Msg) Write-Err $Msg; exit 1 }

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
function Get-NodeMajorVersion {
    try {
        $raw = & node -p "process.versions.node.split('.')[0]" 2>$null
        return [int]$raw
    }
    catch {
        return 0
    }
}

function Add-ToUserPath {
    param([string]$Dir)
    $current = [Environment]::GetEnvironmentVariable("PATH", "User")
    if ($current -and $current.Split(";") -contains $Dir) {
        return $false
    }
    [Environment]::SetEnvironmentVariable("PATH", "$Dir;$current", "User")
    $env:PATH = "$Dir;$env:PATH"
    return $true
}

function New-Shortcut {
    param(
        [string]$ShortcutPath,
        [string]$TargetPath,
        [string]$Arguments = "",
        [string]$WorkingDir = "",
        [string]$IconPath = ""
    )
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($ShortcutPath)
    $shortcut.TargetPath = $TargetPath
    if ($Arguments) { $shortcut.Arguments = $Arguments }
    if ($WorkingDir) { $shortcut.WorkingDirectory = $WorkingDir }
    if ($IconPath -and (Test-Path $IconPath)) { $shortcut.IconLocation = $IconPath }
    $shortcut.Save()
}

# ---------------------------------------------------------------------------
# Uninstall
# ---------------------------------------------------------------------------
function Invoke-Uninstall {
    Write-Info "Uninstalling Auxiora..."

    $found = $false

    # Remove install directory
    if (Test-Path $InstallDir) {
        Write-Info "Removing $InstallDir"
        Remove-Item -Recurse -Force $InstallDir
        $found = $true
    }

    # Remove from PATH
    $userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
    if ($userPath) {
        $binDir = Join-Path $InstallDir "bin"
        $parts = $userPath.Split(";") | Where-Object { $_ -ne $binDir -and $_ -ne $InstallDir }
        [Environment]::SetEnvironmentVariable("PATH", ($parts -join ";"), "User")
    }

    # Remove Desktop shortcut
    $desktopLink = Join-Path ([Environment]::GetFolderPath("Desktop")) "Auxiora.lnk"
    if (Test-Path $desktopLink) {
        Write-Info "Removing Desktop shortcut"
        Remove-Item -Force $desktopLink
        $found = $true
    }

    # Remove Start Menu entry
    $startMenuDir = Join-Path ([Environment]::GetFolderPath("Programs")) "Auxiora"
    if (Test-Path $startMenuDir) {
        Write-Info "Removing Start Menu entry"
        Remove-Item -Recurse -Force $startMenuDir
        $found = $true
    }

    if ($found) {
        Write-Success "Auxiora has been uninstalled."
    }
    else {
        Write-Warn "Auxiora does not appear to be installed."
    }
}

# ---------------------------------------------------------------------------
# Install Node.js
# ---------------------------------------------------------------------------
function Install-NodeJs {
    Write-Info "Node.js >= $MinNodeMajor is required but not found."

    $answer = Read-Host "Would you like to install Node.js $MinNodeMajor? [y/N]"
    if ($answer -notmatch '^[yY]') {
        Write-Fatal "Node.js >= $MinNodeMajor is required. Install it manually and re-run this script."
    }

    # Try winget first
    $hasWinget = $null -ne (Get-Command winget -ErrorAction SilentlyContinue)
    if ($hasWinget) {
        Write-Info "Installing Node.js $MinNodeMajor via winget..."
        & winget install --id OpenJS.NodeJS.LTS --version "$MinNodeMajor.*" --accept-source-agreements --accept-package-agreements
        if ($LASTEXITCODE -eq 0) {
            # Refresh PATH for this session
            $env:PATH = [Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [Environment]::GetEnvironmentVariable("PATH", "User")
            Write-Success "Node.js installed via winget."
            return
        }
        Write-Warn "winget installation failed, trying direct download..."
    }

    # Direct download from nodejs.org
    $nodeInstaller = Join-Path $env:TEMP "node-v$MinNodeMajor-setup.msi"
    $nodeUrl = "https://nodejs.org/dist/latest-v$MinNodeMajor.x/node-v$MinNodeMajor.0.0-x64.msi"

    Write-Info "Downloading Node.js installer..."
    $ProgressPreference = "SilentlyContinue"
    Invoke-WebRequest -Uri $nodeUrl -OutFile $nodeInstaller -UseBasicParsing
    $ProgressPreference = "Continue"

    Write-Info "Running Node.js installer..."
    Start-Process msiexec.exe -ArgumentList "/i", "`"$nodeInstaller`"", "/qn", "/norestart" -Wait -NoNewWindow

    # Refresh PATH
    $env:PATH = [Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [Environment]::GetEnvironmentVariable("PATH", "User")

    Remove-Item -Force $nodeInstaller -ErrorAction SilentlyContinue

    $ver = Get-NodeMajorVersion
    if ($ver -lt $MinNodeMajor) {
        Write-Fatal "Node.js installation completed but version is still below $MinNodeMajor. Please restart your terminal and try again."
    }

    Write-Success "Node.js $(& node --version) installed."
}

# ---------------------------------------------------------------------------
# Main install
# ---------------------------------------------------------------------------
function Invoke-Install {
    Write-Host ""
    Write-Host "  Auxiora Installer v$Version" -ForegroundColor White
    Write-Host "  ==========================" -ForegroundColor DarkGray
    Write-Host ""
    Write-Info "Platform:     windows-x64"
    Write-Info "Install to:   $InstallDir"
    Write-Host ""

    # -- Check Node.js ------------------------------------------------------
    $nodeMajor = Get-NodeMajorVersion
    if ($nodeMajor -lt $MinNodeMajor) {
        Install-NodeJs
    }
    else {
        Write-Success "Node.js $(& node --version) found."
    }

    # -- Download tarball ---------------------------------------------------
    $tmpDir = Join-Path $env:TEMP "auxiora-install-$(Get-Random)"
    New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null

    try {
        $tarball = Join-Path $tmpDir $TarballName

        Write-Info "Downloading $TarballName..."
        $ProgressPreference = "SilentlyContinue"
        Invoke-WebRequest -Uri $DownloadUrl -OutFile $tarball -UseBasicParsing
        $ProgressPreference = "Continue"
        Write-Success "Download complete."

        # -- Extract --------------------------------------------------------
        Write-Info "Extracting to $InstallDir..."

        if (Test-Path $InstallDir) {
            Write-Warn "Existing installation found, replacing it."
            Remove-Item -Recurse -Force $InstallDir
        }

        # Use tar (available on Windows 10+)
        & tar xzf $tarball -C $tmpDir
        if ($LASTEXITCODE -ne 0) {
            Write-Fatal "Failed to extract tarball. Ensure tar is available (Windows 10 1803+)."
        }

        $extractedDir = Join-Path $tmpDir "auxiora-$Version-windows-x64"
        if (-not (Test-Path $extractedDir)) {
            # Try without windows prefix
            $extractedDir = Get-ChildItem -Path $tmpDir -Directory | Where-Object { $_.Name -like "auxiora-*" } | Select-Object -First 1 -ExpandProperty FullName
            if (-not $extractedDir) {
                Write-Fatal "Unexpected tarball structure."
            }
        }

        Move-Item -Path $extractedDir -Destination $InstallDir
        Write-Success "Extracted to $InstallDir."

        # -- Create batch wrapper for Windows -------------------------------
        $binDir = Join-Path $InstallDir "bin"
        if (-not (Test-Path $binDir)) { New-Item -ItemType Directory -Path $binDir | Out-Null }

        $batchWrapper = Join-Path $binDir "auxiora.cmd"
        @"
@echo off
node "%~dp0\..\packages\cli\dist\index.js" %*
"@ | Set-Content -Path $batchWrapper -Encoding ASCII

        # -- Add to PATH ---------------------------------------------------
        Write-Info "Adding to PATH..."
        $added = Add-ToUserPath $binDir
        if ($added) {
            Write-Success "Added $binDir to user PATH."
        }
        else {
            Write-Success "$binDir is already in PATH."
        }

        # -- Desktop shortcut -----------------------------------------------
        if (-not $NoDesktopShortcut) {
            $desktopLink = Join-Path ([Environment]::GetFolderPath("Desktop")) "Auxiora.lnk"
            $nodePath = (Get-Command node -ErrorAction SilentlyContinue).Source
            if ($nodePath) {
                $cliEntry = Join-Path $InstallDir "packages\cli\dist\index.js"
                New-Shortcut -ShortcutPath $desktopLink -TargetPath $nodePath -Arguments "`"$cliEntry`" start" -WorkingDir $InstallDir
                Write-Success "Desktop shortcut created."
            }
        }

        # -- Start Menu entry -----------------------------------------------
        if (-not $NoStartMenu) {
            $startMenuDir = Join-Path ([Environment]::GetFolderPath("Programs")) "Auxiora"
            if (-not (Test-Path $startMenuDir)) { New-Item -ItemType Directory -Path $startMenuDir | Out-Null }

            $startLink = Join-Path $startMenuDir "Auxiora.lnk"
            $nodePath = (Get-Command node -ErrorAction SilentlyContinue).Source
            if ($nodePath) {
                $cliEntry = Join-Path $InstallDir "packages\cli\dist\index.js"
                New-Shortcut -ShortcutPath $startLink -TargetPath $nodePath -Arguments "`"$cliEntry`" start" -WorkingDir $InstallDir
                Write-Success "Start Menu entry created."
            }
        }

        # -- Done -----------------------------------------------------------
        Write-Host ""
        Write-Success "Auxiora $Version installed successfully!"
        Write-Host ""
        Write-Info "Getting started:"
        Write-Host "    auxiora start          # Start the assistant"
        Write-Host "    auxiora --help         # Show all commands"
        Write-Host ""
        Write-Warn "Restart your terminal for PATH changes to take effect."
        Write-Host ""
    }
    finally {
        Remove-Item -Recurse -Force $tmpDir -ErrorAction SilentlyContinue
    }
}

# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if ($Uninstall) {
    Invoke-Uninstall
}
else {
    Invoke-Install
}
