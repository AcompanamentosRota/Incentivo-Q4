"""Snapshot do mês fechado (v1/fechado/AAAAMM.json), rodando o gerar.py de ponta a ponta com dados simulados.

Prévia x oficial (decisão de 04/11/2026): o mês fechado fica em PRÉVIA (fechamento_final = false) e continua sendo
regravado até o Back Office marcar o flash de vendas daquele mês no painel (ajustes.json -> flashFechado); só então o
snapshot é selado (fechamento_final = true, oficial_em, fonte_selo) e nunca mais muda. NUNCA se sela por data no código.

Sequência de datas (dias úteis locais; em 11/2026, 01/11 é domingo e 02/11 é feriado, então o 1º dia útil é 03/11):
  30/10 Outubro/26 normal       -> nenhum snapshot; index.fechados = []
  01/11 fechamento de Outubro   -> grava 202610.json em prévia
  03/11 fechamento de Outubro   -> sobrescreve 202610.json (o último do fechamento é o que vale)
  04/11 Novembro/26 normal      -> NÃO sela: regrava 202610.json pela consulta do mês passado (ainda em prévia)
  12/11 com o flash marcado     -> sela 202610.json (fechamento_final, oficial_em, fonte_selo = "flash")
  13/11 em diante               -> o arquivo selado não muda mais
"""
import importlib.util
import json
import logging
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from gerador import api, fechado, saida, simulado  # noqa: E402
from gerador import mapeamento as M  # noqa: E402

_spec = importlib.util.spec_from_file_location("gerar", Path(__file__).resolve().parent.parent / "scripts" / "gerar.py")
gerar = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gerar)

SNAP = "v1/fechado/202610.json"
EM = "2026-11-12T14:30:00"


