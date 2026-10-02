# Keep this localized script in UTF-8 with BOM for Windows PowerShell 5.1.
$ErrorActionPreference = 'Stop'
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
    $taskPayload | node (Join-Path $PSScriptRoot 'set-admin-password.mjs')
    if ($LASTEXITCODE -ne 0) { throw '密码未能设置，请根据上面的说明重试。' }
} finally {
    if ($taskPasswordPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskPasswordPtr) }
    if ($taskConfirmationPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskConfirmationPtr) }
    $taskPayload = $null
    $taskPassword.Dispose()
    $taskConfirmation.Dispose()
}
