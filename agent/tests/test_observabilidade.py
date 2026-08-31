"""O que estes testes guardam e a capacidade de investigar depois.

O gatilho da HERANCA era "antes de publicar o segundo cliente", e a pergunta que
ele antecipava e "o chat deu 500 as 14h, de quem foi?". Cada teste aqui e uma
parte da resposta: o codigo existe, ele aparece para o usuario, ele aparece no
log, e a linha diz de qual cliente foi.
"""

from __future__ import annotations

import io
import json
import logging

import pytest
from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.testclient import TestClient

from geo_agent.observabilidade import (
    ID_CABECALHO,
    ContextoDaRequisicao,
    configurar_log,
    id_da_requisicao,
    normalizar_id,
)


@pytest.fixture(autouse=True)
def _com_carimbo() -> None:
    """Instala a fábrica de registros, como o main.py faz no import.

    Sem isto os registros nascem sem `request_id`, e os testes de log passariam a
    medir a ausência do carimbo em vez do carimbo.
    """
    configurar_log("eb-prime")


@pytest.fixture
def app_de_teste() -> FastAPI:
    """Um app minimo com as tres saidas que importam: ok, HTTPException e estouro."""
    rotas = APIRouter()

    @rotas.get("/ok")
    def ok() -> dict[str, str]:
        # Loga de dentro da rota, sem receber o identificador: ele tem de vir do
        # contexto, senao todo modulo precisaria carregar o id adiante.
        logging.getLogger("geo_agent.teste").info("dentro da rota")
        return {"id_visto_pela_rota": id_da_requisicao() or ""}

    @rotas.get("/tratado")
    def tratado() -> None:
        raise HTTPException(status_code=429, detail="devagar")

    @rotas.get("/estoura")
    def estoura() -> None:
        raise RuntimeError("segredo que não pode vazar para o usuário")

    app = FastAPI()
    app.include_router(rotas)
    app.add_middleware(ContextoDaRequisicao)
    return app


def linhas_de_log(caplog: pytest.LogCaptureFixture, cliente: str = "eb-prime") -> list[dict]:
    """Formata o que foi capturado com o nosso formatador e devolve os JSONs."""
    from geo_agent.observabilidade import FormatadorJson

    formatador = FormatadorJson(cliente)
    return [json.loads(formatador.format(r)) for r in caplog.records]


class TestIdentificador:
    def test_gera_um_quando_nao_vem_nenhum(self) -> None:
        assert len(normalizar_id(None)) == 36  # uuid4

    def test_aceita_o_de_quem_chamou_para_a_correlacao_atravessar(self) -> None:
        assert normalizar_id("pedido-abc.123") == "pedido-abc.123"

    @pytest.mark.parametrize(
        "hostil",
        [
            "com espaço",
            "quebra\nde-linha",  # forjaria uma linha de log inteira
            "",
            "-comeca-com-hifen",
            "x" * 129,
        ],
    )
    def test_descarta_valor_hostil_e_gera_o_seu(self, hostil: str) -> None:
        # Nao basta rejeitar: tem de devolver um id valido, senao a requisicao
        # segue sem identificador nenhum e o log volta a ser anonimo.
        gerado = normalizar_id(hostil)
        assert gerado != hostil
        assert len(gerado) == 36


class TestRespostaHttp:
    def test_toda_resposta_carrega_o_cabecalho(self, app_de_teste: FastAPI) -> None:
        r = TestClient(app_de_teste).get("/ok")
        assert r.headers[ID_CABECALHO]

    def test_o_erro_tambem_carrega(self, app_de_teste: FastAPI) -> None:
        r = TestClient(app_de_teste, raise_server_exceptions=False).get("/estoura")
        assert r.status_code == 500
        assert r.headers[ID_CABECALHO]

    def test_o_id_do_cabecalho_e_o_mesmo_que_a_rota_enxerga(self, app_de_teste: FastAPI) -> None:
        r = TestClient(app_de_teste).get("/ok", headers={ID_CABECALHO: "meu-id-123"})
        assert r.headers[ID_CABECALHO] == "meu-id-123"
        assert r.json()["id_visto_pela_rota"] == "meu-id-123"


class TestErroPublico:
    def test_nao_vaza_a_excecao_e_entrega_o_codigo_ao_usuario(self, app_de_teste: FastAPI) -> None:
        r = TestClient(app_de_teste, raise_server_exceptions=False).get("/estoura")
        detalhe = r.json()["detail"]

        # O que o usuario NAO pode ver.
        assert "segredo que não pode vazar" not in detalhe
        assert "RuntimeError" not in detalhe
        # E o que ele PRECISA ver: o codigo, dentro do texto que o front mostra.
        assert r.headers[ID_CABECALHO] in detalhe

    def test_nao_engole_o_erro_ja_tratado(self, app_de_teste: FastAPI) -> None:
        # 429 do limitador e 401 do portao viram resposta dentro do call_next e
        # nao podem cair no ramo de excecao: o usuario perderia a mensagem util.
        r = TestClient(app_de_teste).get("/tratado")
        assert r.status_code == 429
        assert r.json()["detail"] == "devagar"


