"""Exclusão de volume de nota fiscal do fechamento (gerador/exclusoes.py), sem rede.

Fixtures sintéticas: rotas 7xx, clientes 7x e notas 'A1'/'A2'/'A3'/'B1' — nada de dado real.
As entradas de exclusão dos testes são sempre injetadas no lugar de EXCLUSOES, então a lista publicada do
repositório nunca interfere.
"""
import logging
import sys
import unittest
from dataclasses import replace
from datetime import datetime
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from gerador import api, exclusoes, fontes, simulado  # noqa: E402
from gerador import mapeamento as M  # noqa: E402
from tests.falso import ConsultaFalsa  # noqa: E402
from tests.test_fechado import SNAP, Rodadas  # noqa: E402
from tests.test_fontes_api import _cliente, _meta  # noqa: E402

CM = M.ColMeta
AGORA = datetime(2026, 10, 22, 10, 0)
AGORA_NOV = datetime(2026, 11, 10, 10, 0)
MOTIVO = "Nota fora do fechamento (teste)"


def _entrada(nf, rota, ag="Powerade", volume=30.0, anomes="202610"):
    return {"anomes": anomes, "nf": nf, "rota": rota, "agrupador": ag, "volume": volume, "motivo": MOTIVO}


# --------------------------------------------------------------------------- funções puras
class TestCasamentoDaLinha(unittest.TestCase):
    """Uma entrada: nota A1, rota 111, agrupador Powerade, outubro."""

    def setUp(self):
        self.ent = [_entrada("A1", "111")]

    def casa(self, rota="111", ag="Powerade", nf="A1", anomes="202610"):
        return exclusoes.entrada_da_linha(anomes, rota, ag, nf, self.ent)

    def test_linha_que_casa_com_todos_os_campos_sai(self):
        self.assertIsNotNone(self.casa())

    def test_outra_nota_na_mesma_rota_e_agrupador_fica(self):
        """O caso que a chave mês+cliente+rota+data+agrupador erraria: notas irmãs do mesmo dia."""
        self.assertIsNone(self.casa(nf="A2"))

    def test_outra_rota_fica(self):
        self.assertIsNone(self.casa(rota="112"))

    def test_outro_agrupador_fica(self):
        self.assertIsNone(self.casa(ag="Sucos"))

    def test_outro_mes_fica(self):
        self.assertIsNone(self.casa(anomes="202611"))

    def test_lista_vazia_nao_casa_nada(self):
        self.ent = []
        self.assertIsNone(self.casa())

    def test_linha_sem_numero_de_nota_fica(self):
        self.assertIsNone(self.casa(nf=None))
        self.assertIsNone(self.casa(nf=""))

    def test_compara_rota_e_agrupador_sem_caixa_e_sem_acento(self):
        self.ent = [_entrada("A1", "r32", ag="Retornavel Único")]
        self.assertIsNotNone(exclusoes.entrada_da_linha("202610", "R32", "RETORNÁVEL ÚNICO", "A1", self.ent))

    def test_zeros_a_esquerda_da_nota_nao_atrapalham(self):
        self.assertIsNotNone(self.casa(nf="000A1".replace("A1", "A1")))
        self.ent = [_entrada("0867744", "R32")]
        self.assertIsNotNone(exclusoes.entrada_da_linha("202610", "R32", "Powerade", "867744", self.ent))

    def test_do_mes_so_traz_as_entradas_daquele_mes(self):
        ent = [_entrada("A1", "111"), _entrada("B1", "111", anomes="202611")]
        self.assertEqual([x["nf"] for x in exclusoes.do_mes("202610", ent)], ["A1"])
        self.assertEqual([x["nf"] for x in exclusoes.do_mes("202612", ent)], [])


