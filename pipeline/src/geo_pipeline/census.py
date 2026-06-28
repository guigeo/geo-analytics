"""Ingestao dos agregados do Censo 2022 (IBGE) por setor censitario.

Le os CSVs tematicos (`;`, decimal com virgula, encoding ISO-8859-1), seleciona
um subconjunto curado de variaveis com nomes legiveis, junta tudo por `CD_SETOR`
e grava a tabela canonica de atributos em GeoParquet-vizinho (sem geometria).

A geometria vive em `setor.parquet`; o chat (Fase 2, DuckDB spatial) junta as duas
por `CD_SETOR` em query-time. Esta tabela e a fonte unica das variaveis do censo.

Codigos das variaveis vem do dicionario oficial
(`dicionario_de_dados_agregados_por_setores_censitarios_*.xlsx`).
Adicionar variavel = acrescentar uma entrada em THEMES.
"""

from __future__ import annotations

import codecs
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

import duckdb

from .config import OutputConfig, _resolve

log = logging.getLogger(__name__)

# Diretorio das fontes do censo (relativo a raiz do repo, gitignored).
CENSUS_DIR = "data/censo_2022"
OUTPUT_NAME = "censo_setor.parquet"
OUTPUT_MUN_NAME = "censo_municipio.parquet"
MUN_KEY = "cd_mun"  # coluna ja presente em censo_setor (vem do tema basico)
KEY = "CD_SETOR"  # coluna-fonte; DuckDB casa CD_SETOR/CD_setor (case-insensitive)
JOIN_KEY = "setor_cd"  # alias interno != KEY (evita colisao case-insensitive no binder)

Kind = Literal["int", "float"]


@dataclass(frozen=True)
class Theme:
    """Um arquivo tematico do censo e as variaveis curadas dele."""

    name: str
    pattern: str  # glob (rglob) para achar o CSV dentro de CENSUS_DIR
    numeric: dict[str, tuple[str, Kind]] = field(default_factory=dict)
    text: dict[str, str] = field(default_factory=dict)
    key: str = KEY  # nome da coluna-chave na fonte (varia: CD_SETOR / CD_setor / setor)


# Registry curado. Codigos conferidos no dicionario oficial (maio/2026).
THEMES: list[Theme] = [
    Theme(
        name="basico",
        pattern="*basico*BR*.csv",
        text={
            "SITUACAO": "situacao",
            "NM_UF": "nm_uf",
            "CD_MUN": "cd_mun",
            "NM_MUN": "nm_mun",
        },
        numeric={
            "AREA_KM2": ("area_km2", "float"),
            "V0001": ("pop_total", "int"),
            "V0002": ("domicilios_total", "int"),
            "V0005": ("media_moradores", "float"),
            "V0007": ("domicilios_ocupados", "int"),
        },
    ),
    Theme(
        name="demografia",
        pattern="*demografia*BR*.csv",
        numeric={
            "V01007": ("pop_masculino", "int"),
            "V01008": ("pop_feminino", "int"),
        },
    ),
    Theme(
        name="cor_ou_raca",
        pattern="*cor_ou_raca*BR*.csv",
        numeric={
            "V01317": ("cor_branca", "int"),
            "V01318": ("cor_preta", "int"),
            "V01319": ("cor_amarela", "int"),
            "V01320": ("cor_parda", "int"),
            "V01321": ("cor_indigena", "int"),
        },
    ),
    Theme(
        name="domicilio1",
        pattern="*caracteristicas_domicilio1*BR*.csv",
        numeric={
            "V00001": ("dom_ocup_perm", "int"),  # DPPO: denominador dos percentuais de infra
        },
    ),
    Theme(
        name="domicilio2",
        pattern="*caracteristicas_domicilio2*BR*.csv",
        key="setor",
        numeric={
            "V00111": ("dom_agua_rede", "int"),
            "V00309": ("dom_esgoto_rede", "int"),
            "V00397": ("dom_lixo_coletado", "int"),
        },
    ),
]

