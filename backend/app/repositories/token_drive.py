from typing import Optional

from sqlalchemy.orm import Session

from app.models import TokenDrive


class TokenDriveRepository:
    def __init__(self, db: Session):
        self.db = db

    def de(self, email: str) -> Optional[TokenDrive]:
        return self.db.query(TokenDrive).filter_by(docente_email=email).one_or_none()

    def guardar(self, email: str, refresh_token_cifrado: str) -> TokenDrive:
        """Crea la fila del docente o reemplaza su token."""
        token = self.de(email)
        if token is None:
            token = TokenDrive(docente_email=email, refresh_token_cifrado=refresh_token_cifrado)
            self.db.add(token)
        else:
            token.refresh_token_cifrado = refresh_token_cifrado
        return token

    def borrar(self, email: str) -> None:
        self.db.query(TokenDrive).filter_by(docente_email=email).delete()