class TestTotalPorEntrada(unittest.TestCase):
    COLS = dict(col_rota="r", col_agrupador="ag", col_nf="nf", col_volume="vol")

    def total(self, linhas, ent):
        achados = exclusoes.total_por_entrada(linhas, "202610", entradas=ent, **self.COLS)
        return exclusoes.aplicadas(achados, "202610", ent)

    def test_soma_as_linhas_de_cada_entrada(self):
        ent = [_entrada("A1", "111", volume=30.0), _entrada("A3", "111", volume=40.0)]
        linhas = [{"r": "111", "ag": "Powerade", "nf": "A1", "vol": 18.0},
                  {"r": "111", "ag": "Powerade", "nf": "A1", "vol": 12.0},
                  {"r": "111", "ag": "Powerade", "nf": "A3", "vol": 40.0},
                  {"r": "111", "ag": "Powerade", "nf": "A2", "vol": 99.0},   # fica
                  {"r": "112", "ag": "Powerade", "nf": "A1", "vol": 99.0}]   # fica
        self.assertEqual([(a["rota"], a["agrupador"], a["volume"], a["linhas"]) for a in self.total(linhas, ent)],
                         [("111", "Powerade", 30.0, 2), ("111", "Powerade", 40.0, 1)])

    def test_entrada_sem_nenhuma_linha_fica_com_zero(self):
        a = self.total([], [_entrada("A1", "111", volume=30.0)])[0]
        self.assertEqual((a["volume"], a["linhas"], a["esperado"]), (0.0, 0, 30.0))

    def test_aplicadas_nao_expoe_nota_nem_cliente(self):
        a = self.total([{"r": "111", "ag": "Powerade", "nf": "A1", "vol": 30.0}], [_entrada("A1", "111")])[0]
        self.assertEqual(sorted(a), ["agrupador", "esperado", "linhas", "motivo", "rota", "volume"])


class TestConferencia(unittest.TestCase):
    def conferir(self, saiu, esperado=30.0):
        return exclusoes.conferir([{"rota": "111", "agrupador": "Powerade", "volume": saiu,
                                    "esperado": esperado, "motivo": MOTIVO}])

    def test_igual_ao_declarado_passa(self):
        self.assertEqual(self.conferir(30.0), ([], []))

    def test_dentro_da_tolerancia_passa(self):
        self.assertEqual(self.conferir(30.04), ([], []))
        self.assertEqual(self.conferir(29.96), ([], []))

    def test_maior_que_o_declarado_reprova(self):
        erros, avisos = self.conferir(30.06)
        self.assertEqual(len(erros), 1)
        self.assertEqual(avisos, [])
        self.assertIn("mais que", erros[0])

    def test_menor_que_o_declarado_so_avisa(self):
        erros, avisos = self.conferir(10.0)
        self.assertEqual(erros, [])
        self.assertEqual(len(avisos), 1)
        self.assertTrue(avisos[0].startswith("ATENÇÃO:"))

    def test_zero_segue_com_aviso(self):
        erros, avisos = self.conferir(0.0)
        self.assertEqual(erros, [])
        self.assertIn("tire a entrada da lista", avisos[0])

    def test_lista_vazia_nao_diz_nada(self):
        self.assertEqual(exclusoes.conferir(None), ([], []))
        self.assertEqual(exclusoes.conferir([]), ([], []))

    def test_conferir_ou_parar_levanta_so_quando_saiu_mais(self):
        with self.assertRaises(exclusoes.VolumeExcluidoMaior):
            exclusoes.conferir_ou_parar([{"rota": "111", "agrupador": "Powerade", "volume": 99.0,
                                          "esperado": 30.0, "motivo": MOTIVO}], "202610")
        avisos = exclusoes.conferir_ou_parar([{"rota": "111", "agrupador": "Powerade", "volume": 0.0,
                                               "esperado": 30.0, "motivo": MOTIVO}], "202610")
        self.assertEqual(len(avisos), 1)


