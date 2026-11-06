"""
base_dia.py — Rodada incremental: a carga completa uma vez por dia e, nas rodadas seguintes, só o Online.

O Real é "até ontem" e não muda ao longo do dia; metas, curva da META_NEG, meta do dia, base de clientes e o mês em
prévia também não. Só os pedidos de hoje (Online) mudam a cada rodada. Então:

  1. a primeira rodada do dia faz a carga completa (fontes.carregar) e guarda tudo menos o Online num arquivo (a base
     do dia; no Actions ele vai para o cache, nunca para o repositório);
  2. as rodadas seguintes leem a base e consultam só o Online (fontes.atualizar_online).

A base só vale se for de hoje, do mesmo mês, com os mesmos agrupadores e modelo, e se o Real não mudou desde ela:
cada rodada faz uma consulta barata do Real do mês por agrupador, com a cobertura (fontes.assinatura_real), e compara
com a da base. A cobertura de hoje vem na mesma consulta do Online.
Real diferente (ex.: o Datasphere carregou o Real de ontem depois da primeira rodada), base ausente, ilegível ou de
outro dia: carga completa, que grava uma base nova. A base nunca vale no fechamento do mês nem antes de
M.REAL_PELA_META_DESDE (`guardavel`). A saída da API é a mesma da carga completa; o contrato não muda.
"""
from __future__ import annotations

import logging
from datetime import date, datetime
from pathlib import Path

from . import fontes
from . import mapeamento as M
from . import saida
from .tipos import Calendario, Cliente, Dados, VolumeRota

log = logging.getLogger(__name__)

FORMATO = 2   # 2: com a cobertura
TOLERANCIA = 0.001   # diferença de Real (por agrupador) que ainda conta como "não mudou"


def _config() -> dict:
    """O que, se mudar, invalida a base: o modelo consultado e os agrupadores (inclui os extras do painel)."""
    return {"objeto": M.OBJ_META, "agrupadores": list(M.AGRUPADORES_CONSULTA),
            "real_pela_meta_desde": M.REAL_PELA_META_DESDE}


def guardavel(dados: Dados) -> bool:
    """Só mês aberto pela chave da meta e com o Online consultado (o Online à parte só existe nesse caso)."""
    return (not dados.simulado and not dados.cal.fechamento and dados.online is not None
            and M.real_pela_meta(dados.cal.anomes))


# ------------------------------------------------------------------ (de)serialização
def _data(valor: str | None) -> date | None:
    return date.fromisoformat(valor) if valor else None


def para_json(dados: Dados, assinatura: dict[str, float]) -> dict:
    cal = dados.cal
    return {
        "formato": FORMATO, "dia": cal.hoje.isoformat(), "anomes": cal.anomes, "gerado_em": dados.agora.isoformat(),
        "config": _config(), "assinatura": assinatura,
        "cal": {"hoje": cal.hoje.isoformat(), "total_dias_uteis": cal.total_dias_uteis, "dia_hoje": cal.dia_hoje,
                "dia_ontem": cal.dia_ontem, "semana_num": cal.semana_num, "semana_tipo": cal.semana_tipo,
                "dia_semana": cal.dia_semana, "mes_label": cal.mes_label, "fechamento": cal.fechamento,
                "ref": cal.ref.isoformat() if cal.ref else None,
                "data_ontem": cal.data_ontem.isoformat() if cal.data_ontem else None},
        "clientes": [[c.pv, c.nome, c.rota, c.gc, c.sv, c.nome_sv, c.vendedor, c.segmento] for c in dados.clientes],
        "volume": {r: {k: [v.meta, v.real, v.neg_restante, v.meta_dia] for k, v in ks.items()}
                   for r, ks in dados.volume.items()},
        "volume_cliente": {r: {str(pv): {k: list(t) for k, t in ks.items()} for pv, ks in pvs.items()}
                           for r, pvs in dados.volume_cliente.items()},
        "eventuais": dados.eventuais, "avisos": dados.avisos, "agrupadores_meta": dados.agrupadores_meta,
        "gcs_originais": dados.gcs_originais,
        "cobertura_meta": dados.cobertura_meta,
        "cobertura_cliente": {r: {str(pv): sorted(ks) for pv, ks in pvs.items()}
                              for r, pvs in dados.cobertura_cliente.items()},
    }


