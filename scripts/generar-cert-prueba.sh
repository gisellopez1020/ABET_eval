#!/bin/sh
# ============================================================================
#  CERTIFICADO AUTOFIRMADO SOLO PARA PRUEBAS. NO APTO PARA PRODUCCIÓN.
#  Ningún navegador confía en él (mostrará una advertencia). En producción, el
#  certificado lo emite la universidad o una autoridad pública (ver
#  DESPLIEGUE_PRODUCCION.md).
# ============================================================================
# Genera certs/fullchain.pem y certs/privkey.pem para probar el modo HTTPS
# (docker-compose.https.yml) en esta máquina, válido 30 días para localhost.
# Usa openssl dentro de un contenedor: solo necesita Docker.
#   sh scripts/generar-cert-prueba.sh [nombre-de-host]
set -eu

HOST="${1:-localhost}"
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$RAIZ/certs"
SAN="DNS:$HOST,IP:127.0.0.1"
[ "$HOST" = "localhost" ] || SAN="DNS:$HOST,DNS:localhost,IP:127.0.0.1"

if [ -e "$RAIZ/certs/privkey.pem" ]; then
  echo "Ya existe certs/privkey.pem: no se sobrescribe. Bórralo primero si quieres uno nuevo." >&2
  exit 1
fi

docker run --rm -v "$RAIZ/certs:/certs" alpine:3 sh -c "
  apk add --no-cache openssl >/dev/null &&
  openssl req -x509 -newkey rsa:2048 -nodes -days 30 \
    -keyout /certs/privkey.pem -out /certs/fullchain.pem \
    -subj '/CN=$HOST/O=SOLO PRUEBAS - NO APTO PARA PRODUCCION' \
    -addext 'subjectAltName=$SAN' 2>/dev/null &&
  chmod 644 /certs/fullchain.pem && chmod 600 /certs/privkey.pem
"

echo "Certificado de PRUEBA creado en certs/ para '$HOST' (30 días)."
echo "NO lo uses en producción."
