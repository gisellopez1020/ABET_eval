# Licencias de terceros

Inventario de las dependencias **de producción** de ABET Eval 1.0.0, generado el 2026-11-05
con herramientas (no a mano). No incluye las de desarrollo y pruebas (pytest, Vitest,
TypeScript, Tailwind…), que no se distribuyen con la aplicación.

| Parte | Herramienta | Qué se inventarió |
|---|---|---|
| Backend | `pip-licenses 5.5.5 --from=mixed` | Todo lo instalado en la imagen de producción (`backend/Dockerfile`, etapa `prod`): `requirements.txt` y sus dependencias, más pip |
| Frontend | `license-checker-rseidelsohn 4.4.2 --production` | `dependencies` de `frontend/package.json` y sus dependencias (lo que se empaqueta en `dist/`) |

Para regenerarlo, ver «Cómo regenerar» al final.

## Licencias que no son permisivas o que piden atención

Ninguna dependencia es GPL ni AGPL, ninguna está «sin licencia» y ninguna tiene licencia
desconocida. Las que conviene conocer:

| Paquete | Licencia | Qué implica |
|---|---|---|
| `psycopg2-binary` 2.9.13 (backend) | **LGPL-3.0 o posterior**, con una excepción que permite enlazarla con OpenSSL | Copyleft débil. La app la usa como biblioteca (se importa, no se modifica), lo que la LGPL permite sin que la app tenga que ser LGPL. Al **distribuir** la biblioteca (p. ej. una imagen de Docker), hay que conservar su aviso de licencia y permitir sustituirla por otra versión. La rueda `-binary` trae además sus propias bibliotecas de C (en `psycopg2_binary.libs/`): libpq (licencia PostgreSQL), OpenSSL 3 (Apache-2.0), Kerberos (MIT), OpenLDAP, Cyrus SASL, PCRE y libselinux, todas permisivas. |
| `certifi` (backend) | **MPL-2.0** | Copyleft débil por archivo: solo obliga a publicar los cambios que se hagan **a sus propios archivos**. Se usa sin modificar. |
| `dompurify` 3.4.17 (frontend, vía jsPDF) | MPL-2.0 **o** Apache-2.0 | Doble licencia: se puede elegir Apache-2.0, que es permisiva. |
| `typing_extensions`, `greenlet` (backend) | PSF-2.0 (greenlet: MIT y PSF-2.0) | Permisiva (la de Python). |
| `pillow` (backend) | MIT-CMU | Permisiva (variante histórica de MIT). |
| `pako` (frontend) | MIT y Zlib | Ambas permisivas. |
| `rgbcolor` (frontend) | MIT\* | El paquete no declara licencia en `package.json`; la herramienta la deduce de su archivo `LICENSE.md`, que es MIT. |

Fuera del alcance de este inventario: los **paquetes del sistema operativo** de las
imágenes base (Debian en el backend, Alpine en nginx y PostgreSQL), entre los que hay
software GPL (bash, coreutils, util-linux…), además del propio PostgreSQL y nginx
(licencias permisivas). Solo generan obligaciones si se **distribuyen las imágenes ya
construidas**; si se entrega el código fuente con los Dockerfile, cada instalación las
descarga de Docker Hub. La titularidad y la licencia de ABET Eval las define el equipo
con la VIIE: este archivo no asigna ninguna licencia al proyecto.

## Backend (59 paquetes)

