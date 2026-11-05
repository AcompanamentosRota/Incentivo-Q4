"""
fechado.py — Snapshot do mês fechado: v1/fechado/AAAAMM.json (um arquivo por mês, sem rede).

A API só traz o mês de referência; quando ela vira para o mês novo, os números do mês anterior somem. O painel precisa
deles para o acumulado do trimestre (pontos e gatilho de volume do SV), então o gerador guarda, por rota, a meta e o
realizado de cada produto do mês fechado, e também os totais de cada gerência e da empresa da mesma rodada (os mesmos de
v1/gerencias/*.json e v1/resumo.json), para a aba Estratégicos não precisar somar rotas.

Dois estados (decisão da Karen em 04/11/2026: o fechamento OFICIAL do incentivo é depois do flash de vendas):
  - PRÉVIA (fechamento_final = false): os números ainda podem mudar (notas canceladas e retornadas até o flash, por
    volta do dia 12). Toda rodada com mes_referencia.fechamento = true grava (ou sobrescreve) fechado/<anomes>.json.
  - OFICIAL (fechamento_final = true): o Back Office marcou, pelo botão da Administração do painel, que o flash de
    vendas daquele mês fechou (frontend/ajustes.json -> flashFechado: {"202610": {"fechado": true, "em": "..."}}).
    Na 1ª rodada com o mês marcado e com a hora "em" já passada, o arquivo é selado: fechamento_final = true,
    oficial_em = a hora da rodada e fonte_selo = "flash". Selado, ele nunca mais é sobrescrito nem apagado (para
    reabrir: scripts/reabrir_fechado.py). Nunca se sela por data fixa no código nem pela virada do mês.
  Arquivo selado antes desta regra (pela virada do mês) não tem fonte_selo: no índice ele aparece com
  fonte_selo = "virada" e oficial_em = null.

Formato (compacto; nomes de produto, gerência e supervisor ficam no index.json e nos arquivos do mês):
  {"anomes": "202610", "rotulo": "Outubro/26", "gerado_em": "...", "atualizado_em": "...", "simulado": false,
   "fechamento_final": false, "oficial_em": null, "fonte_selo": null,
   "campos": ["rota", "gerencia", "supervisao", "produtos"], "campos_produto": ["meta", "realizado"],
   "rotas": [["111", "G1", "SV.G1.1", {"sucos": [100.0, 85.0], "refrigerantes": [900.0, 870.5]}]],
   "gerencias": {"G1": {"sucos": [100.0, 85.0]}}, "empresa": {"sucos": [100.0, 85.0]}}
Produto sem meta e sem realizado fica fora do dicionário (na API ele vem "sem_meta").
"""
from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path

from . import saida

PASTA = "v1/fechado"
CAMPOS = ["rota", "gerencia", "supervisao", "produtos"]
CAMPOS_PRODUTO = ["meta", "realizado"]
FONTE_FLASH = "flash"     # selado pelo botão "Flash de vendas de <mês> fechado" (ajustes.json -> flashFechado)
FONTE_VIRADA = "virada"   # selado pela regra antiga (1ª rodada do mês novo), antes de 04/11/2026
_NOME = re.compile(r"^\d{6}\.json$")
_ANOMES = re.compile(r"^\d{4}(0[1-9]|1[0-2])$")


def caminho(anomes: str) -> str:
    return f"{PASTA}/{anomes}.json"


def _pares(produtos: dict) -> dict:
    return {k: [b["meta"], b["realizado"]] for k, b in (produtos or {}).items()
            if b["meta"] is not None or b["realizado"] is not None}


