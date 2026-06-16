$ErrorActionPreference = "Stop"

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  Write-Error "Run this script from an elevated PowerShell session."
}

Write-Host "Enabling Windows features required by Docker Desktop WSL2 backend..."

Enable-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux -All -NoRestart
Enable-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform -All -NoRestart

Write-Host "Ensuring the Windows hypervisor starts at boot..."
bcdedit /set hypervisorlaunchtype auto

Write-Host ""
Write-Host "Done. Reboot Windows before starting Docker Desktop again."
