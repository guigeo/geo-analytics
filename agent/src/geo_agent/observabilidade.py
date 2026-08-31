"""Identificador de requisicao, log estruturado e erro publico.

Adaptado de `webgis-core/backend/app/core/{request_context,logging}.py` —
repositorio apagado em 2026-08-31, e o que resta dele e o inventario da HERANCA —,
que aquele inventario marcava como **copiar** e cujo gatilho era "antes de
publicar o segundo cliente" (HERANCA §1). O segundo cliente subiu em 2026-08-31
sem isto, entao o gatilho estava vencido.

Duas adaptacoes sobre a origem, e a primeira e o motivo de existir:

1. **`cliente` em toda linha.** A origem era de aplicacao unica. Aqui rodam dois
   processos, um por cliente, e ambos escrevem no journal da mesma VPS: sem esse
   campo, "o chat deu 500 as 14h" nao diz nem de quem. O valor sai do
   `cliente_ativo`, que ja e a unica mencao a id de cliente em codigo Python.

2. **Um modulo em vez de dois.** La eram dois arquivos porque o backend era
   grande; aqui o agente inteiro tem oito modulos, e separar contexto de
   formatacao so espalharia uma coisa so.

O que este modulo garante, e que e o ponto todo:

- toda resposta sai com `X-Request-ID`, gerado ou herdado de quem chamou;
- toda requisicao vira UMA linha JSON com cliente, metodo, rota, status e
  duracao — uma linha, para `grep` e `jq` funcionarem;
- excecao nao tratada vira 500 generico com o codigo, e o traceback fica no log.
  O usuario le "informe o codigo X"; quem lhe atende acha a linha por esse codigo.
"""

from __future__ import annotations

import json
import logging
import re
from contextvars import ContextVar, Token
from datetime import UTC, datetime
from time import perf_counter
from typing import Any
from uuid import uuid4

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

ID_CABECALHO = "X-Request-ID"

# Aceita o identificador de quem chamou para a correlacao atravessar o proxy —
# mas so se ele for inofensivo. Sem validar, o valor entra no log e num cabecalho
# de resposta, e um `\n` ali forja uma linha de log inteira.
_PADRAO_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")

_id_atual: ContextVar[str | None] = ContextVar("id_da_requisicao", default=None)

# Campos que o middleware anexa e o formatador promove a chave de primeiro nivel.
_CAMPOS = ("request_id", "cliente", "metodo", "rota", "status", "duracao_ms")

log = logging.getLogger("geo_agent.http")


def id_da_requisicao() -> str | None:
    """O identificador da requisicao em curso, para quem loga fora do middleware."""
    return _id_atual.get()


def normalizar_id(valor: str | None) -> str:
    if valor and _PADRAO_ID.fullmatch(valor):
        return valor
    return str(uuid4())


class FormatadorJson(logging.Formatter):
    """Uma linha JSON por evento. Sem isto o journal e prosa, e prosa nao se filtra."""

    def __init__(self, cliente: str) -> None:
        super().__init__()
        self.cliente = cliente

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "hora": datetime.fromtimestamp(record.created, UTC)
            .isoformat(timespec="milliseconds")
            .replace("+00:00", "Z"),
            "nivel": record.levelname,
            "origem": record.name,
            "cliente": getattr(record, "cliente", None) or self.cliente,
            "mensagem": record.getMessage(),
        }

        # Ja veio carimbado pela fabrica de registros (`_instalar_carimbo`), na
        # hora em que o registro NASCEU. Ler o ContextVar aqui funcionaria por
        # sorte de sincronia — formatar acontece dentro da requisicao hoje, mas
        # basta um handler com fila para acontecer depois, com o contexto ja
        # desfeito. Um teste que formatava no fim pegou exatamente isso.
        identificador = getattr(record, "request_id", None)
        if identificador:
            payload["request_id"] = identificador

        for campo in _CAMPOS:
            if campo in ("request_id", "cliente"):
                continue
            valor = getattr(record, campo, None)
            if valor is not None:
                payload[campo] = valor

        if record.exc_info:
            payload["excecao"] = self.formatException(record.exc_info)

        return json.dumps(payload, ensure_ascii=False)


_NOME_DO_HANDLER = "geo-agent-json"

_fabrica_original: Any = None