# Colunas derivadas (calculadas apos o join/agregacao). nullif evita divisao por zero.
# As mesmas expressoes valem por setor e por municipio: por municipio incidem sobre os
# totais ja somados (os nomes de coluna sao preservados na agregacao).
DERIVED: dict[str, str] = {
    "densidade_hab_km2": "pop_total / nullif(area_km2, 0)",
    "pct_agua_rede": "100.0 * dom_agua_rede / nullif(dom_ocup_perm, 0)",
    "pct_esgoto_rede": "100.0 * dom_esgoto_rede / nullif(dom_ocup_perm, 0)",
    "pct_lixo_coletado": "100.0 * dom_lixo_coletado / nullif(dom_ocup_perm, 0)",
}

# Variaveis numericas que NAO somam ao agregar por municipio: media ponderada
# (numerador reconstruido = media_i * peso_i; denominador = soma do peso). alias -> peso.
WEIGHTED: dict[str, str] = {"media_moradores": "domicilios_ocupados"}


_CHUNK = 1 << 20


def _find_csv(census_dir: Path, pattern: str) -> Path:
    # ignora sidecars .utf8.csv gerados por _ensure_utf8
    matches = sorted(p for p in census_dir.rglob(pattern) if not p.name.endswith(".utf8.csv"))
    if not matches:
        raise FileNotFoundError(f"CSV do censo nao encontrado: {pattern} em {census_dir}")
    return matches[0]


def _is_utf8(csv: Path) -> bool:
    dec = codecs.getincrementaldecoder("utf-8")()
    with csv.open("rb") as fh:
        for chunk in iter(lambda: fh.read(_CHUNK), b""):
            try:
                dec.decode(chunk)
            except UnicodeDecodeError:
                return False
    try:
        dec.decode(b"", final=True)
    except UnicodeDecodeError:
        return False
    return True


def _ensure_utf8(csv: Path) -> Path:
    """IBGE entrega os CSVs em ISO-8859-1; DuckDB so le UTF-8 confiavelmente.

    Gera (uma vez, cacheado) um sidecar UTF-8 quando a fonte nao e UTF-8/ASCII.
    """
    if _is_utf8(csv):
        return csv
    out = csv.with_suffix(".utf8.csv")
    if not (out.exists() and out.stat().st_mtime >= csv.stat().st_mtime):
        log.info("censo: convertendo %s (ISO-8859-1 -> UTF-8)", csv.name)
        with csv.open("rb") as src, out.open("wb") as dst:
            for chunk in iter(lambda: src.read(_CHUNK), b""):
                dst.write(chunk.decode("latin-1").encode("utf-8"))
    return out


def _clean(col: str, kind: Kind) -> str:
    """SQL para limpar uma celula VARCHAR -> numero (trata '', decimal-virgula, supressao)."""
    cell = f'nullif(trim("{col}"), \'\')'
    if kind == "int":
        return f"TRY_CAST({cell} AS BIGINT)"
    return f"TRY_CAST(replace({cell}, ',', '.') AS DOUBLE)"


def _theme_relation(theme: Theme, census_dir: Path) -> str:
    csv = _ensure_utf8(_find_csv(census_dir, theme.pattern))
    cols = [f'trim("{theme.key}") AS {JOIN_KEY}']
    cols += [f'trim("{src}") AS {alias}' for src, alias in theme.text.items()]
    cols += [f"{_clean(src, kind)} AS {alias}" for src, (alias, kind) in theme.numeric.items()]
    reader = f"read_csv('{csv.as_posix()}', delim=';', header=true, all_varchar=true)"
    return f"SELECT {', '.join(cols)} FROM {reader}"


