param(
  [string]$SourceZip = '',
  [string]$OutputPath = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$sourceUrl = 'https://srvcarto.regione.liguria.it/dtuff/download_statico/opendata/trasporti/GTFS/GTFS-IT-ITC3-TRENITALIA-20260614-20261212-pf.zip'
$repoRoot = Split-Path -Parent $PSScriptRoot
if (-not $OutputPath) {
  $OutputPath = Join-Path $repoRoot 'data\liguria-train-schedule.json'
}

$stationNames = [ordered]@{
  '830006000' = 'La Spezia'
  '830004731' = 'Levanto'
  '830004732' = 'Monterosso'
  '830004733' = 'Vernazza'
  '830004734' = 'Corniglia'
  '830004735' = 'Manarola'
  '830004736' = 'Riomaggiore'
}

$systemTemp = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$tempRoot = Join-Path $systemTemp ('5terrego-liguria-trains-' + [Guid]::NewGuid().ToString('N'))
$resolvedTempRoot = [IO.Path]::GetFullPath($tempRoot)
if (-not $resolvedTempRoot.StartsWith($systemTemp, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to use a temporary directory outside the system temp folder: $resolvedTempRoot"
}

New-Item -ItemType Directory -Path $resolvedTempRoot | Out-Null

try {
  $zipPath = $SourceZip
  if (-not $zipPath) {
    $zipPath = Join-Path $resolvedTempRoot 'liguria-trenitalia-gtfs.zip'
    Invoke-WebRequest -Uri $sourceUrl -OutFile $zipPath -TimeoutSec 180
  }

  $extractPath = Join-Path $resolvedTempRoot 'gtfs'
  Expand-Archive -LiteralPath $zipPath -DestinationPath $extractPath

  $feedInfo = Import-Csv (Join-Path $extractPath 'feed_info.txt') | Select-Object -First 1
  $routes = Import-Csv (Join-Path $extractPath 'routes.txt')
  $trips = Import-Csv (Join-Path $extractPath 'trips.txt')
  $stopTimes = Import-Csv (Join-Path $extractPath 'stop_times.txt')

  $routeById = @{}
  foreach ($route in $routes) {
    $routeById[$route.route_id] = $route
  }

  $targetStopTimes = @($stopTimes | Where-Object { $stationNames.Contains($_.stop_id) })
  $eligibleGroups = @(
    $targetStopTimes |
      Group-Object trip_id |
      Where-Object { @($_.Group.stop_id | Sort-Object -Unique).Count -ge 2 }
  )

  $eligibleTripIds = @{}
  foreach ($group in $eligibleGroups) {
    $eligibleTripIds[$group.Name] = $true
  }

  $tripById = @{}
  $serviceIds = @{}
  foreach ($trip in $trips) {
    if (-not $eligibleTripIds.ContainsKey($trip.trip_id)) { continue }
    $tripById[$trip.trip_id] = $trip
    $serviceIds[$trip.service_id] = $true
  }

  $datesByService = @{}
  foreach ($row in (Import-Csv (Join-Path $extractPath 'calendar_dates.txt'))) {
    if ($row.exception_type -ne '1' -or -not $serviceIds.ContainsKey($row.service_id)) { continue }
    if (-not $datesByService.ContainsKey($row.service_id)) {
      $datesByService[$row.service_id] = [System.Collections.Generic.List[string]]::new()
    }
    $date = $row.date
    $datesByService[$row.service_id].Add(
      $date.Substring(0, 4) + '-' + $date.Substring(4, 2) + '-' + $date.Substring(6, 2)
    )
  }

  $outputTrips = @()
  $calendarIdBySignature = @{}
  $calendars = [ordered]@{}
  $calendarSequence = 0
  foreach ($group in ($eligibleGroups | Sort-Object Name)) {
    $trip = $tripById[$group.Name]
    if (-not $trip) { continue }
    $route = $routeById[$trip.route_id]
    $routeLabel = if ($route) { $route.route_short_name } else { 'REG' }
    $dates = if ($datesByService.ContainsKey($trip.service_id)) {
      @($datesByService[$trip.service_id] | Sort-Object -Unique)
    } else {
      @()
    }
    if (@($dates).Count -eq 0) { continue }
    $dateArray = @($dates)
    $calendarSignature = $dateArray -join ','
    if (-not $calendarIdBySignature.ContainsKey($calendarSignature)) {
      $calendarSequence += 1
      $calendarId = 'c' + $calendarSequence
      $calendarIdBySignature[$calendarSignature] = $calendarId
      $calendars[$calendarId] = $dateArray
    }
    $calendarId = $calendarIdBySignature[$calendarSignature]

    $tripStops = @(
      $group.Group |
        Sort-Object { [int]$_.stop_sequence } |
        ForEach-Object {
          [ordered]@{
            station = $stationNames[$_.stop_id]
            arrival = $_.arrival_time
            departure = $_.departure_time
          }
        }
    )

    $outputTrips += [ordered]@{
      id = $trip.trip_id
      route = $routeLabel
      number = $trip.trip_short_name
      headsign = $trip.trip_headsign
      calendar = $calendarId
      stops = $tripStops
    }
  }

  $payload = [ordered]@{
    source = [ordered]@{
      publisher = 'Regione Liguria / Trenitalia'
      dataset = 'Dati servizio pianificato TRENITALIA S.p.A.'
      url = 'https://dati.regione.liguria.it/dataset/ds-637'
      license = 'CC BY 4.0'
      importedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
      feedVersion = $feedInfo.feed_version
    }
    validFrom = $feedInfo.feed_start_date.Substring(0, 4) + '-' + $feedInfo.feed_start_date.Substring(4, 2) + '-' + $feedInfo.feed_start_date.Substring(6, 2)
    validTo = $feedInfo.feed_end_date.Substring(0, 4) + '-' + $feedInfo.feed_end_date.Substring(4, 2) + '-' + $feedInfo.feed_end_date.Substring(6, 2)
    stations = @($stationNames.Values)
    calendars = $calendars
    trips = $outputTrips
  }

  $resolvedOutput = [IO.Path]::GetFullPath($OutputPath)
  $outputDirectory = Split-Path -Parent $resolvedOutput
  if (-not (Test-Path -LiteralPath $outputDirectory)) {
    New-Item -ItemType Directory -Path $outputDirectory | Out-Null
  }
  $json = $payload | ConvertTo-Json -Depth 8 -Compress
  [IO.File]::WriteAllText($resolvedOutput, $json, [Text.UTF8Encoding]::new($false))

  Write-Output "Wrote $($outputTrips.Count) scheduled train trips to $resolvedOutput"
} finally {
  if (
    (Test-Path -LiteralPath $resolvedTempRoot) -and
    $resolvedTempRoot.StartsWith($systemTemp, [StringComparison]::OrdinalIgnoreCase) -and
    (Split-Path -Leaf $resolvedTempRoot).StartsWith('5terrego-liguria-trains-')
  ) {
    Remove-Item -LiteralPath $resolvedTempRoot -Recurse -Force
  }
}