class Rodadas(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.pasta = Path(self._tmp.name)
        self.ajustes = self.pasta / "ajustes.json"   # não existe: só os produtos fixos, nenhum flash marcado

    def tearDown(self):
        M.incluir_agrupadores([])
        for h in list(logging.getLogger().handlers):   # gerar.main abre o log em saida/logs/
            h.close()
            logging.getLogger().removeHandler(h)
        self._tmp.cleanup()

    def rodar(self, hoje: str) -> int:
        argv = ["gerar.py", "--simulado", "--forcar", "--hoje", hoje, "--saida", str(self.pasta / "api"),
                "--ajustes", str(self.ajustes)]
        with mock.patch.object(sys, "argv", argv), mock.patch.dict("os.environ", {"GITHUB_OUTPUT": ""}):
            return gerar.main()

    def escrever_ajustes(self, **chaves):
        self.ajustes.write_text(json.dumps(chaves), encoding="utf-8")

    def marcar_flash(self, anomes: str, fechado_: bool = True, em: str | None = EM, **extras):
        self.escrever_ajustes(flashFechado={anomes: {"fechado": fechado_, **({"em": em} if em else {})}}, **extras)

    def ler(self, rel: str):
        return saida.ler(self.pasta / "api" / rel)

    def bytes_de(self, rel: str) -> bytes:
        return (self.pasta / "api" / rel).read_bytes()

    def item_fechado(self, anomes: str = "202610") -> dict:
        return next(f for f in self.ler("v1/index.json")["fechados"] if f["anomes"] == anomes)


class TestSequencia(Rodadas):
    def test_grava_sobrescreve_e_nao_sela_na_virada(self):
        """Sem o flash marcado, a virada do mês não sela mais nada: o mês continua em prévia."""
        self.assertEqual(self.rodar("2026-10-30"), 0)
        self.assertEqual(self.ler("v1/index.json")["fechados"], [])
        self.assertIsNone(self.ler(SNAP))

        self.assertEqual(self.rodar("2026-11-01"), 0)
        idx = self.ler("v1/index.json")
        self.assertEqual(idx["mes_referencia"], {"anomes": "202610", "rotulo": "Outubro/26", "fechamento": True})
        primeiro = self.ler(SNAP)
        self.assertFalse(primeiro["fechamento_final"])
        self.assertIsNone(primeiro["oficial_em"])
        self.assertIsNone(primeiro["fonte_selo"])
        self.assertEqual(primeiro["atualizado_em"], idx["atualizado_em"])
        self.assertEqual(idx["fechados"], [{"anomes": "202610", "rotulo": "Outubro/26", "arquivo": "fechado/202610.json",
                                            "gerado_em": primeiro["gerado_em"], "fechamento_final": False,
                                            "oficial_em": None, "fonte_selo": None}])

        self.assertEqual(self.rodar("2026-11-03"), 0)
        self.assertTrue(self.ler("v1/index.json")["mes_referencia"]["fechamento"])
        segundo = self.ler(SNAP)
        self.assertNotEqual(segundo["rotas"], primeiro["rotas"])   # simulado muda com a data: foi sobrescrito
        self.assertEqual(segundo["atualizado_em"][:10], "2026-11-03")

        self.assertEqual(self.rodar("2026-11-04"), 0)
        idx = self.ler("v1/index.json")
        self.assertEqual(idx["mes_referencia"]["anomes"], "202611")
        self.assertFalse(idx["mes_referencia"]["fechamento"])
        self.assertFalse(self.ler(SNAP)["fechamento_final"])   # a virada NÃO sela (regra antiga: selava aqui)
        self.assertFalse(self.item_fechado()["fechamento_final"])

    def test_previa_e_regravada_a_cada_rodada_depois_da_virada(self):
        """Depois da virada, cada rodada consulta o mês em prévia de novo e regrava o snapshot dele."""
        self.rodar("2026-11-03")
        no_fechamento = self.ler(SNAP)
        self.rodar("2026-11-04")
        depois = self.ler(SNAP)
        self.assertEqual((depois["anomes"], depois["rotulo"]), ("202610", "Outubro/26"))
        self.assertNotEqual(depois["rotas"], no_fechamento["rotas"])   # consulta nova de outubro
        self.assertFalse(depois["fechamento_final"])
        self.rodar("2026-11-05")
        self.assertNotEqual(self.ler(SNAP)["rotas"], depois["rotas"])
        self.assertEqual(fechado.em_previa(self.pasta / "api", "202611"), ["202610"])

    def test_flash_marcado_sela_com_oficial_em_e_congela(self):
        self.rodar("2026-11-03")
        self.rodar("2026-11-04")
        self.assertFalse(self.ler(SNAP)["fechamento_final"])
        self.marcar_flash("202610")
        self.assertEqual(self.rodar("2026-11-12"), 0)
        selado = self.ler(SNAP)
        self.assertTrue(selado["fechamento_final"])
        self.assertEqual(selado["oficial_em"], EM)
        self.assertEqual(selado["fonte_selo"], "flash")
        self.assertEqual(self.item_fechado(), {"anomes": "202610", "rotulo": "Outubro/26",
                                               "arquivo": "fechado/202610.json", "gerado_em": selado["gerado_em"],
                                               "fechamento_final": True, "oficial_em": EM, "fonte_selo": "flash"})
        congelado = self.bytes_de(SNAP)
        for hoje in ("2026-11-13", "2026-11-30"):
            self.assertEqual(self.rodar(hoje), 0)
            self.assertEqual(self.bytes_de(SNAP), congelado)
        self.assertEqual(fechado.em_previa(self.pasta / "api", "202611"), [])

    def test_selo_sem_em_usa_a_hora_da_rodada(self):
        self.rodar("2026-11-03")
        self.marcar_flash("202610", em=None)
        self.rodar("2026-11-12")
        selado = self.ler(SNAP)
        self.assertTrue(selado["fechamento_final"])
        self.assertEqual(selado["oficial_em"][:10], "2026-11-12")
        self.assertEqual(selado["fonte_selo"], "flash")

    def test_flash_nao_marcado_continua_em_previa(self):
        """Mês com a chave no arquivo mas `fechado: false` (ou flash ainda por vir) fica em prévia."""
        self.rodar("2026-11-03")
        self.marcar_flash("202610", fechado_=False)
        self.rodar("2026-11-11")
        self.assertFalse(self.ler(SNAP)["fechamento_final"])
        self.assertIsNone(self.ler(SNAP)["oficial_em"])
        self.marcar_flash("202611")   # outro mês marcado não sela outubro
        self.rodar("2026-11-12")
        self.assertFalse(self.ler(SNAP)["fechamento_final"])
        self.assertTrue(any("202611" in a and "não existe" in a for a in self.ler("v1/index.json")["avisos"]))

    def test_ajustes_ilegivel_nao_sela_nada(self):
        self.rodar("2026-11-03")
        self.ajustes.write_text('{"flashFechado":{"202610":{"fechado":true}}}{"outro":1}', encoding="utf-8")
        self.assertEqual(self.rodar("2026-11-12"), 0)
        self.assertFalse(self.ler(SNAP)["fechamento_final"])
        self.assertTrue(any("ilegível" in a for a in self.ler("v1/index.json")["avisos"]))

    def test_flash_fora_do_formato_vira_aviso(self):
        self.rodar("2026-11-03")
        self.escrever_ajustes(flashFechado={"202610": True, "20261": {"fechado": True}})
        self.rodar("2026-11-12")
        self.assertFalse(self.ler(SNAP)["fechamento_final"])
        avisos = self.ler("v1/index.json")["avisos"]
        self.assertTrue(any("'202610'" in a for a in avisos))
        self.assertTrue(any("'20261'" in a for a in avisos))

    def test_selado_nao_volta_a_ser_gravado_no_fechamento(self):
        """Se o fechamento voltar depois do selo (ex.: gerência sem meta), o mês selado continua igual."""
        self.rodar("2026-11-03")
        self.marcar_flash("202610")
        self.rodar("2026-11-12")
        congelado = self.bytes_de(SNAP)
        self.rodar("2026-11-03")
        self.assertEqual(self.bytes_de(SNAP), congelado)
        self.assertTrue(any("selado" in a for a in self.ler("v1/index.json")["avisos"]))

    def test_selado_nao_e_regravado_pela_rodada_normal(self):
        self.rodar("2026-11-03")
        self.marcar_flash("202610")
        self.rodar("2026-11-12")
        congelado = self.bytes_de(SNAP)
        self.rodar("2026-11-20")   # rodada normal de novembro, com outubro já oficial
        self.assertEqual(self.bytes_de(SNAP), congelado)
        self.assertFalse(any("não foi regravado" in a for a in self.ler("v1/index.json")["avisos"]))

    def test_api_ja_virada_nao_sobrescreve_previa_do_mes_de_referencia(self):
        self.rodar("2026-11-03")
        self.rodar("2026-11-04")
        congelado = self.bytes_de(SNAP)
        self.rodar("2026-11-03")   # index anterior em 202611: o fechamento não regrava
        self.assertEqual(self.bytes_de(SNAP), congelado)
        self.assertTrue(any("já tinha virado" in a for a in self.ler("v1/index.json")["avisos"]))

    def test_varios_meses_em_ordem(self):
        for hoje in ("2026-11-03", "2026-11-04", "2026-12-01", "2026-12-02"):
            self.rodar(hoje)
        fechados = self.ler("v1/index.json")["fechados"]
        self.assertEqual([f["anomes"] for f in fechados], ["202610", "202611"])
        self.assertFalse(any(f["fechamento_final"] for f in fechados))   # nenhum flash marcado: os dois em prévia
        self.marcar_flash("202610")
        self.rodar("2026-12-12")
        fechados = self.ler("v1/index.json")["fechados"]
        self.assertEqual([(f["anomes"], f["fechamento_final"]) for f in fechados], [("202610", True), ("202611", False)])

    def test_previas_limitadas_as_mais_recentes(self):
        pasta = self.pasta / "api"
        for anomes in ("202607", "202608", "202609", "202610"):
            saida.gravar(pasta / fechado.caminho(anomes), {"anomes": anomes, "fechamento_final": False})
        self.assertEqual(fechado.em_previa(pasta, "202611"), ["202608", "202609", "202610"])
        self.assertEqual(fechado.em_previa(pasta, "202609"), ["202607", "202608"])


class TestFlashDosAjustes(unittest.TestCase):
    def test_ausente_e_invalido(self):
        self.assertEqual(fechado.flash_dos_ajustes(None), ({}, []))
        self.assertEqual(fechado.flash_dos_ajustes({}), ({}, []))
        self.assertEqual(fechado.flash_dos_ajustes({"flashFechado": {}}), ({}, []))
        flash, avisos = fechado.flash_dos_ajustes({"flashFechado": []})
        self.assertEqual((flash, len(avisos)), ({}, 1))

    def test_so_os_marcados(self):
        flash, avisos = fechado.flash_dos_ajustes({"flashFechado": {
            "202610": {"fechado": True, "em": EM}, "202611": {"fechado": False, "em": EM},
            "202612": {"fechado": True}, "202613x": {"fechado": True}, "202609": {"fechado": True, "em": "   "}}})
        self.assertEqual(flash, {"202610": EM, "202612": None, "202609": None})
        self.assertEqual(len(avisos), 1)
        self.assertIn("202613x", avisos[0])


class TestFormatoETotais(Rodadas):
    def test_formato_e_totais_batem_com_a_rodada(self):
        self.escrever_ajustes(agrupadores=[{"id": "agua", "nome": "Água", "agrupador": "Agua Teste"}])
        self.rodar("2026-11-03")
        snap, resumo = self.ler(SNAP), self.ler("v1/resumo.json")
        self.assertEqual(list(snap), ["anomes", "rotulo", "gerado_em", "atualizado_em", "simulado", "fechamento_final",
                                      "oficial_em", "fonte_selo", "campos", "campos_produto", "totais", "rotas"])
        self.assertEqual(snap["campos"], ["rota", "gerencia", "supervisao", "produtos"])
        self.assertEqual(snap["campos_produto"], ["meta", "realizado"])
        ids = {k for r in snap["rotas"] for k in r[3]}
        self.assertIn("refrigerantes", ids)
        self.assertIn("agua", ids)   # agrupador extra ativo no mês
        rotas_api = {r["id"]: r for g in self.ler("v1/index.json")["gerencias"]
                     for r in self.ler("v1/" + g["arquivo"])["rotas"]}
        self.assertEqual({r[0] for r in snap["rotas"]}, set(rotas_api))
        for rota, gc, sv, produtos in snap["rotas"]:
            self.assertEqual((gc, sv), (rotas_api[rota]["gerencia"], rotas_api[rota]["supervisao"]))
            for k, (meta, real) in produtos.items():
                b = rotas_api[rota]["produtos"][k]
                self.assertEqual((meta, real), (b["meta"], b["realizado"]))
                self.assertIsNone(b["online_hoje"])   # fechamento: sem online
        for k, b in resumo["empresa"]["produtos"].items():
            self.assertAlmostEqual(sum(r[3][k][0] for r in snap["rotas"] if k in r[3]), b["meta"], delta=0.05 * 60)
            self.assertAlmostEqual(sum(r[3][k][1] for r in snap["rotas"] if k in r[3]), b["realizado"], delta=0.05 * 60)

    def test_totais_por_gerencia_e_empresa_batem_com_a_rodada(self):
        """A aba Estratégicos é por gerência: o snapshot guarda os totais da rodada, não a soma das rotas."""
        self.rodar("2026-11-03")
        snap, resumo, index = self.ler(SNAP), self.ler("v1/resumo.json"), self.ler("v1/index.json")
        empresa = {k: [b["meta"], b["realizado"]] for k, b in resumo["empresa"]["produtos"].items()
                   if b["meta"] is not None or b["realizado"] is not None}
        self.assertEqual(snap["totais"]["empresa"], empresa)
        self.assertEqual(sorted(snap["totais"]["gerencias"]), sorted(g["id"] for g in index["gerencias"]))
        for g in index["gerencias"]:
            da_api = self.ler("v1/" + g["arquivo"])["produtos"]
            esperado = {k: [b["meta"], b["realizado"]] for k, b in da_api.items()
                        if b["meta"] is not None or b["realizado"] is not None}
            self.assertEqual(snap["totais"]["gerencias"][g["id"]], esperado)
        self.assertEqual(snap["totais"]["gerencias"], {g["id"]: {k: [b["meta"], b["realizado"]]
                                                                 for k, b in self.ler("v1/" + g["arquivo"])["produtos"].items()
                                                                 if b["meta"] is not None or b["realizado"] is not None}
                                                       for g in index["gerencias"]})

    def test_conferir_reprova_meta_divergente(self):
        arquivos = api.montar(simulado.gerar(gerar.datetime(2026, 11, 3, 10, 0)))
        snap = fechado.montar(arquivos, "2026-11-03T10:00:00")
        self.assertEqual(fechado.conferir(snap, arquivos), [])
        snap["rotas"] = snap["rotas"][1:]
        self.assertTrue(any("meta" in e for e in fechado.conferir(snap, arquivos)))

    def test_conferir_reprova_totais_divergentes(self):
        arquivos = api.montar(simulado.gerar(gerar.datetime(2026, 11, 3, 10, 0)))
        snap = fechado.montar(arquivos, "2026-11-03T10:00:00")
        gc = sorted(snap["totais"]["gerencias"])[0]
        produto = sorted(snap["totais"]["gerencias"][gc])[0]
        snap["totais"]["gerencias"][gc][produto] = [1.0, 2.0]
        erros = fechado.conferir(snap, arquivos)
        self.assertTrue(any(f"total da gerência {gc}" in e for e in erros), erros)

        snap = fechado.montar(arquivos, "2026-11-03T10:00:00")
        snap["totais"]["empresa"].pop(produto)
        self.assertTrue(any("total da empresa" in e for e in fechado.conferir(snap, arquivos)))

        snap = fechado.montar(arquivos, "2026-11-03T10:00:00")
        del snap["totais"]
        self.assertTrue(any("sem os totais" in e for e in fechado.conferir(snap, arquivos)))


class TestFalhaNaoDerrubaRodada(Rodadas):
    def test_erro_ao_gravar(self):
        original = saida.gravar

        def gravar(caminho, obj):
            if "fechado" in str(caminho):
                raise OSError("disco cheio")
            return original(caminho, obj)

        with mock.patch.object(saida, "gravar", side_effect=gravar):
            self.assertEqual(self.rodar("2026-11-03"), 0)
        idx = self.ler("v1/index.json")
        self.assertTrue(idx["mes_referencia"]["fechamento"])   # a rodada normal foi gravada
        self.assertEqual(idx["fechados"], [])
        self.assertTrue(any("disco cheio" in a for a in idx["avisos"]))

    def test_conferencia_divergente_nao_grava(self):
        with mock.patch.object(fechado, "conferir", return_value=["sucos: meta difere"]):
            self.assertEqual(self.rodar("2026-11-03"), 0)
        self.assertIsNone(self.ler(SNAP))
        self.assertTrue(any("meta difere" in a for a in self.ler("v1/index.json")["avisos"]))

    def test_falha_na_regravacao_mantem_o_snapshot_anterior(self):
        self.rodar("2026-11-03")
        antes = self.bytes_de(SNAP)
        with mock.patch.object(fechado, "conferir", return_value=["sucos: meta difere"]):
            self.assertEqual(self.rodar("2026-11-04"), 0)
        self.assertEqual(self.bytes_de(SNAP), antes)   # continua a prévia boa
        idx = self.ler("v1/index.json")
        self.assertTrue(any("202610 não foi regravado" in a for a in idx["avisos"]))
        self.assertEqual([f["anomes"] for f in idx["fechados"]], ["202610"])

    def test_consulta_do_mes_passado_em_outro_mes_nao_regrava(self):
        self.rodar("2026-11-03")
        antes = self.bytes_de(SNAP)
        arquivos = api.montar(simulado.gerar(gerar.datetime(2026, 11, 20, 10, 0)))   # novembro aberto
        gravados, avisos = fechado.regravar(self.pasta / "api", "202610", arquivos, "2026-11-20T10:00:00")
        self.assertEqual(gravados, [])
        self.assertTrue(any("202611" in a for a in avisos))
        self.assertEqual(self.bytes_de(SNAP), antes)

    def test_reprovado_na_validacao_nao_grava_snapshot(self):
        with mock.patch.object(gerar.validacao, "validar", return_value=(["teste"], [])):
            self.assertEqual(self.rodar("2026-11-03"), 2)
        self.assertIsNone(self.ler(SNAP))

    def test_arquivo_ilegivel_vira_aviso(self):
        lixo = self.pasta / "api/v1/fechado/202609.json"
        lixo.parent.mkdir(parents=True)
        lixo.write_text("{")
        self.assertEqual(self.rodar("2026-11-03"), 0)
        idx = self.ler("v1/index.json")
        self.assertEqual([f["anomes"] for f in idx["fechados"]], ["202610"])
        self.assertTrue(any("202609.json" in a for a in idx["avisos"]))
        self.assertTrue(lixo.exists())   # nem a limpeza nem o snapshot apagam


class TestAnteriorDoSnapshot(unittest.TestCase):
    """A regravação de um mês em prévia passa pelas mesmas travas da rodada normal (validacao.validar)."""

    def test_snapshot_sem_totais_nao_da_base_de_comparacao(self):
        self.assertEqual(fechado._anterior_do_snapshot(None), (None, None))
        self.assertEqual(fechado._anterior_do_snapshot({"anomes": "202610", "rotas": []}), (None, None))

    def test_resumo_e_index_no_formato_da_validacao(self):
        snap = {"anomes": "202610", "simulado": False, "campos_produto": ["meta", "realizado"],
                "totais": {"empresa": {"sucos": [100.0, 90.0]}, "gerencias": {"G1": {"sucos": [100.0, 90.0]}}}}
        resumo, index = fechado._anterior_do_snapshot(snap)
        self.assertEqual(resumo, {"empresa": {"produtos": {"sucos": {"meta": 100.0, "realizado": 90.0}}}})
        self.assertEqual(index, {"simulado": False, "mes_referencia": {"anomes": "202610"},
                                 "gerencias": [{"id": "G1"}]})

    def test_queda_brusca_do_realizado_reprova_a_regravacao(self):
        arquivos = api.montar(simulado.gerar(gerar.datetime(2026, 11, 4, 10, 0), ref=gerar.date(2026, 10, 1)))
        arquivos["v1/index.json"]["simulado"] = False   # validacao só compara meses não simulados
        empresa = arquivos["v1/resumo.json"]["empresa"]["produtos"]
        alto = {k: [b["meta"], (b["realizado"] or 0.0) * 10] for k, b in empresa.items() if b["realizado"]}
        anterior = {"anomes": "202610", "simulado": False, "campos_produto": ["meta", "realizado"],
                    "fechamento_final": False, "totais": {"empresa": alto, "gerencias": {}}}
        with tempfile.TemporaryDirectory() as tmp:
            pasta = Path(tmp)
            saida.gravar(pasta / fechado.caminho("202610"), anterior)
            with self.assertRaises(ValueError) as ctx:
                fechado.regravar(pasta, "202610", arquivos, "2026-11-04T10:00:00")
            self.assertIn("caiu", str(ctx.exception))
            self.assertEqual(saida.ler(pasta / fechado.caminho("202610")), anterior)   # nada foi gravado


class TestLimpeza(unittest.TestCase):
    def test_gravar_api_nao_toca_fechado(self):
        arquivos = api.montar(simulado.gerar(gerar.datetime(2026, 10, 22, 10, 0)))
        with tempfile.TemporaryDirectory() as tmp:
            pasta = Path(tmp)
            mes = pasta / SNAP
            mes.parent.mkdir(parents=True)
            mes.write_text('{"anomes":"202610"}')
            extinta = pasta / "v1/rotas/ZZZ.json"
            extinta.parent.mkdir(parents=True)
            extinta.write_text("{}")
            _, apagados = saida.gravar_api(pasta, arquivos)
            self.assertEqual(apagados, ["v1/rotas/ZZZ.json"])
            self.assertEqual(mes.read_text(), '{"anomes":"202610"}')


class TestSimuladoFechamento(unittest.TestCase):
    def test_datas(self):
        for hoje, anomes, fech in (("2026-10-30", "202610", False), ("2026-11-01", "202610", True),
                                   ("2026-11-02", "202610", True), ("2026-11-03", "202610", True),
                                   ("2026-11-04", "202611", False)):
            d = simulado.gerar(gerar.datetime.fromisoformat(hoje + "T10:00"))
            self.assertEqual((d.cal.anomes, d.cal.fechamento), (anomes, fech), hoje)
            self.assertEqual(d.online is None, fech)

    def test_ref_gera_um_mes_passado_como_fechado(self):
        d = simulado.gerar(gerar.datetime(2026, 11, 20, 10, 0), ref=gerar.date(2026, 10, 1))
        self.assertEqual((d.cal.anomes, d.cal.fechamento, d.cal.mes_label), ("202610", True, "Outubro/26"))
        self.assertIsNone(d.online)
        self.assertEqual(d.cal.dia_hoje, d.cal.total_dias_uteis)


if __name__ == "__main__":
    unittest.main()
