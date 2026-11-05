"""
reabrir_fechado.py — Volta um mês fechado de OFICIAL para PRÉVIA (ajuste único, registrado em PR).

Para que serve: até 04/11/2026 o gerador selava o snapshot do mês na 1ª rodada do mês novo (1º dia útil), antes do
fechamento do FLASH DE VENDAS. Os meses selados assim ficaram com números que ainda iam mudar (notas fiscais
canceladas e retornadas até o dia do flash). Este script reabre um desses meses: `fechamento_final` volta para false,
`oficial_em` e `fonte_selo` voltam para null, e o mês passa a ser regravado a cada rodada até o Back Office marcar o
flash na Administração do painel (ajustes.json -> flashFechado), que é o que sela de vez.

Nada mais do arquivo é alterado (rotas, totais, rótulo e datas ficam como estão): quem atualiza os números é a
próxima rodada do gerador.

Uso (na pasta backend/):
    python scripts/reabrir_fechado.py --anomes 202610                 # só mostra o que faria (nada é gravado)
    python scripts/reabrir_fechado.py --anomes 202610 --confirmar     # grava
    python scripts/reabrir_fechado.py --anomes 202610 --saida "$FORA/api" --confirmar   # em outra pasta

Depois de gravar na pasta publicada (`api/`), o arquivo precisa ir para o GitHub **por PR**, como qualquer mudança
em `api/v1/`. Esta é a única situação em que um arquivo de `api/v1/` entra num commit de pessoa: a mudança é feita
por este script, não à mão, e o PR tem de dizer qual mês foi reaberto e por quê.

Códigos de saída: 0 ok (ou nada a fazer), 1 erro (arquivo não existe, fora do padrão ou falha ao gravar).
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from gerador import fechado, saida  # noqa: E402
from odata.config import PASTA_DADOS_PADRAO  # noqa: E402

CAMPOS_DO_SELO = {"fechamento_final": False, "oficial_em": None, "fonte_selo": None}


def _pasta(valor: str | None) -> Path:
    if not valor:
        return PASTA_DADOS_PADRAO
    caminho = Path(valor)
    return caminho if caminho.is_absolute() else (Path(__file__).resolve().parent.parent / caminho).resolve()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--anomes", required=True, help="mês a reabrir (AAAAMM), ex.: 202610")
    ap.add_argument("--saida", help="pasta da API (padrão: SAIDA_DIR ou ../api, a pasta publicada)")
    ap.add_argument("--confirmar", action="store_true", help="grava; sem isso, só mostra o que faria")
    args = ap.parse_args()

    if not (len(args.anomes) == 6 and args.anomes.isdigit()):
        print(f"--anomes {args.anomes!r} não é um AAAAMM.")
        return 1
    destino = _pasta(args.saida or os.getenv("SAIDA_DIR"))
    rel = fechado.caminho(args.anomes)
    caminho = destino / rel
    snap = saida.ler(caminho)
    if not isinstance(snap, dict) or snap.get("anomes") != args.anomes:
        print(f"{caminho}: não existe ou não é o snapshot de {args.anomes}.")
        return 1

    print(f"arquivo: {caminho}")
    print(f"mês: {snap.get('rotulo')} · rotas: {len(snap.get('rotas') or [])} · gerado em {snap.get('gerado_em')}")
    print("estado atual: " + ", ".join(f"{k} = {snap.get(k)!r}" for k in CAMPOS_DO_SELO))
    if not snap.get("fechamento_final"):
        print(f"{args.anomes} já está em prévia (fechamento_final = false): nada a fazer.")
        return 0

    novo = {**snap, **CAMPOS_DO_SELO}
    print("depois:       " + ", ".join(f"{k} = {v!r}" for k, v in CAMPOS_DO_SELO.items()))
    if not args.confirmar:
        print("\nNada foi gravado. Rode de novo com --confirmar para gravar.")
        return 0
    try:
        mudou = saida.gravar(caminho, novo)
    except OSError as erro:
        print(f"falha ao gravar {caminho}: {erro}")
        return 1
    print(f"\n{rel} {'regravado' if mudou else 'já estava assim'}: {args.anomes} volta a ser PRÉVIA.")
    print("A partir da próxima rodada o gerador regrava este mês até o flash de vendas ser marcado no painel.")
    print("Leve o arquivo para o GitHub por PR (api/v1/ nunca vai para a main sem revisão).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
