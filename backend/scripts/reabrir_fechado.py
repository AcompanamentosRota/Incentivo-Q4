"""
reabrir_fechado.py — Volta um mês fechado selado para PRÉVIA (fechamento_final = false). Migração controlada.

Para que serve: até 04/11/2026 o gerador selava o mês fechado na 1ª rodada do mês novo, antes do flash de vendas.
Desde então o selo (OFICIAL) só vem do botão "Flash de vendas de <mês> fechado" (gerador/fechado.py). Um mês selado
pela regra antiga (caso de outubro/26, selado em 04/11/2026) precisa ser reaberto uma vez, por este script; o botão
nunca reabre nada.

O que ele faz, em <saída>/v1/fechado/AAAAMM.json:
  - fechamento_final -> false, oficial_em -> null, fonte_selo -> null; os números (rotas) não mudam;
  - acrescenta ao campo "reaberto" (lista) quando, por quê e como o arquivo estava selado (fica registrado no arquivo).
Ele recusa (código 2) quando o mês está marcado como fechado no ajustes.json (a próxima rodada selaria de novo:
desmarque o flash por PR primeiro) ou quando o ajustes.json não pode ser lido. Não mexe no index.json: a rodada
seguinte do gerar.py refaz a lista `fechados`.

Como rodar: pelo GitHub, Actions > "Atualizar dados" > Run workflow, campo "reabrir" = AAAAMM (o workflow reabre,
gera a API e comita). Na sua máquina, só para testar, sempre com --saida FORA do repositório:
    python scripts/reabrir_fechado.py 202610 --saida /tmp/api --motivo "teste"
Códigos de saída: 0 reaberto (ou já estava em prévia), 1 arquivo ausente ou ilegível, 2 recusado.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from gerador import calendario, fechado, saida  # noqa: E402
from odata.config import PASTA_DADOS_PADRAO  # noqa: E402

AJUSTES_PAINEL = Path(__file__).resolve().parents[2] / "frontend" / "ajustes.json"


def _pasta(valor: Path | None) -> Path:
    if valor:
        return valor if valor.is_absolute() else (Path.cwd() / valor).resolve()
    env = os.getenv("SAIDA_DIR")
    if not env:
        return PASTA_DADOS_PADRAO
    caminho = Path(env)
    return caminho if caminho.is_absolute() else (Path(__file__).resolve().parent.parent / caminho).resolve()


def reabrir(destino: Path, anomes: str, motivo: str, ajustes_path: Path, quando: str) -> tuple[int, str]:
    """Reabre o mês. Devolve (código de saída, mensagem)."""
    if not fechado._ANOMES.match(anomes or ""):
        return 2, f"mês {anomes!r} inválido: use AAAAMM"
    arq = destino / fechado.caminho(anomes)
    snap = saida.ler(arq)
    if not isinstance(snap, dict) or snap.get("anomes") != anomes:
        return 1, f"{fechado.caminho(anomes)} não existe ou está ilegível em {destino}"
    if not snap.get("fechamento_final"):
        return 0, f"{fechado.caminho(anomes)} já está em prévia: nada a fazer"
    if ajustes_path.exists():
        aj = saida.ler(ajustes_path)
        if not isinstance(aj, dict):
            return 2, f"{ajustes_path.name} ilegível: confira o arquivo antes de reabrir"
        marcado = (aj.get("flashFechado") or {}).get(anomes) if isinstance(aj.get("flashFechado"), dict) else None
        if isinstance(marcado, dict) and marcado.get("fechado") is True:
            return 2, (f"{anomes} está marcado como flash fechado em {ajustes_path.name}: a próxima rodada selaria de novo. "
                       "Desmarque o flash na Administração e publique por PR antes de reabrir")
    registro = {"em": quando, "motivo": motivo, "selo_anterior": snap.get("fonte_selo") or fechado.FONTE_VIRADA,
                "oficial_em_anterior": snap.get("oficial_em")}
    novo = {**snap, "fechamento_final": False, "oficial_em": None, "fonte_selo": None,
            "reaberto": list(snap.get("reaberto") or []) + [registro]}
    saida.gravar(arq, novo)
    return 0, f"{fechado.caminho(anomes)} reaberto: volta a ser prévia até o flash de vendas ser marcado como fechado"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("anomes", help="mês a reabrir, AAAAMM (ex.: 202610)")
    ap.add_argument("--motivo", default="selado antes do flash de vendas (regra antiga)", help="registrado no arquivo")
    ap.add_argument("--saida", type=Path, help="pasta da API (padrão: SAIDA_DIR ou ../api)")
    ap.add_argument("--ajustes", type=Path, default=AJUSTES_PAINEL, help="ajustes do painel (padrão: frontend/ajustes.json)")
    args = ap.parse_args()
    codigo, msg = reabrir(_pasta(args.saida), args.anomes.strip(), args.motivo,
                          args.ajustes, calendario.agora().isoformat(timespec="seconds"))
    print(("OK: " if codigo == 0 else "ERRO: ") + msg)
    return codigo


if __name__ == "__main__":
    sys.exit(main())