def build_census(output: OutputConfig, census_dir_rel: str = CENSUS_DIR) -> Path:
    census_dir = _resolve(census_dir_rel)
    dst = _resolve(output.processed_dir) / OUTPUT_NAME
    dst.parent.mkdir(parents=True, exist_ok=True)

    base, *rest = THEMES
    ctes = [f"{t.name} AS (\n{_theme_relation(t, census_dir)}\n)" for t in THEMES]

    select_cols = [f"{JOIN_KEY} AS cd_setor"]
    select_cols += [a for a in base.text.values()]
    select_cols += [a for a, _ in base.numeric.values()]
    for t in rest:
        select_cols += [a for a, _ in t.numeric.values()]
    select_cols += [f"{expr} AS {name}" for name, expr in DERIVED.items()]

    joins = "\n".join(f"LEFT JOIN {t.name} USING ({JOIN_KEY})" for t in rest)
    sql = (
        f"COPY (\nWITH {', '.join(ctes)}\n"
        f"SELECT {', '.join(select_cols)}\n"
        f"FROM {base.name} AS base\n{joins}\n"
        f") TO '{dst.as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)"
    )

    log.info("censo: ingerindo %d temas -> %s", len(THEMES), dst.name)
    con = duckdb.connect()
    con.execute(sql)
    n = con.execute(f"SELECT count(*) FROM '{dst.as_posix()}'").fetchone()[0]
    con.close()
    log.info("censo: %d setores -> %s (%.1f MB)", n, dst.name, dst.stat().st_size / 1e6)
    return dst


def build_census_municipio(output: OutputConfig) -> Path:
    """Agrega censo_setor.parquet por municipio (todas as variaveis de setor).

    Contagens somam; media_moradores vira media ponderada (WEIGHTED); densidade e
    percentuais sao recalculados sobre os totais somados (DERIVED). Gera o setor
    antes, se ausente.
    """
    processed = _resolve(output.processed_dir)
    src = processed / OUTPUT_NAME
    if not src.exists():
        log.info("censo: %s ausente; gerando setor antes da visao municipal", OUTPUT_NAME)
        build_census(output)
    dst = processed / OUTPUT_MUN_NAME

    aliases = [(a, kind) for t in THEMES for a, kind in t.numeric.values()]

    agg = ["any_value(nm_uf) AS nm_uf", "any_value(nm_mun) AS nm_mun"]
    for a, kind in aliases:
        if a in WEIGHTED:
            agg.append(f"sum({a} * {WEIGHTED[a]}) AS _w_{a}")
        elif kind == "int":  # preserva contagem como inteiro (sum de BIGINT alarga o tipo)
            agg.append(f"CAST(sum({a}) AS BIGINT) AS {a}")
        else:
            agg.append(f"sum({a}) AS {a}")

    final = [MUN_KEY, "nm_uf", "nm_mun"]
    for a, _ in aliases:
        final.append(f"_w_{a} / nullif({WEIGHTED[a]}, 0) AS {a}" if a in WEIGHTED else a)
    final += [f"{expr} AS {name}" for name, expr in DERIVED.items()]

    sql = (
        f"COPY (\nWITH agg AS (\n"
        f"  SELECT {MUN_KEY}, {', '.join(agg)}\n"
        f"  FROM '{src.as_posix()}'\n  WHERE {MUN_KEY} IS NOT NULL\n"
        f"  GROUP BY {MUN_KEY}\n)\n"
        f"SELECT {', '.join(final)}\nFROM agg\n"
        f") TO '{dst.as_posix()}' (FORMAT PARQUET, COMPRESSION ZSTD)"
    )

    log.info("censo: agregando %d variaveis por municipio -> %s", len(final) - 3, dst.name)
    con = duckdb.connect()
    con.execute(sql)
    n = con.execute(f"SELECT count(*) FROM '{dst.as_posix()}'").fetchone()[0]
    con.close()
    log.info("censo: %d municipios -> %s (%.2f MB)", n, dst.name, dst.stat().st_size / 1e6)
    return dst
