"""Cobertura (clientes que compraram) com um Datasphere falso, sem rede. Cenário de novembro de test_fontes_api com:
  META_COBERTURA: 111 Sucos 3; 112 Sucos 2; 111 Powerade 0 (sem meta)
  coberto no mês (FX_COBERTURA_REALIZADO): cli 1 Sucos na meta da 111; cli 3 Sucos na meta da 111 e na da 112;
      cli 4 (outra gerência, fora da base) Sucos na meta da 112
  coberto hoje (FX_COBERTURA_WF_ONLINE): cli 5 (111, novo na base) com pedido válido de Sucos 2; cli 6 (111) com
      pedido cancelado (fica fora, como o volume online)
"""
import shutil
import sys
import tempfile
import unittest
from datetime import timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from gerador import api, base_dia, fontes, simulado, validacao  # noqa: E402
from gerador import mapeamento as M  # noqa: E402
from tests.test_fontes_api import AGORA, AGORA_NOV, _cliente, _fato_nov, _meta, cenario, cenario_nov  # noqa: E402

CM = M.ColMeta


def _meta_cob(rota, ag, valor):
    return {**_meta(rota, ag, None, "202611"), CM.META_COBERTURA: valor}


def cenario_cob():
    cons = cenario_nov()
    cons.dados[M.OBJ_META] += [
        _meta_cob("111", "Sucos", 3), _meta_cob("112", "Sucos", 2), _meta_cob("111", "Powerade", 0),
        _fato_nov("111", 1, "Sucos", "111", **{CM.COB_REAL: 1}),
        _fato_nov("112", 3, "Sucos", "111", **{CM.COB_REAL: 1}),
        _fato_nov("112", 3, "Sucos", "112", **{CM.COB_REAL: 1}),
        _fato_nov("X01", 4, "Sucos", "112", gc="--", **{CM.COB_REAL: 1}),
        _fato_nov("111", 5, "Sucos", "111", fonte="WF Online", data="2026-11-10",
                  **{CM.VOL_ONLINE: 2, CM.COB_ONLINE: 1}),
        _fato_nov("111", 6, "Sucos", "111", fonte="WF Online", data="2026-11-10", situacao="Cancelado",
                  **{CM.VOL_ONLINE: 9, CM.COB_ONLINE: 1}),
    ]
    cons.dados[M.OBJ_BASE_CLIENTE] += [_cliente(5, "111", "Sv. G1.1"), _cliente(6, "111", "Sv. G1.1")]
    return cons


def _clientes(arquivos, rota):
    return {c["pv"]: c for c in arquivos[f"v1/rotas/{rota}.json"]["clientes"]}


