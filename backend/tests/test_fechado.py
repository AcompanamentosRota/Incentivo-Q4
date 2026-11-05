"""Snapshot do mês fechado (v1/fechado/AAAAMM.json), rodando o gerar.py de ponta a ponta com dados simulados.

Sequência de datas (dias úteis locais; em 11/2026, 01/11 é domingo e 02/11 é feriado, então o 1º dia útil é 03/11):
  30/10 Outubro/26 normal       -> nenhum snapshot; index.fechados = []
  01/11 fechamento de Outubro   -> grava 202610.json (provisório)
  03/11 fechamento de Outubro   -> sobrescreve 202610.json (o último do fechamento é o que vale)
  04/11 Novembro/26 normal      -> sela 202610.json (fechamento_final = true) e não muda mais
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
    def test_grava_sobrescreve_e_sela(self):
        self.assertEqual(self.rodar("2026-10-30"), 0)
        self.assertEqual(self.ler("v1/index.json")["fechados"], [])
        self.assertIsNone(self.ler(SNAP))

        self.assertEqual(self.rodar("2026-11-01"), 0)
        idx = self.ler("v1/index.json")
        self.assertEqual(idx["mes_referencia"], {"anomes": "202610", "rotulo": "Outubro/26", "fechamento": True})
        primeiro = self.ler(SNAP)
        self.assertFalse(primeiro["fechamento_final"])
        self.assertEqual(primeiro["atualizado_em"], idx["atualizado_em"])
        self.assertEqual(idx["fechados"], [{"anomes": "202610", "rotulo": "Outubro/26", "arquivo": "fechado/202610.json",
                                            "gerado_em": primeiro["gerado_em"], "fechamento_final": False}])

        self.assertEqual(self.rodar("2026-11-03"), 0)
        self.assertTrue(self.ler("v1/index.json")["mes_referencia"]["fechamento"])
        segundo = self.ler(SNAP)
        self.assertNotEqual(segundo["rotas"], primeiro["rotas"])   # simulado muda com a data: foi sobrescrito
        self.assertEqual(segundo["atualizado_em"][:10], "2026-11-03")

        self.assertEqual(self.rodar("2026-11-04"), 0)
        idx = self.ler("v1/index.json")
        self.assertEqual(idx["mes_referencia"]["anomes"], "202611")
        self.assertFalse(idx["mes_referencia"]["fechamento"])
        selado = self.ler(SNAP)
        self.assertEqual({**selado, "fechamento_final": False}, segundo)   # só o selo mudou
        self.assertTrue(selado["fechamento_final"])
        self.assertTrue(idx["fechados"][0]["fechamento_final"])
        self.assertEqual(sorted(p.name for p in (self.pasta / "api/v1/fechado").iterdir()), ["202610.json"])

        congelado = self.bytes_de(SNAP)
        for hoje in ("2026-11-05", "2026-11-30"):
            self.assertEqual(self.rodar(hoje), 0)
            self.assertEqual(self.bytes_de(SNAP), congelado)

    def test_selado_nao_volta_a_ser_gravado_no_fechamento(self):
        """Se o fechamento voltar depois da virada (ex.: gerência sem meta), o mês selado continua igual."""
        self.rodar("2026-11-03")
        self.rodar("2026-11-04")
        congelado = self.bytes_de(SNAP)
        self.rodar("2026-11-03")
        self.assertEqual(self.bytes_de(SNAP), congelado)
        self.assertTrue(any("selado" in a for a in self.ler("v1/index.json")["avisos"]))

    def test_api_ja_virada_nao_sobrescreve_provisorio(self):
        self.rodar("2026-11-03")
        self.rodar("2026-11-04")
        snap = self.pasta / "api" / SNAP
        snap.write_bytes(saida.serializar({**saida.ler(snap), "fechamento_final": False}))
        congelado = snap.read_bytes()
        self.rodar("2026-11-03")   # index anterior em 202611
        self.assertEqual(snap.read_bytes(), congelado)

    def test_varios_meses_em_ordem(self):
        for hoje in ("2026-11-03", "2026-11-04", "2026-12-01", "2026-12-02"):
            self.rodar(hoje)
        fechados = self.ler("v1/index.json")["fechados"]
        self.assertEqual([f["anomes"] for f in fechados], ["202610", "202611"])
        self.assertTrue(all(f["fechamento_final"] for f in fechados))


class TestFormatoETotais(Rodadas):
    def test_formato_e_totais_batem_com_a_rodada(self):
        self.ajustes.write_text(json.dumps({"agrupadores": [{"id": "agua", "nome": "Água", "agrupador": "Agua Teste"}]}))
        self.rodar("2026-11-03")
        snap, resumo = self.ler(SNAP), self.ler("v1/resumo.json")
        self.assertEqual(list(snap), ["anomes", "rotulo", "gerado_em", "atualizado_em", "simulado", "fechamento_final",
                                      "campos", "campos_produto", "rotas"])
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

    def test_conferir_reprova_meta_divergente(self):
        arquivos = api.montar(simulado.gerar(gerar.datetime(2026, 11, 3, 10, 0)))
        snap = fechado.montar(arquivos, "2026-11-03T10:00:00")
        self.assertEqual(fechado.conferir(snap, arquivos), [])
        snap["rotas"] = snap["rotas"][1:]
        self.assertTrue(any("meta" in e for e in fechado.conferir(snap, arquivos)))


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