class TestPublicar(unittest.TestCase):
    def test_bloco_publicado_nao_tem_nota_nem_cliente_nem_esperado(self):
        bloco = exclusoes.publicar([{"rota": "R32", "agrupador": "Powerade", "volume": 166.95,
                                     "esperado": 166.95, "motivo": MOTIVO, "linhas": 1}])
        self.assertEqual(bloco, [{"rota": "R32", "agrupador": "Powerade", "volume": 166.9, "motivo": MOTIVO}])

    def test_entrada_que_nao_tirou_volume_nao_vira_linha(self):
        self.assertIsNone(exclusoes.publicar([{"rota": "R32", "agrupador": "Powerade", "volume": 0.0,
                                               "esperado": 166.95, "motivo": MOTIVO}]))

    def test_sem_exclusao_nao_ha_bloco(self):
        self.assertIsNone(exclusoes.publicar([]))
        self.assertIsNone(exclusoes.publicar(None))


# --------------------------------------------------------------------------- consulta inteira
def _venda(rota, pv, ag, nf, vol, anomes="202610", rota_meta=None, ag_meta=None, coberto=True):
    """Linha de Vol Real com número de nota. Sem rota_meta/ag_meta vale a chave do faturamento (outubro)."""
    return {"ANOMES_REF": anomes, "CD_ROTA_Clien": rota, "DS_GC_AGRUPADA_ATUAL_Clien": "Gc. G1",
            "DS_GERENCIA_COMERCIAL_AT_Clien": "Gc. G1", "CD_CLIENTE": str(pv),
            "DS_AGRUPADOR_Agrupador_Prod": ag, "DATA_MOVIMENTO": "2026-10-10" if anomes == "202610" else "2026-11-05",
            "FONTE": "Basis", "SITUACAO_Pedido": "Inc. e Exp.", "NF_STATUS_Nota_Fiscal": "Acertado",
            "NF_NRONF_Nota_Fiscal": nf, "FX_VOL_PADRAO_FAT": vol,
            "ANOMES_REF_Chave_Meta_SAP": anomes if rota_meta else None,
            "CD_ROTA_Chave_Meta_SAP": rota_meta,
            "AGRUPADOR_PRODU_Chave_Meta_SAP": (ag_meta or ag) if rota_meta else None,
            **({"FX_COBERTURA_REALIZADO": 1} if coberto else {})}


