$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$outCandidate = Join-Path $scriptRoot "out"
$webRoot = if (Test-Path $outCandidate -PathType Container) { $outCandidate } else { $scriptRoot }
$port = 4173
$prefix = "http://localhost:$port/"

$mimeTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".txt" = "text/plain; charset=utf-8"
  ".css" = "text/css; charset=utf-8"
  ".js" = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".png" = "image/png"
  ".jpg" = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".svg" = "image/svg+xml"
  ".woff" = "font/woff"
  ".woff2" = "font/woff2"
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($prefix)
$listener.Start()
Write-Host "Rahhal preview is running at $prefix" -ForegroundColor Green
Write-Host "Keep this window open. Press Ctrl+C to stop." -ForegroundColor DarkGray
Start-Process $prefix

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    try {
      $relativePath = [Uri]::UnescapeDataString($context.Request.Url.AbsolutePath.TrimStart("/"))
      if ([string]::IsNullOrWhiteSpace($relativePath)) { $relativePath = "index.html" }
      $candidate = Join-Path $webRoot ($relativePath -replace "/", [IO.Path]::DirectorySeparatorChar)
      if (Test-Path $candidate -PathType Container) { $candidate = Join-Path $candidate "index.html" }
      if (-not [IO.Path]::HasExtension($candidate) -and -not (Test-Path $candidate)) {
        $candidate = Join-Path $candidate "index.html"
      }
      $resolvedRoot = [IO.Path]::GetFullPath($webRoot)
      $resolvedCandidate = [IO.Path]::GetFullPath($candidate)
      if (-not $resolvedCandidate.StartsWith($resolvedRoot, [StringComparison]::OrdinalIgnoreCase)) {
        $context.Response.StatusCode = 403
        $context.Response.Close()
        continue
      }
      if (-not (Test-Path $resolvedCandidate -PathType Leaf)) {
        $context.Response.StatusCode = 404
        $context.Response.Close()
        continue
      }
      $extension = [IO.Path]::GetExtension($resolvedCandidate).ToLowerInvariant()
      $context.Response.ContentType = if ($mimeTypes.ContainsKey($extension)) { $mimeTypes[$extension] } else { "application/octet-stream" }
      $bytes = [IO.File]::ReadAllBytes($resolvedCandidate)
      $context.Response.ContentLength64 = $bytes.Length
      $context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      $context.Response.OutputStream.Close()
    }
    catch {
      $context.Response.StatusCode = 500
      $context.Response.Close()
    }
  }
}
finally {
  $listener.Stop()
  $listener.Close()
}
