"""
fechado.py — Snapshot do mês fechado: v1/fechado/AAAAMM.json (um arquivo por mês, sem rede).

A API só traz o mês de referência; quando ela vira para o mês novo, os números do mês anterior somem. O painel precisa
deles para o acumulado do trimestre (pontos e gatilho de volume do SV), então o gerador guarda, por rota, a meta e o
realizado de cada produto do mês fechado, mais os totais por gerência e o total da empresa daquela rodada.

Um mês fechado tem DOIS estados (decisão informada pela Karen em 04/11/2026):

  - `fechamento_final: false` -> PRÉVIA: os números ainda podem mudar (notas fiscais canceladas e retornadas até o
    fechamento do FLASH DE VENDAS, em torno do dia 12). O arquivo continua sendo regravado a cada rodada: no período
    de fechamento da API, com o mês de referência; depois da virada, pela consulta do mês passado (scripts/gerar.py).
  - `fechamento_final: true` -> OFICIAL: só depois do flash. Aí sim o arquivo nunca mais é sobrescrito nem apagado,
    e `oficial_em` guarda a data/hora do selo e `fonte_selo` como ele foi selado ("flash").

Quem sela é o Back Office, por um botão da Administração do painel que grava `flashFechado` no frontend/ajustes.json
(`flash_dos_ajustes`). NUNCA se sela por data nem por dia fixo no código: a data do flash varia todo mês.

Formato (compacto; nomes de produto, gerência e supervisor ficam no index.json e nos arquivos do mês):
  {"anomes": "202610", "rotulo": "Outubro/26", "gerado_em": "...", "atualizado_em": "...", "simulado": false,
   "fechamento_final": true, "oficial_em": "2026-11-12T14:30:00", "fonte_selo": "flash",
   "campos": ["rota", "gerencia", "supervisao", "produtos", "cobertura"], "campos_produto": ["meta", "realizado"],
   "totais": {"empresa": {"sucos": [1000.0, 850.0]}, "gerencias": {"G1": {"sucos": [100.0, 85.0]}}},
   "totais_cobertura": {"empresa": {"skyy": [1200.0, 980]}, "gerencias": {"G1": {"skyy": [90.0, 75]}}},
   "rotas": [["111", "G1", "SV.G1.1", {"sucos": [100.0, 85.0], "refrigerantes": [900.0, 870.5]},
              {"sucos": [None, 12], "skyy": [8.0, 6]}]]}
Produto sem meta e sem realizado fica fora do dicionário (na API ele vem "sem_meta"). Os totais são os mesmos que a
rodada montou em v1/gerencias/*.json e v1/resumo.json: a aba Estratégicos é por gerência, e somar as rotas do snapshot
não daria o mesmo número (rota sem canal, arredondamento por rota).

Cobertura (desde 11/2026; pendência 10 do Campari Club): igual ao volume, com o bloco `cobertura` de cada produto da API
— coluna `cobertura` de cada rota e `totais_cobertura` (empresa e gerências), os dois em [meta, realizado]; meta `None` =
sem meta de cobertura. Rodada sem cobertura (colunas ausentes no modelo): a coluna vem `None` e `totais_cobertura` também.
Snapshots gravados antes não têm a coluna nem `totais_cobertura`.
"""
from __future__ import annotations

import re
from pathlib import Path

from . import saida

PASTA = "v1/fechado"
CAMPOS = ["rota", "gerencia", "supervisao", "produtos", "cobertura"]
CAMPOS_PRODUTO = ["meta", "realizado"]
FONTE_FLASH = "flash"
_NOME = re.compile(r"^\d{6}\.json$")
_ANOMES = re.compile(r"^\d{6}$")


def caminho(anomes: str) -> str:
    return f"{PASTA}/{anomes}.json"


