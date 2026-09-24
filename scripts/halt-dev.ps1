$ErrorActionPreference = "Stop"

Set-Location (Join-Path $PSScriptRoot "..")

# `npm run dev` runs `docker compose watch`, which outlives its containers and
# holds a lock on the Compose project, so the next `npm run dev` fails with
# "cannot take exclusive lock". Stop those watchers (the docker CLI and its
# compose plugin process) before taking the containers down.
Get-CimInstance Win32_Process -Filter "Name='docker.exe' OR Name='docker-compose.exe'" |
	Where-Object { $_.CommandLine -match 'compose .*-f (web-socket-api|web-server)/src/compose\.yaml watch' } |
	ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

npx concurrently `
	"docker compose --env-file .env -f web-socket-api/src/compose.yaml down mysql-db" `
	"docker compose --env-file .env -f web-socket-api/src/compose.yaml down signalling-server-dev" `
	"docker compose --env-file .env -f web-server/src/compose.yaml down web-server-dev"