| Paquete | Versión | Licencia | Sitio |
|---|---|---|---|
| alembic | 1.13.1 | MIT License | https://alembic.sqlalchemy.org |
| annotated-doc | 0.0.5 | MIT | https://github.com/fastapi/annotated-doc |
| annotated-types | 0.8.0 | MIT | https://github.com/annotated-types/annotated-types |
| anyio | 4.16.0 | MIT | https://anyio.readthedocs.io/en/stable/versionhistory.html |
| cachetools | 5.5.2 | MIT License | https://github.com/tkem/cachetools/ |
| certifi | 2026.10.23 | Mozilla Public License 2.0 (MPL 2.0) | https://github.com/certifi/python-certifi |
| cffi | 2.1.1 | MIT-0 | https://cffi.readthedocs.io/en/latest/whatsnew.html |
| charset-normalizer | 3.5.2 | MIT | https://github.com/jawah/charset_normalizer/blob/master/CHANGELOG.md |
| click | 8.5.0 | BSD-3-Clause | https://github.com/pallets/click/ |
| cryptography | 50.0.1 | Apache-2.0 OR BSD-3-Clause | https://github.com/pyca/cryptography |
| et_xmlfile | 2.0.0 | MIT License | https://foss.heptapod.net/openpyxl/et_xmlfile |
| fastapi | 0.162.0 | MIT | https://github.com/fastapi/fastapi |
| google-api-core | 2.43.2 | Apache Software License | https://github.com/googleapis/google-cloud-python/tree/main/packages/google-api-core |
| google-api-python-client | 2.129.0 | Apache Software License | https://github.com/googleapis/google-api-python-client/ |
| google-auth | 2.29.0 | Apache Software License | https://github.com/googleapis/google-auth-library-python |
| google-auth-httplib2 | 0.4.4 | Apache Software License | https://github.com/googleapis/google-cloud-python/tree/main/packages/google-auth-httplib2 |
| google-auth-oauthlib | 1.2.0 | Apache Software License | https://github.com/GoogleCloudPlatform/google-auth-library-python-oauthlib |
| googleapis-common-protos | 1.76.0 | Apache-2.0 | https://github.com/googleapis/google-cloud-python/tree/main/packages/googleapis-common-protos |
| greenlet | 3.5.6 | MIT AND PSF-2.0 | https://greenlet.readthedocs.io |
| h11 | 0.16.0 | MIT License | https://github.com/python-hyper/h11 |
| httpcore | 1.0.9 | BSD-3-Clause | https://www.encode.io/httpcore/ |
| httplib2 | 0.32.1 | MIT License | https://github.com/httplib2/httplib2 |
| httptools | 0.9.0 | MIT | https://github.com/MagicStack/httptools |
| httpx | 0.27.0 | BSD-3-Clause | https://github.com/encode/httpx |
| idna | 3.20 | BSD-3-Clause | https://github.com/kjd/idna |
| Mako | 1.4.3 | MIT | https://www.makotemplates.org/ |
| MarkupSafe | 3.0.4 | BSD-3-Clause | https://github.com/pallets/markupsafe/ |
| oauthlib | 4.0.1 | BSD-3-Clause | https://github.com/oauthlib/oauthlib |
| openpyxl | 3.1.5 | MIT License | https://openpyxl.readthedocs.io |
| opentelemetry-api | 1.45.2 | Apache-2.0 | https://github.com/open-telemetry/opentelemetry-python/tree/main/opentelemetry-api |
| pillow | 13.0.0 | MIT-CMU | https://python-pillow.org |
| proto-plus | 1.29.0 | Apache Software License | https://github.com/googleapis/google-cloud-python/tree/main/packages/proto-plus |
| protobuf | 7.36.2 | 3-Clause BSD License | https://developers.google.com/protocol-buffers/ |
| psycopg2-binary | 2.9.13 | GNU Library or Lesser General Public License (LGPL) | https://psycopg.org/ |
| pyasn1 | 0.6.5 | BSD-2-Clause | https://github.com/pyasn1/pyasn1 |
| pyasn1_modules | 0.4.2 | BSD License | https://github.com/pyasn1/pyasn1-modules |
| pycparser | 3.12 | BSD-3-Clause | https://github.com/eliben/pycparser |
| pydantic | 2.14.2 | MIT | https://github.com/pydantic/pydantic |
| pydantic-settings | 2.2.1 | MIT | https://github.com/pydantic/pydantic-settings |
| pydantic_core | 2.50.2 | MIT | https://github.com/pydantic |
| PyJWT | 2.15.1 | MIT | https://github.com/jpadilla/pyjwt |
| pyparsing | 3.3.3 | MIT | https://github.com/pyparsing/pyparsing/ |
| python-dotenv | 1.2.4 | BSD-3-Clause | https://github.com/theskumar/python-dotenv |
| python-multipart | 0.0.33 | Apache-2.0 | https://github.com/Kludex/python-multipart |
| PyYAML | 6.0.3 | MIT License | https://pyyaml.org/ |
| requests | 2.34.2 | Apache Software License | https://github.com/psf/requests |
| requests-oauthlib | 2.0.0 | BSD License | https://github.com/requests/requests-oauthlib |
| rsa | 4.9.1 | Apache Software License | https://stuvel.eu/rsa |
| sniffio | 1.3.1 | Apache Software License; MIT License | https://github.com/python-trio/sniffio |
| SQLAlchemy | 2.0.57 | MIT | https://www.sqlalchemy.org |
| starlette | 1.10.0 | BSD-3-Clause | https://github.com/Kludex/starlette |
| typing-inspection | 0.4.5 | MIT | https://github.com/pydantic/typing-inspection |
| typing_extensions | 4.16.0 | PSF-2.0 | https://github.com/python/typing_extensions |
| uritemplate | 4.2.0 | BSD 3-Clause OR Apache-2.0 | https://uritemplate.readthedocs.org |
| urllib3 | 2.8.0 | MIT | https://github.com/urllib3/urllib3/blob/main/CHANGES.rst |
| uvicorn | 0.29.0 | BSD-3-Clause | https://www.uvicorn.org/ |
| uvloop | 0.23.0 | Apache Software License; MIT License | UNKNOWN |
| watchfiles | 1.3.0 | MIT License | https://github.com/samuelcolvin/watchfiles |
| websockets | 17.4 | BSD-3-Clause | https://github.com/python-websockets/websockets |

