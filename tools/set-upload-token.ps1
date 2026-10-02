# Keep this localized script in UTF-8 with BOM for Windows PowerShell 5.1.
$ErrorActionPreference = 'Stop'
$taskNode = (Get-Command node -CommandType Application | Select-Object -First 1).Source
& $taskNode (Join-Path $PSScriptRoot 'set-admin-password.mjs') --check-auth
if ($LASTEXITCODE -ne 0) { throw '请先在当前终端完成 Wrangler 授权；尚未输入或更新上传令牌。' }
Write-Host '请使用仅选择 LMingyao/testWebRA1、Contents 读写权限的 GitHub fine-grained token。'
$taskToken = Read-Host '粘贴照片上传专用令牌（输入隐藏，不要发到聊天）' -AsSecureString
$taskTokenPtr = [IntPtr]::Zero
try {
    $taskTokenPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($taskToken)
    $taskPayload = @{ token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($taskTokenPtr) } | ConvertTo-Json -Compress
    $OutputEncoding = [Text.UTF8Encoding]::new($false)
    $taskPayload | & $taskNode (Join-Path $PSScriptRoot 'set-upload-token.mjs')
    if ($LASTEXITCODE -ne 0) { throw '上传配置未完成，请根据上面的提示重试。' }
} finally {
    if ($taskTokenPtr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($taskTokenPtr) }
    $taskPayload = $null
    $taskToken.Dispose()
}
