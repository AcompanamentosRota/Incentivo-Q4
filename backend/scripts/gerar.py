"""
gerar.py — Busca os dados no SAP Datasphere e grava a API (JSONs) em api/v1/.

Uso (na pasta backend/):
    python scripts/gerar.py                       # dados reais -> ../api/v1
    python scripts/gerar.py --simulado --forcar   # dados FICTÍCIOS (sem Datasphere), para o front
    python scripts/gerar.py --rota 111 --forcar   # testa uma rota, grava em saida/rota_111/
    python scripts/gerar.py --hoje 2026-11-03 --saida saida/sim --forcar   # simula a data
    python scripts/gerar.py --ajustes teste.json --saida saida/teste --forcar   # outro arquivo de ajustes

Fechamento do mês: detectado sozinho (até o fim do 1º dia útil e enquanto alguma gerência não tiver
META_VOLUME do mês). Nesse período a API mostra o mês anterior fechado e cada rodada grava o snapshot dele em
v1/fechado/AAAAMM.json, em PRÉVIA (fechamento_final = false). Depois da virada, cada rodada consulta de novo os
meses ainda em prévia e regrava o snapshot deles: os números do mês anterior mudam até o fechamento do FLASH DE
VENDAS (notas canceladas e retornadas). O selo OFICIAL (fechamento_final = true, nunca mais sobrescrito) sai só
quando o Back Office marca o mês no botão da Administração do painel, que grava "flashFechado" no
frontend/ajustes.json — nunca por data no código (gerador/fechado.py). Falha aqui vira aviso: a rodada normal
continua.

Base do dia (--base-dia, gerador/base_dia.py): a primeira rodada do dia faz a carga completa e guarda tudo menos o
Online nesse arquivo; as seguintes consultam só o Online (o Real é até ontem e não muda no dia). Uma consulta barata do
Real por agrupador confere a base a cada rodada: se o Real mudou, carga completa de novo. --completa força a carga
completa (e grava uma base nova). Na rodada incremental os meses em prévia não são consultados de novo: eles só mudam
de um dia para o outro e já foram regravados pela carga completa do dia.

Agrupadores extras e flash de vendas: o que o admin do painel publicou (frontend/ajustes.json -> "agrupadores" e
"flashFechado"). Arquivo ilegível: nada é selado e a rodada registra o aviso.

Fora da janela de execução (JANELA_EXECUCAO, padrão 07:00-18:59 de Brasília) termina sem fazer nada,
a não ser com --forcar. Códigos de saída: 0 ok / nada a fazer, 1 erro de execução,
2 dados reprovados na validação (nada é gravado).
"""
from __future__ import annotations

import argparse
import os
import sys
import time as relogio
from datetime import date, datetime, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from gerador import api, calendario, fechado, mapeamento, saida, validacao  # noqa: E402
from odata.config import PASTA_DADOS_PADRAO, PASTA_SAIDA  # noqa: E402
from odata.log import configurar_log  # noqa: E402

AJUSTES_PAINEL = Path(__file__).resolve().parents[2] / "frontend" / "ajustes.json"


def _janela(texto: str) -> tuple[time, time]:
    ini, fim = texto.split("-")
    return time.fromisoformat(ini.strip()), time.fromisoformat(fim.strip())


def _github_output(**valores: str) -> None:
    destino = os.getenv("GITHUB_OUTPUT")
    if destino:
        with open(destino, "a", encoding="utf-8") as f:
            for k, v in valores.items():
                f.write(f"{k}={v}\n")


def _primeiro_dia(anomes: str) -> date:
    """'202610' -> date(2026, 10, 1)."""
    return date(int(anomes[:4]), int(anomes[4:]), 1)


def _pasta(valor: str | None) -> Path:
    if not valor:
        return PASTA_DADOS_PADRAO
    caminho = Path(valor)
    return caminho if caminho.is_absolute() else (Path(__file__).resolve().parent.parent / caminho).resolve()


def _flash_dos_ajustes(caminho_ajustes: Path, ajustes, log) -> tuple[dict | None, list[str]]:
    """Meses que o Back Office marcou como fechados no flash de vendas (frontend/ajustes.json -> flashFechado).
    Arquivo ilegível: devolve None, e nenhum mês é selado nesta rodada (como já se faz com os agrupadores)."""
    if caminho_ajustes.exists() and not isinstance(ajustes, dict):
        aviso = (f"{caminho_ajustes.name} ilegível: nenhum mês fechado foi selado pelo flash de vendas nesta rodada "
                 "(o arquivo tem de ser um único objeto JSON)")
        log.warning("Aviso: %s", aviso)
        return None, [aviso]
    flash, avisos = fechado.flash_dos_ajustes(ajustes)
    for a in avisos:
        log.warning("Aviso: %s", a)
    if flash:
        log.info("Flash de vendas fechado em: %s", ", ".join(sorted(flash)))
    return flash, avisos


