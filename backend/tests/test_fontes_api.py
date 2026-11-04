"""Consulta -> normalização -> API, com um Datasphere falso e valores conferidos à mão.

Cenário (22/10/2026, dia útil 15 de 21; 14 fechados; ritmo esperado 67%):
  rota 111 (G1, SV.G1.1): clientes 1 e 2   | rota 112 (G1, SV.G1.2): cliente 3
  cliente 9 está numa rota eventual (EV5), gerência comercial G1
  Sucos  111: META_VOLUME 100; META_NEG cli 1 = 40 até ontem + 20 de hoje em diante; cli 2 = 30 + 10
              faturado: cli 1 = 50 Acertado + 10 Cancelada (fora); cli 2 = 20 Em Aberto
              pedidos de hoje: cli 1 = 3 (Inc. e Exp.), cli 2 = 4 (Cancelado, fora); meta do dia 4
  Sucos  112: META_VOLUME 40, sem META_NEG; faturado cli 3 = 15
  Powerade 111: META_VOLUME 50, nada faturado
  Individuais 111: sem META_VOLUME, META_NEG cli 1 = 30, faturado cli 1 = 12 -> meta 0 (como o SAC)
  EV5 (cliente 9): faturado Sucos 5 -> entra só no total da G1
"""
import sys
import unittest
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from gerador import api, fontes, validacao  # noqa: E402
from gerador import mapeamento as M  # noqa: E402
from tests.falso import ConsultaFalsa  # noqa: E402

AGORA = datetime(2026, 10, 22, 10, 0)


def _fato(rota, pv, ag, fonte="Basis", data="2026-10-10", gc_com="Gc. G1", **medidas):
    return {"ANOMES_REF": "202610", "CD_ROTA_Clien": rota, "DS_GC_AGRUPADA_ATUAL_Clien": "Gc. G1",
            "DS_GERENCIA_COMERCIAL_AT_Clien": gc_com, "CD_CLIENTE": str(pv), "DS_AGRUPADOR_Agrupador_Prod": ag,
            "DATA_MOVIMENTO": data, "FONTE": fonte, "SITUACAO_Pedido": medidas.pop("situacao", "Inc. e Exp."),
            "NF_STATUS_Nota_Fiscal": medidas.pop("nf", "Acertado"),
            "ANOMES_REF_Chave_Meta_SAP": None, "CD_ROTA_Chave_Meta_SAP": medidas.pop("rota_meta", None),
            "AGRUPADOR_PRODU_Chave_Meta_SAP": None, **medidas}


def _meta(rota, ag, valor, anomes="202610"):
    return {"ANOMES_REF": anomes, "ANOMES_REF_Chave_Meta_SAP": anomes, "CD_ROTA_Chave_Meta_SAP": rota,
            "AGRUPADOR_PRODU_Chave_Meta_SAP": ag, "META_VOLUME_Chave_Meta_SAP": valor}


def _cliente(pv, rota, sv):
    return {"CD_ROTA": rota, "CD_CLIENTE": str(pv), "NM_NOME_FANTASIA": f"Cliente {pv}", "DS_SEGMENTO": "Boteco",
            "DS_GC_AGRUPADA_ATUAL": "Gc. G1", "DS_SUPERVISOR_ATUAL": sv, "DS_NOME_SUPERVISOR_ATUAL": f"Nome {sv}",
            "DS_VENDEDOR_ATUAL": f"Vend {rota}", "QUANTIDADE": 1, "FL_CORRENTE": "S", "STATUS_CLIENTE": "Ativo"}


