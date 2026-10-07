"""
Los endpoints /drive/sync y /drive/status se eliminaron: no tenían consumidor,
/drive/sync no verificaba la pertenencia de la calificación y /drive/status
mezclaba el estado de todos los docentes. La subida real a Drive ocurre desde
reportes (services/google_drive.subir_archivo). Este test evita que se vuelvan
a registrar sin querer.
"""
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_drive_sync_ya_no_existe():
    assert client.post("/drive/sync/1").status_code == 404


def test_drive_status_ya_no_existe():
    assert client.get("/drive/status").status_code == 404


def test_ninguna_ruta_bajo_drive():
    assert not [r.path for r in app.routes if getattr(r, "path", "").startswith("/drive")]
