"""
gerar.py — Busca os dados no SAP Datasphere e grava a API (JSONs) em api/v1/.

Uso (na pasta backend/):
    python scripts/gerar.py                       # dados reais -> ../api/v1
    python scripts/gerar.py --simulado --forcar   # dados FICTÍCIOS (sem Datasphere), para o front
    python scripts/gerar.py --rota 111 --forcar   # testa uma rota, grava em saida/rota_111/
    python scripts/gerar.py --hoje 2026-11-03 --saida saida/sim --forcar   # simula a data
    python scripts/gerar.py --hoje 2026-11-12T15:00 --saida saida/sim --forcar   # simula a data e a hora
    python scripts/gerar.py --ajustes teste.json --saida saida/teste --forcar   # outro arquivo de ajustes

Fechamento do mês: detectado sozinho (até o fim do 1º dia útil e enquanto alguma gerência não tiver
META_VOLUME do mês). Nesse período a API mostra o mês anterior fechado e cada rodada grava o snapshot dele em
v1/fechado/AAAAMM.json, em PRÉVIA (fechamento_final = false). O snapshot só é selado (OFICIAL) depois do flash de
vendas: quando o Back Office marca o mês no botão da Administração (frontend/ajustes.json -> "flashFechado"), a 1ª
rodada depois da hora marcada sela o arquivo, que não muda mais (gerador/fechado.py). Ajustes ilegíveis: nada é
selado, com aviso. Falha no snapshot vira aviso: a rodada normal continua.

Agrupadores extras: os que o admin do painel incluiu (frontend/ajustes.json -> "agrupadores") entram como produtos
da API, além dos fixos de gerador/mapeamento.py.

Fora da janela de execução (JANELA_EXECUCAO, padrão 07:00-18:59 de Brasília) termina sem fazer nada,
a não ser com --forcar. Códigos de saída: 0 ok / nada a fazer, 1 erro de execução,
2 dados reprovados na validação (nada é gravado).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time as relogio
from datetime import datetime, time
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


def _pasta(valor: str | None) -> Path:
    if not valor:
        return PASTA_DADOS_PADRAO
    caminho = Path(valor)
    return caminho if caminho.is_absolute() else (Path(__file__).resolve().parent.parent / caminho).resolve()


def _ler_ajustes(caminho: Path) -> tuple[dict | None, str | None]:
    """frontend/ajustes.json -> (objeto, erro). Arquivo ausente = sem ajustes, sem erro (ninguém publicou ainda).
    Existente mas ilegível ou que não seja UM objeto JSON = erro (os ajustes são ignorados e nada é selado)."""
    if not caminho.exists():
        return None, None
    try:
        obj = json.loads(caminho.read_text(encoding="utf-8"))
    except (OSError, ValueError) as erro:
        return None, f"{caminho.name} ilegível ({erro})"
    if not isinstance(obj, dict):
        return None, f"{caminho.name} não é um objeto JSON"
    return obj, None


def _meses_fechados(destino: Path, arquivos: dict[str, dict], anterior_index: dict | None, log,
                    flash: dict | None = None, agora: datetime | None = None,
                    avisos_ajustes: list[str] | None = None) -> list[str]:
    """Snapshot do mês fechado (gerador/fechado.py), selo pelo flash e a lista `fechados` do index.json. Só roda com a
    validação aprovada; qualquer falha aqui vira aviso no log e no index.json, sem derrubar a rodada. Devolve os
    gravados. `flash` None = ajustes ilegíveis: nenhum mês é selado."""
    index = arquivos["v1/index.json"]
    gravados: list[str] = []
    try:
        gravados, avisos = fechado.atualizar(destino, arquivos, calendario.agora().isoformat(), anterior_index,
                                             flash=flash, agora=agora)
        for rel in gravados:
            log.info("Mês fechado gravado: %s", rel)
    except Exception as erro:  # noqa: BLE001 - o snapshot nunca derruba a rodada normal
        avisos = [f"snapshot do mês fechado {index['mes_referencia']['anomes']} não foi gravado: {erro}"]
    avisos = list(avisos_ajustes or []) + avisos
    try:
        index["fechados"], ilegiveis = fechado.listar(destino)
        avisos += ilegiveis
    except Exception as erro:  # noqa: BLE001
        avisos.append(f"lista de meses fechados indisponível: {erro}")
    for a in avisos:
        log.warning("Aviso: %s", a)
    index["avisos"] = index["avisos"] + avisos
    return gravados


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--saida", type=Path, help="pasta de destino (padrão: SAIDA_DIR ou ../api)")
    ap.add_argument("--simulado", action="store_true", help="dados fictícios, sem consultar o Datasphere")
    ap.add_argument("--rota", help="restringe a uma rota (teste); grava em saida/rota_<ROTA>/")
    ap.add_argument("--hoje", help="simula a data (AAAA-MM-DD ou AAAA-MM-DDTHH:MM); o agendamento não usa")
    ap.add_argument("--forcar", action="store_true", help="ignora a janela de horário")
    ap.add_argument("--gravar-cache", type=Path, help="salva as respostas do Datasphere nesta pasta")
    ap.add_argument("--replay", type=Path, help="usa respostas salvas (sem rede)")
    ap.add_argument("--ajustes", type=Path, default=AJUSTES_PAINEL,
                    help="ajustes do painel: agrupadores extras e flash fechado (padrão: frontend/ajustes.json)")
    args = ap.parse_args()

    log = configurar_log("gerar")
    inicio = relogio.monotonic()
    ajustes, erro_ajustes = _ler_ajustes(args.ajustes)
    if erro_ajustes:
        flash, avisos_ajustes = None, [f"ajustes do painel ignorados: {erro_ajustes}; nenhum mês foi selado pelo flash"]
    else:
        flash, avisos_ajustes = fechado.flash_dos_ajustes(ajustes)
    extras = ajustes.get("agrupadores") if isinstance(ajustes, dict) else None
    extras = extras if isinstance(extras, list) else []
    for aviso in mapeamento.incluir_agrupadores(extras):
        log.warning("Aviso: %s", aviso)
    if extras:
        log.info("Agrupadores extras do painel (%s): %s", args.ajustes.name,
                 ", ".join(p["agrupadores"][0] for p in mapeamento.PRODUTOS if p.get("extra")) or "nenhum válido")
    agora = calendario.agora()
    if args.hoje:   # AAAA-MM-DD (hora de agora) ou AAAA-MM-DDTHH:MM
        simulada = datetime.fromisoformat(args.hoje)
        agora = simulada if "T" in args.hoje else datetime.combine(simulada.date(), agora.time())

    ini, fim = _janela(os.getenv("JANELA_EXECUCAO", "07:00-18:59"))
    if not args.forcar and not (ini <= agora.time() <= fim):
        log.info("Fora da janela %s-%s (agora %s). Nada a fazer.", ini, fim, agora.time())
        _github_output(mudou="false")
        return 0

    destino = args.saida or (PASTA_SAIDA / f"rota_{args.rota}" if args.rota else _pasta(os.getenv("SAIDA_DIR")))
    try:
        if args.simulado:
            from gerador import simulado
            log.warning("Gerando dados SIMULADOS (fictícios) -> %s", destino)
            dados = simulado.gerar(agora)
        else:
            from gerador import fontes
            from gerador.consulta import Consulta
            from odata.config import carregar_config
            cfg = carregar_config()
            mapeamento.OBJ_META = cfg.objeto
            cons = Consulta(cfg, pasta_cache=args.replay or args.gravar_cache,
                            gravar=bool(args.gravar_cache), replay=bool(args.replay))
            log.info("Gerando dados de %s (space %s, modelo %s) -> %s", agora, cfg.space, cfg.objeto, destino)
            dados = fontes.carregar(cons, agora, rota=args.rota)
    except Exception as erro:  # noqa: BLE001
        log.error("Falha ao montar os dados: %s", erro)
        _github_output(mudou="false")
        return 1

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

    fechados = [] if args.rota else _meses_fechados(destino, arquivos, anterior[1], log, flash=flash, agora=agora,
                                                    avisos_ajustes=avisos_ajustes)

    total = sum(len(saida.serializar(o)) for o in arquivos.values())
    log.info("%d arquivos, %.2f MB no total", len(arquivos), total / 1e6)
    gravados, apagados = saida.gravar_api(destino, arquivos)
    log.info("Gravados: %d; apagados: %d (%.0f s no total)", len(gravados), len(apagados), relogio.monotonic() - inicio)
    mudou = bool(gravados or apagados or fechados)
    _github_output(mudou="true" if mudou else "false")
    return 0


if __name__ == "__main__":
    sys.exit(main())
