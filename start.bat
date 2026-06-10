@echo off
chcp 65001 >nul
echo.
echo  Dang khoi dong Quiz PWA...
echo  Khong can cai Python hay Node.js!
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$port=8080; $root='%~dp0'.TrimEnd('\'); $mime=@{'.html'='text/html; charset=utf-8';'.css'='text/css; charset=utf-8';'.js'='application/javascript; charset=utf-8';'.mjs'='application/javascript; charset=utf-8';'.json'='application/json';'.webmanifest'='application/manifest+json';'.png'='image/png';'.ico'='image/x-icon';'.svg'='image/svg+xml';'.woff'='font/woff';'.woff2'='font/woff2';'.xlsx'='application/octet-stream';'.xls'='application/octet-stream'}; $l=New-Object System.Net.HttpListener; $l.Prefixes.Add(\"http://localhost:$port/\"); try{$l.Start()}catch{Write-Host \"Loi: Khong the mo port $port\" -ForegroundColor Red; Read-Host; exit}; Write-Host \"  Server: http://localhost:$port\" -ForegroundColor Green; Write-Host '  Nhan Ctrl+C de dung.' -ForegroundColor Yellow; Start-Process \"http://localhost:$port\"; while($l.IsListening){try{$c=$l.GetContext(); $p=$c.Request.Url.LocalPath; if($p -eq '/'){$p='/index.html'}; $f=[IO.Path]::GetFullPath((Join-Path $root $p.TrimStart('/'))); $r=$c.Response; if((Test-Path $f -PathType Leaf)-and $f.StartsWith($root)){$e=[IO.Path]::GetExtension($f).ToLower(); $r.ContentType=if($mime[$e]){$mime[$e]}else{'application/octet-stream'}; $b=[IO.File]::ReadAllBytes($f); $r.ContentLength64=$b.Length; $r.OutputStream.Write($b,0,$b.Length)}else{$r.StatusCode=404; $b=[Text.Encoding]::UTF8.GetBytes('404'); $r.ContentLength64=$b.Length; $r.OutputStream.Write($b,0,$b.Length)}; $r.OutputStream.Close()}catch{break}}; $l.Stop()"

pause
