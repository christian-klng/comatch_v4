#!/bin/sh
# Tägliche Sicherung der Datenbank ohne Fotos: Die Tabelle media_object wird nur als leere
# Hülle gesichert, damit Selfies nicht länger als die Löschfrist in Sicherungen liegen.
# Läuft im Dienst "backup" aus docker-compose.prod.yml. Behält die letzten 7 Tage, damit
# gelöschte Daten nicht länger als in der Datenschutzerklärung zugesagt in Sicherungen liegen.
set -eu

BACKUP_DIR=/backups
KEEP_DAYS=7
INTERVAL_S=86400

backup() {
  stamp=$(date -u +%Y%m%d-%H%M%S)
  file="$BACKUP_DIR/comatch-$stamp.dump"
  pg_dump --format=custom --no-owner --exclude-table-data=media_object --file="$file.tmp"
  mv "$file.tmp" "$file"
  # Älter als KEEP_DAYS Tage: weg.
  find "$BACKUP_DIR" -name 'comatch-*.dump' -mtime +$((KEEP_DAYS - 1)) -delete
  echo "$(date -u +%FT%TZ) Sicherung $file ($(du -h "$file" | cut -f1))"
}

mkdir -p "$BACKUP_DIR"
until pg_isready -q; do sleep 2; done
while true; do
  backup || echo "$(date -u +%FT%TZ) Sicherung fehlgeschlagen" >&2
  sleep "$INTERVAL_S"
done
