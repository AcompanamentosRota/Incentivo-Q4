"""Missões Guiadas: consulta (fontes.carregar_missoes) -> v1/missoes.json (api.montar_missoes), com Datasphere falso.

Cenário (registros missão x tarefa x cliente, como no modelo):
  missão 241 "Traga De Volta": rota 111 -> 2 + 1 (duas tarefas); rota 112 -> 0; um registro sem rota -> 4
  missão 35 "Combo Especial Da Semana": rota 111 -> 0,5
  O registro traz também colunas sensíveis (CPF, telefone): elas não podem ir no $select.
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from gerador import api, fontes  # noqa: E402
from gerador import mapeamento as M  # noqa: E402
from tests.falso import ConsultaFalsa  # noqa: E402

C = M.ColMissao


def _reg(codigo, nome, rota, realizado, tarefa="1"):
    return {C.CODIGO: codigo, C.NOME: nome, C.ROTA: rota, C.REALIZADO: realizado, "CD_TAREFA_Misso": tarefa,
            "CNPJ_CPF_Clien": "00000000000", "TELEFONE_Clien": "0000-0000", "VL_PCT_PROGRESSO": 0.5}


def cenario(**objetos) -> ConsultaFalsa:
    padrao = {M.OBJ_MISSOES: [
        _reg("241", "Traga De Volta", "111", 2, tarefa="1010"),
        _reg("241", "Traga De Volta", "111", 1, tarefa="1033"),
        _reg("241", "Traga De Volta", "112", 0),
        _reg("241", "Traga De Volta", "", 4),
        _reg("35", "Combo Especial Da Semana", "111", 0.5),
    ]}
    return ConsultaFalsa({**padrao, **objetos})


class TestMissoes(unittest.TestCase):
    def test_soma_por_missao_e_por_rota(self):
        missoes = fontes.carregar_missoes(cenario())
        self.assertEqual([m["codigo"] for m in missoes], ["35", "241"])   # ordem numérica do código
        m241 = missoes[1]
        self.assertEqual(m241["nome"], "Traga De Volta")
        self.assertEqual(m241["realizado"], 7)                    # sem rota conta no total
        self.assertEqual(m241["rotas"], {"111": 3, "112": 0})     # tarefas somadas; sem rota fica fora

    def test_select_so_com_as_colunas_permitidas(self):
        cons = cenario()
        fontes.carregar_missoes(cons)
        (objeto, select, filtro), = cons.chamadas
        self.assertEqual(objeto, M.OBJ_MISSOES)
        self.assertEqual(set(select), {C.CODIGO, C.NOME, C.ROTA, C.REALIZADO})
        self.assertIsNone(filtro)                                  # sem filtro de data

    def test_filtro_de_uma_rota(self):
        missoes = fontes.carregar_missoes(cenario(), rota="112")
        self.assertEqual([(m["codigo"], m["realizado"], m["rotas"]) for m in missoes], [("241", 0, {"112": 0})])

    def test_modelo_sem_a_coluna_devolve_none(self):
        cons = cenario(**{M.OBJ_MISSOES: [{C.CODIGO: "241", C.NOME: "X", C.ROTA: "111"}]})   # sem VL_REALIZADO
        with self.assertLogs("gerador.fontes", "WARNING"):
            self.assertIsNone(fontes.carregar_missoes(cons))

    def test_arquivo_da_api(self):
        doc = api.montar_missoes(fontes.carregar_missoes(cenario()))
        self.assertEqual(doc, {"missoes": [
            {"codigo": "35", "nome": "Combo Especial Da Semana", "realizado": 0.5, "rotas": {"111": 0.5}},
            {"codigo": "241", "nome": "Traga De Volta", "realizado": 7, "rotas": {"111": 3, "112": 0}},
        ]})
        self.assertIsInstance(doc["missoes"][1]["realizado"], int)


if __name__ == "__main__":
    unittest.main()
