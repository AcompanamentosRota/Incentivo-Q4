"""
exclusoes.py — Volumes de Real tirados do fechamento por decisão do Back Office.

É o ÚNICO lugar onde uma nota fiscal é declarada fora do fechamento. A lógica do gerador não conhece nenhum
número de nota: ela só pergunta a este módulo se a linha que acabou de ler casa com alguma entrada declarada.

Como funciona
-------------
A exclusão é de LINHA: ela é aplicada logo depois da consulta do Vol Real e ANTES de qualquer soma
(gerador/fontes.py), para que rota, supervisão, gerência, empresa e cobertura saiam coerentes de uma vez.
Nunca se subtrai de um total já montado.

Chave da exclusão
-----------------
O número da nota (NF_NRONF_Nota_Fiscal, em mapeamento.ColMeta.NF) identifica a linha sozinho dentro do mês.
A chave mês + cliente + rota + data + agrupador NÃO serve: em 13/11/2026, na R32/Powerade/31-10-2026, o mesmo
cliente tinha quatro notas de 166,95 cada (867743, 867744, 867746 e 867747), e 6 das 9 chaves (cliente, data)
daquela rota e produto tinham mais de uma nota. Por isso a entrada declara a nota, e a rota e o agrupador
servem para manter a exclusão restrita ao produto decidido.

Privacidade: o número da nota fica SÓ aqui (código-fonte). O bloco `exclusoes` do fechado/AAAAMM.json publica
apenas rota, agrupador, volume e motivo — sem número de nota e sem código de cliente —, então o `motivo` é
escrito sem citar o número da nota.

Alcance
-------
- Vale só para o Real (FX_VOL_PADRAO_FAT). Não toca Online, META, META_NEG nem meta de cobertura.
- Vale só para os meses em que está declarada. Lista vazia = comportamento de antes, byte a byte: sem entrada
  no mês, nem a coluna da nota entra no groupby da consulta.
- Mês já selado (fechamento_final: true) não é reconsultado, então a entrada fica inerte depois do selo.

Conferência (conferir): o volume que saiu é comparado com o declarado, com tolerância de TOLERANCIA.
- saiu MAIS que o declarado  -> erro: a rodada é reprovada (saída 2) e nada é gravado. Tirar volume legítimo
  em silêncio é pior que não rodar.
- saiu MENOS (inclusive zero) -> aviso em destaque: é o que acontece quando a nota é cancelada na origem.
  Nesse caso a entrada deve sair desta lista, senão o aviso fica para sempre.
"""
from __future__ import annotations

from .texto import limpar, normalizar, numero

# Tolerância (em caixas) da conferência do volume excluído.
TOLERANCIA = 0.05

# Uma entrada por nota fiscal tirada do fechamento.
#   anomes      ANOMES_REF do mês (texto de 6 dígitos)
#   nf          número da nota (NF_NRONF_Nota_Fiscal). NUNCA vai para os JSONs publicados
#   rota        rota da linha; pela chave da meta é a rota da meta (as duas são R32 nesta nota)
#   agrupador   agrupador do produto, como vem do modelo (comparado sem acento e sem caixa)
#   volume      volume esperado da linha, conferido no modelo
#   motivo      texto curto que VAI para o JSON publicado: sem número de nota e sem código de cliente
EXCLUSOES: list[dict] = [
    {
        "anomes": "202610",
        "nf": "867744",
        "rota": "R32",
        "agrupador": "Powerade",
        "volume": 166.95,
        "motivo": "Nota fiscal fora do fechamento de outubro/26 (decisão do Back Office em 13/11/2026)",
    },
]


class VolumeExcluidoMaior(ValueError):
    """Saiu mais volume que o declarado: a rodada é reprovada (saída 2) e nada é gravado."""


def _nf(valor: object) -> str:
    """'0867744' / ' 867744 ' -> '867744' (o modelo devolve o número como texto)."""
    return limpar(valor).lstrip("0")


def do_mes(anomes: str, entradas: list[dict] | None = None) -> list[dict]:
    """As entradas declaradas para o mês, na ordem da lista."""
    return [x for x in (EXCLUSOES if entradas is None else entradas) if str(x["anomes"]) == str(anomes)]


def entrada_da_linha(anomes: str, rota: object, agrupador: object, nf: object,
                     entradas: list[dict] | None = None) -> dict | None:
    """A entrada que casa com esta linha do Real, ou None.

    Casam os quatro campos: mês, nota, rota e agrupador. Rota e agrupador são comparados sem acento e sem caixa,
    pelo nome inteiro (mesma regra do resto do gerador); a nota, sem zeros à esquerda.
    """
    num = _nf(nf)
    if not num:
        return None
    r, ag = normalizar(rota), normalizar(agrupador)
    for x in do_mes(anomes, entradas):
        if _nf(x["nf"]) == num and normalizar(x["rota"]) == r and normalizar(x["agrupador"]) == ag:
            return x
    return None