def montar(arquivos: dict[str, dict], gerado_em: str) -> dict:
    """Snapshot do mês de referência a partir da API montada (api.montar) da rodada, em prévia."""
    index = arquivos["v1/index.json"]
    rotas, gerencias = [], {}
    for g in index["gerencias"]:
        arq = arquivos["v1/" + g["arquivo"]]
        gerencias[g["id"]] = _pares(arq.get("produtos"))
        for r in arq["rotas"]:
            rotas.append([r["id"], r["gerencia"], r["supervisao"], _pares(r["produtos"])])
    ref = index["mes_referencia"]
    return {"anomes": ref["anomes"], "rotulo": ref["rotulo"], "gerado_em": gerado_em,
            "atualizado_em": index["atualizado_em"], "simulado": index["simulado"], "fechamento_final": False,
            "oficial_em": None, "fonte_selo": None,
            "campos": CAMPOS, "campos_produto": CAMPOS_PRODUTO, "rotas": rotas,
            "gerencias": gerencias, "empresa": _pares(arquivos["v1/resumo.json"]["empresa"]["produtos"])}


def _somas(linhas: list[dict], k: str, i: int) -> tuple[float, int]:
    valores = [p[k][i] for p in linhas if k in p and p[k][i] is not None]
    return sum(valores), len(valores)


def conferir(snapshot: dict, arquivos: dict[str, dict]) -> list[str]:
    """Confere o snapshot com a rodada de onde ele veio:
      - a soma das rotas, por produto, contra o total da empresa da rodada (resumo.json);
      - o total de cada gerência e o da empresa guardados no snapshot contra os da rodada (gerencias/*.json e
        resumo.json), valor a valor;
      - a soma das rotas de cada gerência contra o total dela, e a soma das gerências contra o da empresa.
    A tolerância das somas é a do arredondamento (1 casa) de cada parcela somada."""
    erros = []
    empresa = arquivos["v1/resumo.json"]["empresa"]["produtos"]
    rotas = [r[3] for r in snapshot["rotas"]]
    for k, b in empresa.items():
        for i, campo in enumerate(CAMPOS_PRODUTO):
            soma, n = _somas(rotas, k, i)
            total = b[campo] or 0.0
            if abs(soma - total) > 0.05 * (n + 1):
                erros.append(f"{k}: {campo} do snapshot {soma:.1f} difere do total da rodada {total:.1f}")
    if "gerencias" not in snapshot or "empresa" not in snapshot:
        return erros + ["snapshot sem os totais por gerência e da empresa"]
    if snapshot["empresa"] != _pares(empresa):
        erros.append("total da empresa do snapshot difere do resumo.json da rodada")
    index = arquivos["v1/index.json"]
    ids = [g["id"] for g in index["gerencias"]]
    if sorted(snapshot["gerencias"]) != sorted(ids):
        erros.append("gerências do snapshot diferem das da rodada")
    for g in index["gerencias"]:
        tot = snapshot["gerencias"].get(g["id"])
        if tot != _pares(arquivos["v1/" + g["arquivo"]].get("produtos")):
            erros.append(f"total da gerência {g['id']} do snapshot difere de {g['arquivo']}")
            continue
        das_rotas = [r[3] for r in snapshot["rotas"] if r[1] == g["id"]]
        for k, par in tot.items():
            for i, campo in enumerate(CAMPOS_PRODUTO):
                soma, n = _somas(das_rotas, k, i)
                if par[i] is not None and abs(soma - par[i]) > 0.05 * (n + 1):
                    erros.append(f"gerência {g['id']}, {k}: {campo} das rotas {soma:.1f} difere do total {par[i]:.1f}")
    for k, par in snapshot["empresa"].items():
        for i, campo in enumerate(CAMPOS_PRODUTO):
            soma, n = _somas(list(snapshot["gerencias"].values()), k, i)
            if par[i] is not None and abs(soma - par[i]) > 0.05 * (n + 1):
                erros.append(f"{k}: {campo} das gerências {soma:.1f} difere do total da empresa {par[i]:.1f}")
    return erros


def _mes_publicado(anterior_index: dict | None) -> str | None:
    return ((anterior_index or {}).get("mes_referencia") or {}).get("anomes")


def _data(texto) -> datetime | None:
    if not isinstance(texto, str):
        return None
    try:
        d = datetime.fromisoformat(texto)
    except ValueError:
        return None
    if d.tzinfo is not None:   # o gerador trabalha na hora de Brasília, sem fuso
        from .calendario import FUSO
        d = d.astimezone(FUSO).replace(tzinfo=None)
    return d


