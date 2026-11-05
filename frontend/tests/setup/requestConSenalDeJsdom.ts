/**
 * Compatibilidad de pruebas (no se usa en la app): Request de Node 24 + AbortSignal de jsdom.
 *
 * En el entorno jsdom de Vitest, AbortController/AbortSignal son los de jsdom, pero
 * Request es el de Node (jsdom no lo implementa). react-router 7 (createMemoryRouter)
 * hace `new Request(url, { signal })` en cada navegación, y desde Node 24 undici
 * comprueba que la señal sea suya: "RequestInit: Expected signal to be an instance of
 * AbortSignal". En Node 22 no lo comprobaba.
 *
 * Aquí, si la señal no es de Node, se le pasa a Request una señal de Node enlazada a
 * la de jsdom (si esta se aborta, también la de Node), así que abortar una navegación
 * sigue abortando su Request. util.transferableAbortController() es la forma pública
 * de obtener un AbortController de Node cuando el global es el de jsdom.
 */
import { transferableAbortController } from 'node:util';

const SenalDeNode = transferableAbortController().signal.constructor as typeof AbortSignal;
const RequestDeNode = globalThis.Request;

if (RequestDeNode && globalThis.AbortSignal !== SenalDeNode) {
  class RequestConSenalDeJsdom extends RequestDeNode {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      const senal = init?.signal;
      if (!senal || senal instanceof SenalDeNode) {
        super(input, init);
        return;
      }
      const enlazada = transferableAbortController();
      if (senal.aborted) enlazada.abort(senal.reason);
      else senal.addEventListener('abort', () => enlazada.abort(senal.reason), { once: true });
      super(input, { ...init, signal: enlazada.signal });
    }
  }
  globalThis.Request = RequestConSenalDeJsdom;
}
