<#
.SYNOPSIS
    Math Copilot 快速启动脚本 (PowerShell)
.DESCRIPTION
    一键启动后端。自动检测端口占用并给出建议。
.PARAMETER Port
    指定端口 (默认: 8000)
.PARAMETER AutoPort
    端口被占用时自动切换
.PARAMETER NoReload
    禁用热重载
.EXAMPLE
    .\start.ps1
    .\start.ps1 -Port 9000
    .\start.ps1 -AutoPort
#>

param(
    [int]$Port = 8000,
    [switch]$AutoPort,
    [switch]$NoReload
)

$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ManagePy = Join-Path $RootDir "manage.py"

# 检查 Python
try {
    $pyVersion = & python --version 2>&1
    Write-Host "[OK] $pyVersion" -ForegroundColor Green
} catch {
    Write-Host "[FAIL] 未找到 Python，请安装 Python >= 3.10" -ForegroundColor Red
    exit 1
}

# 检查 manage.py
if (-not (Test-Path $ManagePy)) {
    Write-Host "[FAIL] 未找到 manage.py" -ForegroundColor Red
    exit 1
}

# 检查端口
$inUse = $false
try {
    $conn = New-Object System.Net.Sockets.TcpClient
    $conn.Connect("127.0.0.1", $Port)
    $conn.Close()
    $inUse = $true
} catch {
    $inUse = $false
}

if ($inUse) {
    if ($AutoPort) {
        Write-Host "[WARN] 端口 $Port 被占用，将自动切换到空闲端口" -ForegroundColor Yellow
    } else {
        Write-Host "[FAIL] 端口 $Port 已被占用！" -ForegroundColor Red
        Write-Host ""
        Write-Host "可用方案:" -ForegroundColor Cyan
        Write-Host "  .\start.ps1 -AutoPort          # 自动切换空闲端口" -ForegroundColor White
        Write-Host "  .\start.ps1 -Port 9000          # 指定其他端口" -ForegroundColor White
        Write-Host "  python manage.py start --auto-port" -ForegroundColor White
        exit 1
    }
}

# 启动
Write-Host ">>> Math Copilot 启动中..." -ForegroundColor Cyan
Write-Host ""
Write-Host "  API:      http://localhost:$Port" -ForegroundColor Green
Write-Host "  文档:     http://localhost:$Port/docs" -ForegroundColor Green
Write-Host ""

# 构建参数列表
$argsList = @($ManagePy, "start", "--port", $Port)
if ($NoReload) {
    $argsList += "--no-reload"
}
if ($AutoPort) {
    $argsList += "--auto-port"
}

# 通过 manage.py 启动
Write-Host "[INFO] 执行: python $argsList" -ForegroundColor Gray
& python $argsList