def chave(entrada: dict) -> tuple[str, str, str, str]:
    """Identifica a entrada entre as do mês (mês + nota + rota + agrupador)."""
    return (str(entrada["anomes"]), _nf(entrada["nf"]), normalizar(entrada["rota"]), normalizar(entrada["agrupador"]))


def total_por_entrada(linhas: list[dict], anomes: str, col_rota: str, col_agrupador: str, col_nf: str,
                      col_volume: str, entradas: list[dict] | None = None) -> dict[tuple, dict]:
    """Quanto cada entrada tirou destas linhas: {chave(entrada): {"entrada", "linhas", "volume"}}.

    Função pura, usada pelos testes e espelhada pelo filtro de gerador/fontes.py. `linhas` são as do Real já
    lidas do modelo; `col_*` são os nomes das colunas nelas.
    """
    achados: dict[tuple, dict] = {}
    for l in linhas:
        x = entrada_da_linha(anomes, l.get(col_rota), l.get(col_agrupador), l.get(col_nf), entradas)
        if x is None:
            continue
        k = chave(x)
        achados.setdefault(k, {"entrada": x, "linhas": 0, "volume": 0.0})
        achados[k]["linhas"] += 1
        achados[k]["volume"] += numero(l.get(col_volume))
    return achados


def aplicadas(achados: dict[tuple, dict], anomes: str, entradas: list[dict] | None = None) -> list[dict]:
    """Resultado por entrada declarada no mês, inclusive as que não acharam linha nenhuma.

    [{"rota", "agrupador", "volume", "motivo", "esperado", "linhas"}], na ordem da lista. `volume` é o que saiu
    de fato; `esperado`, o declarado. Sem número de nota e sem código de cliente.
    """
    saida = []
    for x in do_mes(anomes, entradas):
        achado = achados.get(chave(x)) or {}
        saida.append({"rota": limpar(x["rota"]).upper(), "agrupador": limpar(x["agrupador"]),
                      "volume": round(achado.get("volume", 0.0), 3), "motivo": x["motivo"],
                      "esperado": float(x["volume"]), "linhas": achado.get("linhas", 0)})
    return saida


def conferir(lista: list[dict] | None, onde: str = "",
             tolerancia: float = TOLERANCIA) -> tuple[list[str], list[str]]:
    """(erros, avisos) da conferência do volume excluído. Erro = saiu mais que o declarado (reprova a rodada)."""
    erros: list[str] = []
    avisos: list[str] = []
    prefixo = f"{onde}: " if onde else ""
    for a in lista or []:
        saiu, esperado = float(a.get("volume") or 0.0), float(a.get("esperado") or 0.0)
        quem = f"exclusão de volume em {a.get('rota')}/{a.get('agrupador')}"
        if saiu > esperado + tolerancia:
            erros.append(f"{prefixo}{quem}: saíram {saiu:,.2f} do Real, mais que os {esperado:,.2f} declarados "
                         f"em gerador/exclusoes.py (tolerância {tolerancia}). Confira a entrada antes de publicar.")
        elif saiu < esperado - tolerancia:
            avisos.append(f"ATENÇÃO: {prefixo}{quem}: saíram {saiu:,.2f} do Real, menos que os {esperado:,.2f} "
                          f"declarados em gerador/exclusoes.py (nota cancelada na origem?). "
                          f"Se a nota não existe mais, tire a entrada da lista.")
    return erros, avisos


def conferir_ou_parar(lista: list[dict] | None, onde: str = "", log=None,
                      tolerancia: float = TOLERANCIA) -> list[str]:
    """Confere e levanta VolumeExcluidoMaior se saiu mais que o declarado. Devolve os avisos (saiu menos).

    Usada no caminho dos meses em prévia (scripts/gerar.py), onde a conferência precisa acontecer antes de o
    snapshot ser gravado e a falha tem de derrubar a rodada, não virar aviso.
    """
    erros, avisos = conferir(lista, onde, tolerancia)
    if log is not None:
        for a in avisos:
            log.warning("Aviso: %s", a)
    if erros:
        raise VolumeExcluidoMaior("; ".join(erros))
    return avisos


def publicar(lista: list[dict] | None) -> list[dict] | None:
    """Bloco `exclusoes` do fechado/AAAAMM.json: só rota, agrupador, volume e motivo.

    Só entram as entradas que tiraram volume de fato: entrada declarada que não achou a nota (cancelada na
    origem) não vira linha no JSON — ela aparece como aviso da rodada. None quando não sobra nenhuma.
    """
    saida = [{"rota": a["rota"], "agrupador": a["agrupador"], "volume": round(float(a["volume"]), 1),
              "motivo": a["motivo"]} for a in (lista or []) if float(a.get("volume") or 0.0) > 0]
    return saida or None
