# Download Policies list attachments using PnP Interactive with OUR Entra app client id.
$ErrorActionPreference = 'Stop'

$SiteUrl = 'https://countrylion.sharepoint.com/sites/Compliance'
$ListTitle = 'Policies'
$OutZip = Join-Path (Get-Location) 'policies.zip'
$WorkDir = Join-Path (Get-Location) '.policies-download-tmp'
$EnvFile = Join-Path $PSScriptRoot '..\.env'

function Get-EnvMap([string]$Path) {
  $map = @{}
  if (-not (Test-Path $Path)) { return $map }
  foreach ($line in Get-Content $Path) {
    $t = $line.Trim()
    if (-not $t -or $t.StartsWith('#')) { continue }
    $i = $t.IndexOf('=')
    if ($i -le 0) { continue }
    $k = $t.Substring(0, $i).Trim()
    $v = $t.Substring($i + 1).Trim()
    if (($v.StartsWith('"') -and $v.EndsWith('"')) -or ($v.StartsWith("'") -and $v.EndsWith("'"))) {
      $v = $v.Substring(1, $v.Length - 2)
    }
    $map[$k] = $v
  }
  return $map
}

$envMap = Get-EnvMap $EnvFile
$ClientId = $env:MS_GRAPH_CLIENT_ID
if (-not $ClientId) { $ClientId = $envMap['MS_GRAPH_CLIENT_ID'] }
$TenantId = $env:MS_GRAPH_TENANT_ID
if (-not $TenantId) { $TenantId = $envMap['MS_GRAPH_TENANT_ID'] }

if (-not $ClientId -or -not $TenantId) {
  throw 'Missing MS_GRAPH_CLIENT_ID / MS_GRAPH_TENANT_ID in env or functions/.env'
}

Import-Module PnP.PowerShell

Write-Host "Connecting to $SiteUrl with ClientId $ClientId (device login)..."
Write-Host 'Complete the device code in your browser (dalewatkins@countrylion.co.uk + MFA).'
# Device login avoids needing a registered reply URL (Interactive needs http://localhost).
Connect-PnPOnline -Url $SiteUrl -DeviceLogin -ClientId $ClientId -Tenant $TenantId

if (Test-Path $WorkDir) { Remove-Item $WorkDir -Recurse -Force }
New-Item -ItemType Directory -Path $WorkDir | Out-Null

Write-Host "Loading list items from '$ListTitle'..."
$items = Get-PnPListItem -List $ListTitle -PageSize 100
Write-Host "Found $($items.Count) items"

$downloaded = 0
$itemsWithFiles = 0

foreach ($item in $items) {
  $title = [string]$item['Title']
  if ([string]::IsNullOrWhiteSpace($title)) { $title = "item-$($item.Id)" }
  $safeTitle = ($title -replace '[\\/:*?"<>|]', '-' -replace '\s+', ' ').Trim()
  if ([string]::IsNullOrWhiteSpace($safeTitle)) { $safeTitle = "item-$($item.Id)" }

  $attachments = Get-PnPProperty -ClientObject $item -Property AttachmentFiles
  if (-not $attachments -or $attachments.Count -eq 0) { continue }

  $itemsWithFiles++
  $itemDir = Join-Path $WorkDir ("{0}_{1}" -f $item.Id, $safeTitle)
  New-Item -ItemType Directory -Path $itemDir -Force | Out-Null

  foreach ($file in $attachments) {
    $fileName = $file.FileName
    Write-Host ("  {0}/{1}" -f $item.Id, $fileName)
    Get-PnPFile -Url $file.ServerRelativeUrl -Path $itemDir -FileName $fileName -AsFile -Force | Out-Null
    $downloaded++
  }
}

Write-Host "Downloaded $downloaded attachment(s) from $itemsWithFiles item(s)."
if ($downloaded -eq 0) { throw 'No attachments found to zip.' }

if (Test-Path $OutZip) { Remove-Item $OutZip -Force }
Compress-Archive -Path (Join-Path $WorkDir '*') -DestinationPath $OutZip -Force
Remove-Item $WorkDir -Recurse -Force

$sizeMb = [math]::Round((Get-Item $OutZip).Length / 1MB, 2)
Write-Host "Done: $OutZip ($sizeMb MB)"
Disconnect-PnPOnline