class TestLinhaDeLog:
    def test_uma_linha_por_requisicao_com_o_que_se_precisa(
        self, app_de_teste: FastAPI, caplog: pytest.LogCaptureFixture
    ) -> None:
        with caplog.at_level(logging.INFO, logger="geo_agent.http"):
            TestClient(app_de_teste).get("/ok")

        acesso = [linha for linha in linhas_de_log(caplog) if linha["origem"] == "geo_agent.http"]
        assert len(acesso) == 1
        linha = acesso[0]
        assert linha["cliente"] == "eb-prime"
        assert linha["metodo"] == "GET"
        assert linha["rota"] == "/ok"
        assert linha["status"] == 200
        assert linha["duracao_ms"] >= 0
        assert linha["request_id"]

    def test_a_linha_diz_de_qual_cliente_foi(self, app_de_teste: FastAPI) -> None:
        """A pergunta que motivou tudo: dois agentes escrevem no mesmo journal.

        Exercita o cano de verdade — o handler que o `configurar_log` instala —, e
        não um formatador construído à mão aqui dentro. É a diferença entre provar
        que o formatador sabe escrever o campo e provar que ele CHEGA no journal.
        """
        configurar_log("geo-analytics")
        instalado = [h for h in logging.getLogger().handlers if h.get_name() == "geo-agent-json"]
        assert len(instalado) == 1, "o handler tem de estar instalado, e uma vez só"

        saida = io.StringIO()
        instalado[0].stream = saida  # type: ignore[attr-defined]
        TestClient(app_de_teste).get("/ok")

        escritas = [json.loads(x) for x in saida.getvalue().splitlines() if x]
        acesso = [x for x in escritas if x["origem"] == "geo_agent.http"]
        assert acesso, "a requisição tem de deixar linha no journal"
        assert acesso[0]["cliente"] == "geo-analytics"
        assert acesso[0]["rota"] == "/ok"

    def test_quem_loga_dentro_da_rota_herda_o_identificador(
        self, app_de_teste: FastAPI, caplog: pytest.LogCaptureFixture
    ) -> None:
        with caplog.at_level(logging.INFO):
            r = TestClient(app_de_teste).get("/ok", headers={ID_CABECALHO: "abc-123"})

        da_rota = [linha for linha in linhas_de_log(caplog) if linha["origem"] == "geo_agent.teste"]
        assert da_rota and da_rota[0]["request_id"] == "abc-123"
        assert r.json()["id_visto_pela_rota"] == "abc-123"

    def test_o_traceback_vai_para_o_log_e_nao_para_a_resposta(
        self, app_de_teste: FastAPI, caplog: pytest.LogCaptureFixture
    ) -> None:
        with caplog.at_level(logging.ERROR, logger="geo_agent.http"):
            TestClient(app_de_teste, raise_server_exceptions=False).get("/estoura")

        erros = [linha for linha in linhas_de_log(caplog) if linha["nivel"] == "ERROR"]
        assert erros, "o estouro tem de deixar rastro"
        assert "RuntimeError" in erros[0]["excecao"]
        assert "segredo que não pode vazar" in erros[0]["excecao"]

    def test_cada_linha_e_um_json_de_uma_linha_so(
        self, app_de_teste: FastAPI, caplog: pytest.LogCaptureFixture
    ) -> None:
        # `grep` e `jq` no journal dependem disto: evento que ocupa duas linhas
        # quebra os dois.
        from geo_agent.observabilidade import FormatadorJson

        with caplog.at_level(logging.ERROR, logger="geo_agent.http"):
            TestClient(app_de_teste, raise_server_exceptions=False).get("/estoura")

        for registro in caplog.records:
            texto = FormatadorJson("eb-prime").format(registro)
            assert "\n" not in texto
            json.loads(texto)


class TestConfiguracao:
    def test_reinstalar_nao_duplica_o_handler(self) -> None:
        # O `--reload` do uvicorn reimporta o modulo. Sem a limpeza, cada
        # reimportacao acrescentaria um handler e as linhas sairiam repetidas.
        raiz = logging.getLogger()
        antes = len(raiz.handlers)
        configurar_log("eb-prime")
        depois_de_uma = len(raiz.handlers)
        configurar_log("eb-prime")
        assert len(raiz.handlers) == depois_de_uma
        assert depois_de_uma >= antes