def cenario() -> ConsultaFalsa:
    neg = lambda pv, data, v: _fato("111", pv, "Sucos", fonte="Meta NEG", data=data, situacao="Meta NEG",  # noqa: E731
                                    nf="Meta Neg", rota_meta="111", META_NEG=v)
    meta = [
        _meta("111", "Sucos", 100), _meta("111", "Powerade", 50), _meta("112", "Sucos", 40),
        _meta("999", "Cervejas", 999),   # agrupador fora da API: ignorado
    ]
    fatos = [
        neg(1, "2026-10-10", 40), neg(1, "2026-10-22", 10), neg(1, "2026-10-28", 10),
        neg(2, "2026-10-15", 30), neg(2, "2026-10-23", 10),
        _fato("111", 1, "Sucos", FX_VOL_PADRAO_FAT=50),
        _fato("111", 1, "Sucos", nf="Cancelada", FX_VOL_PADRAO_FAT=10),
        _fato("111", 2, "Sucos", nf="Em Aberto", FX_VOL_PADRAO_FAT=20),
        _fato("112", 3, "Sucos", FX_VOL_PADRAO_FAT=15),
        _fato("112", 3, "SUCOS", FX_VOL_PADRAO_FAT=99),   # grafia diferente: o $filter é exato, fica fora
        _fato("EV5", 9, "Sucos", FX_VOL_PADRAO_FAT=5),
        _fato("111", 1, "Sucos", fonte="WF Online", data="2026-10-22", FX_VOL_PADRAO_WF_ONLINE=3),
        _fato("111", 2, "Sucos", fonte="WF Online", data="2026-10-22", situacao="Cancelado", FX_VOL_PADRAO_WF_ONLINE=4),
        _fato("111", 1, "Sucos", fonte="Meta NEG", data="2026-10-22", rota_meta="111", META_RECUPERAVEL_ROTA=4),
        _fato("111", 1, "Cervejas", FX_VOL_PADRAO_FAT=500),                 # fora da API
        _fato("111", 1, "Refrigerantes Individual", fonte="Meta NEG", data="2026-10-12", situacao="Meta NEG",
              nf="Meta Neg", rota_meta="111", META_NEG=30),                  # sem META_VOLUME
        _fato("111", 1, "Refrigerantes Individual", FX_VOL_PADRAO_FAT=12),
    ]
    base = [_cliente(1, "111", "Sv. G1.1"), _cliente(2, "111", "Sv. G1.1"), _cliente(3, "112", "Sv. G1. 2"),
            _cliente(9, "EV5", "Sv. G1.1")]
    cal = [{"DATA": "2026-10-22", "NO_DIAS_UTEIS_MES": 21, "NO_DIA_UTIL": 15, "NO_DIAS_UTEIS_RESTANTES": 7}]
    return ConsultaFalsa({M.OBJ_META: meta + fatos, M.OBJ_BASE_CLIENTE: base, M.OBJ_CALENDARIO: cal},
                         tipos={M.OBJ_META: {"DATA_MOVIMENTO": "Edm.Date"}})


