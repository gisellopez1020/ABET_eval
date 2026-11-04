# ============================================================================
#  CERTIFICADO AUTOFIRMADO SOLO PARA PRUEBAS. NO APTO PARA PRODUCCIÓN.
#  Ningún navegador confía en él (mostrará una advertencia). En producción, el
#  certificado lo emite la universidad o una autoridad pública (ver
#  DESPLIEGUE_PRODUCCION.md).
# ============================================================================
# Genera certs\fullchain.pem y certs\privkey.pem para probar el modo HTTPS
# (docker-compose.https.yml) en esta máquina, válido 30 días para localhost.
# Usa openssl dentro de un contenedor: solo necesita Docker Desktop abierto.
#   powershell -ExecutionPolicy Bypass -File scripts\generar-cert-prueba.ps1 [-Host_ nombre]
param([string]$Host_ = "localhost")
$ErrorActionPreference = "Stop"

$raiz = Split-Path -Parent $PSScriptRoot
$certs = Join-Path $raiz "certs"
New-Item -ItemType Directory -Force $certs | Out-Null

if (Test-Path (Join-Path $certs "privkey.pem")) {
    Write-Error "Ya existe certs\privkey.pem: no se sobrescribe. Bórralo primero si quieres uno nuevo."
}

$san = if ($Host_ -eq "localhost") { "DNS:localhost,IP:127.0.0.1" } else { "DNS:$Host_,DNS:localhost,IP:127.0.0.1" }
$comando = "apk add --no-cache openssl >/dev/null && " +
    "openssl req -x509 -newkey rsa:2048 -nodes -days 30 " +
    "-keyout /certs/privkey.pem -out /certs/fullchain.pem " +
    "-subj '/CN=$Host_/O=SOLO PRUEBAS - NO APTO PARA PRODUCCION' " +
    "-addext 'subjectAltName=$san' 2>/dev/null && " +
    "chmod 644 /certs/fullchain.pem && chmod 600 /certs/privkey.pem"
docker run --rm -v "${certs}:/certs" alpine:3 sh -c $comando
if ($LASTEXITCODE -ne 0) { Write-Error "No se pudo generar el certificado (¿Docker Desktop está abierto?)" }

Write-Host "Certificado de PRUEBA creado en certs\ para '$Host_' (30 días)."
Write-Host "NO lo uses en producción." -ForegroundColor Yellow