def _cenario(anomes="202610"):
    """Powerade nas rotas 711 (SV.G1.1) e 712 (SV.G1.2), com notas sintéticas.

      711 / cli 71: nota A1 30 (a excluir) + nota A2 20 (fica) -> cliente segue coberto
      711 / cli 72: nota A3 40 (a excluir)                     -> cliente fica SEM volume, cobertura cai
      712 / cli 73: nota A1 50                                 -> mesma nota, outra rota: fica
      711 / cli 71: Sucos na nota A1, 7                        -> mesma nota e rota, outro agrupador: fica
    """
    pela_meta = anomes != "202610"
    rm = (lambda r: r) if pela_meta else (lambda r: None)
    meta = [_meta("711", "Powerade", 100, anomes), _meta("712", "Powerade", 100, anomes),
            _meta("711", "Sucos", 100, anomes),
            {**_meta("711", "Powerade", None, anomes), CM.META_COBERTURA: 3},
            {**_meta("712", "Powerade", None, anomes), CM.META_COBERTURA: 1}]
    curva = {"ANOMES_REF": anomes, "CD_ROTA_Clien": "711", "DS_GC_AGRUPADA_ATUAL_Clien": "Gc. G1",
             "DS_GERENCIA_COMERCIAL_AT_Clien": "Gc. G1", "CD_CLIENTE": "71",
             "DS_AGRUPADOR_Agrupador_Prod": "Powerade", "FONTE": "Meta NEG", "SITUACAO_Pedido": "Meta NEG",
             "NF_STATUS_Nota_Fiscal": "Meta Neg", "CD_ROTA_Chave_Meta_SAP": "711",
             "ANOMES_REF_Chave_Meta_SAP": anomes, "AGRUPADOR_PRODU_Chave_Meta_SAP": "Powerade"}
    dia = "2026-10-10" if anomes == "202610" else "2026-11-05"
    hoje = "2026-10-22" if anomes == "202610" else "2026-11-10"
    fatos = [
        {**curva, "DATA_MOVIMENTO": dia, "META_NEG": 60},
        {**curva, "DATA_MOVIMENTO": hoje, "META_RECUPERAVEL_ROTA": 4},
        {**curva, "DATA_MOVIMENTO": hoje, "FONTE": "WF Online", "SITUACAO_Pedido": "Inc. e Exp.",
         "NF_STATUS_Nota_Fiscal": "Em Aberto", "FX_VOL_PADRAO_WF_ONLINE": 0},
        _venda("711", 71, "Powerade", "A1", 30, anomes, rm("711")),
        _venda("711", 71, "Powerade", "A2", 20, anomes, rm("711")),
        _venda("711", 72, "Powerade", "A3", 40, anomes, rm("711")),
        _venda("712", 73, "Powerade", "A1", 50, anomes, rm("712")),
        _venda("711", 71, "Sucos", "A1", 7, anomes, rm("711")),
    ]
    base = [_cliente(71, "711", "Sv. G1.1"), _cliente(72, "711", "Sv. G1.1"), _cliente(73, "712", "Sv. G1. 2")]
    cal = [{"DATA": hoje, "NO_DIAS_UTEIS_MES": 21, "NO_DIA_UTIL": 15, "NO_DIAS_UTEIS_RESTANTES": 7}]
    return ConsultaFalsa({M.OBJ_META: meta + fatos, M.OBJ_BASE_CLIENTE: base, M.OBJ_CALENDARIO: cal},
                         tipos={M.OBJ_META: {"DATA_MOVIMENTO": "Edm.Date"}})


class _ComExclusao(unittest.TestCase):
    ANOMES = "202610"
    QUANDO = AGORA

    def montar(self, entradas):
        with mock.patch.object(exclusoes, "EXCLUSOES", entradas):
            cons = _cenario(self.ANOMES)
            dados = fontes.carregar(cons, self.QUANDO)
        return cons, dados, api.montar(dados)

    def real(self, arquivos, arquivo, produto="powerade"):
        return arquivos[arquivo]["produtos"][produto]["realizado"]

    def cobertura(self, arquivos, arquivo, produto="powerade"):
        return arquivos[arquivo]["produtos"][produto]["cobertura"]["realizado"]