def de_json(obj: dict) -> Dados:
    c = obj["cal"]
    cal = Calendario(hoje=_data(c["hoje"]), total_dias_uteis=c["total_dias_uteis"], dia_hoje=c["dia_hoje"],
                     dia_ontem=c["dia_ontem"], semana_num=c["semana_num"], semana_tipo=c["semana_tipo"],
                     dia_semana=c["dia_semana"], mes_label=c["mes_label"], fechamento=c["fechamento"],
                     ref=_data(c["ref"]), data_ontem=_data(c["data_ontem"]))
    return Dados(
        agora=datetime.fromisoformat(obj["gerado_em"]), cal=cal,
        clientes=[Cliente(*l) for l in obj["clientes"]],
        volume={r: {k: VolumeRota(*v) for k, v in ks.items()} for r, ks in obj["volume"].items()},
        volume_cliente={r: {int(pv): {k: tuple(t) for k, t in ks.items()} for pv, ks in pvs.items()}
                        for r, pvs in obj["volume_cliente"].items()},
        online=None, eventuais=obj["eventuais"], avisos=obj["avisos"], agrupadores_meta=obj["agrupadores_meta"],
        gcs_originais=obj["gcs_originais"], cobertura_meta=obj["cobertura_meta"],
        cobertura_cliente={r: {int(pv): set(ks) for pv, ks in pvs.items()}
                           for r, pvs in obj["cobertura_cliente"].items()})


# ------------------------------------------------------------------ leitura e gravação
def _mesma_assinatura(a: dict[str, float], b: dict[str, float]) -> bool:
    return set(a) == set(b) and all(abs(a[k] - b[k]) <= TOLERANCIA for k in a)


def ler(caminho: Path, hoje: date, anomes: str, assinatura: dict[str, float]) -> tuple[Dados | None, str]:
    """(base, "") se a base em `caminho` vale para esta rodada; senão (None, motivo da carga completa)."""
    obj = saida.ler(caminho)
    if not isinstance(obj, dict):
        return None, "sem base do dia"
    if obj.get("formato") != FORMATO:
        return None, f"base em outro formato ({obj.get('formato')})"
    if obj.get("dia") != hoje.isoformat():
        return None, f"base de outro dia ({obj.get('dia')})"
    if obj.get("anomes") != anomes:
        return None, f"base de outro mês ({obj.get('anomes')})"
    if obj.get("config") != _config():
        return None, "agrupadores ou modelo mudaram desde a base"
    if not _mesma_assinatura(obj.get("assinatura") or {}, assinatura):
        return None, "o Real mudou desde a base"
    try:
        return de_json(obj), ""
    except (KeyError, TypeError, ValueError) as erro:
        return None, f"base ilegível ({erro})"


def salvar(caminho: Path, dados: Dados, assinatura: dict[str, float]) -> bool:
    """Grava a base do dia (só se `guardavel`). Devolve True quando gravou."""
    if not guardavel(dados):
        return False
    return saida.gravar(caminho, para_json(dados, assinatura))


def carregar(cons, agora: datetime, caminho: Path | None, completa: bool = False
             ) -> tuple[Dados, dict[str, float] | None, bool]:
    """(dados, assinatura, incremental). Sem `caminho`, é a carga completa de sempre (sem a consulta da assinatura).
    `assinatura` volta preenchida só na carga completa, para `salvar` depois que a rodada for aprovada; ela é lida
    ANTES da carga, então um Real que mude no meio da carga faz a próxima rodada recarregar tudo."""
    if caminho is None:
        return fontes.carregar(cons, agora), None, False
    anomes = agora.strftime("%Y%m")
    try:
        assinatura = fontes.assinatura_real(cons, anomes)
    except Exception as erro:   # noqa: BLE001 - sem assinatura, carga completa e nenhuma base gravada
        log.warning("Base do dia: consulta do Real por agrupador falhou (%s); carga completa.", erro)
        return fontes.carregar(cons, agora), None, False
    motivo = "carga completa pedida (--completa)" if completa else ""
    if not completa:
        base, motivo = ler(caminho, agora.date(), anomes, assinatura)
        if base is not None:
            log.info("Rodada incremental: base do dia de %s; consultando só o Online.", base.agora.strftime("%H:%M"))
            return fontes.atualizar_online(cons, agora, base), None, True
    log.info("Base do dia: %s; carga completa.", motivo)
    return fontes.carregar(cons, agora), assinatura, False
