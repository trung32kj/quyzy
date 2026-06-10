# server.ps1 — Static HTTP server cho Quiz PWA
# Chạy từ start.bat, không cần cài Python hay Node.js

param([int]$Port = 8080)

$rootPath = $PSScriptRoot

$mimeTypes = @{
    '.html'        = 'text/html; charset=utf-8'
    '.htm'         = 'text/html; charset=utf-8'
    '.css'         = 'text/css; charset=utf-8'
    '.js'          = 'application/javascript; charset=utf-8'
    '.mjs'         = 'application/javascript; charset=utf-8'
    '.json'        = 'application/json; charset=utf-8'
    '.webmanifest' = 'application/manifest+json; charset=utf-8'
    '.png'         = 'image/png'
    '.jpg'         = 'image/jpeg'
    '.jpeg'        = 'image/jpeg'
    '.svg'         = 'image/svg+xml'
    '.ico'         = 'image/x-icon'
    '.woff'        = 'font/woff'
    '.woff2'       = 'font/woff2'
    '.ttf'         = 'font/ttf'
    '.xlsx'        = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    '.xls'         = 'application/vnd.ms-excel'
}

$url = "http://localhost:$Port/"

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($url)

try {
    $listener.Start()
} catch {
    Write-Host "Loi: Khong the mo port $Port. Thu port khac hoac chay voi quyen Admin." -ForegroundColor Red
    Write-Host "Chi tiet: $_" -ForegroundColor Red
    Read-Host "Nhan Enter de thoat"
    exit 1
}

Write-Host ""
Write-Host "  ╔════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "  ║   Quiz PWA dang chay tai:          ║" -ForegroundColor Cyan
Write-Host "  ║   http://localhost:$Port           ║" -ForegroundColor Cyan
Write-Host "  ╚════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Nhan Ctrl+C trong cua so nay de dung server." -ForegroundColor Yellow
Write-Host ""

# Mở trình duyệt
Start-Process $url

# Xử lý Ctrl+C để dừng sạch
[Console]::TreatControlCAsInput = $false
$null = Register-ObjectEvent -InputObject ([Console]) -EventName CancelKeyPress -Action {
    $listener.Stop()
}

while ($listener.IsListening) {
    try {
        $context  = $listener.GetContext()
        $request  = $context.Request
        $response = $context.Response

        $localPath = $request.Url.LocalPath
        if ($localPath -eq '/' -or $localPath -eq '') {
            $localPath = '/index.html'
        }

        # Chống path traversal: normalize và kiểm tra nằm trong rootPath
        $relative  = $localPath.TrimStart('/').Replace('/', [System.IO.Path]::DirectorySeparatorChar)
        $filePath  = [System.IO.Path]::GetFullPath((Join-Path $rootPath $relative))

        if (-not $filePath.StartsWith($rootPath)) {
            # Path traversal attempt
            $response.StatusCode = 403
            $bytes = [System.Text.Encoding]::UTF8.GetBytes('403 Forbidden')
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } elseif (Test-Path $filePath -PathType Leaf) {
            $ext         = [System.IO.Path]::GetExtension($filePath).ToLower()
            $contentType = if ($mimeTypes[$ext]) { $mimeTypes[$ext] } else { 'application/octet-stream' }

            $response.ContentType = $contentType
            $response.Headers.Add('Access-Control-Allow-Origin', '*')
            $response.Headers.Add('Cache-Control', 'no-cache')

            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $bytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $localPath")
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        }

        $response.OutputStream.Close()
    } catch [System.Net.HttpListenerException] {
        # Listener đã đóng (Ctrl+C) → thoát
        break
    } catch {
        # Lỗi không nghiêm trọng → tiếp tục
        try { $context.Response.Abort() } catch {}
    }
}

$listener.Stop()
Write-Host "Server da dung." -ForegroundColor Green