class TestExclusaoNaConsulta(_ComExclusao):
    """Chave do faturamento (outubro): duas notas fora, nos quatro níveis e na cobertura."""

    @classmethod
    def setUpClass(cls):
        cls.ent = [_entrada("A1", "711", volume=30.0), _entrada("A3", "711", volume=40.0)]

    def setUp(self):
        self.cons, self.dados, self.api = self.montar(self.ent)

    def test_rota_sai_sem_o_volume_excluido(self):
        self.assertEqual(self.real(self.api, "v1/rotas/711.json"), 20.0)   # 30 + 20 + 40 -> só a nota A2

    def test_outra_rota_com_a_mesma_nota_nao_muda(self):
        self.assertEqual(self.real(self.api, "v1/rotas/712.json"), 50.0)

    def test_outro_agrupador_da_mesma_nota_nao_muda(self):
        self.assertEqual(self.real(self.api, "v1/rotas/711.json", "sucos"), 7.0)

    def test_supervisao_gerencia_e_empresa_somam_sem_o_volume_excluido(self):
        g = self.api["v1/gerencias/G1.json"]
        svs = {s["id"]: s["produtos"]["powerade"]["realizado"] for s in g["supervisoes"]}
        self.assertEqual(svs["SV.G1.1"], 20.0)
        self.assertEqual(svs["SV.G1.2"], 50.0)
        self.assertEqual(g["produtos"]["powerade"]["realizado"], 70.0)
        self.assertEqual(self.api["v1/resumo.json"]["empresa"]["produtos"]["powerade"]["realizado"], 70.0)
        self.assertEqual(sum(svs.values()), g["produtos"]["powerade"]["realizado"])

    def test_cobertura_cai_so_de_quem_ficou_sem_volume(self):
        # 71 tem a nota A2 e continua coberto; 72 perdeu a única nota e sai da cobertura
        self.assertEqual(self.cobertura(self.api, "v1/rotas/711.json"), 1)
        self.assertEqual(self.cobertura(self.api, "v1/rotas/712.json"), 1)
        clientes = {c["pv"]: c for c in self.api["v1/rotas/711.json"]["clientes"]}
        self.assertTrue(clientes[71]["produtos"]["powerade"]["coberto"])
        self.assertFalse(clientes[72]["produtos"]["powerade"]["coberto"])

    def test_cobertura_de_outro_produto_do_cliente_nao_cai(self):
        clientes = {c["pv"]: c for c in self.api["v1/rotas/711.json"]["clientes"]}
        self.assertTrue(clientes[71]["produtos"]["sucos"]["coberto"])

    def test_registro_da_exclusao_nos_dados_e_no_index(self):
        self.assertEqual([(a["rota"], a["volume"], a["esperado"]) for a in self.dados.exclusoes],
                         [("711", 30.0, 30.0), ("711", 40.0, 40.0)])
        self.assertEqual(self.api["v1/index.json"]["exclusoes"],
                         [{"rota": "711", "agrupador": "Powerade", "volume": 30.0, "motivo": MOTIVO},
                          {"rota": "711", "agrupador": "Powerade", "volume": 40.0, "motivo": MOTIVO}])

    def test_o_groupby_do_real_nao_ganha_a_coluna_da_nota(self):
        """A linha sai no $filter, não no groupby: nenhum outro número se mexe (nem no último bit da soma)."""
        reais = [(sel, f) for obj, sel, f in self.cons.chamadas
                 if obj == M.OBJ_META and CM.NF_STATUS in sel and CM.VOL_MES in sel and CM.NF not in sel]
        self.assertTrue(reais, "a consulta do Vol Real deveria continuar sem a coluna da nota no $select")
        sel, filtro = reais[0]
        self.assertIn(f"{CM.NF} ne 'A1'", filtro)      # De Morgan: a linha sai no servidor
        self.assertIn(f"{CM.NF} ne 'A3'", filtro)

    def test_uma_consulta_estreita_mede_o_que_saiu(self):
        estreitas = [sel for obj, sel, f in self.cons.chamadas if obj == M.OBJ_META and CM.NF in sel]
        self.assertEqual(len(estreitas), 1)
        self.assertIn(CM.VOL_MES, estreitas[0])

    def test_meta_e_cobertura_nao_mudam(self):
        self.assertEqual(self.api["v1/rotas/711.json"]["produtos"]["powerade"]["meta"], 100.0)
        self.assertEqual(self.api["v1/rotas/711.json"]["produtos"]["powerade"]["cobertura"]["meta"], 3.0)


class TestExclusaoPelaChaveDaMeta(_ComExclusao):
    """Novembro: a rota e o agrupador da entrada são os da META (a exclusão não supõe qual é a chave)."""
    ANOMES = "202611"
    QUANDO = AGORA_NOV

    def test_funciona_pela_chave_da_meta(self):
        ent = [_entrada("A1", "711", volume=30.0, anomes="202611"),
               _entrada("A3", "711", volume=40.0, anomes="202611")]
        _, _, arquivos = self.montar(ent)
        self.assertEqual(self.real(arquivos, "v1/rotas/711.json"), 20.0)
        self.assertEqual(self.real(arquivos, "v1/rotas/712.json"), 50.0)
        self.assertEqual(arquivos["v1/resumo.json"]["empresa"]["produtos"]["powerade"]["realizado"], 70.0)


