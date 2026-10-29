"""
fechado.py — Snapshot do mês fechado: v1/fechado/AAAAMM.json (um arquivo por mês, sem rede).

A API só traz o mês de referência; quando ela vira para o mês novo, os números do mês anterior somem. O painel precisa
deles para o acumulado do trimestre (pontos e gatilho de volume do SV), então o gerador guarda, por rota, a meta e o
realizado de cada produto do mês fechado:

  - rodada com mes_referencia.fechamento = true: grava (ou sobrescreve) fechado/<anomes de referência>.json com
    fechamento_final = false. Vale o último gravado: as notas do último dia só entram de madrugada.
  - 1ª rodada com o mês novo (fechamento = false): sela os arquivos de meses anteriores ainda provisórios, regravando
    só fechamento_final = true. Selado, o arquivo nunca mais é sobrescrito nem apagado.

Formato (compacto; nomes de produto, gerência e supervisor ficam no index.json e nos arquivos do mês):
  {"anomes": "202610", "rotulo": "Outubro/26", "gerado_em": "...", "atualizado_em": "...", "simulado": false,
   "fechamento_final": true, "campos": ["rota", "gerencia", "supervisao", "produtos"],
   "campos_produto": ["meta", "realizado"],
   "rotas": [["111", "G1", "SV.G1.1", {"sucos": [100.0, 85.0], "refrigerantes": [900.0, 870.5]}]]}
Produto sem meta e sem realizado na rota fica fora do dicionário dela (na API ele vem "sem_meta").
"""
from __future__ import annotations

import re
from pathlib import Path

from . import saida

PASTA = "v1/fechado"
CAMPOS = ["rota", "gerencia", "supervisao", "produtos"]
CAMPOS_PRODUTO = ["meta", "realizado"]
_NOME = re.compile(r"^\d{6}\.json$")


def caminho(anomes: str) -> str:
    return f"{PASTA}/{anomes}.json"


def montar(arquivos: dict[str, dict], gerado_em: str) -> dict:
    """Snapshot do mês de referência a partir da API montada (api.montar) da rodada."""
    index = arquivos["v1/index.json"]
    rotas = []
    for g in index["gerencias"]:
        for r in arquivos["v1/" + g["arquivo"]]["rotas"]:
            produtos = {k: [b["meta"], b["realizado"]] for k, b in r["produtos"].items()
                        if b["meta"] is not None or b["realizado"] is not None}
            rotas.append([r["id"], r["gerencia"], r["supervisao"], produtos])
    ref = index["mes_referencia"]
    return {"anomes": ref["anomes"], "rotulo": ref["rotulo"], "gerado_em": gerado_em,
            "atualizado_em": index["atualizado_em"], "simulado": index["simulado"], "fechamento_final": False,
            "campos": CAMPOS, "campos_produto": CAMPOS_PRODUTO, "rotas": rotas}


def conferir(snapshot: dict, arquivos: dict[str, dict]) -> list[str]:
    """Meta e realizado de cada produto, somados nas rotas do snapshot, contra o total da empresa da rodada.
    A tolerância é a do arredondamento (1 casa) de cada rota somada."""
    erros = []
    empresa = arquivos["v1/resumo.json"]["empresa"]["produtos"]
    for k, b in empresa.items():
        for i, campo in enumerate(CAMPOS_PRODUTO):
            valores = [r[3][k][i] for r in snapshot["rotas"] if k in r[3] and r[3][k][i] is not None]
            soma, total = sum(valores), b[campo] or 0.0
            if abs(soma - total) > 0.05 * (len(valores) + 1):
                erros.append(f"{k}: {campo} do snapshot {soma:.1f} difere do total da rodada {total:.1f}")
    return erros


def _mes_publicado(anterior_index: dict | None) -> str | None:
    return ((anterior_index or {}).get("mes_referencia") or {}).get("anomes")


def atualizar(destino: Path, arquivos: dict[str, dict], gerado_em: str,
              anterior_index: dict | None = None) -> tuple[list[str], list[str]]:
    """Grava o snapshot (fechamento) ou sela os anteriores (mês novo). Devolve (gravados, avisos).
    Erro de gravação ou de conferência sobe como exceção: quem chama decide (a rodada normal continua)."""
    index = arquivos["v1/index.json"]
    ref = index["mes_referencia"]
    anomes = ref["anomes"]
    gravados, avisos = [], []
    if ref["fechamento"]:
        rel = caminho(anomes)
        existente = saida.ler(destino / rel)
        publicado = _mes_publicado(anterior_index)
        if existente and existente.get("fechamento_final"):
            avisos.append(f"{rel} já está selado (fechamento_final): não foi sobrescrito")
        elif publicado and publicado > anomes:
            avisos.append(f"{rel} não foi sobrescrito: a API já tinha virado para {publicado}")
        else:
            snap = montar(arquivos, gerado_em)
            erros = conferir(snap, arquivos)
            if erros:
                raise ValueError("snapshot não confere com a rodada: " + "; ".join(erros))
            if saida.gravar(destino / rel, snap):
                gravados.append(rel)
    else:
        for item in listar(destino)[0]:
            if item["anomes"] < anomes and not item["fechamento_final"]:
                rel = caminho(item["anomes"])
                snap = saida.ler(destino / rel)
                if saida.gravar(destino / rel, {**snap, "fechamento_final": True}):
                    gravados.append(rel)
    return gravados, avisos


def listar(destino: Path) -> tuple[list[dict], list[str]]:
    """Itens de index.json -> fechados, em ordem cronológica, e avisos de arquivos ilegíveis."""
    pasta = destino / PASTA
    itens, avisos = [], []
    for arq in sorted(pasta.glob("*.json")) if pasta.exists() else []:
        obj = saida.ler(arq)
        if not _NOME.match(arq.name) or not isinstance(obj, dict) or obj.get("anomes") != arq.stem:
            avisos.append(f"{PASTA}/{arq.name}: arquivo de mês fechado ilegível ou fora do padrão; ignorado no índice")
            continue
        itens.append({"anomes": obj["anomes"], "rotulo": obj.get("rotulo"), "arquivo": f"fechado/{arq.name}",
                      "gerado_em": obj.get("gerado_em"), "fechamento_final": bool(obj.get("fechamento_final"))})
    return itens, avisos
