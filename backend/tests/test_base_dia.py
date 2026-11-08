"""Rodada incremental (gerador/base_dia.py), sem rede: a 1ª carga do dia guarda a base e as seguintes consultam só o
Online, com a mesma API da carga completa. Usa o cenário de novembro (Real pela chave da meta) de test_fontes_api."""
import shutil
import sys
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from gerador import api, base_dia, fontes  # noqa: E402
from gerador import mapeamento as M  # noqa: E402
from tests.test_fontes_api import AGORA_NOV, cenario, cenario_nov, _fato_nov  # noqa: E402

DEPOIS = AGORA_NOV + timedelta(minutes=15)


def _pedido_novo(cons, valor=10):
    """Mais um pedido de hoje (cli 1, Sucos, meta da 111)."""
    cons.dados[M.OBJ_META].append(_fato_nov("111", 1, "Sucos", "111", fonte="WF Online", data="2026-11-10",
                                            FX_VOL_PADRAO_WF_ONLINE=valor))


def _sem_hora(arquivos):
    """A API sem os campos que dependem só da hora da rodada."""
    idx = dict(arquivos["v1/index.json"])
    idx.pop("atualizado_em", None)
    return {**arquivos, "v1/index.json": idx}


class TestBaseDoDia(unittest.TestCase):
    def setUp(self):
        self.pasta = Path(tempfile.mkdtemp(prefix="base_dia_"))
        self.caminho = self.pasta / "base.json"

    def tearDown(self):
        shutil.rmtree(self.pasta, ignore_errors=True)

    def _primeira(self, cons=None):
        cons = cons or cenario_nov()
        dados, assinatura, incremental = base_dia.carregar(cons, AGORA_NOV, self.caminho)
        self.assertFalse(incremental)
        self.assertTrue(base_dia.salvar(self.caminho, dados, assinatura))
        return dados

    def test_primeira_rodada_completa_grava_a_base(self):
        dados = self._primeira()
        self.assertTrue(self.caminho.exists())
        self.assertEqual(dados.online["111"]["sucos"], 3.0)

    def test_incremental_igual_a_carga_completa(self):
        self._primeira()
        cons = cenario_nov()
        _pedido_novo(cons)
        dados, assinatura, incremental = base_dia.carregar(cons, DEPOIS, self.caminho)
        self.assertTrue(incremental)
        self.assertIsNone(assinatura)            # nada a regravar
        completa = fontes.carregar(cenario_nov_com_pedido(), DEPOIS)
        self.assertEqual(_sem_hora(api.montar(dados)), _sem_hora(api.montar(completa)))
        self.assertEqual(api.montar(dados)["v1/rotas/111.json"]["produtos"]["sucos"]["online_hoje"], 13.0)

    def test_incremental_so_consulta_a_assinatura_e_o_online(self):
        self._primeira()
        cons = cenario_nov()
        base_dia.carregar(cons, DEPOIS, self.caminho)
        selects = [set(sel) for objeto, sel, _ in cons.chamadas]
        self.assertTrue(selects)
        com_rota = [s for s in selects if M.ColMeta.META_ROTA in s]
        self.assertTrue(com_rota and all(M.ColMeta.VOL_ONLINE in s for s in com_rota))   # só o Online por rota
        sem_rota = [s for s in selects if M.ColMeta.META_ROTA not in s]
        self.assertEqual(len(sem_rota), 1)                                                # a assinatura do Real
        self.assertIn(M.ColMeta.NF_STATUS, sem_rota[0])
        self.assertFalse(any(objeto != M.OBJ_META for objeto, _, _ in cons.chamadas))     # nem clientes nem calendário

    def test_real_mudou_faz_carga_completa(self):
        self._primeira()
        cons = cenario_nov()
        cons.dados[M.OBJ_META].append(_fato_nov("111", 1, "Sucos", "111", FX_VOL_PADRAO_FAT=20))
        dados, assinatura, incremental = base_dia.carregar(cons, DEPOIS, self.caminho)
        self.assertFalse(incremental)
        self.assertIsNotNone(assinatura)
        self.assertEqual(api.montar(dados)["v1/rotas/111.json"]["produtos"]["sucos"]["realizado"], 78.0)

    def test_base_de_outro_dia_nao_vale(self):
        self._primeira()
        _, assinatura, incremental = base_dia.carregar(cenario_nov(), AGORA_NOV + timedelta(days=1), self.caminho)
        self.assertFalse(incremental)
        self.assertIsNotNone(assinatura)

    def test_completa_ignora_a_base(self):
        self._primeira()
        _, assinatura, incremental = base_dia.carregar(cenario_nov(), DEPOIS, self.caminho, completa=True)
        self.assertFalse(incremental)
        self.assertIsNotNone(assinatura)

    def test_agrupadores_mudaram_invalida_a_base(self):
        self._primeira()
        with mock.patch.object(M, "AGRUPADORES_CONSULTA", M.AGRUPADORES_CONSULTA + ["Agrupador Novo"]):
            _, motivo = base_dia.ler(self.caminho, AGORA_NOV.date(), "202611",
                                     fontes.assinatura_real(cenario_nov(), "202611"))
        self.assertIn("agrupadores", motivo)

    def test_base_ilegivel_faz_carga_completa(self):
        self.caminho.write_text("{ isto não é json", encoding="utf-8")
        _, _, incremental = base_dia.carregar(cenario_nov(), DEPOIS, self.caminho)
        self.assertFalse(incremental)

    def test_ida_e_volta_do_json(self):
        dados = self._primeira()
        volta, motivo = base_dia.ler(self.caminho, AGORA_NOV.date(), "202611",
                                     fontes.assinatura_real(cenario_nov(), "202611"))
        self.assertEqual(motivo, "")
        for campo in ("cal", "clientes", "volume", "volume_cliente", "eventuais", "avisos", "agrupadores_meta",
                      "gcs_originais"):
            self.assertEqual(getattr(volta, campo), getattr(dados, campo), campo)
        self.assertIsNone(volta.online)

    def test_sem_caminho_e_a_carga_de_sempre(self):
        cons = cenario_nov()
        dados, assinatura, incremental = base_dia.carregar(cons, AGORA_NOV, None)
        self.assertEqual((assinatura, incremental), (None, False))
        self.assertEqual(api.montar(dados), api.montar(fontes.carregar(cenario_nov(), AGORA_NOV)))

    def test_mes_antes_da_chave_da_meta_nao_guarda_base(self):
        dados, assinatura, _ = base_dia.carregar(cenario(), datetime(2026, 10, 22, 10, 0), self.caminho)
        self.assertFalse(base_dia.salvar(self.caminho, dados, assinatura))
        self.assertFalse(self.caminho.exists())

    def test_fechamento_nao_guarda_base(self):
        dados = fontes.carregar(cenario_nov(), AGORA_NOV)
        from dataclasses import replace
        fech = replace(dados, cal=replace(dados.cal, fechamento=True), online=None)
        self.assertFalse(base_dia.salvar(self.caminho, fech, {}))


def cenario_nov_com_pedido():
    cons = cenario_nov()
    _pedido_novo(cons)
    return cons


if __name__ == "__main__":
    unittest.main()