class TestListaVazia(_ComExclusao):
    """P2: sem entrada para o mês, nada muda — nem o resultado nem a consulta."""

    def test_lista_vazia_e_entrada_de_outro_mes_dao_o_mesmo_resultado(self):
        _, _, vazia = self.montar([])
        _, _, outro_mes = self.montar([_entrada("A1", "711", anomes="202612")])
        self.assertEqual(vazia, outro_mes)

    def test_sem_entrada_no_mes_o_real_fica_inteiro(self):
        _, dados, arquivos = self.montar([])
        self.assertEqual(self.real(arquivos, "v1/rotas/711.json"), 90.0)   # 30 + 20 + 40
        self.assertEqual(self.cobertura(arquivos, "v1/rotas/711.json"), 2)
        self.assertEqual(dados.exclusoes, [])
        self.assertNotIn("exclusoes", arquivos["v1/index.json"])

    def test_sem_entrada_no_mes_a_coluna_da_nota_nao_e_pedida(self):
        cons, _, _ = self.montar([])
        selects = [sel for obj, sel, _ in cons.chamadas if obj == M.OBJ_META]
        self.assertFalse(any(CM.NF in s for s in selects))


class TestColunaAusenteNoModelo(unittest.TestCase):
    """Modelo sem a coluna da nota: a rodada não cai, a exclusão não acontece e a conferência acusa."""

    def test_sem_a_coluna_a_exclusao_nao_acontece_e_vira_aviso(self):
        ent = [_entrada("A1", "711", volume=30.0)]
        with mock.patch.object(exclusoes, "EXCLUSOES", ent):
            cons = _cenario()
            for l in cons.dados[M.OBJ_META]:
                l.pop(CM.NF, None)
            dados = fontes.carregar(cons, AGORA)
        arquivos = api.montar(dados)
        self.assertEqual(arquivos["v1/rotas/711.json"]["produtos"]["powerade"]["realizado"], 90.0)
        self.assertEqual([a["volume"] for a in dados.exclusoes], [0.0])
        erros, avisos = exclusoes.conferir(dados.exclusoes)
        self.assertEqual(erros, [])
        self.assertEqual(len(avisos), 1)
        self.assertNotIn("exclusoes", arquivos["v1/index.json"])


class TestValidacaoDaRodada(unittest.TestCase):
    """P4 dentro de gerador/validacao.py: é o caminho que leva à saída 2."""

    def _arquivos(self, entradas):
        with mock.patch.object(exclusoes, "EXCLUSOES", entradas):
            return api.montar(fontes.carregar(_cenario(), AGORA))

    def validar(self, saiu, esperado):
        from gerador import validacao
        arquivos = self._arquivos([_entrada("A1", "711", volume=esperado)])
        aplicadas = [{"rota": "711", "agrupador": "Powerade", "volume": saiu, "esperado": esperado, "motivo": MOTIVO}]
        return validacao.validar(arquivos, exclusoes_aplicadas=aplicadas)

    def test_volume_maior_que_o_declarado_vira_erro_da_validacao(self):
        erros, _ = self.validar(99.0, 30.0)
        self.assertTrue(any("mais que" in e for e in erros))

    def test_volume_menor_vira_aviso_e_nao_erro(self):
        erros, avisos = self.validar(0.0, 30.0)
        self.assertEqual([e for e in erros if "exclusão" in e], [])
        self.assertTrue(any("ATENÇÃO" in a for a in avisos))

    def test_sem_exclusao_a_validacao_nao_muda(self):
        from gerador import validacao
        arquivos = self._arquivos([])
        self.assertEqual(validacao.validar(arquivos), validacao.validar(arquivos, exclusoes_aplicadas=[]))


