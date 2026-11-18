param(
  [ValidateSet('start', 'stop', 'status')]
  [string]$Action = 'start'
)

$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$postgresData = [System.IO.Path]::GetFullPath((Join-Path $projectRoot '.local\postgres'))
$pgCtl = Join-Path $projectRoot 'node_modules\@embedded-postgres\windows-x64\native\bin\pg_ctl.exe'
$postgresLog = Join-Path $projectRoot '.local\postgres.log'

if (-not $postgresData.StartsWith($projectRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'PostgreSQL data directory must remain inside the workspace.'
}
if (-not (Test-Path -LiteralPath $pgCtl)) { throw 'Run npm install first.' }
if (-not (Test-Path -LiteralPath (Join-Path $postgresData 'PG_VERSION'))) {
  throw 'Initialize the development cluster with npm run db:local before using this Windows launcher.'
}

# pg_ctl creates a restricted child token on Windows. Unlike spawning postgres.exe
# directly, this works from an elevated developer terminal without creating a user/service.
switch ($Action) {
  'start' { & $pgCtl start -D $postgresData -l $postgresLog -o '-h 127.0.0.1 -p 5432' -w -t 20 }
  'stop' { & $pgCtl stop -D $postgresData -m fast -w -t 20 }
  'status' { & $pgCtl status -D $postgresData }
}
exit $LASTEXITCODE
