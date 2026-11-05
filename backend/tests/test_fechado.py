"""Snapshot do mês fechado (v1/fechado/AAAAMM.json), rodando o gerar.py de ponta a ponta com dados simulados.

Sequência de datas (dias úteis locais; em 11/2026, 01/11 é domingo e 02/11 é feriado, então o 1º dia útil é 03/11):
  30/10 Outubro/26 normal       -> nenhum snapshot; index.fechados = []
  01/11 fechamento de Outubro   -> grava 202610.json (prévia)
  03/11 fechamento de Outubro   -> sobrescreve 202610.json (o último do fechamento é o que vale)
  04/11 Novembro/26 normal      -> 202610.json continua em PRÉVIA (desde 04/11/2026 a virada não sela mais)
  flash marcado (ajustes.json -> flashFechado) -> a 1ª rodada depois da hora marcada sela (OFICIAL) e não muda mais
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


class Rodadas(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.pasta = Path(self._tmp.name)
        self.ajustes = self.pasta / "ajustes.json"   # não existe: só os produtos fixos

    def tearDown(self):
        M.incluir_agrupadores([])
        for h in list(logging.getLogger().handlers):   # gerar.main abre o log em saida/logs/
            h.close()
            logging.getLogger().removeHandler(h)
        self._tmp.cleanup()

    def flash(self, marcados: dict, **extra):
        """Grava o ajustes.json de teste com o flashFechado (o que o botão da Administração publica)."""
        self.ajustes.write_text(json.dumps({"flashFechado": marcados, **extra}))

    def rodar(self, hoje: str) -> int:
        argv = ["gerar.py", "--simulado", "--forcar", "--hoje", hoje, "--saida", str(self.pasta / "api"),
                "--ajustes", str(self.ajustes)]
        with mock.patch.object(sys, "argv", argv), mock.patch.dict("os.environ", {"GITHUB_OUTPUT": ""}):
            return gerar.main()

    def ler(self, rel: str):
        return saida.ler(self.pasta / "api" / rel)

    def bytes_de(self, rel: str) -> bytes:
        return (self.pasta / "api" / rel).read_bytes()


class TestSequencia(Rodadas):
    def test_grava_sobrescreve_e_continua_em_previa_na_virada(self):
        """Antes (até 04/11/2026) a 1ª rodada de novembro selava outubro; agora a virada não sela: só o flash."""
        self.assertEqual(self.rodar("2026-10-30"), 0)
        self.assertEqual(self.ler("v1/index.json")["fechados"], [])
        self.assertIsNone(self.ler(SNAP))

        self.assertEqual(self.rodar("2026-11-01"), 0)
        idx = self.ler("v1/index.json")
        self.assertEqual(idx["mes_referencia"], {"anomes": "202610", "rotulo": "Outubro/26", "fechamento": True})
        primeiro = self.ler(SNAP)
        self.assertFalse(primeiro["fechamento_final"])
        self.assertEqual((primeiro["oficial_em"], primeiro["fonte_selo"]), (None, None))
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
        self.assertEqual(self.ler(SNAP), segundo)                     # nada mudou: nem os números, nem o estado
        self.assertFalse(idx["fechados"][0]["fechamento_final"])
        self.assertEqual(sorted(p.name for p in (self.pasta / "api/v1/fechado").iterdir()), ["202610.json"])
        for hoje in ("2026-11-05", "2026-11-30"):                   # sem flash marcado: prévia o mês inteiro
            self.assertEqual(self.rodar(hoje), 0)
            self.assertFalse(self.ler(SNAP)["fechamento_final"])

    def test_flash_com_hora_futura_continua_em_previa_e_sela_na_1a_rodada_depois(self):
        self.rodar("2026-11-03")
        previa = self.ler(SNAP)
        self.flash({"202610": {"fechado": True, "em": "2026-11-12T14:30:00"}})
        for hoje in ("2026-11-03T15:00", "2026-11-11T10:00", "2026-11-12T14:29"):
            self.assertEqual(self.rodar(hoje), 0)
            snap = self.ler(SNAP)
            self.assertFalse(snap["fechamento_final"], hoje)
            self.assertIsNone(snap["oficial_em"], hoje)
            self.assertFalse(self.ler("v1/index.json")["fechados"][0]["fechamento_final"], hoje)

        self.assertEqual(self.rodar("2026-11-12T14:30"), 0)
        selado = self.ler(SNAP)
        self.assertTrue(selado["fechamento_final"])
        self.assertEqual((selado["oficial_em"], selado["fonte_selo"]), ("2026-11-12T14:30:00", "flash"))
        self.assertEqual(selado["rotas"], previa["rotas"])   # o selo não mexe nos números
        item = self.ler("v1/index.json")["fechados"][0]
        self.assertEqual((item["fechamento_final"], item["oficial_em"], item["fonte_selo"]),
                         (True, "2026-11-12T14:30:00", "flash"))

        congelado = self.bytes_de(SNAP)
        for hoje in ("2026-11-13", "2026-11-30"):
            self.assertEqual(self.rodar(hoje), 0)
            self.assertEqual(self.bytes_de(SNAP), congelado)

    def test_mes_sem_flash_e_regravado_em_cada_rodada_do_fechamento(self):
        self.flash({"202609": {"fechado": True, "em": "2026-10-10T10:00"}})   # outro mês: não afeta outubro
        self.rodar("2026-11-01")
        a = self.ler(SNAP)
        self.rodar("2026-11-03")
        b = self.ler(SNAP)
        self.assertFalse(b["fechamento_final"])
        self.assertNotEqual(a["rotas"], b["rotas"])

    def test_flash_marcado_no_fechamento_sela_os_numeros_da_mesma_rodada(self):
        self.flash({"202610": {"fechado": True, "em": "2026-11-01T08:00"}})
        self.rodar("2026-11-03T10:00")
        snap = self.ler(SNAP)
        self.assertTrue(snap["fechamento_final"])
        self.assertEqual(snap["atualizado_em"][:10], "2026-11-03")
        self.assertEqual(snap["oficial_em"], "2026-11-03T10:00:00")

    def test_flash_desmarcado_antes_do_selo_continua_em_previa(self):
        self.rodar("2026-11-03")
        self.flash({"202610": {"fechado": False, "em": "2026-11-12T14:30"}})
        self.rodar("2026-11-13")
        self.assertFalse(self.ler(SNAP)["fechamento_final"])
        self.flash({})
        self.rodar("2026-11-13")
        self.assertFalse(self.ler(SNAP)["fechamento_final"])

    def test_selado_nao_volta_a_ser_gravado_no_fechamento(self):
        """Se o fechamento voltar depois do selo (ex.: gerência sem meta), o mês selado continua igual."""
        self.flash({"202610": {"fechado": True, "em": "2026-11-03T08:00"}})
        self.rodar("2026-11-03T10:00")
        congelado = self.bytes_de(SNAP)
        self.assertTrue(self.ler(SNAP)["fechamento_final"])
        self.flash({})                     # desmarcar depois do selo não reabre nada
        self.rodar("2026-11-03T11:00")
        self.assertEqual(self.bytes_de(SNAP), congelado)
        self.assertTrue(any("selado" in a for a in self.ler("v1/index.json")["avisos"]))

    def test_api_ja_virada_nao_sobrescreve_previa(self):
        self.rodar("2026-11-03")
        self.rodar("2026-11-04")
        congelado = self.bytes_de(SNAP)
        self.rodar("2026-11-03")   # index anterior em 202611
        self.assertEqual(self.bytes_de(SNAP), congelado)
        self.assertTrue(any("já tinha virado" in a for a in self.ler("v1/index.json")["avisos"]))

    def test_varios_meses_em_ordem(self):
        self.flash({"202610": {"fechado": True, "em": "2026-11-12T14:30"}})
        for hoje in ("2026-11-03", "2026-11-04", "2026-11-13", "2026-12-01", "2026-12-02"):
            self.rodar(hoje)
        fechados = self.ler("v1/index.json")["fechados"]
        self.assertEqual([f["anomes"] for f in fechados], ["202610", "202611"])
        self.assertEqual([(f["fechamento_final"], f["fonte_selo"]) for f in fechados], [(True, "flash"), (False, None)])

    def test_mes_aberto_nunca_e_selado(self):
        self.flash({"202611": {"fechado": True, "em": "2026-11-01T08:00"}})
        self.rodar("2026-11-13")
        self.assertIsNone(self.ler("v1/fechado/202611.json"))
        self.rodar("2026-12-01")   # fechamento de novembro: grava e sela (o flash dele já foi marcado)
        self.assertTrue(self.ler("v1/fechado/202611.json")["fechamento_final"])


class TestAjustesDoFlash(Rodadas):
    def test_ajustes_ilegivel_nao_sela_e_avisa(self):
        self.rodar("2026-11-03")
        self.ajustes.write_text('{"flashFechado": {"202610": {"fechado": true, "em": "2026-11-12T14:30"}}}\n{"x": 1}')
        self.assertEqual(self.rodar("2026-11-13"), 0)
        self.assertFalse(self.ler(SNAP)["fechamento_final"])
        self.assertTrue(any("ajustes do painel ignorados" in a and "nenhum mês foi selado" in a
                            for a in self.ler("v1/index.json")["avisos"]))

    def test_ajustes_ausente_nao_avisa(self):
        self.rodar("2026-11-13")
        self.assertFalse(any("ajustes" in a for a in self.ler("v1/index.json")["avisos"]))

    def test_valor_invalido_vira_aviso_e_nao_sela(self):
        self.rodar("2026-11-03")
        self.flash({"202610": {"fechado": True, "em": "dia 12"}, "2026-10": {"fechado": True}})
        self.rodar("2026-11-13")
        self.assertFalse(self.ler(SNAP)["fechamento_final"])
        avisos = self.ler("v1/index.json")["avisos"]
        self.assertTrue(any("flashFechado.202610" in a and "inválida" in a for a in avisos))
        self.assertTrue(any("flashFechado.2026-10" in a for a in avisos))

    def test_flash_dos_ajustes(self):
        d = gerar.datetime
        self.assertEqual(fechado.flash_dos_ajustes(None), ({}, []))
        self.assertEqual(fechado.flash_dos_ajustes({"agrupadores": []}), ({}, []))   # retrocompatível: sem a chave
        ok, av = fechado.flash_dos_ajustes({"flashFechado": {
            "202610": {"fechado": True, "em": "2026-11-12T14:30:00"}, "202611": {"fechado": False, "em": None},
            "202612": {"fechado": True, "em": "2027-01-12T17:30:00Z"}}})
        self.assertEqual(ok, {"202610": d(2026, 11, 12, 14, 30), "202612": d(2027, 1, 12, 14, 30)})   # UTC -> Brasília
        self.assertEqual(av, [])
        self.assertEqual(fechado.flash_dos_ajustes({"flashFechado": []})[0], {})
        self.assertEqual(len(fechado.flash_dos_ajustes({"flashFechado": {"202610": {"fechado": "sim"}}})[1]), 1)


class TestSeloAntigo(Rodadas):
    def test_arquivo_selado_pela_virada_aparece_como_virada_e_nao_e_regravado(self):
        self.rodar("2026-11-03")
        snap = self.pasta / "api" / SNAP
        antigo = {k: v for k, v in saida.ler(snap).items() if k not in ("oficial_em", "fonte_selo", "gerencias", "empresa")}
        snap.write_bytes(saida.serializar({**antigo, "fechamento_final": True}))   # como o 202610.json de 04/11/2026
        congelado = snap.read_bytes()
        self.flash({"202610": {"fechado": True, "em": "2026-11-12T14:30"}})
        self.rodar("2026-11-13")
        self.assertEqual(snap.read_bytes(), congelado)
        item = self.ler("v1/index.json")["fechados"][0]
        self.assertEqual((item["fechamento_final"], item["oficial_em"], item["fonte_selo"]), (True, None, "virada"))


class TestReabrir(Rodadas):
    def setUp(self):
        super().setUp()
        spec = importlib.util.spec_from_file_location(
            "reabrir", Path(__file__).resolve().parent.parent / "scripts" / "reabrir_fechado.py")
        self.mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.mod)

    def selar_pela_regra_antiga(self):
        self.rodar("2026-11-03")
        snap = self.pasta / "api" / SNAP
        antigo = {k: v for k, v in saida.ler(snap).items() if k not in ("oficial_em", "fonte_selo")}
        snap.write_bytes(saida.serializar({**antigo, "fechamento_final": True}))
        return antigo

    def reabrir(self, anomes="202610"):
        return self.mod.reabrir(self.pasta / "api", anomes, "teste", self.ajustes, "2026-11-05T10:00:00")

    def test_reabre_registra_e_volta_a_ser_previa(self):
        antigo = self.selar_pela_regra_antiga()
        codigo, msg = self.reabrir()
        self.assertEqual(codigo, 0, msg)
        snap = self.ler(SNAP)
        self.assertEqual((snap["fechamento_final"], snap["oficial_em"], snap["fonte_selo"]), (False, None, None))
        self.assertEqual(snap["rotas"], antigo["rotas"])
        self.assertEqual(snap["reaberto"], [{"em": "2026-11-05T10:00:00", "motivo": "teste", "selo_anterior": "virada",
                                             "oficial_em_anterior": None}])
        self.assertEqual(self.reabrir()[0], 0)   # de novo: já está em prévia, nada muda
        self.assertEqual(len(self.ler(SNAP)["reaberto"]), 1)
        self.rodar("2026-11-05")                  # a rodada seguinte refaz o índice: prévia
        self.assertFalse(self.ler("v1/index.json")["fechados"][0]["fechamento_final"])
        self.assertFalse(self.ler(SNAP)["fechamento_final"])

    def test_recusa_com_flash_marcado_ou_ajustes_ilegivel(self):
        self.selar_pela_regra_antiga()
        self.flash({"202610": {"fechado": True, "em": "2026-11-12T14:30"}})
        self.assertEqual(self.reabrir()[0], 2)
        self.ajustes.write_text("{} {}")
        self.assertEqual(self.reabrir()[0], 2)
        self.assertTrue(self.ler(SNAP)["fechamento_final"])

    def test_mes_inexistente_ou_invalido(self):
        self.assertEqual(self.reabrir("202610")[0], 1)
        self.assertEqual(self.reabrir("2026-10")[0], 2)
        self.assertEqual(self.reabrir("../x")[0], 2)

    def test_previa_regravada_no_fechamento_guarda_o_registro(self):
        self.selar_pela_regra_antiga()
        self.reabrir()
        self.rodar("2026-11-03")   # API de volta ao fechamento de outubro (index anterior em 202610)
        self.assertEqual(len(self.ler(SNAP)["reaberto"]), 1)


class TestFormatoETotais(Rodadas):
    def test_formato_e_totais_batem_com_a_rodada(self):
        self.ajustes.write_text(json.dumps({"agrupadores": [{"id": "agua", "nome": "Água", "agrupador": "Agua Teste"}]}))
        self.rodar("2026-11-03")
        snap, resumo = self.ler(SNAP), self.ler("v1/resumo.json")
        self.assertEqual(list(snap), ["anomes", "rotulo", "gerado_em", "atualizado_em", "simulado", "fechamento_final",
                                      "oficial_em", "fonte_selo", "campos", "campos_produto", "rotas", "gerencias",
                                      "empresa"])
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
            self.assertEqual(snap["empresa"][k], [b["meta"], b["realizado"]])   # total da empresa = resumo.json
        idx = self.ler("v1/index.json")
        self.assertEqual(sorted(snap["gerencias"]), sorted(g["id"] for g in idx["gerencias"]))
        for g in idx["gerencias"]:                                              # total da gerência = gerencias/{GC}.json
            prod = self.ler("v1/" + g["arquivo"])["produtos"]
            self.assertEqual(snap["gerencias"][g["id"]],
                             {k: [b["meta"], b["realizado"]] for k, b in prod.items() if b["meta"] is not None or b["realizado"] is not None})

    def test_conferir_reprova_meta_divergente(self):
        arquivos = api.montar(simulado.gerar(gerar.datetime(2026, 11, 3, 10, 0)))
        snap = fechado.montar(arquivos, "2026-11-03T10:00:00")
        self.assertEqual(fechado.conferir(snap, arquivos), [])
        snap["rotas"] = snap["rotas"][1:]
        self.assertTrue(any("meta" in e for e in fechado.conferir(snap, arquivos)))

    def test_conferir_reprova_totais_por_gerencia_e_empresa_divergentes(self):
        arquivos = api.montar(simulado.gerar(gerar.datetime(2026, 11, 3, 10, 0)))
        base = fechado.montar(arquivos, "2026-11-03T10:00:00")
        gc = next(iter(base["gerencias"]))
        snap = json.loads(json.dumps(base))
        snap["gerencias"][gc]["sucos"][1] += 50.0
        self.assertTrue(any(f"gerência {gc}" in e for e in fechado.conferir(snap, arquivos)))
        snap = json.loads(json.dumps(base))
        snap["empresa"]["sucos"][0] += 50.0
        self.assertTrue(any("empresa" in e for e in fechado.conferir(snap, arquivos)))
        snap = json.loads(json.dumps(base))
        del snap["gerencias"]
        self.assertTrue(any("gerência" in e for e in fechado.conferir(snap, arquivos)))
        snap = json.loads(json.dumps(base))
        for r in snap["rotas"]:            # rota trocada de gerência: o total por gerência não fecha mais
            if r[1] == gc and "sucos" in r[3] and r[3]["sucos"][1]:
                r[1] = "OUTRA"
                break
        self.assertTrue(any(f"gerência {gc}" in e for e in fechado.conferir(snap, arquivos)))


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


if __name__ == "__main__":
    unittest.main()