def _meses_fechados(destino: Path, arquivos: dict[str, dict], anterior_index: dict | None, log,
                    flash: dict | None = None, avisos_flash: list[str] | None = None,
                    montar_mes=None, agora: datetime | None = None) -> tuple[list[str], bool]:
    """Meses fechados (gerador/fechado.py) e a lista `fechados` do index.json. Em ordem: regrava os meses que ainda
    estão em prévia (com `montar_mes`, uma nova consulta daquele mês), grava o snapshot do mês em fechamento e sela os
    meses marcados no flash de vendas. Só roda com a validação aprovada; qualquer falha aqui vira aviso no log e no
    index.json, sem derrubar a rodada. Devolve (gravados, se todos os meses em prévia foram consultados de novo)."""
    index = arquivos["v1/index.json"]
    gerado_em = (agora or calendario.agora()).isoformat(timespec="seconds")
    gravados: list[str] = []
    avisos: list[str] = list(avisos_flash or [])
    previas_ok = True
    if montar_mes is not None:
        try:
            previas = fechado.em_previa(destino, index["mes_referencia"]["anomes"])
        except Exception as erro:  # noqa: BLE001
            previas, previas_ok = [], False
            avisos.append(f"meses em prévia indisponíveis: {erro}")
        for anomes in previas:
            try:
                g, a = fechado.regravar(destino, anomes, montar_mes(anomes), gerado_em)
                gravados += g
                avisos += a
                for rel in g:
                    log.info("Mês em prévia regravado: %s", rel)
                if not g and not a:
                    log.info("Mês em prévia %s: nada mudou", anomes)
            except Exception as erro:  # noqa: BLE001 - a rodada normal continua
                previas_ok = False
                avisos.append(f"mês em prévia {anomes} não foi regravado: {erro}")
    try:
        g, a = fechado.atualizar(destino, arquivos, gerado_em, anterior_index, flash)
        gravados += g
        avisos += a
        for rel in g:
            log.info("Mês fechado gravado: %s", rel)
    except Exception as erro:  # noqa: BLE001 - o snapshot nunca derruba a rodada normal
        avisos.append(f"snapshot do mês fechado {index['mes_referencia']['anomes']} não foi gravado: {erro}")
    try:
        index["fechados"], ilegiveis = fechado.listar(destino)
        avisos += ilegiveis
    except Exception as erro:  # noqa: BLE001
        avisos.append(f"lista de meses fechados indisponível: {erro}")
    for a in avisos[len(avisos_flash or []):]:   # os avisos do flash já foram para o log em _flash_dos_ajustes
        log.warning("Aviso: %s", a)
    index["avisos"] = index["avisos"] + avisos
    return gravados, previas_ok


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--saida", type=Path, help="pasta de destino (padrão: SAIDA_DIR ou ../api)")
    ap.add_argument("--simulado", action="store_true", help="dados fictícios, sem consultar o Datasphere")
    ap.add_argument("--rota", help="restringe a uma rota (teste); grava em saida/rota_<ROTA>/")
    ap.add_argument("--hoje", help="simula a data (AAAA-MM-DD); o agendamento não usa")
    ap.add_argument("--forcar", action="store_true", help="ignora a janela de horário")
    ap.add_argument("--gravar-cache", type=Path, help="salva as respostas do Datasphere nesta pasta")
    ap.add_argument("--replay", type=Path, help="usa respostas salvas (sem rede)")
    ap.add_argument("--ajustes", type=Path, default=AJUSTES_PAINEL,
                    help="ajustes do painel com os agrupadores extras (padrão: frontend/ajustes.json)")
    ap.add_argument("--base-dia", type=Path,
                    help="arquivo da base do dia: depois da 1ª carga do dia, consulta só o Online (gerador/base_dia.py)")
    ap.add_argument("--completa", action="store_true", help="com --base-dia: carga completa mesmo com a base válida")
    args = ap.parse_args()

    log = configurar_log("gerar")
    inicio = relogio.monotonic()
    ajustes = saida.ler(args.ajustes)
    flash, avisos_flash = _flash_dos_ajustes(args.ajustes, ajustes, log)
    extras = ajustes.get("agrupadores") if isinstance(ajustes, dict) else None
    extras = extras if isinstance(extras, list) else []
    for aviso in mapeamento.incluir_agrupadores(extras):
        log.warning("Aviso: %s", aviso)
    if extras:
        log.info("Agrupadores extras do painel (%s): %s", args.ajustes.name,
                 ", ".join(p["agrupadores"][0] for p in mapeamento.PRODUTOS if p.get("extra")) or "nenhum válido")
    agora = calendario.agora()
    if args.hoje:
        agora = datetime.combine(datetime.fromisoformat(args.hoje).date(), agora.time())

    ini, fim = _janela(os.getenv("JANELA_EXECUCAO", "07:00-18:59"))
    if not args.forcar and not (ini <= agora.time() <= fim):
        log.info("Fora da janela %s-%s (agora %s). Nada a fazer.", ini, fim, agora.time())
        _github_output(mudou="false")
        return 0

    destino = args.saida or (PASTA_SAIDA / f"rota_{args.rota}" if args.rota else _pasta(os.getenv("SAIDA_DIR")))
    # consulta de um mês já encerrado, para regravar o snapshot de um mês em prévia (--rota e --replay não regravam)
    montar_mes = None
    assinatura, incremental = None, False
    try:
        if args.simulado:
            from gerador import simulado
            log.warning("Gerando dados SIMULADOS (fictícios) -> %s", destino)
            dados = simulado.gerar(agora)

            def montar_mes(anomes: str) -> dict[str, dict]:
                return api.montar(simulado.gerar(agora, ref=_primeiro_dia(anomes)))
        else:
            from gerador import fontes
            from gerador.consulta import Consulta
            from odata.config import carregar_config
            cfg = carregar_config()
            mapeamento.OBJ_META = cfg.objeto
            cons = Consulta(cfg, pasta_cache=args.replay or args.gravar_cache,
                            gravar=bool(args.gravar_cache), replay=bool(args.replay))
            log.info("Gerando dados de %s (space %s, modelo %s) -> %s", agora, cfg.space, cfg.objeto, destino)
            if args.base_dia and not args.rota:
                from gerador import base_dia
                dados, assinatura, incremental = base_dia.carregar(cons, agora, args.base_dia, args.completa)
            else:
                dados = fontes.carregar(cons, agora, rota=args.rota)

            def montar_mes(anomes: str) -> dict[str, dict]:
                return api.montar(fontes.carregar(cons, agora, ref=_primeiro_dia(anomes)))
    except Exception as erro:  # noqa: BLE001
        log.error("Falha ao montar os dados: %s", erro)
        _github_output(mudou="false")
        return 1
    if args.rota or args.replay or incremental:
        montar_mes = None

    arquivos = api.montar(dados)
    if "v1/agrupadores.json" not in arquivos and not args.rota:   # lista de sugestões sem atualizar: mantém a anterior
        if (lista := saida.ler(destino / "v1/agrupadores.json")) is not None:
            arquivos["v1/agrupadores.json"] = lista
    anterior = (None, None) if args.rota else (saida.ler(destino / "v1/resumo.json"), saida.ler(destino / "v1/index.json"))
    erros, avisos = validacao.validar(arquivos, *anterior)
    for a in avisos + dados.avisos:
        log.warning("Aviso: %s", a)
    if erros:
        for e in erros:
            log.error("Reprovado: %s", e)
        log.error("Nada foi gravado; o site continua com a versão anterior.")
        _github_output(mudou="false")
        return 2

    fechados, previas_ok = ([], True) if args.rota else _meses_fechados(destino, arquivos, anterior[1], log, flash,
                                                                        avisos_flash, montar_mes, agora)

    total = sum(len(saida.serializar(o)) for o in arquivos.values())
    log.info("%d arquivos, %.2f MB no total", len(arquivos), total / 1e6)
    gravados, apagados = saida.gravar_api(destino, arquivos)
    log.info("Gravados: %d; apagados: %d (%.0f s no total)", len(gravados), len(apagados), relogio.monotonic() - inicio)
    mudou = bool(gravados or apagados or fechados)
    # base do dia só depois da rodada aprovada e gravada, e com os meses em prévia em dia (senão a próxima é completa)
    base_nova = False
    if assinatura is not None and previas_ok:
        from gerador import base_dia
        try:
            base_nova = base_dia.salvar(args.base_dia, dados, assinatura)
        except OSError as erro:
            log.warning("Aviso: base do dia não foi gravada (%s); a próxima rodada faz a carga completa.", erro)
        if base_nova:
            log.info("Base do dia gravada: %s", args.base_dia)
    _github_output(mudou="true" if mudou else "false", base_nova="true" if base_nova else "false")
    return 0


if __name__ == "__main__":
    sys.exit(main())