def _pares(produtos: dict, cobertura: bool = False) -> dict[str, list]:
    """Bloco de produtos da API -> {produto: [meta, realizado]}, sem os produtos sem meta e sem realizado.
    `cobertura`: os mesmos pares, do bloco `cobertura` de cada produto (produto sem o bloco fica fora)."""
    blocos = {k: b.get("cobertura") if cobertura else b for k, b in produtos.items()}
    return {k: [b["meta"], b["realizado"]] for k, b in blocos.items()
            if b is not None and (b["meta"] is not None or b["realizado"] is not None)}


def _tem_cobertura(arquivos: dict[str, dict]) -> bool:
    """A rodada trouxe cobertura (na API, o bloco `cobertura` vem null em todos os produtos quando ela falta)."""
    return any(b.get("cobertura") is not None for b in arquivos["v1/resumo.json"]["empresa"]["produtos"].values())


def montar(arquivos: dict[str, dict], gerado_em: str) -> dict:
    """Snapshot do mês de referência a partir da API montada (api.montar) da rodada."""
    index = arquivos["v1/index.json"]
    cob = _tem_cobertura(arquivos)
    rotas, gerencias, gerencias_cob = [], {}, {}
    for g in index["gerencias"]:
        arq = arquivos["v1/" + g["arquivo"]]
        gerencias[g["id"]] = _pares(arq["produtos"])
        gerencias_cob[g["id"]] = _pares(arq["produtos"], cobertura=True)
        for r in arq["rotas"]:
            rotas.append([r["id"], r["gerencia"], r["supervisao"], _pares(r["produtos"]),
                          _pares(r["produtos"], cobertura=True) if cob else None])
    ref = index["mes_referencia"]
    empresa = arquivos["v1/resumo.json"]["empresa"]["produtos"]
    return {"anomes": ref["anomes"], "rotulo": ref["rotulo"], "gerado_em": gerado_em,
            "atualizado_em": index["atualizado_em"], "simulado": index["simulado"], "fechamento_final": False,
            "oficial_em": None, "fonte_selo": None,
            "campos": CAMPOS, "campos_produto": CAMPOS_PRODUTO,
            "totais": {"empresa": _pares(empresa), "gerencias": gerencias},
            "totais_cobertura": {"empresa": _pares(empresa, cobertura=True), "gerencias": gerencias_cob} if cob else None,
            "rotas": rotas}


def _conferir_totais(guardado: dict, da_rodada: dict, onde: str, cobertura: bool = False) -> list[str]:
    """Totais guardados no snapshot contra os da rodada: são os mesmos números, então a diferença tem de ser zero."""
    erros = []
    esperado = _pares(da_rodada, cobertura)
    for k in sorted(set(guardado) | set(esperado)):
        if k not in guardado or k not in esperado:
            erros.append(f"{onde}: produto {k} só está {'no snapshot' if k in guardado else 'na rodada'}")
            continue
        for i, campo in enumerate(CAMPOS_PRODUTO):
            a, b = guardado[k][i], esperado[k][i]
            if (a is None) != (b is None) or (a is not None and abs(a - b) > 0.001):
                erros.append(f"{onde}: {campo} de {k} no snapshot {a} difere da rodada {b}")
    return erros