class TestRodadaComExclusao(Rodadas):
    """Rodada inteira (gerar.main, simulado): a reprovação de P4 é saída 2 e nada é gravado."""

    def _simulado_com(self, volume, esperado):
        original = simulado.gerar

        def gerar_(agora, ref=None):
            d = original(agora, ref=ref)
            if ref is None:
                return d
            return replace(d, exclusoes=[{"rota": "901", "agrupador": "Powerade", "volume": volume,
                                          "esperado": esperado, "motivo": MOTIVO, "linhas": 1}])
        return mock.patch.object(simulado, "gerar", side_effect=gerar_)

    def test_volume_maior_que_o_declarado_reprova_a_rodada_e_nao_grava(self):
        self.assertEqual(self.rodar("2026-11-03"), 0)
        antes_snap = self.bytes_de(SNAP)
        antes_index = self.bytes_de("v1/index.json")
        with self._simulado_com(99.0, 30.0):
            self.assertEqual(self.rodar("2026-11-04"), 2)
        self.assertEqual(self.bytes_de(SNAP), antes_snap)             # prévia intacta
        self.assertEqual(self.bytes_de("v1/index.json"), antes_index)  # rodada inteira não gravada

    def test_volume_menor_segue_e_registra_o_aviso_na_rodada(self):
        self.assertEqual(self.rodar("2026-11-03"), 0)
        with self._simulado_com(0.0, 30.0):
            self.assertEqual(self.rodar("2026-11-04"), 0)
        avisos = self.ler("v1/index.json")["avisos"]
        self.assertTrue(any("ATENÇÃO" in a and "901/Powerade" in a for a in avisos))
        self.assertEqual([f["anomes"] for f in self.ler("v1/index.json")["fechados"]], ["202610"])

    def test_sem_exclusao_a_rodada_e_a_de_sempre(self):
        self.assertEqual(self.rodar("2026-11-03"), 0)
        self.assertEqual(self.rodar("2026-11-04"), 0)
        self.assertNotIn("exclusoes", self.ler(SNAP))
        self.assertFalse(any("ATENÇÃO" in a for a in self.ler("v1/index.json")["avisos"]))


class TestBlocoNoMesFechado(Rodadas):
    """O fechado/AAAAMM.json ganha o bloco `exclusoes` (sem nota e sem cliente)."""

    def test_bloco_aparece_no_snapshot_do_mes(self):
        original = simulado.gerar

        def gerar_(agora, ref=None):
            return replace(original(agora, ref=ref),
                           exclusoes=[{"rota": "901", "agrupador": "Powerade", "volume": 166.95,
                                       "esperado": 166.95, "motivo": MOTIVO, "linhas": 1}])
        with mock.patch.object(simulado, "gerar", side_effect=gerar_):
            self.assertEqual(self.rodar("2026-11-03"), 0)
        snap = self.ler(SNAP)
        self.assertEqual(snap["exclusoes"], [{"rota": "901", "agrupador": "Powerade", "volume": 166.9,
                                              "motivo": MOTIVO}])
        texto = str(snap)
        self.assertNotIn("867744", texto)
        self.assertNotIn("nf", snap["exclusoes"][0])


class TestEntradaPublicada(unittest.TestCase):
    """A lista do repositório: a decisão de 13/11/2026 e nada de dado pessoal no texto publicado."""

    def test_a_entrada_de_outubro_esta_declarada(self):
        ent = exclusoes.do_mes("202610")
        self.assertEqual(len(ent), 1)
        self.assertEqual((ent[0]["rota"], ent[0]["agrupador"], ent[0]["volume"]), ("R32", "Powerade", 166.95))

    def test_o_motivo_publicado_nao_cita_a_nota(self):
        for x in exclusoes.EXCLUSOES:
            self.assertNotIn(x["nf"], x["motivo"])

    def test_o_agrupador_declarado_existe_na_api(self):
        for x in exclusoes.EXCLUSOES:
            self.assertIsNotNone(M.produto_do_agrupador(x["agrupador"]),
                                 f"agrupador {x['agrupador']} não é de nenhum produto da API")


if __name__ == "__main__":
    logging.disable(logging.CRITICAL)
    unittest.main()