class TestCobertura(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cons = cenario_cob()
        cls.dados = fontes.carregar(cls.cons, AGORA_NOV)
        cls.api = api.montar(cls.dados)

    def cob(self, arquivo, produto="sucos"):
        return self.api[arquivo]["produtos"][produto]["cobertura"]

    def test_rota_111(self):
        self.assertEqual(self.cob("v1/rotas/111.json"),
                         {"meta": 3.0, "realizado": 2, "atingimento_pct": 67, "diferenca": -1.0, "online_hoje": 1})

    def test_rota_112_conta_cliente_de_outra_gerencia_pela_rota_da_meta(self):
        self.assertEqual(self.cob("v1/rotas/112.json"),
                         {"meta": 2.0, "realizado": 2, "atingimento_pct": 100, "diferenca": 0.0, "online_hoje": 0})

    def test_sem_meta_de_cobertura(self):
        self.assertEqual(self.cob("v1/rotas/111.json", "powerade"),
                         {"meta": None, "realizado": 0, "atingimento_pct": None, "diferenca": None, "online_hoje": 0})

    def test_somas_da_supervisao_gerencia_e_empresa(self):
        g = self.api["v1/gerencias/G1.json"]
        self.assertEqual(g["produtos"]["sucos"]["cobertura"],
                         {"meta": 5.0, "realizado": 4, "atingimento_pct": 80, "diferenca": -1.0, "online_hoje": 1})
        sv1 = next(s for s in g["supervisoes"] if s["id"] == "SV.G1.1")
        self.assertEqual((sv1["produtos"]["sucos"]["cobertura"]["meta"], sv1["produtos"]["sucos"]["cobertura"]["realizado"]),
                         (3.0, 2))
        self.assertEqual(self.api["v1/resumo.json"]["empresa"]["produtos"]["sucos"]["cobertura"],
                         g["produtos"]["sucos"]["cobertura"])

    def test_cliente(self):
        c111, c112 = _clientes(self.api, "111"), _clientes(self.api, "112")
        sucos = lambda c: (c["produtos"]["sucos"]["coberto"], c["produtos"]["sucos"]["coberto_hoje"])  # noqa: E731
        self.assertEqual(sucos(c111[1]), (True, False))
        self.assertEqual(sucos(c111[5]), (False, True))
        self.assertEqual(sucos(c111[6]), (False, False))   # pedido cancelado não cobre
        self.assertEqual(sucos(c111[2]), (False, False))
        self.assertEqual(sucos(c111[3]), (True, False))    # coberto na meta da 111, mesmo estando hoje na 112
        self.assertEqual(sucos(c112[4]), (True, False))
        self.assertFalse(c112[4]["na_base"])
        self.assertEqual(c111[1]["produtos"]["powerade"]["coberto"], False)

    def test_soma_dos_clientes_bate_com_a_rota(self):
        for r in ("111", "112"):
            cli = _clientes(self.api, r)
            self.assertEqual(sum(c["produtos"]["sucos"]["coberto"] for c in cli.values()),
                             self.cob(f"v1/rotas/{r}.json")["realizado"])
            self.assertEqual(sum(c["produtos"]["sucos"]["coberto_hoje"] for c in cli.values()),
                             self.cob(f"v1/rotas/{r}.json")["online_hoje"])

    def test_volume_nao_muda(self):
        b = self.api["v1/rotas/111.json"]["produtos"]["sucos"]
        self.assertEqual((b["meta"], b["realizado"], b["online_hoje"]), (100.0, 58.0, 5.0))   # 3 + 2 do cli 5

    def test_consulta_da_cobertura_sem_status_da_nota(self):
        sels = [sel for objeto, sel, _ in self.cons.chamadas if CM.COB_REAL in sel and CM.CLIENTE in sel]
        self.assertTrue(sels)
        self.assertTrue(all(CM.NF_STATUS not in sel for sel in sels))

    def test_validacao_passa(self):
        self.assertEqual(validacao.validar(self.api)[0], [])


class TestCoberturaIndisponivel(unittest.TestCase):
    def test_sem_colunas_no_modelo_fica_null(self):
        dados = fontes.carregar(cenario(), AGORA)
        a = api.montar(dados)
        self.assertIsNone(a["v1/resumo.json"]["empresa"]["produtos"]["sucos"]["cobertura"])
        cli = a["v1/rotas/111.json"]["clientes"][0]["produtos"]["sucos"]
        self.assertEqual((cli["coberto"], cli["coberto_hoje"]), (None, None))
        self.assertTrue(any("Cobertura indisponível" in x for x in dados.avisos))


class TestCoberturaNoFechamento(unittest.TestCase):
    def test_sem_online_no_fechamento(self):
        from datetime import date
        dados = simulado.gerar(AGORA_NOV, ref=date(2026, 10, 1))
        a = api.montar(dados)
        c = a["v1/resumo.json"]["empresa"]["produtos"]["sucos"]["cobertura"]
        self.assertIsNone(c["online_hoje"])
        self.assertIsNotNone(c["meta"])
        cli = next(iter(a[k] for k in a if k.startswith("v1/rotas/")))["clientes"][0]["produtos"]["sucos"]
        self.assertIsNone(cli["coberto_hoje"])
        self.assertIn(cli["coberto"], (True, False))


class TestCoberturaNaBaseDoDia(unittest.TestCase):
    def setUp(self):
        self.pasta = Path(tempfile.mkdtemp(prefix="base_cob_"))
        self.caminho = self.pasta / "base.json"

    def tearDown(self):
        shutil.rmtree(self.pasta, ignore_errors=True)

    def test_incremental_igual_a_completa_e_cobertura_de_hoje_atualizada(self):
        dados, assinatura, _ = base_dia.carregar(cenario_cob(), AGORA_NOV, self.caminho)
        self.assertTrue(base_dia.salvar(self.caminho, dados, assinatura))
        depois = AGORA_NOV + timedelta(minutes=15)

        def com_cliente_7(cons):
            cons.dados[M.OBJ_BASE_CLIENTE].append(_cliente(7, "111", "Sv. G1.1"))
            cons.dados[M.OBJ_META].append(_fato_nov("111", 7, "Sucos", "111", fonte="WF Online", data="2026-11-10",
                                                    **{CM.VOL_ONLINE: 1, CM.COB_ONLINE: 1}))
            return cons

        cons = cenario_cob()
        cons.dados[M.OBJ_META].append(_fato_nov("111", 7, "Sucos", "111", fonte="WF Online", data="2026-11-10",
                                                **{CM.VOL_ONLINE: 1, CM.COB_ONLINE: 1}))
        inc, _, incremental = base_dia.carregar(cons, depois, self.caminho)
        self.assertTrue(incremental)
        a = api.montar(inc)
        self.assertEqual(a["v1/rotas/111.json"]["produtos"]["sucos"]["cobertura"]["online_hoje"], 2)
        # a carga completa com o mesmo dado: igual, a não ser pelo cliente 7, que só a carga completa vê na base
        completa = api.montar(fontes.carregar(com_cliente_7(cenario_cob()), depois))
        self.assertEqual(a["v1/resumo.json"], completa["v1/resumo.json"])

    def test_cobertura_mudou_faz_carga_completa(self):
        dados, assinatura, _ = base_dia.carregar(cenario_cob(), AGORA_NOV, self.caminho)
        base_dia.salvar(self.caminho, dados, assinatura)
        cons = cenario_cob()
        cons.dados[M.OBJ_META].append(_fato_nov("111", 2, "Sucos", "111", **{CM.COB_REAL: 1}))
        _, _, incremental = base_dia.carregar(cons, AGORA_NOV + timedelta(minutes=15), self.caminho)
        self.assertFalse(incremental)


if __name__ == "__main__":
    unittest.main()
