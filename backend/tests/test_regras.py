"""Regras puras: meta/tendência, status, gravação da API, validação e dados simulados."""
import sys
import tempfile
import unittest
from datetime import date, datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from gerador import api, calendario, modelo, saida, simulado, validacao  # noqa: E402
from gerador import mapeamento as M  # noqa: E402


class TestMetaERestante(unittest.TestCase):
    def test_casos(self):
        self.assertEqual(modelo.meta_e_restante(100, 100.5, 30, 7, 21, direto=True), (100, 30, modelo.DIRETO))
        self.assertEqual(modelo.meta_e_restante(100, 80, 20, 7, 21, direto=True), (100, 25.0, modelo.CURVA))
        meta, rest, caso = modelo.meta_e_restante(42, None, None, 7, 21)
        self.assertEqual((meta, round(rest, 6), caso), (42, 14.0, modelo.SEM_CURVA))
        self.assertEqual(modelo.meta_e_restante(0, 60, 10, 7, 21), (60, 10, modelo.SEM_META_ROTA))
        self.assertEqual(modelo.meta_e_restante(None, 0, 0, 7, 21), (None, None, None))


class TestStatus(unittest.TestCase):
    cal = calendario.montar(date(2026, 10, 22), 21, 15)

    def test_bloco(self):
        a = modelo.Acumulado(meta=100, realizado=101, neg_restante=0, rotas_com_meta=1)
        self.assertEqual(modelo.bloco(a, self.cal)["status"], modelo.META_BATIDA)
        a = modelo.Acumulado(meta=100, realizado=60, neg_restante=45, rotas_com_meta=1)
        self.assertEqual(modelo.bloco(a, self.cal)["status"], modelo.NO_RITMO)
        a = modelo.Acumulado(meta=100, realizado=60, neg_restante=30, rotas_com_meta=1)
        self.assertEqual(modelo.bloco(a, self.cal)["status"], modelo.ABAIXO)
        self.assertEqual(modelo.bloco(None, self.cal)["status"], modelo.SEM_META)

    def test_cliente(self):
        self.assertEqual(modelo.bloco_cliente(10, 7, 0, self.cal)["status"], modelo.NO_RITMO)    # 70% >= 67%
        self.assertEqual(modelo.bloco_cliente(10, 6, 0, self.cal)["status"], modelo.ABAIXO)
        self.assertEqual(modelo.bloco_cliente(0, 6, 0, self.cal)["status"], modelo.SEM_META)

    def test_sem_menos_zero(self):
        self.assertEqual(modelo.r1(-0.04), 0.0)


class TestSimuladoEGravacao(unittest.TestCase):
    def setUp(self):
        self.arquivos = api.montar(simulado.gerar(datetime(2026, 10, 22, 10, 0)))

    def test_estrutura(self):
        idx = self.arquivos["v1/index.json"]
        self.assertTrue(idx["simulado"])
        for g in idx["gerencias"]:
            self.assertIn("v1/" + g["arquivo"], self.arquivos)
            for r in self.arquivos["v1/" + g["arquivo"]]["rotas"]:
                self.assertIn(f"v1/rotas/{r['id']}.json", self.arquivos)
        for nome, obj in self.arquivos.items():
            if nome.startswith("v1/rotas/"):
                self.assertEqual(list(obj["produtos"]), M.IDS_PRODUTOS)

    def test_somente_index_tem_data_hora(self):
        outro = api.montar(simulado.gerar(datetime(2026, 10, 22, 15, 30)))
        diferentes = [k for k in self.arquivos if saida.serializar(self.arquivos[k]) != saida.serializar(outro[k])]
        self.assertEqual(diferentes, ["v1/index.json"])

    def test_gravar_apaga_rota_extinta(self):
        with tempfile.TemporaryDirectory() as tmp:
            pasta = Path(tmp)
            velho = pasta / "v1/rotas/ZZZ.json"
            velho.parent.mkdir(parents=True)
            velho.write_text("{}")
            gravados, apagados = saida.gravar_api(pasta, self.arquivos)
            self.assertEqual(apagados, ["v1/rotas/ZZZ.json"])
            self.assertEqual(len(gravados), len(self.arquivos))
            self.assertEqual(saida.gravar_api(pasta, self.arquivos), ([], []))   # nada mudou

    def test_validacao_reprova_queda_brusca(self):
        idx = {**self.arquivos["v1/index.json"], "simulado": False}
        arq = {**self.arquivos, "v1/index.json": idx}
        antes = {"empresa": {"produtos": {k: {"realizado": (b["realizado"] or 0) * 3}
                                          for k, b in self.arquivos["v1/resumo.json"]["empresa"]["produtos"].items()}}}
        erros, _ = validacao.validar(arq, antes, idx)
        self.assertTrue(any("caiu" in e for e in erros))
        self.assertEqual(validacao.validar(arq, self.arquivos["v1/resumo.json"], idx)[0], [])


class TestIncluirAgrupadores(unittest.TestCase):
    def tearDown(self):
        M.incluir_agrupadores([])

    def test_valida_e_ignora_com_aviso(self):
        avisos = M.incluir_agrupadores([
            {"id": "agua", "nome": "Água", "agrupador": "Agua Crystal"},
            {"id": "sucos", "nome": "Outro", "agrupador": "Outro"},        # id de um fixo
            {"id": "x1", "nome": "Refri", "agrupador": "REFRIGERANTES"},    # agrupador de um fixo (sem caixa)
            {"id": "Com Espaço", "nome": "X", "agrupador": "X"},            # id inválido
            {"id": "cha", "nome": "Chá", "agrupador": "Agua Crystal"},      # agrupador repetido
        ])
        self.assertEqual(len(avisos), 4)
        self.assertEqual(M.IDS_PRODUTOS[-1], "agua")
        self.assertEqual(M.produto_do_agrupador("AGUA CRYSTAL"), "agua")
        self.assertIn("Agua Crystal", M.AGRUPADORES_CONSULTA)
        self.assertIn("agua", M.SO_META_VOLUME)
        M.incluir_agrupadores([])
        self.assertEqual(M.IDS_PRODUTOS, [p["id"] for p in M.PRODUTOS_FIXOS])

    def test_maximo_de_extras(self):
        extras = [{"id": f"e{i}", "nome": f"E{i}", "agrupador": f"Agrupador {i}"} for i in range(M.EXTRAS_MAX + 2)]
        self.assertEqual(len(M.incluir_agrupadores(extras)), 2)
        self.assertEqual(len(M.IDS_PRODUTOS), len(M.PRODUTOS_FIXOS) + M.EXTRAS_MAX)

    def test_simulado_com_extra(self):
        M.incluir_agrupadores([{"id": "agua", "nome": "Água", "agrupador": "Agua"}])
        arquivos = api.montar(simulado.gerar(datetime(2026, 10, 22, 10, 0)))
        self.assertIn("agua", arquivos["v1/resumo.json"]["empresa"]["produtos"])


if __name__ == "__main__":
    unittest.main()
