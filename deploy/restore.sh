#!/bin/sh
# Stellt eine Sicherung wieder her (überschreibt die aktuelle Datenbank!).
#   deploy/restore.sh comatch-20261101-030000.dump
# Vorher die App stoppen, damit niemand schreibt:
#   docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env stop app
set -eu
cd "$(dirname "$0")"

file=${1:?"Bitte den Dateinamen einer Sicherung angeben (siehe: ls im Volume backups)."}
# COMPOSE überschreibbar, z. B. für einen Probelauf mit anderem Projekt.
compose=${COMPOSE:-"docker compose -f docker-compose.prod.yml --env-file .env"}

$compose exec -T backup test -f "/backups/$file"
echo "Stelle /backups/$file wieder her …"
# PGDATABASE & Co. sind im Container gesetzt, daher die Variablen erst dort auflösen.
$compose exec -T -e FILE="$file" backup sh -c 'pg_restore --clean --if-exists --no-owner --dbname="$PGDATABASE" "/backups/$FILE"'
echo "Fertig. App wieder starten: $compose start app"
