"""
RNF-16: escribe en la respuesta la cookie de sesión renovada.

get_current_user decide si toca renovar (app.auth.dependencies.renovar_sesion) y deja
el token nuevo en request.state; este middleware ASGI lo añade como Set-Cookie al
empezar la respuesta. Se hace aquí y no con el Response de la dependencia porque
FastAPI descarta esos encabezados cuando el endpoint devuelve su propio Response
(p. ej. las exportaciones a Excel, que son StreamingResponse).
"""
from starlette.datastructures import MutableHeaders
from starlette.responses import Response
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.auth.dependencies import ESTADO_SESION_RENOVADA, SESSION_COOKIE_NAME
from app.routers.auth import poner_cookie_sesion


class RenovarSesion:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def enviar(message: Message) -> None:
            if message["type"] == "http.response.start":
                renovada = scope.get("state", {}).get(ESTADO_SESION_RENOVADA)
                if renovada:
                    encabezados = MutableHeaders(scope=message)
                    # Si la respuesta ya pone (o borra) la cookie de sesión, manda ella
                    ya_la_pone = any(
                        c.startswith(f"{SESSION_COOKIE_NAME}=")
                        for c in encabezados.getlist("set-cookie")
                    )
                    if not ya_la_pone:
                        token, max_age = renovada
                        cookie = Response()
                        poner_cookie_sesion(cookie, token, max_age)
                        for valor in cookie.headers.getlist("set-cookie"):
                            encabezados.append("set-cookie", valor)
            await send(message)

        await self.app(scope, receive, enviar)