def _instalar_carimbo() -> None:
    """Carimba `request_id` em todo registro, no nascimento dele.

    Fabrica de registros e nao filtro de handler porque filtro de handler so
    alcanca os registros daquele handler: quem loga de outro modulo, ou uma
    captura de teste com handler proprio, ficaria sem contexto. O carimbo tem de
    valer para o registro, nao para o caminho que ele toma.
    """
    global _fabrica_original
    if _fabrica_original is None:
        _fabrica_original = logging.getLogRecordFactory()
    anterior = _fabrica_original

    def fabrica(*args: Any, **kwargs: Any) -> logging.LogRecord:
        registro = anterior(*args, **kwargs)
        if not hasattr(registro, "request_id"):
            identificador = _id_atual.get()
            if identificador:
                registro.request_id = identificador
        return registro

    logging.setLogRecordFactory(fabrica)


def configurar_log(cliente: str, nivel: str = "INFO") -> None:
    """Instala o formatador JSON na raiz, substituindo o que houver.

    Idempotente de proposito: o uvicorn com `--reload` reimporta o modulo, e sem
    isto cada reimportacao acrescentaria um handler e cada linha sairia repetida.
    """
    _instalar_carimbo()

    raiz = logging.getLogger()
    raiz.setLevel(nivel)

    for existente in list(raiz.handlers):
        if existente.get_name() == _NOME_DO_HANDLER:
            raiz.removeHandler(existente)

    handler = logging.StreamHandler()
    handler.set_name(_NOME_DO_HANDLER)
    handler.setLevel(nivel)
    handler.setFormatter(FormatadorJson(cliente))
    raiz.addHandler(handler)

    # O uvicorn instala os proprios handlers e as linhas sairiam duplicadas: uma
    # em JSON pela raiz, outra em prosa por ele. Deixa so a nossa.
    for nome in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        logging.getLogger(nome).handlers.clear()
        logging.getLogger(nome).propagate = True

    # O `uvicorn.access` escreve uma linha por requisicao, e a nossa ja diz o
    # mesmo com cliente, identificador e duracao. Duas linhas por requisicao
    # dobram o journal e obrigam quem investiga a escolher uma — some com a
    # pobre. WARNING e nao `disabled` para um problema do proprio uvicorn ainda
    # aparecer.
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)


class ContextoDaRequisicao(BaseHTTPMiddleware):
    """Amarra identificador, log de acesso e erro publico numa coisa so.

    Nao recebe o cliente: um processo serve um cliente so (fase 5 do passo 5 do
    ADR-0001), entao o nome entra uma vez, no `configurar_log`, e o formatador o
    escreve em toda linha. Carimba-lo tambem aqui criava duas fontes para o mesmo
    fato — e um teste com dois middlewares no mesmo processo mostrou que elas
    podiam discordar.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        identificador = normalizar_id(request.headers.get(ID_CABECALHO))
        token: Token[str | None] = _id_atual.set(identificador)
        request.state.request_id = identificador
        comeco = perf_counter()
        status = 500

        try:
            try:
                resposta = await call_next(request)
                status = resposta.status_code
            except Exception:
                # So chega aqui o que ninguem tratou: `HTTPException` levantada
                # numa rota ja virou resposta dentro do `call_next`. Por isso o
                # 429 do limitador e o 401 do portao nao passam por este ramo.
                log.exception(
                    "erro nao tratado",
                    extra=self._contexto(request, identificador, status, comeco),
                )
                resposta = JSONResponse(
                    status_code=status,
                    # `detail` porque e o campo que o front le (web/src/chat/api.ts),
                    # e o codigo vai DENTRO do texto: num campo separado o usuario
                    # nunca o veria, e sem ele o relato vira "deu erro as 14h".
                    content={
                        "detail": (
                            "Erro interno no agente. Informe o código "
                            f"{identificador} para que possamos localizar."
                        ),
                        "request_id": identificador,
                    },
                )

            resposta.headers[ID_CABECALHO] = identificador
            log.info(
                "requisição concluída",
                extra=self._contexto(request, identificador, status, comeco),
            )
            return resposta
        finally:
            _id_atual.reset(token)

    def _contexto(
        self, request: Request, identificador: str, status: int, comeco: float
    ) -> dict[str, str | int | float]:
        # Sem `request_id` nem `cliente` aqui: a fabrica de registros ja os
        # carimba, e o `logging` levanta KeyError ao ver `extra` sobrescrevendo
        # atributo existente. Mandar os dois de novo derrubava toda requisicao.
        return {
            "metodo": request.method,
            # `url.path`, nao a URL inteira: query string carrega o que o usuario
            # digitou, e isso nao tem por que ficar no journal.
            "rota": request.url.path,
            "status": status,
            "duracao_ms": round((perf_counter() - comeco) * 1000, 2),
        }
