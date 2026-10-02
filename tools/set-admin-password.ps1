# Keep this localized script in UTF-8 with BOM for Windows PowerShell 5.1.
$ErrorActionPreference = 'Stop'
$taskNode = (Get-Command node -CommandType Application | Select-Object -First 1).Source
$taskWrangler = Join-Path $PSScriptRoot '../node_modules/wrangler/bin/wrangler.js'
$taskSetter = Join-Path $PSScriptRoot 'set-admin-password.mjs'
$taskRepo = Split-Path $PSScriptRoot -Parent
Push-Location -LiteralPath $taskRepo
try {
    Write-Host '正在检查 Cloudflare 账号授权...'
    & $taskNode $taskSetter --check-auth
    $taskAuthExit = $LASTEXITCODE
    if ($taskAuthExit -eq 2) {
        Write-Host '需要授权 Wrangler。请在即将打开的浏览器中登录网站所属 Cloudflare 账号并完成授权，然后回到此终端。'
        & $taskNode $taskWrangler login --use-keyring --scopes account:read user:read workers_scripts:write d1:write
        if ($LASTEXITCODE -ne 0) { throw 'Cloudflare 授权未完成，尚未输入或更新密码。' }
        & $taskNode $taskSetter --check-auth
        $taskAuthExit = $LASTEXITCODE
    }
    if ($taskAuthExit -ne 0) { throw 'Cloudflare 授权检查失败，尚未输入或更新密码。' }
} finally {
    Pop-Location
}
$taskPassword = Read-Host '设置管理员密码（8–128 个字符，输入隐藏）' -AsSecureString
$taskConfirmation = Read-Host '再次输入管理员密码（输入隐藏）' -AsSecureString
$taskPasswordPtr = [IntPtr]::Zero
$taskConfirmationPtr = [IntPtr]::Zero
try {
    $taskPasswordPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskPassword)
    $taskConfirmationPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskConfirmation)
    $taskPayload = @{
        password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskPasswordPtr)
        confirmation = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskConfirmationPtr)
    } | ConvertTo-Json -Compress
    $OutputEncoding = [System.Text.UTF8Encoding]::new($false)
    $taskPayload | & $taskNode $taskSetter
    if ($LASTEXITCODE -ne 0) { throw '密码未能设置，请根据上面的说明重试。' }
} finally {
    if ($taskPasswordPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskPasswordPtr) }
    if ($taskConfirmationPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskConfirmationPtr) }
    $taskPayload = $null
    $taskPassword.Dispose()
    $taskConfirmation.Dispose()
}
