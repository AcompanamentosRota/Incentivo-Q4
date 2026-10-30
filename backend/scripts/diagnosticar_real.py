"""
diagnosticar_real.py — Por que o Real do Total Band da API não bate com o Real do SAC.

SOMENTE LEITURA: lê os JSONs já publicados em api/v1 e, com --datasphere, consulta o modelo sem passar
pelo gerador. Não grava nada em api/ nem em frontend/; o relatório vai para saida/descoberta/real-vs-sac.md
(pasta fora do Git).

Uso (na pasta backend/):
    python scripts/diagnosticar_real.py                        # API publicada + valores do SAC embutidos
    python scripts/diagnosticar_real.py --api ../api/v1        # outra cópia da API
    python scripts/diagnosticar_real.py --sac sac.json         # valores do SAC informados pelo Back Office
    python scripts/diagnosticar_real.py --datasphere           # + consulta direta ao modelo (precisa de .env)

O arquivo de --sac é {"corte": "...", "recorte": "...", "filtros": "...",
                      "produtos": {"<id do produto>": {"real": 1.0, "meta": 2.0}}}.
Produto sem valor fica como "[PREENCHER]" no relatório: o script nunca inventa número do SAC.

Privacidade: o relatório só traz nomes de coluna, códigos de rota/gerência, contagens e totais de volume.
Nomes de clientes, de vendedores e de supervisores nunca entram — `nomes_vazados` confere antes de gravar.
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from gerador import mapeamento as M  # noqa: E402
from gerador.mapeamento import ColMeta as CM  # noqa: E402
from gerador.texto import data as ler_data  # noqa: E402
from gerador.texto import limpar, numero  # noqa: E402

log = logging.getLogger(__name__)

FALTA = "[PREENCHER]"

# Valores do SAC informados pela Karen (Total Band, 30/10/2026, corte 15:20; a API comparada é a de 15:15).
# A leitura de 28/10 (corte 16:07) só trouxe o Real. Troque o conjunto com --sac.
SAC_PADRAO: dict = {
    "corte": "30/10/2026 15:20",
    "recorte": "todas as vendas da Bandeirantes em cada agrupador (Agrupador Produto (Meta SAP) = Todos)",
    "filtros": "story sobre AM_FAT_BND_ANALISE_META; Data (Meta SAP) = 202610; NF_STATUS Acertado, Em Aberto e "
               "Meta Neg; medidas (Realizado) e Meta",
    "produtos": {
        "sucos": {"real": 190439.19, "meta": 260000.07},
        "powerade": {"real": 32449.25, "meta": 40000.01},
        "sabores": {"real": 874176.49, "meta": 1279060.26},
        "retornaveis": {"real": 560914.37, "meta": 687841.39},
        "individuais": {"real": 1048057.35, "meta": 1163507.49},
        "refrigerantes": {"real": 5835552.82, "meta": 7065000.04},
    },
}

# Diferença relativa a partir da qual a divergência deixa de ser compatível com arredondamento.
TOL_RELEVANTE = 0.001          # 0,1%
# Soma das rotas x soma das gerências: a API grava 1 casa decimal por rota, então o erro cresce com o nº de rotas.
TOL_POR_ROTA = 0.05

NOME_CURTO = {"sucos": "Sucos", "powerade": "Powerade", "sabores": "Sabores", "retornaveis": "Retornáveis",
              "individuais": "Refri Single", "refrigerantes": "Refrigerantes"}


# ---------------------------------------------------------------------------
# Leitura da API publicada (sem rede)
# ---------------------------------------------------------------------------
def ler_api(pasta: Path) -> dict:
    """{'index', 'resumo', 'gerencias': {gc: json}, 'rotas': {rota: json}, 'produtos': [ids]}."""
    def ler(nome: str) -> dict:
        return json.loads((Path(pasta) / nome).read_text(encoding="utf-8"))

    index = ler("index.json")
    gerencias = {g["id"]: ler(g["arquivo"]) for g in index.get("gerencias", [])}
    rotas = {p.stem: json.loads(p.read_text(encoding="utf-8"))
             for p in sorted((Path(pasta) / "rotas").glob("*.json"))}
    return {"index": index, "resumo": ler("resumo.json"), "gerencias": gerencias, "rotas": rotas,
            "produtos": [p["id"] for p in index.get("produtos", [])]}


def _campo(bloco: object, campo: str) -> float:
    return float((bloco or {}).get(campo) or 0.0)


def somar(blocos, produtos: list[str], campo: str) -> dict:
    """Soma um campo do bloco de indicador, por produto, numa lista de dicionários `produtos`."""
    total = {k: 0.0 for k in produtos}
    for prods in blocos:
        for k in produtos:
            total[k] += _campo((prods or {}).get(k), campo)
    return total


CAMPOS = ("meta", "realizado", "online_hoje")


def totais_api(api: dict) -> dict:
    """Total Band por produto nos três caminhos que a API oferece: resumo, gerências e rotas."""
    prods = api["produtos"]
    empresa = api["resumo"]["empresa"]["produtos"]
    return {
        "empresa": {c: {k: _campo(empresa.get(k), c) for k in prods} for c in CAMPOS},
        "gerencias": {c: somar([g["produtos"] for g in api["gerencias"].values()], prods, c) for c in CAMPOS},
        "rotas": {c: somar([r["produtos"] for r in api["rotas"].values()], prods, c) for c in CAMPOS},
    }


# ---------------------------------------------------------------------------
# 1. Tabela de diferenças API x SAC
# ---------------------------------------------------------------------------
def tabela_diferencas(totais: dict, sac: dict, produtos: list[str]) -> list[dict]:
    """Uma linha por produto, com Real e Meta da API e do SAC e as diferenças absoluta e relativa."""
    linhas = []
    for k in produtos:
        info = (sac.get("produtos") or {}).get(k) or {}
        linha = {"produto": k}
        for medida, campo in (("real", "realizado"), ("meta", "meta")):
            api_v = totais["empresa"][campo][k]
            sac_v = info.get(medida)
            linha[f"api_{medida}"] = api_v
            linha[f"sac_{medida}"] = sac_v
            linha[f"dif_{medida}"] = None if sac_v is None else api_v - sac_v
            linha[f"dif_{medida}_pct"] = None if not sac_v else (api_v - sac_v) / sac_v
        linhas.append(linha)
    return linhas


def veredito_escopo_ou_medida(linhas: list[dict]) -> tuple[str, str]:
    """('escopo'|'medida'|'ok'|'indeterminado', explicação) — o primeiro corte do diagnóstico.

    Meta divergente -> ESCOPO/FILTRO (rotas, canal, período, unidade). Só o Real divergente ->
    MEDIDA/CORTE/REGRA. Sem a meta do SAC não se separa um do outro.
    """
    com_meta = [l for l in linhas if l["dif_meta_pct"] is not None]
    com_real = [l for l in linhas if l["dif_real_pct"] is not None]
    if not com_real:
        return "indeterminado", "nenhum valor do SAC foi informado."
    nomes = lambda ls: ", ".join(NOME_CURTO.get(l["produto"], l["produto"]) for l in ls) or "nenhum produto"  # noqa: E731
    meta_diverge = [l for l in com_meta if abs(l["dif_meta_pct"]) > TOL_RELEVANTE]
    real_diverge = [l for l in com_real if abs(l["dif_real_pct"]) > TOL_RELEVANTE]
    if not com_meta:
        return "indeterminado", (
            "a meta do SAC não foi informada: sem ela não se distingue ESCOPO/FILTRO de MEDIDA/CORTE/REGRA. "
            f"O Real diverge mais de {TOL_RELEVANTE:.1%} em: {nomes(real_diverge)}.")
    if meta_diverge:
        return "escopo", (f"a META também diverge em {nomes(meta_diverge)}: o problema é de ESCOPO/FILTRO "
                          "(rotas, canal, período, unidade).")
    if real_diverge:
        return "medida", (f"a META bate e só o REAL diverge em {nomes(real_diverge)}: o problema é de "
                          "MEDIDA/CORTE/REGRA.")
    return "ok", f"meta e Real batem dentro de {TOL_RELEVANTE:.1%} em todos os produtos informados."


# ---------------------------------------------------------------------------
# 2. Consistência interna da API
# ---------------------------------------------------------------------------
def achado(nivel: str, texto: str) -> dict:
    """nivel: 'ok', 'alerta' ou 'erro'."""
    return {"nivel": nivel, "texto": texto}


def _somas_batem(api: dict) -> list[dict]:
    totais, out = totais_api(api), []
    limite = TOL_POR_ROTA * max(1, len(api["rotas"]))
    for campo in CAMPOS:
        fora = []
        for k in api["produtos"]:
            emp, ger, rot = (totais[n][campo][k] for n in ("empresa", "gerencias", "rotas"))
            if abs(emp - ger) > limite or abs(ger - rot) > limite:
                fora.append(f"{NOME_CURTO.get(k, k)}: resumo {emp:,.1f} / gerências {ger:,.1f} / rotas {rot:,.1f}")
        if fora:
            out.append(achado("erro", f"`{campo}`: as três somas divergem acima de {limite:,.1f} em "
                                      + "; ".join(fora)))
        else:
            out.append(achado("ok", f"`{campo}`: resumo = soma das gerências = soma das rotas "
                                    f"(diferença abaixo de {limite:,.1f}, o arredondamento de 1 casa por rota)"))
    return out


def consistencia(api: dict) -> list[dict]:
    """Confere a API contra ela mesma: somas, rotas órfãs, duplicadas, produtos e agrupadores."""
    out = _somas_batem(api)

    listadas: dict = defaultdict(list)
    for gc, g in api["gerencias"].items():
        for r in g.get("rotas", []):
            listadas[r["id"]].append(gc)
        citadas = {x for s in g.get("supervisoes", []) for x in s.get("rotas", [])}
        orfas = sorted(citadas - {r["id"] for r in g.get("rotas", [])})
        if orfas:
            out.append(achado("erro", f"{gc}: supervisão cita rota que a gerência não lista: {', '.join(orfas)}"))
    dup = sorted(r for r, gcs in listadas.items() if len(gcs) > 1)
    out.append(achado("erro", f"rotas listadas em mais de uma gerência: {', '.join(dup)}") if dup
               else achado("ok", f"{len(listadas)} rotas listadas, nenhuma em duas gerências"))

    sem_arquivo = sorted(set(listadas) - set(api["rotas"]))
    sem_lista = sorted(set(api["rotas"]) - set(listadas))
    out.append(achado("erro" if sem_arquivo or sem_lista else "ok",
                      f"rotas listadas sem arquivo: {', '.join(sem_arquivo) or 'nenhuma'}; "
                      f"arquivos de rota que nenhuma gerência lista: {', '.join(sem_lista) or 'nenhuma'}"))

    blocos = [api["resumo"]["empresa"]["produtos"]] + [g["produtos"] for g in api["gerencias"].values()]
    faltando = sorted({k for k in api["produtos"] for b in blocos if k not in b})
    out.append(achado("erro", "produtos de index.json ausentes no resumo ou em alguma gerência: "
                              + ", ".join(faltando)) if faltando
               else achado("ok", "todos os produtos de index.json aparecem no resumo e em todas as gerências"))

    out.append(rotas_sem_meta(api))
    out += agrupadores_sobrepostos(api["index"].get("produtos", []))
    out.append(relacao_refrigerantes(totais_api(api)["empresa"]["realizado"]))
    return out


def rotas_sem_meta(api: dict) -> dict:
    """Rota com Real e sem meta num produto: o Real entra nos totais, mas a rota não tem meta no pilar.

    As rotas `eventual` (G1-EV) não têm meta por construção (API.md) e ficam só como informação. Em 28/10/2026
    24 rotas tinham Real de Refri Single sem meta; com a meta carregada, o Refri Single voltou a bater com o SAC.
    """
    normais: dict = defaultdict(dict)
    eventuais: dict = defaultdict(float)
    for rota, r in api["rotas"].items():
        eventual = ((r.get("rota") or {}).get("tipo")) == "eventual"
        for k in api["produtos"]:
            b = (r.get("produtos") or {}).get(k) or {}
            real = _campo(b, "realizado")
            if not real or _campo(b, "meta"):
                continue
            if eventual:
                eventuais[k] += real
            else:
                normais[k][rota] = real
    info = (f"rotas eventuais, sem meta por construção: {_lista(dict(eventuais))} de Real" if eventuais
            else "nenhuma rota eventual com Real")
    if not normais:
        return achado("ok", f"toda rota normal com Real tem meta no produto ({info})")
    return achado("alerta", "rotas com Real e sem meta no produto: " + "; ".join(
        f"{NOME_CURTO.get(k, k)} {len(v)} rotas, {sum(v.values()):,.1f} de Real ({', '.join(sorted(v))})"
        for k, v in sorted(normais.items())) + f". O Real entra nos totais, mas essas rotas não têm meta no "
        f"pilar; confira a META_VOLUME do agrupador no Datasphere ({info}).")


def agrupadores_sobrepostos(produtos: list[dict]) -> list[dict]:
    """O mesmo agrupador em dois produtos faria o item contar em dois pilares."""
    de: dict = defaultdict(list)
    for p in produtos:
        for a in p.get("agrupadores") or []:
            de[a].append(p["id"])
    repetidos = {a: ids for a, ids in de.items() if len(ids) > 1}
    if not repetidos:
        return [achado("ok", f"{len(de)} agrupadores, cada um em um só produto: nenhum item em dois pilares")]
    return [achado("erro", f"o agrupador '{a}' está em dois produtos ({', '.join(ids)}): o mesmo volume entraria "
                           "em dois pilares") for a, ids in sorted(repetidos.items())]


def relacao_refrigerantes(real: dict) -> dict:
    """Refrigerantes é a categoria inteira: tem de ser MAIOR que Retornáveis + Individuais, e nunca a soma deles."""
    ref = real.get("refrigerantes")
    if ref is None or "retornaveis" not in real or "individuais" not in real:
        return achado("alerta", "a API não tem os produtos de refrigerantes para conferir a relação de categoria")
    ri = real["retornaveis"] + real["individuais"]
    soma3 = ri + real.get("sabores", 0.0)
    texto = (f"Refrigerantes {ref:,.1f} x Retornáveis+Individuais {ri:,.1f} (resto da categoria "
             f"{ref - ri:,.1f}); Retornáveis+Individuais+Sabores {soma3:,.1f}")
    if ref < ri:
        return achado("erro", "Refrigerantes é MENOR que Retornáveis + Individuais, o que a categoria não "
                              "permite: " + texto)
    if abs(ref - soma3) <= TOL_RELEVANTE * max(ref, 1.0):
        return achado("alerta", "Refrigerantes é igual a Retornáveis + Individuais + Sabores: conferir se a "
                                "categoria não está sendo somada dos pilares — " + texto)
    return achado("ok", "Refrigerantes contém os demais e não é a soma deles, como diz API.md — " + texto)


# ---------------------------------------------------------------------------
# 3. Consulta direta ao Datasphere (sem passar pelo gerador)
# ---------------------------------------------------------------------------
BUCKET_API = "no escopo da API"
BUCKET_FORA_BASE = "rota fora da base de clientes"
BUCKET_EV = "rota eventual (EV*)"
BUCKET_SEM_ROTA = "rota vazia"
BUCKET_GC = "GC fora das 12"


def classificar_linhas(linhas: list[dict], rotas_api: set[str]) -> tuple[dict, dict, dict]:
    """(por_recorte {recorte: {prod: vol}}, status_fora {NF_STATUS: {prod: vol}}, rotas_fora {recorte: {rota: vol}}).

    Reproduz, sobre as linhas cruas do modelo, o que o gerador inclui no Vol Real e o que ele deixa de fora.
    """
    por_recorte: dict = defaultdict(lambda: defaultdict(float))
    status_fora: dict = defaultdict(lambda: defaultdict(float))
    rotas_fora: dict = defaultdict(lambda: defaultdict(float))
    for l in linhas:
        k = M.produto_do_agrupador(l.get(CM.AGRUPADOR))
        if not k:
            continue
        vol = numero(l.get(CM.VOL_MES))
        if not M.status_nf_real(l.get(CM.NF_STATUS)):
            status_fora[limpar(l.get(CM.NF_STATUS)) or "(vazio)"][k] += vol
            continue
        rota, gc = limpar(l.get(CM.ROTA)).upper(), limpar(l.get(CM.GC))
        if gc not in M.GC_ORIGEM:
            recorte = f"{BUCKET_GC} ({gc or 'vazio'})"
        elif not rota:
            recorte = BUCKET_SEM_ROTA
        elif M.rota_eventual(rota):
            recorte = BUCKET_EV
        elif rota in rotas_api:
            recorte = BUCKET_API
        else:
            recorte = BUCKET_FORA_BASE
        por_recorte[recorte][k] += vol
        if recorte != BUCKET_API:
            rotas_fora[recorte][rota or "(vazia)"] += vol
    return ({b: dict(v) for b, v in por_recorte.items()},
            {s: dict(v) for s, v in status_fora.items()},
            {b: dict(v) for b, v in rotas_fora.items()})


def sobreposicao_real_online(linhas_hoje: list[dict]) -> dict:
    """{prod: (FX_VOL_PADRAO_FAT, FX_VOL_PADRAO_WF_ONLINE)} só das linhas de hoje.

    FAT > 0 em DATA_MOVIMENTO = hoje significa que `realizado` já contém hoje, e então Real + Online conta
    hoje duas vezes (pendência 7 do painel).
    """
    out: dict = defaultdict(lambda: [0.0, 0.0])
    for l in linhas_hoje:
        k = M.produto_do_agrupador(l.get(CM.AGRUPADOR))
        if not k:
            continue
        out[k][0] += numero(l.get(CM.VOL_MES))
        out[k][1] += numero(l.get(CM.VOL_ONLINE))
    return {k: (v[0], v[1]) for k, v in out.items()}


def por_dia(linhas: list[dict]) -> dict:
    """{data ISO: (Vol Real, FX_VOL_PADRAO_FAT fora do Vol Real, FX_VOL_PADRAO_WF_ONLINE)}.

    Mostra se o faturado entra com atraso: dia a dia, `realizado` só aparece até ontem e o volume de hoje
    fica todo em `online_hoje`. É o que prova a regra "Real = até ontem, Online = hoje" sem depender de um
    único dia.
    """
    out: dict = defaultdict(lambda: [0.0, 0.0, 0.0])
    for l in linhas:
        d = ler_data(l.get(CM.DATA))
        if d is None:
            continue
        alvo = out[d.isoformat()]
        alvo[0 if M.status_nf_real(l.get(CM.NF_STATUS)) else 1] += numero(l.get(CM.VOL_MES))
        alvo[2] += numero(l.get(CM.VOL_ONLINE))
    return {d: (v[0], v[1], v[2]) for d, v in sorted(out.items())}


MEDIDAS_CANDIDATAS = ["FX_VOL_PADRAO_FAT", "VL_PADRAO", "FX_CAIXA_FISICA_FAT", "VL_CXF",
                      "FX_VL_FATURAMENTO_REALIZADO"]
COLUNAS_CORTE = ["RETORNO_Nota_Fiscal", "TROCA_Nota_Fiscal", "CANCELAMENTO_Nota_Fiscal",
                 "NF_TIPOOPER_Nota_Fiscal", "FONTE_Nota_Fiscal", "NF_UNID_Nota_Fiscal"]


def somar_por(linhas: list[dict], coluna: str, medida: str, no_vol_real: bool | None = None) -> dict:
    """{valor da coluna: soma da medida}. no_vol_real filtra pelo NF_STATUS do Vol Real (None = todas as linhas)."""
    out: dict = defaultdict(float)
    for l in linhas:
        if no_vol_real is not None and M.status_nf_real(l.get(CM.NF_STATUS)) is not no_vol_real:
            continue
        out[limpar(l.get(coluna)) or "(vazio)"] += numero(l.get(medida))
    return dict(out)


def consultar_datasphere(cons, anomes: str, hoje: date, rotas_api: set[str]) -> dict:
    """Todas as consultas da Fase A, agregadas no servidor. Só leitura; nada é gravado em api/."""
    from gerador import fontes
    from gerador.consulta import e, eq, ou

    obj = M.OBJ_META
    base = e(eq(CM.ANOMES, anomes), ou(CM.AGRUPADOR, M.AGRUPADORES_CONSULTA))
    out: dict = {"anomes": anomes, "hoje": hoje.isoformat()}

    log.info("(a) rota x gerência x agrupador x NF_STATUS")
    linhas = cons.linhas(obj, [CM.ROTA, CM.GC, CM.AGRUPADOR, CM.NF_STATUS, CM.VOL_MES], base)
    out["linhas_rota"] = len(linhas)
    out["recortes"], out["status_fora"], out["rotas_fora"] = classificar_linhas(linhas, rotas_api)

    log.info("(b) agrupador x FONTE x SITUACAO_Pedido")
    fs = cons.linhas(obj, [CM.AGRUPADOR, CM.FONTE, CM.SITUACAO_PEDIDO, CM.VOL_MES, CM.VOL_ONLINE], base)
    out["fonte_situacao"] = {
        f"{limpar(l.get(CM.AGRUPADOR))} / {limpar(l.get(CM.FONTE)) or '(vazio)'} / "
        f"{limpar(l.get(CM.SITUACAO_PEDIDO)) or '(vazio)'}":
        (numero(l.get(CM.VOL_MES)), numero(l.get(CM.VOL_ONLINE))) for l in fs}

    log.info("(c) linhas de hoje: `realizado` x `online_hoje` (pendência 7)")
    out["hoje_fat_online"] = sobreposicao_real_online(
        cons.linhas(obj, [CM.AGRUPADOR, CM.VOL_MES, CM.VOL_ONLINE], e(base, fontes.filtro_hoje(cons, hoje))))

    log.info("(d) faturado x online dia a dia")
    ref = next((p for p in M.PRODUTOS if p["id"] == "refrigerantes"), M.PRODUTOS[0])
    out["agrupador_do_dia"] = ref["agrupadores"][0]
    out["por_dia"] = por_dia(cons.linhas(obj, [CM.DATA, CM.NF_STATUS, CM.VOL_MES, CM.VOL_ONLINE],
                                         e(eq(CM.ANOMES, anomes), eq(CM.AGRUPADOR, out["agrupador_do_dia"]))))

    log.info("(e) medidas candidatas do modelo")
    colunas = set(cons.colunas(obj))
    out["medidas"] = {}
    for medida in MEDIDAS_CANDIDATAS:
        if medida not in colunas:
            out["medidas"][medida] = None
            continue
        out["medidas"][medida] = somar_por(cons.linhas(obj, [CM.AGRUPADOR, CM.NF_STATUS, medida], base),
                                           CM.AGRUPADOR, medida, no_vol_real=True)

    log.info("(f) tipo de documento, devolução, troca, cancelamento e unidade")
    out["corte"] = {}
    for coluna in COLUNAS_CORTE:
        if coluna not in colunas:
            continue
        ls = cons.linhas(obj, [coluna, CM.NF_STATUS, CM.VOL_MES], base)
        out["corte"][coluna] = {"no_vol_real": somar_por(ls, coluna, CM.VOL_MES, no_vol_real=True),
                                "fora": somar_por(ls, coluna, CM.VOL_MES, no_vol_real=False)}
    return out


# ---------------------------------------------------------------------------
# 4. Hipóteses
# ---------------------------------------------------------------------------
CONFIRMADA, DESCARTADA, NAO_TESTAVEL = "confirmada", "descartada", "não testável"
SEM_DS = "não testável nesta rodada: rode com --datasphere na máquina da empresa"

TEXTO_HIPOTESE = {
    "H1": "unidade de medida diferente",
    "H2": "devoluções, bonificação ou cancelamentos tratados diferente do SAC",
    "H3": "filtro de tipo de documento/status ou de unidade diferente",
    "H4": "sobreposição Real x Online (hoje contado duas vezes)",
    "H5": "corte de horário diferente (notas do último dia entrando de madrugada)",
    "H6": "mapeamento de agrupador (itens a mais ou a menos em um pilar)",
    "H7": "rotas ou gerências fora da API que o SAC inclui (ou o contrário)",
    "H8": "a story do SAC usa medida ou filtro diferente do modelo do gerador",
    "H9": "os dois números do SAC não vêm do mesmo recorte ou do mesmo instante",
}


def _lista(d: dict, casas: int = 1) -> str:
    return ", ".join(f"{NOME_CURTO.get(k, k)} {v:,.{casas}f}" for k, v in sorted(d.items())) or "nada"


def _hipoteses_datasphere(ds: dict) -> list[dict]:
    """H1, H2, H3, H4 e H7: as que a consulta direta decide."""
    out = []
    medidas = {k: v for k, v in (ds.get("medidas") or {}).items() if v}
    usada = medidas.get("FX_VOL_PADRAO_FAT") or {}
    iguais = [k for k, v in medidas.items() if k != "FX_VOL_PADRAO_FAT" and usada
              and all(abs(v.get(a, 0.0) - usada.get(a, 0.0)) <= TOL_RELEVANTE * max(abs(usada.get(a, 0.0)), 1.0)
                      for a in usada)]
    # as medidas que sobram são caixa física ou faturamento em R$: ordens de grandeza diferentes
    outras = [k for k in medidas if k != "FX_VOL_PADRAO_FAT" and k not in iguais]
    out.append({"id": "H1", "resultado": DESCARTADA if usada else NAO_TESTAVEL, "evidencia":
                f"no modelo, {', '.join(['FX_VOL_PADRAO_FAT'] + iguais)} dão o mesmo total por agrupador; "
                f"{', '.join(outras) or 'nenhuma outra medida'} são caixa física ou faturamento em R$ e ficam "
                "a ordens de grandeza dos valores do SAC. Soma no Vol Real: "
                + " · ".join(f"`{k}` {_lista(v)}" for k, v in medidas.items())})

    corte = ds.get("corte") or {}
    retorno = corte.get("RETORNO_Nota_Fiscal") or {}
    cancel = corte.get("CANCELAMENTO_Nota_Fiscal") or {}
    out.append({"id": "H2", "resultado": DESCARTADA if retorno else NAO_TESTAVEL, "evidencia":
                "no Vol Real só entram notas com RETORNO='Não', TROCA='Não', CANCELAMENTO='Não' e "
                "FONTE_Nota_Fiscal='NF SAIDA' — nenhuma devolução, troca ou nota cancelada passa. Elas ficam "
                f"nos NF_STATUS excluídos: devolução (RETORNO='Sim') {retorno.get('fora', {}).get('Sim', 0.0):,.1f} "
                f"e cancelada (CANCELAMENTO='Sim') {cancel.get('fora', {}).get('Sim', 0.0):,.1f}. Se o SAC as "
                "incluísse ficaria ACIMA da API, não abaixo. Bonificação não tem coluna própria neste modelo: "
                "depende dos filtros da story (pendente)."})

    tipos = (corte.get("NF_TIPOOPER_Nota_Fiscal") or {}).get("no_vol_real", {})
    unid = (corte.get("NF_UNID_Nota_Fiscal") or {}).get("no_vol_real", {})
    out.append({"id": "H3", "resultado": DESCARTADA if tipos else NAO_TESTAVEL, "evidencia":
                f"tipos de operação no Vol Real: {_lista(tipos)}. Unidades: {len(unid)} filiais, da menor "
                f"({min(unid.values()) if unid else 0:,.1f}) à maior ({max(unid.values()) if unid else 0:,.1f}). "
                "Tirar qualquer tipo de documento ou qualquer unidade mexeria em dezenas de milhares de caixas, "
                "muito acima da diferença medida."})

    hoje = ds.get("hoje_fat_online") or {}
    fat_hoje = sum(v[0] for v in hoje.values())
    dias = ds.get("por_dia") or {}
    com_fat = [d for d, v in dias.items() if v[0] > 0]
    com_online = [d for d, v in dias.items() if v[2] > 0]
    out.append({"id": "H4", "resultado": CONFIRMADA if fat_hoje > 0 else DESCARTADA, "evidencia":
                f"com DATA_MOVIMENTO = {ds['hoje']}: FX_VOL_PADRAO_FAT = "
                + ", ".join(f"{NOME_CURTO.get(k, k)} {v[0]:,.2f}" for k, v in sorted(hoje.items()))
                + "; FX_VOL_PADRAO_WF_ONLINE = "
                + ", ".join(f"{NOME_CURTO.get(k, k)} {v[1]:,.1f}" for k, v in sorted(hoje.items()))
                + ". Dia a dia, o faturado aparece em "
                + (f"{len(com_fat)} dias, de {com_fat[0]} a {com_fat[-1]}" if com_fat else "nenhum dia")
                + " e o online só em " + (", ".join(com_online) if com_online else "nenhum dia")
                + ": `realizado` vai até ontem e `online_hoje` cobre hoje, sem contar hoje duas vezes."})

    resto_ontem = {d: v[2] for d, v in dias.items() if v[0] > 0 and v[2] > 0}
    out.append({"id": "H5", "resultado": NAO_TESTAVEL, "evidencia":
                "um corte só de cada lado não separa horário de medida. Mas o mecanismo existe e está medido: "
                "o faturado do último dia ainda está entrando — "
                + (f"em {', '.join(f'{d} sobram {v:,.1f} de pedido ainda não faturado' for d, v in resto_ontem.items())}"
                   if resto_ontem else "nesta leitura nenhum dia fechado tinha pedido pendente")
                + f" (agrupador `{ds.get('agrupador_do_dia')}`). Enquanto esse resíduo migra para o faturado, "
                  "duas leituras minutos depois uma da outra dão números diferentes na casa das centenas de "
                  "caixas. Para provar, leia os dois no mesmo instante."})

    recortes = ds.get("recortes") or {}
    fora = {b: v for b, v in recortes.items() if b != BUCKET_API}
    rotas_fora = ds.get("rotas_fora") or {}
    out.append({"id": "H7", "resultado": DESCARTADA if recortes else NAO_TESTAVEL, "evidencia":
                f"no escopo da API o modelo dá {_lista(recortes.get(BUCKET_API, {}))}. Fica de fora: "
                + ("; ".join(f"{b} -> {_lista(v)} (rotas {', '.join(sorted(rotas_fora.get(b, {})))})"
                             for b, v in sorted(fora.items())) or "nada")
                + ". Incluir esse volume afastaria a API do SAC em vez de aproximar."})
    return out


def hipoteses(linhas: list[dict], ds: dict | None, agrupadores_ok: bool = True) -> list[dict]:
    """Uma entrada por hipótese: id, texto, resultado e a evidência numérica que o sustenta.

    `agrupadores_ok` vem da consistência interna: False quando um agrupador está em dois produtos da API.
    """
    por_id: dict = {}
    if ds:
        por_id = {h["id"]: h for h in _hipoteses_datasphere(ds)}
    else:
        por_id = {i: {"id": i, "resultado": NAO_TESTAVEL, "evidencia": SEM_DS}
                  for i in ("H1", "H2", "H3", "H4", "H7")}

    por_id.setdefault("H5", {"id": "H5", "resultado": NAO_TESTAVEL, "evidencia":
                             "separar corte de horário de erro de medida exige duas leituras do mesmo instante "
                             "(o `atualizado_em` da API e o corte do SAC). Com um par só de números não se "
                             "prova nem se descarta."})
    por_id["H8"] = {"id": "H8", "resultado": NAO_TESTAVEL, "evidencia":
                    f"os filtros da story do SAC não foram informados ({FALTA}): sem eles não há o que comparar."}

    reais = {l["produto"]: l for l in linhas if l["dif_real"] is not None}
    piores = sorted(reais.values(), key=lambda l: -abs(l["dif_real_pct"] or 0.0))
    if not agrupadores_ok:
        por_id["H6"] = {"id": "H6", "resultado": CONFIRMADA, "evidencia":
                        "a consistência interna achou um agrupador em dois produtos da API: o mesmo volume "
                        "entra em dois pilares (veja a seção 2)."}
    elif len(piores) >= 2:
        pior, resto = piores[0], piores[1:]
        maior_resto = max(abs(l["dif_real_pct"] or 0.0) for l in resto)
        isolado = abs(pior["dif_real_pct"]) > 10 * maior_resto
        por_id["H6"] = {"id": "H6", "resultado": NAO_TESTAVEL, "evidencia":
                        "na API cada agrupador está em um só produto, então não há item contado em dois "
                        "pilares. " + (
                            f"Ainda assim {NOME_CURTO.get(pior['produto'], pior['produto'])} diverge "
                            f"{pior['dif_real_pct']:.4%} enquanto os outros ficam em "
                            + ", ".join(f"{NOME_CURTO.get(l['produto'], l['produto'])} {l['dif_real_pct']:.4%}"
                                        for l in resto)
                            + ": os produtos saem das mesmas linhas, separadas só pelo agrupador, e uma "
                              "divergência isolada assim fica entre o conteúdo do agrupador no Datasphere e o "
                              "recorte da story do SAC. Decidir exige os filtros da story (H8)."
                            if isolado else "Os desvios são da mesma ordem em todos os produtos: nada aponta "
                                            "para um pilar específico.")}
    else:
        por_id["H6"] = {"id": "H6", "resultado": NAO_TESTAVEL, "evidencia":
                        "é preciso o Real do SAC de pelo menos dois produtos para comparar os desvios."}

    ind, ref = reais.get("individuais"), reais.get("refrigerantes")
    if ind and ref and ref["sac_real"] and ref["api_real"]:
        coerente = abs(ind["dif_real"] - ref["dif_real"]) <= max(abs(ref["dif_real"]), 1.0)
        por_id["H9"] = {"id": "H9", "resultado": DESCARTADA if coerente else CONFIRMADA, "evidencia":
                        "Refri Single está dentro da categoria Refrigerantes, então um excesso em Refri Single "
                        "tem de reaparecer em Refrigerantes. Razão Refri Single/Refrigerantes: API "
                        f"{ind['api_real'] / ref['api_real']:.3%}, SAC {ind['sac_real'] / ref['sac_real']:.3%}. "
                        f"Diferença API-SAC: Refri Single {ind['dif_real']:,.2f} x Refrigerantes "
                        f"{ref['dif_real']:,.2f} — "
                        + ("compatíveis entre si." if coerente else
                           "incompatíveis entre si: isso só acontece se os dois valores do SAC tiverem recorte, "
                           "filtro ou instante diferentes.")}
    else:
        por_id["H9"] = {"id": "H9", "resultado": NAO_TESTAVEL, "evidencia":
                        "faltam o Real do SAC de Refri Single e de Refrigerantes."}

    return [{**por_id[i], "texto": TEXTO_HIPOTESE[i]} for i in sorted(TEXTO_HIPOTESE)]


# ---------------------------------------------------------------------------
# 5. Conclusão: impacto nas faixas de pontos e no gatilho
# ---------------------------------------------------------------------------
FAIXAS = (90.0, 100.0, 105.0)
GATILHO_REFRI = 95.0


def pct_painel(bloco: dict) -> float | None:
    """% do painel: (Real + Online) / Meta x 100. Sem meta, None. Não arredonda (a tela trunca)."""
    meta = (bloco or {}).get("meta")
    if not meta:
        return None
    return ((bloco.get("realizado") or 0.0) + (bloco.get("online_hoje") or 0.0)) / meta * 100.0


def na_borda(pcts: list[float], limites, desvio_relativo: float) -> dict:
    """{limite: quantos % cairiam do outro lado se o Real errasse `desvio_relativo`}.

    O % anda `desvio_relativo` do seu próprio valor, então a faixa de risco em volta do limite tem essa
    largura relativa. Vale para qualquer limite (faixas 90/100/105 e gatilho de 95%).
    """
    out = {}
    for limite in limites:
        banda = abs(desvio_relativo) * limite
        out[limite] = sum(1 for p in pcts if abs(p - limite) <= banda)
    return out


def impacto_nas_faixas(api: dict, linhas: list[dict]) -> list[dict]:
    """Por produto: o desvio medido e quantas rotas e gerências estão perto de um limite.

    Conta TODAS as rotas da API com meta — é o teto do impacto. O recorte do incentivo (rotas com canal)
    é menor, então o número real de linhas afetadas só pode ser igual ou menor.
    """
    out = []
    for l in linhas:
        if l["dif_real_pct"] is None:
            continue
        k, desvio = l["produto"], l["dif_real_pct"]
        rotas = [p for p in (pct_painel((r["produtos"] or {}).get(k)) for r in api["rotas"].values())
                 if p is not None]
        gers = [p for p in (pct_painel((g["produtos"] or {}).get(k)) for g in api["gerencias"].values())
                if p is not None]
        limites = FAIXAS + ((GATILHO_REFRI,) if k == "refrigerantes" else ())
        out.append({"produto": k, "desvio": desvio, "rotas_com_meta": len(rotas),
                    "rotas": na_borda(rotas, limites, desvio), "gerencias": na_borda(gers, limites, desvio)})
    return out


def meses_fechados(pasta: Path) -> list[str]:
    """Snapshots de meses fechados em api/v1/fechado/, se existirem."""
    fechado = Path(pasta) / "fechado"
    if not fechado.is_dir():
        return []
    return sorted(p.name for p in fechado.iterdir())


# ---------------------------------------------------------------------------
# 6. Privacidade: nada de nomes na saída
# ---------------------------------------------------------------------------
def nomes_da_api(api: dict) -> set[str]:
    """Nomes de pessoas e de clientes que existem na API e NÃO podem aparecer no relatório.

    Fica de fora o que é curto demais para ser reconhecível e colide com palavra comum ("RESTO", "META"):
    nome de uma palavra entra com 9 letras ou mais, nome composto com 6.
    """
    nomes: set[str] = set()
    for g in api["gerencias"].values():
        nomes |= {s.get("nome") or "" for s in g.get("supervisoes", [])}
        nomes |= {r.get("vendedor") or "" for r in g.get("rotas", [])}
    for r in api["rotas"].values():
        rota = r.get("rota") or {}
        nomes |= {rota.get("vendedor") or "", rota.get("nome_supervisor") or ""}
        nomes |= {c.get("nome") or "" for c in r.get("clientes", [])}
    limpos = {n.strip() for n in nomes}
    return {n for n in limpos if len(n) >= (6 if " " in n else 9)}


def nomes_vazados(texto: str, nomes: set[str]) -> list[str]:
    """Nomes de pessoas ou de clientes que escaparam para o relatório (tem de ser sempre vazio).

    Compara palavra inteira, para não acusar um nome que por acaso é pedaço de outra palavra.
    """
    import re
    alvo = texto.upper()
    return sorted({n for n in nomes if re.search(rf"\b{re.escape(n.upper())}\b", alvo)})


# ---------------------------------------------------------------------------
# Relatório
# ---------------------------------------------------------------------------
def _n(v: float | None, casas: int = 2) -> str:
    return FALTA if v is None else f"{v:,.{casas}f}"


def _pc(v: float | None) -> str:
    return FALTA if v is None else f"{v:.4%}"


def secao_conclusao(linhas: list[dict], hips: list[dict], impactos: list[dict], fechados: list[str]) -> list[str]:
    """Causa mais provável, impacto nas faixas e no gatilho, e quais meses o desvio alcança."""
    por_id = {h["id"]: h for h in hips}
    confirmadas = [h["id"] for h in hips if h["resultado"] == CONFIRMADA]
    descartadas = [h["id"] for h in hips if h["resultado"] == DESCARTADA]
    reais = [l for l in linhas if l["dif_real_pct"] is not None]
    maior = max((abs(l["dif_real_pct"]) for l in reais), default=0.0)
    pequenos = [l for l in reais if abs(l["dif_real_pct"]) <= TOL_RELEVANTE]

    t = ["", "## 5. Conclusão", ""]
    if not reais:
        t.append("Sem valores do SAC não há conclusão possível: a Fase A ficou só na consistência interna.")
    else:
        t += [f"- **Causa mais provável:** nenhuma causa técnica no gerador foi provada. "
              f"Descartadas: {', '.join(descartadas) or 'nenhuma'}. Confirmadas: "
              f"{', '.join(confirmadas) or 'nenhuma'}.",
              f"- {len(pequenos)} de {len(reais)} produtos ficam dentro de {TOL_RELEVANTE:.1%} "
              f"({', '.join(NOME_CURTO.get(l['produto'], l['produto']) for l in pequenos) or 'nenhum'}): "
              "diferença dessa ordem não se separa de corte de horário nem de arredondamento (H5).",
              f"- O maior desvio é {maior:.4%}. " + (
                  "Ele está isolado em um produto e é incompatível com o próprio número de Refrigerantes do SAC "
                  "(H9), então a próxima evidência tem de vir do SAC, não do gerador."
                  if por_id.get("H9", {}).get("resultado") == CONFIRMADA else
                  "Nenhum produto se destaca dos outros.")]
    t += ["", "### Impacto nas faixas de pontos e no gatilho", "",
          "Quantas linhas estão perto o bastante de um limite para mudarem de faixa se o Real errar o desvio "
          "medido. Conta todas as rotas da API com meta: o recorte do incentivo é menor, então o número real "
          "só pode ser igual ou menor. Os pontos não são recalculados aqui.", "",
          "| Pilar | Desvio | Rotas c/ meta | Rotas na borda de 90 / 100 / 105 | Gerências na borda | Gatilho 95% |",
          "|---|---:|---:|---:|---:|---:|"]
    for i in impactos:
        faixas_r = " / ".join(str(i["rotas"][f]) for f in FAIXAS)
        faixas_g = " / ".join(str(i["gerencias"][f]) for f in FAIXAS)
        gat = (f"{i['rotas'].get(GATILHO_REFRI, 0)} rotas, {i['gerencias'].get(GATILHO_REFRI, 0)} gerências"
               if GATILHO_REFRI in i["rotas"] else "—")
        t.append(f"| {NOME_CURTO.get(i['produto'], i['produto'])} | {i['desvio']:.4%} | "
                 f"{i['rotas_com_meta']} | {faixas_r} | {faixas_g} | {gat} |")
    t += ["", "### Meses alcançados", "",
          ("Snapshots de meses fechados em `api/v1/fechado/`: " + ", ".join(fechados) +
           ". Se a causa for do gerador, eles também precisam de decisão (regerar ou manter)." if fechados else
           "Não existe `api/v1/fechado/`: a API tem só o mês corrente, regerado a cada 15 min. Qualquer "
           "correção no gerador vale para o mês corrente na execução seguinte, sem snapshot a reescrever.")]
    return t


def montar_relatorio(api: dict, sac: dict, linhas: list[dict], achados: list[dict], hips: list[dict],
                     ds: dict | None, impactos: list[dict] | None = None,
                     fechados: list[str] | None = None) -> str:
    idx = api["index"]
    veredito, porque = veredito_escopo_ou_medida(linhas)
    marca = {"ok": "ok", "alerta": "ATENÇÃO", "erro": "ERRO"}
    t = [f"# Real do Total Band: API x SAC ({idx['mes_referencia']['rotulo']})", "",
         f"- API lida: `atualizado_em` {idx['atualizado_em']}, `simulado` = {idx['simulado']}, "
         f"{len(api['gerencias'])} gerências, {len(api['rotas'])} rotas, "
         f"{len(api['produtos'])} produtos.",
         f"- Corte informado do SAC: {sac.get('corte') or FALTA}.",
         f"- Recorte \"Total Band\": {sac.get('recorte') or FALTA}.",
         f"- Filtros da story: {sac.get('filtros') or FALTA}.",
         f"- Consulta direta ao Datasphere: {'sim' if ds else 'NÃO (rode com --datasphere)'}.",
         "", "## 1. Tabela de diferenças (Total Band)", "",
         "| Produto | Real API | Real SAC | Dif. | Dif. % | Meta API | Meta SAC | Dif. | Dif. % |",
         "|---|---:|---:|---:|---:|---:|---:|---:|---:|"]
    for l in linhas:
        t.append(f"| {NOME_CURTO.get(l['produto'], l['produto'])} | {_n(l['api_real'])} | {_n(l['sac_real'])} "
                 f"| {_n(l['dif_real'])} | {_pc(l['dif_real_pct'])} | {_n(l['api_meta'], 1)} "
                 f"| {_n(l['sac_meta'])} | {_n(l['dif_meta'])} | {_pc(l['dif_meta_pct'])} |")
    t += ["", f"**Escopo/filtro ou medida/corte/regra:** {veredito.upper()} — {porque}",
          "", "## 2. Consistência interna da API", ""]
    t += [f"- **{marca[a['nivel']]}** — {a['texto']}" for a in achados]

    t += ["", "## 3. Consulta direta ao Datasphere (sem o gerador)", ""]
    if not ds:
        t += ["Não executada nesta rodada. Na máquina da empresa (com `backend/.env`):", "", "```bash",
              "cd backend", "python scripts/diagnosticar_real.py --datasphere", "```"]
    else:
        prods = api["produtos"]
        t += [f"Mês {ds['anomes']}, {ds['linhas_rota']} linhas agregadas de "
              "rota x gerência x agrupador x NF_STATUS.", "",
              "### (a) o que o gerador inclui e o que deixa de fora no Vol Real", "",
              "| Recorte | " + " | ".join(NOME_CURTO.get(k, k) for k in prods) + " |",
              "|---|" + "---:|" * len(prods)]
        for b, v in sorted((ds.get("recortes") or {}).items()):
            t.append(f"| {b} | " + " | ".join(f"{v.get(k, 0.0):,.1f}" for k in prods) + " |")
        for s, v in sorted((ds.get("status_fora") or {}).items()):
            t.append(f"| NF_STATUS fora do Vol Real: {s} | "
                     + " | ".join(f"{v.get(k, 0.0):,.1f}" for k in prods) + " |")
        rotas_fora = ds.get("rotas_fora") or {}
        t += ["", "Rotas de fora, por recorte (só códigos de rota): "
              + ("; ".join(f"**{b}** {', '.join(f'{r} ({x:,.1f})' for r, x in sorted(d.items()))}"
                           for b, d in sorted(rotas_fora.items())) if rotas_fora else "nenhuma"),
              "", "### (b) a medida usada x as outras candidatas (soma no Vol Real)", ""]
        for medida, v in (ds.get("medidas") or {}).items():
            t.append(f"- `{medida}`: " + (_lista(v, 2) if v else "não existe no modelo"))
        t += ["", "### (c) linhas de hoje: `realizado` x `online_hoje`", ""]
        for k, (fat, on) in sorted((ds.get("hoje_fat_online") or {}).items()):
            t.append(f"- {NOME_CURTO.get(k, k)}: `FX_VOL_PADRAO_FAT` {fat:,.2f} · "
                     f"`FX_VOL_PADRAO_WF_ONLINE` {on:,.2f}")
        dias = ds.get("por_dia") or {}
        if dias:
            t += ["", f"### (d) dia a dia, no agrupador `{ds.get('agrupador_do_dia')}`", "",
                  "Prova a regra \"Real = até ontem, Online = hoje\" sem depender de um dia só: o faturado "
                  "aparece nos dias fechados e o volume de hoje fica todo no online.", "",
                  "| DATA_MOVIMENTO | Vol Real | `FX_VOL_PADRAO_FAT` fora do Vol Real | `FX_VOL_PADRAO_WF_ONLINE` |",
                  "|---|---:|---:|---:|"]
            t += [f"| {d} | {v[0]:,.2f} | {v[1]:,.2f} | {v[2]:,.2f} |" for d, v in dias.items()]
        t += ["", "### (e) tipo de documento, devolução, troca, cancelamento e unidade", ""]
        for coluna, v in (ds.get("corte") or {}).items():
            t.append(f"- `{coluna}` — no Vol Real: "
                     + ", ".join(f"{k} {x:,.2f}" for k, x in sorted(v["no_vol_real"].items()))
                     + " | fora: " + (", ".join(f"{k} {x:,.2f}" for k, x in sorted(v["fora"].items())) or "nada"))
        t += ["", "### (f) FONTE x SITUACAO_Pedido", "",
              "| Agrupador / FONTE / SITUACAO | `FX_VOL_PADRAO_FAT` | `FX_VOL_PADRAO_WF_ONLINE` |",
              "|---|---:|---:|"]
        for chave, (fat, on) in sorted((ds.get("fonte_situacao") or {}).items()):
            t.append(f"| {chave} | {fat:,.2f} | {on:,.2f} |")

    t += ["", "## 4. Hipóteses", "", "| # | Hipótese | Resultado | Evidência |", "|---|---|---|---|"]
    t += [f"| {h['id']} | {h['texto']} | **{h['resultado']}** | {h['evidencia']} |" for h in hips]
    t += secao_conclusao(linhas, hips, impactos or [], fechados or [])
    t += ["", "## 6. Pendências para fechar o diagnóstico", "",
          "- **Meta do SAC por produto**: sem ela não se separa escopo/filtro de medida/corte/regra.",
          "- **Story e filtros do SAC**: período, canal, unidade, tipo de documento, devoluções, bonificação e "
          "unidade de medida.",
          "- **Definição de \"Total Band\"**: todas as gerências somadas ou outro recorte.",
          "- **Dois cortes no mesmo instante** (API e SAC) para isolar o horário de leitura.", ""]
    return "\n".join(t) + "\n"


# ---------------------------------------------------------------------------
def main() -> int:
    from odata.config import PASTA_SAIDA, RAIZ_PROJETO
    from odata.log import configurar_log

    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--api", help="pasta da API publicada (padrão: ../api/v1)")
    ap.add_argument("--sac", help="JSON com os valores do SAC (formato no cabeçalho do arquivo)")
    ap.add_argument("--datasphere", action="store_true", help="também consulta o modelo direto (precisa de .env)")
    ap.add_argument("--anomes", help="AAAAMM da consulta direta (padrão: o mês de referência da API)")
    ap.add_argument("--saida", help="arquivo do relatório (padrão: saida/descoberta/real-vs-sac.md)")
    args = ap.parse_args()
    registro = configurar_log("diagnosticar_real")

    pasta = Path(args.api) if args.api else RAIZ_PROJETO.parent / "api" / "v1"
    api = ler_api(pasta)
    registro.info("API de %s: %d gerências, %d rotas, %d produtos", api["index"]["atualizado_em"],
                  len(api["gerencias"]), len(api["rotas"]), len(api["produtos"]))
    sac = json.loads(Path(args.sac).read_text(encoding="utf-8")) if args.sac else SAC_PADRAO

    linhas = tabela_diferencas(totais_api(api), sac, api["produtos"])
    veredito, porque = veredito_escopo_ou_medida(linhas)
    registro.info("Veredito do primeiro corte: %s — %s", veredito.upper(), porque)
    achados = consistencia(api)
    for a in achados:
        {"erro": registro.error, "alerta": registro.warning}.get(a["nivel"], registro.info)(a["texto"])

    ds = None
    if args.datasphere:
        from gerador.consulta import Consulta
        from odata.config import carregar_config
        anomes = args.anomes or api["index"]["mes_referencia"]["anomes"]
        hoje = date.fromisoformat(api["index"]["calendario"]["hoje"])
        if anomes != hoje.strftime("%Y%m"):
            registro.warning("--anomes %s não é o mês de `calendario.hoje` (%s): a conferência das linhas de "
                             "hoje sai zerada.", anomes, hoje)
        ds = consultar_datasphere(Consulta(carregar_config()), anomes, hoje, set(api["rotas"]))

    hips = hipoteses(linhas, ds, agrupadores_ok=all(a["nivel"] == "ok" for a in
                                                    agrupadores_sobrepostos(api["index"].get("produtos", []))))
    texto = montar_relatorio(api, sac, linhas, achados, hips, ds,
                             impactos=impacto_nas_faixas(api, linhas), fechados=meses_fechados(pasta))
    vazados = nomes_vazados(texto, nomes_da_api(api))
    if vazados:
        registro.error("Relatório NÃO gravado: %d nome(s) de cliente ou de pessoa apareceriam na saída.",
                       len(vazados))
        return 1

    destino = Path(args.saida) if args.saida else PASTA_SAIDA / "descoberta" / "real-vs-sac.md"
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(texto, encoding="utf-8")
    print(texto)
    registro.info("Relatório: %s", destino)
    return 0


if __name__ == "__main__":
    sys.exit(main())
