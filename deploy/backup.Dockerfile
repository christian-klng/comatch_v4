# Backup-Dienst als eigenes Image: Das Skript steckt im Image, so braucht es unter Coolify keine
# Datei-Einbindung aus dem Repository.
FROM postgres:17-alpine
COPY deploy/backup.sh /usr/local/bin/backup.sh
ENTRYPOINT ["/bin/sh", "/usr/local/bin/backup.sh"]