class TestCenario(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dados = fontes.carregar(cenario(), AGORA)
        cls.api = api.montar(cls.dados)

    def test_calendario(self):
        cal = self.api["v1/index.json"]["calendario"]
        self.assertEqual((cal["dias_uteis_mes"], cal["dia_util_hoje"], cal["dias_uteis_fechados"]), (21, 15, 14))
        self.assertEqual(cal["ritmo_esperado_pct"], 67)
        self.assertFalse(self.api["v1/index.json"]["mes_referencia"]["fechamento"])

    def test_rota_111_sucos(self):
        b = self.api["v1/rotas/111.json"]["produtos"]["sucos"]
        self.assertEqual(b["meta"], 100.0)
        self.assertEqual(b["realizado"], 70.0)            # 50 + 20; a NF cancelada fica fora
        self.assertEqual(b["tendencia"], 100.0)           # 70 + 30 restante da META_NEG (direto)
        self.assertEqual(b["tendencia_pct"], 100)
        self.assertEqual(b["atingimento_pct"], 70)
        self.assertEqual(b["meta_dia"], 4.0)
        self.assertEqual(b["online_hoje"], 3.0)           # pedido cancelado fora
        self.assertEqual(b["status"], "no_ritmo")

    def test_rota_112_sem_curva(self):
        b = self.api["v1/rotas/112.json"]["produtos"]["sucos"]
        self.assertEqual((b["meta"], b["realizado"]), (40.0, 15.0))
        self.assertEqual(b["tendencia"], round(15 + 40 * 7 / 21, 1))   # restante por dias úteis
        self.assertEqual(b["status"], "abaixo_do_ritmo")

    def test_powerade_sem_venda(self):
        b = self.api["v1/rotas/111.json"]["produtos"]["powerade"]
        self.assertEqual((b["meta"], b["realizado"], b["atingimento_pct"]), (50.0, 0.0, 0))

    def test_produto_sem_meta(self):
        self.assertEqual(self.api["v1/rotas/111.json"]["produtos"]["sabores"]["status"], "sem_meta")

    def test_individuais_sem_meta_volume_fica_com_meta_zero(self):
        b = self.api["v1/rotas/111.json"]["produtos"]["individuais"]
        self.assertEqual((b["meta"], b["realizado"], b["status"]), (0.0, 12.0, "sem_meta"))   # não usa a META_NEG (30)
        self.assertFalse(any("Vol. Individuais" in a for a in self.dados.avisos))

    def test_clientes(self):
        cli = {c["pv"]: c for c in self.api["v1/rotas/111.json"]["clientes"]}
        self.assertEqual(set(cli), {1, 2})
        c1, c2 = cli[1]["produtos"]["sucos"], cli[2]["produtos"]["sucos"]
        self.assertEqual((c1["meta"], c1["realizado"], c1["atingimento_pct"], c1["online_hoje"]), (60.0, 50.0, 83, 3.0))
        self.assertEqual(c1["status"], "no_ritmo")        # 83% >= 67%
        self.assertEqual((c2["meta"], c2["realizado"], c2["status"]), (40.0, 20.0, "abaixo_do_ritmo"))
        self.assertEqual(cli[1]["nome"], "CLIENTE 1")

    def test_supervisao_com_espaco_no_codigo(self):
        rota = self.api["v1/rotas/112.json"]["rota"]
        self.assertEqual((rota["supervisao"], rota["gerencia"]), ("SV.G1.2", "G1"))

    def test_gerencia_soma_rotas_e_eventuais(self):
        g = self.api["v1/gerencias/G1.json"]
        b = g["produtos"]["sucos"]
        self.assertEqual(b["meta"], 140.0)                # 100 + 40 (+ 0 da rota eventual)
        self.assertEqual(b["realizado"], 90.0)            # 70 + 15 + 5 do cliente em EV5
        tipos = {r["id"]: r["tipo"] for r in g["rotas"]}
        self.assertEqual(tipos, {"111": "normal", "112": "normal", "G1-EV": "eventual"})
        sv1 = next(s for s in g["supervisoes"] if s["id"] == "SV.G1.1")
        self.assertEqual(sv1["produtos"]["sucos"]["realizado"], 70.0)

    def test_empresa_igual_soma_das_gerencias(self):
        r = self.api["v1/resumo.json"]
        for k in M.IDS_PRODUTOS:
            soma = sum(g["produtos"][k]["realizado"] or 0 for g in r["gerencias"])
            self.assertAlmostEqual(r["empresa"]["produtos"][k]["realizado"] or 0, soma, places=1)

    def test_busca_sem_cliente_de_rota_eventual(self):
        self.assertEqual([c[0] for c in self.api["v1/busca.json"]["clientes"]], [1, 2, 3])

    def test_validacao_passa_com_aviso_dos_produtos_sem_meta(self):
        erros, avisos = validacao.validar(self.api)
        self.assertEqual(erros, [])
        self.assertTrue(any("Vol. Sabores" in a for a in avisos))

    def test_consultas_so_com_agrupadores_da_api(self):
        cons = cenario()
        fontes.carregar(cons, AGORA)
        for objeto, _, filtro in cons.chamadas:
            if objeto == M.OBJ_META and filtro:
                self.assertNotIn("Cervejas", filtro)


class TestFechamento(unittest.TestCase):
    def test_primeiro_dia_util_mostra_mes_anterior(self):
        cons = cenario()
        cons.dados[M.OBJ_CALENDARIO] = [
            {"DATA": "2026-09-30", "NO_DIAS_UTEIS_MES": 22, "NO_DIA_UTIL": 22, "NO_DIAS_UTEIS_RESTANTES": 0},
            {"DATA": "2026-10-01", "NO_DIAS_UTEIS_MES": 21, "NO_DIA_UTIL": 1, "NO_DIAS_UTEIS_RESTANTES": 21}]
        for l in cons.dados[M.OBJ_META]:   # dados de setembro
            l["ANOMES_REF"] = "202609"
            if l.get("ANOMES_REF_Chave_Meta_SAP"):
                l["ANOMES_REF_Chave_Meta_SAP"] = "202609"
        a = api.montar(fontes.carregar(cons, datetime(2026, 10, 1, 9, 0)))
        idx = a["v1/index.json"]
        self.assertEqual(idx["mes_referencia"], {"anomes": "202609", "rotulo": "Setembro/26", "fechamento": True})
        b = a["v1/rotas/111.json"]["produtos"]["sucos"]
        self.assertEqual((b["realizado"], b["tendencia"], b["meta_dia"], b["online_hoje"]), (70.0, None, None, None))
        self.assertEqual(b["status"], "abaixo_do_ritmo")   # 70% realizado no mês fechado


class TestAgrupadoresExtras(unittest.TestCase):
    def tearDown(self):
        M.incluir_agrupadores([])

    def test_extra_do_painel_entra_na_api(self):
        self.assertEqual(M.incluir_agrupadores([{"id": "agua", "nome": "Água", "agrupador": "Agua"}]), [])
        cons = cenario()
        cons.dados[M.OBJ_META] += [_meta("111", "Agua", 30), _fato("111", 1, "Agua", FX_VOL_PADRAO_FAT=12)]
        a = api.montar(fontes.carregar(cons, AGORA))
        b = a["v1/rotas/111.json"]["produtos"]["agua"]
        self.assertEqual((b["meta"], b["realizado"]), (30.0, 12.0))
        prod = {p["id"]: p for p in a["v1/index.json"]["produtos"]}
        self.assertEqual((prod["agua"]["nome"], prod["agua"]["agrupadores"], prod["agua"]["extra"]), ("Vol. Água", ["Agua"], True))
        self.assertFalse(prod["sucos"]["extra"])
        ags = dict(a["v1/agrupadores.json"]["agrupadores"])   # todos os agrupadores com META_VOLUME, inclusive fora da API
        self.assertEqual((ags["Sucos"], ags["Agua"], ags["Cervejas"]), (140.0, 30.0, 999.0))


AGORA_NOV = datetime(2026, 11, 10, 10, 0)
SEM_CHAVE = {"mes_meta": "210012", "ag_meta": "--", "rota_meta": None}   # venda sem associação com a meta


def _fato_nov(rota, pv, ag, rota_meta, ag_meta=None, mes_meta="202611", data="2026-11-05", gc="Gc. G1", **medidas):
    """Linha de venda de novembro com a chave da meta (mês, agrupador e rota da meta)."""
    l = _fato(rota, pv, ag, data=data, rota_meta=rota_meta, **medidas)
    l.update({"ANOMES_REF": "202611", "ANOMES_REF_Chave_Meta_SAP": mes_meta, "DS_GC_AGRUPADA_ATUAL_Clien": gc,
              "AGRUPADOR_PRODU_Chave_Meta_SAP": ag if ag_meta is None else ag_meta})
    return l


def cenario_nov() -> ConsultaFalsa:
    """Novembro, Real pela chave da meta (como o SAC). Mesmas rotas do cenário de outubro:
      cli 1 (111): Sucos 50 na meta da 111
      cli 3 (hoje na 112, veio da 111): Sucos 8 na meta da 111 e 7 na meta da 112
      cli 9 (EV5): Sucos 5 na meta da 112; Sucos 2 sem chave de meta (fica fora)
      cli 4 (cliente de outra gerência, fora da base): Sucos 1 na meta da 112
      cli 2 (111): Powerade 6 sem chave de meta (fica fora); Sabores 30 sem chave (Sabores sem meta carregada)
      cli 1: Sucos 4 na meta da rota 777, que não está na base (aviso)
      pedidos de hoje: cli 1 Sucos 3 na meta da 111; cli 3 Sucos 4 na meta da 112; cli 2 Sucos 2 sem chave (fora)
    """
    meta = [_meta("111", "Sucos", 100, "202611"), _meta("111", "Powerade", 50, "202611"),
            _meta("112", "Sucos", 40, "202611")]
    fatos = [
        _fato_nov("111", 1, "Sucos", "111", FX_VOL_PADRAO_FAT=50),
        _fato_nov("112", 3, "Sucos", "111", FX_VOL_PADRAO_FAT=8),
        _fato_nov("112", 3, "Sucos", "112", FX_VOL_PADRAO_FAT=7),
        _fato_nov("EV5", 9, "Sucos", "112", FX_VOL_PADRAO_FAT=5),
        _fato_nov("EV5", 9, "Sucos", **SEM_CHAVE, FX_VOL_PADRAO_FAT=2),
        _fato_nov("X01", 4, "Sucos", "112", gc="--", FX_VOL_PADRAO_FAT=1),
        _fato_nov("111", 2, "Powerade", **SEM_CHAVE, FX_VOL_PADRAO_FAT=6),
        _fato_nov("111", 2, "Sabores Tt", **SEM_CHAVE, FX_VOL_PADRAO_FAT=30),
        _fato_nov("111", 1, "Sucos", "777", FX_VOL_PADRAO_FAT=4),
        _fato_nov("111", 1, "Sucos", "111", fonte="WF Online", data="2026-11-10", FX_VOL_PADRAO_WF_ONLINE=3),
        _fato_nov("112", 3, "Sucos", "112", fonte="WF Online", data="2026-11-10", FX_VOL_PADRAO_WF_ONLINE=4),
        _fato_nov("111", 2, "Sucos", **SEM_CHAVE, fonte="WF Online", data="2026-11-10", FX_VOL_PADRAO_WF_ONLINE=2),
        _fato_nov("111", 1, "Sucos", "111", fonte="Meta NEG", situacao="Meta NEG", nf="Meta Neg", data="2026-11-03",
                  META_NEG=60),
        _fato_nov("111", 1, "Sucos", "111", fonte="Meta NEG", data="2026-11-10", META_RECUPERAVEL_ROTA=4),
    ]
    base = [_cliente(1, "111", "Sv. G1.1"), _cliente(2, "111", "Sv. G1.1"), _cliente(3, "112", "Sv. G1. 2"),
            _cliente(9, "EV5", "Sv. G1.1")]
    cal = [{"DATA": "2026-11-10", "NO_DIAS_UTEIS_MES": 20, "NO_DIA_UTIL": 6, "NO_DIAS_UTEIS_RESTANTES": 15}]
    return ConsultaFalsa({M.OBJ_META: meta + fatos, M.OBJ_BASE_CLIENTE: base, M.OBJ_CALENDARIO: cal},
                         tipos={M.OBJ_META: {"DATA_MOVIMENTO": "Edm.Date"}})


class TestRealPelaChaveDaMeta(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cons = cenario_nov()
        cls.dados = fontes.carregar(cls.cons, AGORA_NOV)
        cls.api = api.montar(cls.dados)

    def test_so_a_partir_de_novembro(self):
        self.assertEqual(M.REAL_PELA_META_DESDE, "202611")
        self.assertEqual([M.real_pela_meta(m) for m in ("202609", "202610", "202611", "202701")],
                         [False, False, True, True])

    def test_real_vai_para_a_rota_da_meta(self):
        sucos = lambda r: self.api[f"v1/rotas/{r}.json"]["produtos"]["sucos"]  # noqa: E731
        self.assertEqual(self.api["v1/index.json"]["mes_referencia"]["anomes"], "202611")
        self.assertEqual((sucos("111")["meta"], sucos("111")["realizado"]), (100.0, 58.0))   # 50 + 8 do cli 3
        self.assertEqual((sucos("112")["meta"], sucos("112")["realizado"]), (40.0, 13.0))    # 7 + 5 (EV5) + 1 (outra GC)

    def test_venda_sem_chave_de_meta_fica_fora(self):
        rota = self.api["v1/rotas/111.json"]["produtos"]
        self.assertEqual((rota["powerade"]["meta"], rota["powerade"]["realizado"]), (50.0, 0.0))
        self.assertEqual(rota["sabores"]["status"], "sem_meta")
        self.assertFalse(rota["sabores"]["realizado"])
        g = self.api["v1/gerencias/G1.json"]
        self.assertEqual(g["produtos"]["sucos"]["realizado"], 71.0)   # 58 + 13; o 2 sem chave e o 4 da 777 ficam fora

    def test_sem_rota_eventual(self):
        tipos = {r["id"]: r["tipo"] for r in self.api["v1/gerencias/G1.json"]["rotas"]}
        self.assertEqual(tipos, {"111": "normal", "112": "normal"})

    def test_online_pela_rota_da_meta(self):
        sucos = lambda r: self.api[f"v1/rotas/{r}.json"]["produtos"]["sucos"]["online_hoje"]  # noqa: E731
        self.assertEqual((sucos("111"), sucos("112")), (3.0, 4.0))   # o pedido sem chave de meta fica fora

    def test_cliente_que_mudou_de_rota(self):
        cli = lambda r: {c["pv"]: c for c in self.api[f"v1/rotas/{r}.json"]["clientes"]}  # noqa: E731
        c111, c112 = cli("111"), cli("112")
        self.assertEqual(c111[3]["produtos"]["sucos"]["realizado"], 8.0)
        self.assertFalse(c111[3]["na_base"])
        self.assertEqual(c112[3]["produtos"]["sucos"]["realizado"], 7.0)
        self.assertTrue(c112[3]["na_base"])

    def test_aviso_da_rota_da_meta_fora_da_base(self):
        self.assertTrue(any("777 4.0" in a for a in self.dados.avisos), self.dados.avisos)
        self.assertNotIn("v1/rotas/777.json", self.api)

    def test_consultas_pela_chave_da_meta(self):
        filtros = [f for objeto, sel, f in self.cons.chamadas if objeto == M.OBJ_META and M.ColMeta.NF_STATUS in sel]
        self.assertTrue(filtros)
        self.assertTrue(all("ANOMES_REF_Chave_Meta_SAP eq '202611'" in f for f in filtros))
        self.assertTrue(any("DS_GC_AGRUPADA_ATUAL_Clien ne 'Gc. G1'" in f for f in filtros))   # clientes de outra GC

    def test_validacao_passa(self):
        erros, _ = validacao.validar(self.api)
        self.assertEqual(erros, [])


if __name__ == "__main__":
    unittest.main()
