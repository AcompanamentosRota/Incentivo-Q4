"""
missoes.py — Missões Guiadas pelo CRUZAMENTO entre a base de elegíveis e a cobertura por cliente x produto.

Decisão informada pela Karen em 17/11/2026 (documento de regras, seção 4). O realizado do pilar deixa de sair do
AM_FAT_BND_GM_PROGRESSO_TAREFA e passa a sair do AM_FAT_BND_ANALISE_META, pela cobertura: a PRIMEIRA compra do
produto pelo cliente no mês marca a missão; compras seguintes não contam de novo. É a mesma conta por outro
caminho — a conferência da IM em 17/11/2026 reproduziu o missoes.json da fonte antiga exatamente (1.127
realizações em 209 rotas, zero divergências) — e, de quebra, o pilar ganha o **Online (hoje)**, que a fonte
antiga não enxerga.

A base de elegíveis
-------------------
Ela é MONTADA À MÃO todo mês (informado pela Karen em 18/11/2026): não existe em modelo nenhum do Datasphere.
Mora em `backend/dados/missoes/AAAAMM.csv`, DENTRO do repositório e FORA de `frontend/` e de `api/v1/` — o
arquivo tem código de cliente e o site é público. Entra por PR comum. **Nada dela é publicado na API**: do
arquivo saem só contagens por rota.

Formato (o menor passo manual possível): CSV UTF-8, separador `;`, cabeçalho e três colunas —
`missao;cod_produto;cod_cliente`. A chave é a concatenação das três; o resto o gerador descobre.

Sem a base do mês o pilar fica "sem dados" (P6): não pontua, não vira zero e não repete o número do mês
anterior. O gerador grava um `missoes.json` sem missões, com a razão, e o painel avisa.

Duas rotas, de propósito (decisão da Karen em 18/11/2026)
---------------------------------------------------------
- A **realização** vai para a **rota da chave da meta** (`CD_ROTA_Chave_Meta_SAP`), o mesmo critério do Real
  desde o PR 63.
- O **elegível** é contado na **rota do cliente** (cadastro da base de clientes): um par elegível sem venda
  nenhuma não tem chave de meta, logo não teria rota.

Por isso a contagem publicada chama-se `elegiveis_rota_cliente` e **não é denominador de nada**: a meta do
pilar é 10 por rota, fixa, e vem da configuração do painel. Como as duas rotas podem divergir, uma rota pode
receber mais realizações do que tem elegíveis; isso é **alerta** (`acima_dos_elegiveis`, que nomeia as duas
rotas), nunca erro. O invariante que vale sempre é outro, e este módulo o confere:

    soma de `rotas` + soma de `rotas_online` de TODAS as rotas == pares elegíveis cobertos no mês

Conferência de transição
------------------------
Enquanto `COMPARAR_COM_PROGRESSO_TAREFA` estiver ligado, a rodada consulta também a fonte antiga e compara rota
a rota. Divergência vira aviso (nunca derruba a rodada). A Karen desliga isto depois de novembro e dezembro.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from .texto import inteiro, limpar, normalizar

# ---------------------------------------------------------------------------
# Configuração (nunca no meio da lógica)
# ---------------------------------------------------------------------------
# Pasta da base de elegíveis, montada à mão todo mês e versionada por PR. Fora de frontend/ e de api/v1/.
PASTA_BASE = Path(__file__).resolve().parent.parent / "dados" / "missoes"
# Rede de segurança da transição: consulta a fonte antiga e compara rota a rota, a cada rodada.
# Desligar depois de novembro e dezembro/2026 (decisão da Karen).
COMPARAR_COM_PROGRESSO_TAREFA = True

SEPARADOR = ";"
COLUNAS = ("missao", "cod_produto", "cod_cliente")

# Motivos de linha ignorada (texto curto, vai para o log e para o missoes.json)
SEM_MISSAO = "missão em branco"
SEM_PRODUTO = "código de produto em branco"
SEM_CLIENTE = "código de cliente em branco ou não numérico"
REPETIDA = "chave repetida"
FORA_DO_MES = "missão fora das que contam no mês"
CLIENTE_FORA = "cliente fora do cadastro da base"


@dataclass(frozen=True)
class Base:
    """Base de elegíveis de um mês, já conferida. `pares` são as linhas que entraram."""
    anomes: str
    arquivo: str                      # só o nome do arquivo (nunca o caminho da máquina)
    pares: tuple[tuple[str, str, int], ...] = ()     # (missão, código do produto, código do cliente)
    linhas: int = 0                   # linhas de dado lidas do arquivo (sem o cabeçalho)
    ignoradas: dict[str, int] = field(default_factory=dict)
    erro: str | None = None           # preenchido quando a base não pôde ser usada (pilar "sem dados")

    @property
    def ok(self) -> bool:
        return self.erro is None and bool(self.pares)

    @property
    def total_ignoradas(self) -> int:
        return sum(self.ignoradas.values())

    @property
    def produtos(self) -> list[str]:
        """Códigos de produto distintos, em ordem: é o $filter da consulta da cobertura."""
        return sorted({p for _, p, _ in self.pares})

    @property
    def missoes(self) -> list[str]:
        return sorted({m for m, _, _ in self.pares}, key=normalizar)


def _conta(d: dict, chave: str) -> None:
    d[chave] = d.get(chave, 0) + 1


def ler_base(texto: str, anomes: str, arquivo: str, contam: list[str] | None = None) -> Base:
    """Lê e confere o CSV da base (função pura: recebe o texto, não o arquivo).

    `contam`: nomes das missões que contam no mês (do painel). None = sem filtro — o gerador publica o que a
    base traz e quem escolhe o mês continua sendo quem consome (contrato do missoes.json). Linha fora da lista,
    repetida ou com campo em branco é IGNORADA com aviso, sem derrubar o resto.
    """
    linhas = [l for l in texto.replace("\r\n", "\n").replace("\r", "\n").split("\n") if l.strip()]
    if not linhas:
        return Base(anomes, arquivo, erro="arquivo vazio")
    cabecalho = [normalizar(c) for c in linhas[0].split(SEPARADOR)]
    faltando = [c for c in COLUNAS if normalizar(c) not in cabecalho]
    if faltando:
        return Base(anomes, arquivo, erro=f"cabeçalho sem a(s) coluna(s): {', '.join(faltando)}")
    pos = {c: cabecalho.index(normalizar(c)) for c in COLUNAS}
    alvo = {normalizar(n) for n in contam} if contam else None

    pares: list[tuple[str, str, int]] = []
    vistos: set[tuple[str, str, int]] = set()
    ignoradas: dict[str, int] = {}
    for linha in linhas[1:]:
        campos = linha.split(SEPARADOR)
        if len(campos) <= max(pos.values()):
            _conta(ignoradas, "linha com menos colunas que o cabeçalho")
            continue
        missao = limpar(campos[pos["missao"]])
        produto = limpar(campos[pos["cod_produto"]])
        cliente = inteiro(campos[pos["cod_cliente"]])
        if not missao:
            _conta(ignoradas, SEM_MISSAO)
        elif not produto:
            _conta(ignoradas, SEM_PRODUTO)
        elif cliente is None:
            _conta(ignoradas, SEM_CLIENTE)
        elif alvo is not None and normalizar(missao) not in alvo:
            _conta(ignoradas, FORA_DO_MES)
        elif (chave := (normalizar(missao), produto, cliente)) in vistos:
            _conta(ignoradas, REPETIDA)
        else:
            vistos.add(chave)
            pares.append((missao, produto, cliente))
    erro = None if pares else "nenhuma linha válida na base"
    return Base(anomes, arquivo, tuple(pares), len(linhas) - 1, ignoradas, erro)


def carregar_base(anomes: str, pasta: Path | None = None, contam: list[str] | None = None) -> Base:
    """A base do mês em `<pasta>/AAAAMM.csv`. Arquivo ausente ou ilegível: Base com `erro` (pilar "sem dados")."""
    arquivo = (pasta or PASTA_BASE) / f"{anomes}.csv"
    if not arquivo.exists():
        return Base(anomes, arquivo.name, erro="base de elegíveis do mês não publicada")
    try:
        texto = arquivo.read_text(encoding="utf-8-sig")
    except (OSError, UnicodeDecodeError) as erro:
        return Base(anomes, arquivo.name, erro=f"base ilegível ({erro})")
    return ler_base(texto, anomes, arquivo.name, contam)


# ---------------------------------------------------------------------------
# Cruzamento
# ---------------------------------------------------------------------------
def cruzar(base: Base, cobertura: dict[tuple[int, str], tuple[str, bool]],
           rota_do_cliente: dict[int, str]) -> tuple[list[dict], list[str], list[dict]]:
    """Cruza a base com a cobertura do mês. Função pura.

    `cobertura`: {(cliente, código do produto): (rota da META, coberto só hoje?)} — de
    fontes.carregar_cobertura_missoes. Um par aparece UMA vez: ou no realizado (até ontem) ou no online (hoje).
    `rota_do_cliente`: {cliente: rota} do cadastro (Dados.clientes). Cliente fora dele é ignorado, com aviso.

    Devolve (missões, avisos, acima_dos_elegiveis). Cada missão:
      {"nome", "rotas" (realizado por rota da meta), "rotas_online", "elegiveis_rota_cliente",
       "realizado", "realizado_online", "elegiveis"}
    Rota com elegíveis e nenhuma realização entra em `rotas` com 0 (participa sem nada feito); rota que não
    aparece em lugar nenhum fica DE FORA (realizado nulo para ela: "sem dados", nunca zero).
    """
    por_missao: dict[str, dict] = {}
    avisos: list[str] = []
    ignoradas: dict[str, int] = {}
    for missao, produto, cliente in base.pares:
        rota_cliente = rota_do_cliente.get(cliente)
        if not rota_cliente:
            _conta(ignoradas, CLIENTE_FORA)
            continue
        m = por_missao.setdefault(normalizar(missao), {
            "nome": missao, "codigo": None, "rotas": {}, "rotas_online": {},
            "elegiveis_rota_cliente": {}, "_cruzou": {}})
        _conta(m["elegiveis_rota_cliente"], rota_cliente)
        m["rotas"].setdefault(rota_cliente, 0)      # rota com elegível participa, mesmo sem realização
        cob = cobertura.get((cliente, produto))
        if cob is None:
            continue
        rota_meta, hoje = cob
        _conta(m["rotas_online"] if hoje else m["rotas"], rota_meta)
        m["rotas"].setdefault(rota_meta, 0)    # rota que só tem online fica com realizado 0, nunca ausente
        if rota_meta != rota_cliente:
            m["_cruzou"].setdefault(rota_meta, {})
            _conta(m["_cruzou"][rota_meta], rota_cliente)

    for motivo, n in sorted(ignoradas.items()):
        avisos.append(f"Missões Guiadas: {n} linha(s) da base ignorada(s) ({motivo})")

    missoes, acima = [], []
    for chave in sorted(por_missao):
        m = por_missao[chave]
        cruzou = m.pop("_cruzou")
        m["realizado"] = sum(m["rotas"].values())
        m["realizado_online"] = sum(m["rotas_online"].values())
        m["elegiveis"] = sum(m["elegiveis_rota_cliente"].values())
        for rota in sorted(set(m["rotas"]) | set(m["rotas_online"])):
            feito = m["rotas"].get(rota, 0) + m["rotas_online"].get(rota, 0)
            elegiveis = m["elegiveis_rota_cliente"].get(rota, 0)
            if feito > elegiveis:
                acima.append({"missao": m["nome"], "rota": rota, "elegiveis": elegiveis,
                              "realizado": m["rotas"].get(rota, 0), "online": m["rotas_online"].get(rota, 0),
                              "origens": [{"rota_cliente": rc, "pares": n}
                                          for rc, n in sorted(cruzou.get(rota, {}).items())]})
        missoes.append(m)
    for a in acima:
        de = ", ".join(f"{o['rota_cliente']} ({o['pares']})" for o in a["origens"]) or "origem desconhecida"
        avisos.append(f"Missões Guiadas: a rota {a['rota']} recebeu {a['realizado'] + a['online']} realização(ões) "
                      f"de \"{a['missao']}\" e tem {a['elegiveis']} elegível(is) próprio(s); "
                      f"vieram da(s) rota(s) do cliente: {de}")
    return missoes, avisos, acima


def conferir_invariante(missoes: list[dict], base: Base, cobertura: dict) -> list[str]:
    """O invariante que vale sempre, qualquer que seja a rota: realizado + online de TODAS as rotas = pares
    elegíveis cobertos no mês. Devolve avisos (vazio quando fecha)."""
    avisos = []
    for m in missoes:
        feito = m["realizado"] + m["realizado_online"]
        cobertos = sum(1 for missao, produto, cliente in base.pares
                       if normalizar(missao) == normalizar(m["nome"]) and (cliente, produto) in cobertura)
        if feito != cobertos:
            avisos.append(f"Missões Guiadas: \"{m['nome']}\" soma {feito} realização(ões) por rota, mas {cobertos} "
                          f"par(es) elegível(is) estão cobertos no mês (os dois deveriam ser iguais)")
    return avisos


# ---------------------------------------------------------------------------
# Rede de segurança da transição
# ---------------------------------------------------------------------------
def comparar(missoes: list[dict], progresso: list[dict] | None, fonte: str) -> dict | None:
    """Compara o realizado por rota do cruzamento com o da fonte antiga, missão a missão (pelo nome
    normalizado). Só leitura: nunca muda os números e nunca derruba a rodada. None = fonte antiga ausente.

    De quebra, preenche o `codigo` de cada missão, que a base de elegíveis não traz.
    """
    if progresso is None:
        return None
    antigo = {normalizar(p.get("nome")): p for p in progresso}
    saida = {"fonte": fonte, "missoes": [], "rotas_diferentes": 0}
    for m in missoes:
        p = antigo.get(normalizar(m["nome"]))
        if p is None:
            saida["missoes"].append({"nome": m["nome"], "encontrada": False})
            continue
        m["codigo"] = p.get("codigo")
        rotas_p = {r: v for r, v in (p.get("rotas") or {}).items()}
        difs = {}
        for rota in sorted(set(m["rotas"]) | set(rotas_p)):
            novo, velho = m["rotas"].get(rota, 0), rotas_p.get(rota, 0)
            if novo != velho:
                difs[rota] = [novo, velho]
        saida["rotas_diferentes"] += len(difs)
        saida["missoes"].append({"nome": m["nome"], "codigo": p.get("codigo"), "encontrada": True,
                                 "total": m["realizado"], "total_anterior": p.get("realizado"),
                                 "rotas_diferentes": len(difs), "rotas": difs})
    return saida


def avisos_da_comparacao(comparacao: dict | None) -> list[str]:
    """Avisos da rede de segurança, para o log e para o index.json. Nunca derruba a rodada."""
    if not comparacao:
        return []
    avisos = []
    for m in comparacao["missoes"]:
        if not m.get("encontrada"):
            avisos.append(f"Missões Guiadas: \"{m['nome']}\" não existe na fonte antiga ({comparacao['fonte']}): "
                          "sem comparação para ela")
        elif m.get("rotas_diferentes"):
            avisos.append(f"Missões Guiadas: \"{m['nome']}\" diverge da fonte antiga em {m['rotas_diferentes']} "
                          f"rota(s) (total {m['total']} x {m['total_anterior']})")
    return avisos


def bloco_base(base: Base) -> dict:
    """Bloco `base` do missoes.json: só o nome do arquivo e contagens — nunca cliente, produto ou caminho."""
    return {"arquivo": base.arquivo, "anomes": base.anomes, "linhas": base.linhas,
            "pares": len(base.pares), "ignoradas": base.total_ignoradas,
            "motivos": dict(sorted(base.ignoradas.items())), "erro": base.erro}