def _conferir_parte(snapshot: dict, arquivos: dict[str, dict], cobertura: bool) -> list[str]:
    """Volume (coluna `produtos` e `totais`) ou cobertura (coluna `cobertura` e `totais_cobertura`): pares de cada
    produto somados nas rotas contra o total da empresa da rodada e, exatos, os totais guardados contra os da rodada."""
    erros = []
    col = CAMPOS.index("cobertura" if cobertura else "produtos")
    rotulo, chave_totais = ("cobertura de ", "totais_cobertura") if cobertura else ("", "totais")
    empresa = arquivos["v1/resumo.json"]["empresa"]["produtos"]
    for k, b in empresa.items():
        b = b.get("cobertura") if cobertura else b
        if b is None:
            continue
        for i, campo in enumerate(CAMPOS_PRODUTO):
            valores = [r[col][k][i] for r in snapshot["rotas"]
                       if len(r) > col and r[col] and k in r[col] and r[col][k][i] is not None]
            soma, total = sum(valores), b[campo] or 0.0
            if abs(soma - total) > 0.05 * (len(valores) + 1):
                erros.append(f"{rotulo}{k}: {campo} do snapshot {soma:.1f} difere do total da rodada {total:.1f}")
    totais = snapshot.get(chave_totais)
    if not isinstance(totais, dict):
        return erros + [f"snapshot sem os {chave_totais} por gerência e da empresa"]
    erros += _conferir_totais(totais.get("empresa") or {}, empresa, f"{rotulo}total da empresa", cobertura)
    guardadas = totais.get("gerencias") or {}
    for g in arquivos["v1/index.json"]["gerencias"]:
        if g["id"] not in guardadas:
            erros.append(f"{rotulo}total da gerência {g['id']}: não está no snapshot")
            continue
        erros += _conferir_totais(guardadas[g["id"]], arquivos["v1/" + g["arquivo"]]["produtos"],
                                  f"{rotulo}total da gerência {g['id']}", cobertura)
    for gc in sorted(set(guardadas) - {g["id"] for g in arquivos["v1/index.json"]["gerencias"]}):
        erros.append(f"{rotulo}total da gerência {gc}: está no snapshot e não na rodada")
    return erros


def conferir(snapshot: dict, arquivos: dict[str, dict]) -> list[str]:
    """Meta e realizado de cada produto, somados nas rotas do snapshot, contra o total da empresa da rodada (a
    tolerância é a do arredondamento de 1 casa de cada rota somada) e, exatos, os totais por gerência e da empresa
    guardados no snapshot contra os da rodada. O mesmo para a cobertura, quando a rodada a trouxe."""
    erros = _conferir_parte(snapshot, arquivos, cobertura=False)
    if _tem_cobertura(arquivos):
        erros += _conferir_parte(snapshot, arquivos, cobertura=True)
    elif snapshot.get("totais_cobertura") is not None:
        erros.append("snapshot com totais_cobertura, mas a rodada não trouxe cobertura")
    return erros


def flash_dos_ajustes(ajustes: dict | None) -> tuple[dict[str, str | None], list[str]]:
    """frontend/ajustes.json -> ({anomes: data/hora do selo ou None}, avisos) dos meses que o Back Office marcou como
    fechados no flash de vendas. Campo opcional e retrocompatível: arquivo sem `flashFechado` não sela nada."""
    bruto = (ajustes or {}).get("flashFechado")
    if bruto is None:
        return {}, []
    if not isinstance(bruto, dict):
        return {}, ["flashFechado dos ajustes do painel: precisa ser um objeto {anomes: {fechado, em}}; ignorado"]
    out: dict[str, str | None] = {}
    avisos = []
    for mes, v in sorted(bruto.items()):
        if not (isinstance(mes, str) and _ANOMES.match(mes)) or not isinstance(v, dict):
            avisos.append(f"flashFechado[{mes!r}]: mês ou valor fora do formato {{fechado, em}}; ignorado")
            continue
        if v.get("fechado") is not True:
            continue
        em = v.get("em")
        out[mes] = em.strip() if isinstance(em, str) and em.strip() else None
    return out, avisos


def _mes_publicado(anterior_index: dict | None) -> str | None:
    return ((anterior_index or {}).get("mes_referencia") or {}).get("anomes")


PREVIAS_MAX = 3


def em_previa(destino: Path, anomes_ref: str, limite: int = PREVIAS_MAX) -> list[str]:
    """Meses anteriores ao de referência que ainda estão em prévia (a regravar a cada rodada), do mais antigo para o
    mais novo. No máximo `limite` meses: um mês que ninguém selou não pode fazer a rodada crescer sem fim."""
    previas = [i["anomes"] for i in listar(destino)[0] if i["anomes"] < anomes_ref and not i["fechamento_final"]]
    return previas[-limite:] if limite else previas