## Frontend (102 paquetes)

| Paquete | Versión | Licencia | Repositorio |
|---|---|---|---|
| @babel/runtime | 7.29.7 | MIT | https://github.com/babel/babel |
| @types/d3-array | 3.2.2 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-color | 3.1.3 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-ease | 3.0.2 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-interpolate | 3.0.4 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-path | 3.1.1 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-scale | 4.0.9 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-shape | 3.1.8 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-time | 3.0.4 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/d3-timer | 3.0.2 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/pako | 2.0.4 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/prop-types | 15.7.15 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/raf | 3.4.3 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/react | 18.3.29 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/trusted-types | 2.0.7 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| agent-base | 6.0.2 | MIT | https://github.com/TooTallNate/node-agent-base |
| asynckit | 0.4.0 | MIT | https://github.com/alexindigo/asynckit |
| axios | 1.21.0 | MIT | https://github.com/axios/axios |
| base64-arraybuffer | 1.0.2 | MIT | https://github.com/niklasvh/base64-arraybuffer |
| call-bind-apply-helpers | 1.0.2 | MIT | https://github.com/ljharb/call-bind-apply-helpers |
| canvg | 3.0.11 | MIT | https://github.com/canvg/canvg |
| clsx | 2.1.1 | MIT | https://github.com/lukeed/clsx |
| combined-stream | 1.0.8 | MIT | https://github.com/felixge/node-combined-stream |
| cookie | 1.1.1 | MIT | https://github.com/jshttp/cookie |
| core-js | 3.49.0 | MIT | https://github.com/zloirock/core-js |
| css-line-break | 2.1.0 | MIT | https://github.com/niklasvh/css-line-break |
| csstype | 3.2.3 | MIT | https://github.com/frenic/csstype |
| d3-array | 3.2.4 | ISC | https://github.com/d3/d3-array |
| d3-color | 3.1.0 | ISC | https://github.com/d3/d3-color |
| d3-ease | 3.0.1 | BSD-3-Clause | https://github.com/d3/d3-ease |
| d3-format | 3.1.2 | ISC | https://github.com/d3/d3-format |
| d3-interpolate | 3.0.1 | ISC | https://github.com/d3/d3-interpolate |
| d3-path | 3.1.0 | ISC | https://github.com/d3/d3-path |
| d3-scale | 4.0.2 | ISC | https://github.com/d3/d3-scale |
| d3-shape | 3.2.0 | ISC | https://github.com/d3/d3-shape |
| d3-time-format | 4.1.0 | ISC | https://github.com/d3/d3-time-format |
| d3-time | 3.1.0 | ISC | https://github.com/d3/d3-time |
| d3-timer | 3.0.1 | ISC | https://github.com/d3/d3-timer |
| debug | 4.4.3 | MIT | https://github.com/debug-js/debug |
| decimal.js-light | 2.5.1 | MIT | https://github.com/MikeMcl/decimal.js-light |
| delayed-stream | 1.0.0 | MIT | https://github.com/felixge/node-delayed-stream |
| dom-helpers | 5.2.1 | MIT | https://github.com/react-bootstrap/dom-helpers |
| dompurify | 3.4.17 | (MPL-2.0 OR Apache-2.0) | https://github.com/cure53/DOMPurify |
| dunder-proto | 1.0.1 | MIT | https://github.com/es-shims/dunder-proto |
| es-define-property | 1.0.1 | MIT | https://github.com/ljharb/es-define-property |
| es-errors | 1.3.0 | MIT | https://github.com/ljharb/es-errors |
| es-object-atoms | 1.1.2 | MIT | https://github.com/ljharb/es-object-atoms |
| es-set-tostringtag | 2.1.0 | MIT | https://github.com/es-shims/es-set-tostringtag |
| eventemitter3 | 4.0.7 | MIT | https://github.com/primus/eventemitter3 |
| fast-equals | 5.4.0 | MIT | https://github.com/planttheidea/fast-equals |
| fast-png | 6.4.0 | MIT | https://github.com/image-js/fast-png |
| fflate | 0.8.3 | MIT | https://github.com/101arrowz/fflate |
| follow-redirects | 1.16.2 | MIT | https://github.com/follow-redirects/follow-redirects |
| form-data | 4.0.6 | MIT | https://github.com/form-data/form-data |
| function-bind | 1.1.2 | MIT | https://github.com/Raynos/function-bind |
| get-intrinsic | 1.3.0 | MIT | https://github.com/ljharb/get-intrinsic |
| get-proto | 1.0.1 | MIT | https://github.com/ljharb/get-proto |
| gopd | 1.2.0 | MIT | https://github.com/ljharb/gopd |
| has-symbols | 1.1.0 | MIT | https://github.com/inspect-js/has-symbols |
| has-tostringtag | 1.0.2 | MIT | https://github.com/inspect-js/has-tostringtag |
| hasown | 2.0.4 | MIT | https://github.com/inspect-js/hasOwn |
| html2canvas | 1.4.1 | MIT | https://github.com/niklasvh/html2canvas |
| https-proxy-agent | 5.0.1 | MIT | https://github.com/TooTallNate/node-https-proxy-agent |
| internmap | 2.0.3 | ISC | https://github.com/mbostock/internmap |
| iobuffer | 5.4.0 | MIT | https://github.com/image-js/iobuffer |
| js-tokens | 4.0.0 | MIT | https://github.com/lydell/js-tokens |
| jspdf | 4.2.1 | MIT | https://github.com/parallax/jsPDF |
| lodash | 4.18.1 | MIT | https://github.com/lodash/lodash |
| loose-envify | 1.4.0 | MIT | https://github.com/zertosh/loose-envify |
| lucide-react | 1.47.0 | ISC | https://github.com/lucide-icons/lucide |
| math-intrinsics | 1.1.0 | MIT | https://github.com/es-shims/math-intrinsics |
| mime-db | 1.52.0 | MIT | https://github.com/jshttp/mime-db |
| mime-types | 2.1.35 | MIT | https://github.com/jshttp/mime-types |
| ms | 2.1.3 | MIT | https://github.com/vercel/ms |
| object-assign | 4.1.1 | MIT | https://github.com/sindresorhus/object-assign |
| pako | 2.2.0 | (MIT AND Zlib) | https://github.com/nodeca/pako |
| performance-now | 2.1.0 | MIT | https://github.com/braveg1rl/performance-now |
| prop-types | 15.8.1 | MIT | https://github.com/facebook/prop-types |
| proxy-from-env | 2.1.0 | MIT | https://github.com/Rob--W/proxy-from-env |
| raf | 3.4.1 | MIT | https://github.com/chrisdickinson/raf |
| react-dom | 18.3.1 | MIT | https://github.com/facebook/react |
| react-is | 16.13.1 | MIT | https://github.com/facebook/react |
| react-is | 18.3.1 | MIT | https://github.com/facebook/react |
| react-router-dom | 7.18.5 | MIT | https://github.com/remix-run/react-router |
| react-router | 7.18.5 | MIT | https://github.com/remix-run/react-router |
| react-smooth | 4.0.4 | MIT | https://github.com/recharts/react-smooth |
| react-transition-group | 4.4.5 | BSD-3-Clause | https://github.com/reactjs/react-transition-group |
| react | 18.3.1 | MIT | https://github.com/facebook/react |
| recharts-scale | 0.4.5 | MIT | https://github.com/recharts/recharts-scale |
| recharts | 2.15.4 | MIT | https://github.com/recharts/recharts |
| regenerator-runtime | 0.13.11 | MIT | https://github.com/facebook/regenerator.git#main |
| rgbcolor | 1.0.1 | MIT* | https://github.com/yetzt/node-rgbcolor |
| scheduler | 0.23.2 | MIT | https://github.com/facebook/react |
| set-cookie-parser | 2.7.3 | MIT | https://github.com/nfriedly/set-cookie-parser |
| stackblur-canvas | 2.7.0 | MIT | https://github.com/flozz/StackBlur |
| svg-pathdata | 6.0.3 | MIT | https://github.com/nfroidure/svg-pathdata |
| text-segmentation | 1.0.3 | MIT | https://github.com/niklasvh/text-segmentation |
| tiny-invariant | 1.3.3 | MIT | https://github.com/alexreardon/tiny-invariant |
| use-sync-external-store | 1.6.0 | MIT | https://github.com/facebook/react |
| utrie | 1.0.2 | MIT | https://github.com/niklasvh/utrie |
| victory-vendor | 36.9.2 | MIT AND ISC | https://github.com/FormidableLabs/victory |
| zustand | 4.5.7 | MIT | https://github.com/pmndrs/zustand |

## Cómo regenerar

Backend, sobre la imagen de producción (pip-licenses en una venv aparte, para no
contarse a sí mismo):

```bash
docker build --target prod -t abet-backend:licencias backend
docker run --rm --user root --entrypoint sh abet-backend:licencias -c \
  "python -m venv /tmp/l && /tmp/l/bin/pip install -q pip-licenses==5.5.5 && \
   /tmp/l/bin/pip-licenses --python /usr/local/bin/python --from=mixed --with-urls --format=markdown"
```

Frontend, solo dependencias de producción:

```bash
cd frontend && npm ci && npx -y license-checker-rseidelsohn@4.4.2 --production --excludePrivatePackages --summary
```