def flash_dos_ajustes(ajustes: dict | None) -> tuple[dict[str, datetime], list[str]]:
    """frontend/ajustes.json -> {anomes: hora em que o flash foi marcado como fechado}, e avisos.
    Chave opcional: arquivo sem ela, ou mês ausente, = flash ainda não fechou. "fechado": false = ainda não fechou.
    Valor inválido vira aviso e aquele mês não é selado."""
    if not isinstance(ajustes, dict) or ajustes.get("flashFechado") is None:
        return {}, []
    bruto = ajustes["flashFechado"]
    if not isinstance(bruto, dict):
        return {}, ["ajustes.json -> flashFechado precisa ser um objeto {AAAAMM: {fechado, em}}: nenhum mês selado"]
    out, avisos = {}, []
    for anomes, v in bruto.items():
        if not _ANOMES.match(str(anomes)) or not isinstance(v, dict) or not isinstance(v.get("fechado"), bool):
            avisos.append(f"ajustes.json -> flashFechado.{anomes}: precisa ser {{\"fechado\": true|false, \"em\": "
                          f"\"AAAA-MM-DDTHH:MM\"}}: não selado")
            continue
        if not v["fechado"]:
            continue
        em = _data(v.get("em"))
        if em is None:
            avisos.append(f"ajustes.json -> flashFechado.{anomes}: data/hora \"em\" inválida: não selado")
            continue
        out[anomes] = em
    return out, avisos


def _selar(destino: Path, item: dict, agora: datetime) -> bool:
    rel = caminho(item["anomes"])
    snap = saida.ler(destino / rel)
    if not isinstance(snap, dict) or snap.get("fechamento_final"):
        return False
    return saida.gravar(destino / rel, {**snap, "fechamento_final": True,
                                        "oficial_em": agora.isoformat(timespec="seconds"), "fonte_selo": FONTE_FLASH})


def atualizar(destino: Path, arquivos: dict[str, dict], gerado_em: str, anterior_index: dict | None = None,
              flash: dict[str, datetime] | None = None, agora: datetime | None = None) -> tuple[list[str], list[str]]:
    """Grava o snapshot em prévia (rodada de fechamento) e sela os meses cujo flash já fechou. Devolve (gravados, avisos).

    `flash` vem de flash_dos_ajustes; None = os ajustes não puderam ser lidos, e então nada é selado. `agora` é a hora da
    rodada (a simulada, com --hoje); um mês só é selado quando a hora marcada no botão já passou.
    Erro de gravação ou de conferência sobe como exceção: quem chama decide (a rodada normal continua)."""
    index = arquivos["v1/index.json"]
    ref = index["mes_referencia"]
    anomes = ref["anomes"]
    agora = agora or datetime.fromisoformat(gerado_em)
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
            if existente and existente.get("reaberto"):   # histórico da migração (scripts/reabrir_fechado.py)
                snap["reaberto"] = existente["reaberto"]
            erros = conferir(snap, arquivos)
            if erros:
                raise ValueError("snapshot não confere com a rodada: " + "; ".join(erros))
            if saida.gravar(destino / rel, snap):
                gravados.append(rel)
    if flash is None:
        return gravados, avisos
    for item in listar(destino)[0]:
        if item["fechamento_final"] or item["anomes"] not in flash:
            continue
        if item["anomes"] > anomes or (item["anomes"] == anomes and not ref["fechamento"]):
            continue   # mês ainda aberto: nunca se sela
        if flash[item["anomes"]] > agora:
            continue   # hora marcada no botão ainda não chegou: continua em prévia
        if _selar(destino, item, agora):
            gravados.append(caminho(item["anomes"]))
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
        final = bool(obj.get("fechamento_final"))
        itens.append({"anomes": obj["anomes"], "rotulo": obj.get("rotulo"), "arquivo": f"fechado/{arq.name}",
                      "gerado_em": obj.get("gerado_em"), "fechamento_final": final,
                      "oficial_em": obj.get("oficial_em") if final else None,
                      "fonte_selo": (obj.get("fonte_selo") or FONTE_VIRADA) if final else None})
    return itens, avisos