def _anterior_do_snapshot(snap: dict | None) -> tuple[dict | None, dict | None]:
    """Snapshot em prévia -> (resumo, index) no formato que validacao.validar compara, para a regravação de um mês
    passado passar pelas mesmas travas da rodada normal (queda brusca do realizado, gerência que sumiu).
    Snapshot sem os totais (gravado antes de 11/2026) não dá base de comparação: devolve (None, None)."""
    totais = (snap or {}).get("totais")
    if not isinstance(totais, dict) or not isinstance(totais.get("empresa"), dict):
        return None, None
    pos = {c: n for n, c in enumerate(snap.get("campos_produto") or CAMPOS_PRODUTO)}
    resumo = {"empresa": {"produtos": {k: {c: v[n] for c, n in pos.items()} for k, v in totais["empresa"].items()}}}
    index = {"simulado": bool(snap.get("simulado")), "mes_referencia": {"anomes": snap.get("anomes")},
             "gerencias": [{"id": g} for g in (totais.get("gerencias") or {})]}
    return resumo, index


def regravar(destino: Path, anomes: str, arquivos: dict[str, dict], gerado_em: str) -> tuple[list[str], list[str]]:
    """Regrava o snapshot de um mês em prévia com os dados de uma nova consulta daquele mês (mesma montagem, mesma
    conferência e as mesmas travas de validação da rodada normal). Mês já selado não é tocado."""
    from . import validacao

    rel = caminho(anomes)
    existente = saida.ler(destino / rel)
    if existente and existente.get("fechamento_final"):
        return [], [f"{rel} já está selado (fechamento_final): não foi regravado"]
    ref = arquivos["v1/index.json"]["mes_referencia"]
    if ref["anomes"] != anomes or not ref.get("fechamento"):
        return [], [f"{rel} não foi regravado: a consulta veio em {ref['anomes']} "
                    f"(fechamento = {bool(ref.get('fechamento'))})"]
    snap = montar(arquivos, gerado_em)
    erros = conferir(snap, arquivos) + validacao.validar(arquivos, *_anterior_do_snapshot(existente))[0]
    if erros:
        raise ValueError(f"snapshot de {anomes} não confere com a consulta: " + "; ".join(erros))
    return ([rel] if saida.gravar(destino / rel, snap) else []), []


def selar(destino: Path, flash: dict[str, str | None] | None, gerado_em: str) -> tuple[list[str], list[str]]:
    """Sela (fechamento_final, oficial_em, fonte_selo) os meses em prévia marcados como fechados no flash de vendas.
    `flash = None` (ajustes do painel ilegíveis) não sela nada. Mês já selado não é tocado."""
    gravados, avisos = [], []
    if flash is None:
        return gravados, avisos
    itens = {i["anomes"]: i for i in listar(destino)[0]}
    for mes, em in sorted(flash.items()):
        rel = caminho(mes)
        if mes not in itens:
            avisos.append(f"flash de {mes} marcado como fechado, mas não existe {rel}: nada foi selado")
            continue
        if itens[mes]["fechamento_final"]:
            continue
        snap = saida.ler(destino / rel)
        if not isinstance(snap, dict):
            avisos.append(f"{rel} ilegível: não foi selado")
            continue
        if saida.gravar(destino / rel, {**snap, "fechamento_final": True, "oficial_em": em or gerado_em,
                                        "fonte_selo": FONTE_FLASH}):
            gravados.append(rel)
    return gravados, avisos


def atualizar(destino: Path, arquivos: dict[str, dict], gerado_em: str, anterior_index: dict | None = None,
              flash: dict[str, str | None] | None = None) -> tuple[list[str], list[str]]:
    """Grava o snapshot do mês em fechamento e sela os meses marcados no flash. Devolve (gravados, avisos).
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
    g, a = selar(destino, flash, gerado_em)
    return gravados + g, avisos + a


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
                      "gerado_em": obj.get("gerado_em"), "fechamento_final": bool(obj.get("fechamento_final")),
                      "oficial_em": obj.get("oficial_em"), "fonte_selo": obj.get("fonte_selo")})
    return itens, avisos
