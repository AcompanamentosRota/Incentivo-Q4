"""Missões Guiadas pelo cruzamento base de elegíveis x cobertura (gerador/missoes.py + fontes + api).

Fixtures sintéticas: missões, produtos, clientes e rotas fictícios. Nenhum código real.

Cenário base (duas missões, quatro clientes):
  "Missão Alfa":  produto P1 x cliente 9001 (rota R1), produto P1 x cliente 9002 (rota R1)
  "Missão Beta":  produto P2 x cliente 9003 (rota R2), produto P2 x cliente 9004 (rota R2)
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from gerador import api, fontes  # noqa: E402
from gerador import mapeamento as M  # noqa: E402
from gerador import missoes as gm  # noqa: E402
from tests.falso import ConsultaFalsa  # noqa: E402

CM = M.ColMeta

CABECALHO = "missao;cod_produto;cod_cliente"
CSV = "\n".join([CABECALHO,
                 "Missão Alfa;P1;9001",
                 "Missão Alfa;P1;9002",
                 "Missão Beta;P2;9003",
                 "Missão Beta;P2;9004"])
ROTAS = {9001: "R1", 9002: "R1", 9003: "R2", 9004: "R2"}


def base(texto=CSV, anomes="202611", contam=None) -> gm.Base:
    return gm.ler_base(texto, anomes, f"{anomes}.csv", contam)


def por_nome(missoes: list[dict]) -> dict[str, dict]:
    return {m["nome"]: m for m in missoes}


# ---------------------------------------------------------------- carga e validação da base
class TestBase(unittest.TestCase):
    def test_le_as_tres_colunas(self):
        b = base()
        self.assertTrue(b.ok)
        self.assertEqual(b.linhas, 4)
        self.assertEqual(len(b.pares), 4)
        self.assertEqual(b.produtos, ["P1", "P2"])
        self.assertEqual(b.missoes, ["Missão Alfa", "Missão Beta"])
        self.assertEqual(b.ignoradas, {})

    def test_cabecalho_em_outra_ordem_e_com_bom_de_caixa(self):
        b = base("COD_CLIENTE;MISSAO;COD_PRODUTO\n9001;Missão Alfa;P1")
        self.assertTrue(b.ok)
        self.assertEqual(b.pares, (("Missão Alfa", "P1", 9001),))

    def test_coluna_faltando_deixa_o_pilar_sem_dados(self):
        b = base("missao;cod_produto\nMissão Alfa;P1")
        self.assertFalse(b.ok)
        self.assertIn("cod_cliente", b.erro)
        self.assertEqual(b.pares, ())

    def test_arquivo_vazio_deixa_o_pilar_sem_dados(self):
        b = base("")
        self.assertFalse(b.ok)
        self.assertEqual(b.erro, "arquivo vazio")

    def test_base_so_com_cabecalho_deixa_o_pilar_sem_dados(self):
        b = base(CABECALHO)
        self.assertFalse(b.ok)
        self.assertEqual(b.erro, "nenhuma linha válida na base")

    def test_arquivo_ausente_deixa_o_pilar_sem_dados(self):
        b = gm.carregar_base("209901", pasta=Path(__file__).resolve().parent)
        self.assertFalse(b.ok)
        self.assertIn("não publicada", b.erro)
        self.assertEqual(b.arquivo, "209901.csv")

    def test_chave_repetida_e_ignorada_com_aviso(self):
        b = base(CSV + "\nMissão Alfa;P1;9001")
        self.assertEqual(len(b.pares), 4)
        self.assertEqual(b.ignoradas, {gm.REPETIDA: 1})
        self.assertEqual(b.linhas, 5)

    def test_missao_fora_das_que_contam_e_ignorada_com_aviso(self):
        b = base(CSV, contam=["Missao Alfa"])          # sem acento: a comparação normaliza
        self.assertEqual(len(b.pares), 2)
        self.assertEqual(b.ignoradas, {gm.FORA_DO_MES: 2})

    def test_sem_lista_de_missoes_nada_e_filtrado(self):
        self.assertEqual(len(base(CSV, contam=None).pares), 4)

    def test_campos_em_branco_sao_ignorados_sem_derrubar_o_resto(self):
        b = base(CSV + "\n;P1;9001\nMissão Alfa;;9002\nMissão Alfa;P9;abc\nMissão Alfa;P9")
        self.assertEqual(len(b.pares), 4)
        self.assertEqual(b.ignoradas[gm.SEM_MISSAO], 1)
        self.assertEqual(b.ignoradas[gm.SEM_PRODUTO], 1)
        self.assertEqual(b.ignoradas[gm.SEM_CLIENTE], 1)
        self.assertEqual(b.ignoradas["linha com menos colunas que o cabeçalho"], 1)


# ---------------------------------------------------------------- cruzamento
class TestCruzamento(unittest.TestCase):
    def cruzar(self, cobertura, rotas=None):
        return gm.cruzar(base(), cobertura, rotas or ROTAS)

    def test_par_coberto_conta_1(self):
        missoes, avisos, acima = self.cruzar({(9001, "P1"): ("R1", False)})
        alfa = por_nome(missoes)["Missão Alfa"]
        self.assertEqual(alfa["rotas"], {"R1": 1})
        self.assertEqual(alfa["realizado"], 1)
        self.assertEqual(alfa["elegiveis_rota_cliente"], {"R1": 2})
        self.assertEqual((avisos, acima), ([], []))

    def test_par_coberto_so_hoje_vai_para_o_online_e_nao_para_o_realizado(self):
        alfa = por_nome(self.cruzar({(9001, "P1"): ("R1", True)})[0])["Missão Alfa"]
        self.assertEqual(alfa["rotas_online"], {"R1": 1})
        self.assertEqual(alfa["rotas"], {"R1": 0})          # a rota aparece, com realizado 0 (nunca ausente)
        self.assertEqual((alfa["realizado"], alfa["realizado_online"]), (0, 1))

    def test_par_coberto_ontem_e_de_novo_hoje_fica_so_no_realizado(self):
        # é o próprio modelo que garante isso (FX_COBERTURA_WF_ONLINE só marca quem ainda não estava coberto);
        # a consulta tem a precedência do Real, conferida em test_consulta_da_cobertura
        alfa = por_nome(self.cruzar({(9001, "P1"): ("R1", False)})[0])["Missão Alfa"]
        self.assertEqual((alfa["realizado"], alfa["realizado_online"]), (1, 0))

    def test_cliente_fora_da_base_nao_conta(self):
        missoes, avisos, _ = self.cruzar({(9999, "P1"): ("R1", False)})
        self.assertEqual(por_nome(missoes)["Missão Alfa"]["realizado"], 0)
        self.assertEqual(avisos, [])

    def test_produto_fora_da_base_nao_conta(self):
        missoes, _, _ = self.cruzar({(9001, "P9"): ("R1", False)})
        self.assertEqual(por_nome(missoes)["Missão Alfa"]["realizado"], 0)

    def test_cliente_sem_rota_no_cadastro_e_ignorado_com_aviso(self):
        rotas = {k: v for k, v in ROTAS.items() if k != 9002}
        missoes, avisos, _ = gm.cruzar(base(), {(9001, "P1"): ("R1", False)}, rotas)
        self.assertEqual(por_nome(missoes)["Missão Alfa"]["elegiveis_rota_cliente"], {"R1": 1})
        self.assertEqual(len(avisos), 1)
        self.assertIn(gm.CLIENTE_FORA, avisos[0])

    def test_base_vazia_nao_gera_missao_nenhuma(self):
        self.assertEqual(gm.cruzar(base(CABECALHO), {}, ROTAS)[0], [])

    def test_rota_da_meta_diferente_manda_a_realizacao_para_a_rota_da_meta(self):
        missoes, avisos, acima = self.cruzar({(9001, "P1"): ("R7", False)})
        alfa = por_nome(missoes)["Missão Alfa"]
        self.assertEqual(alfa["rotas"], {"R1": 0, "R7": 1})            # conta em R7, a rota da META
        self.assertEqual(alfa["elegiveis_rota_cliente"], {"R1": 2})    # elegível segue na rota do CLIENTE
        self.assertEqual(len(acima), 1)                                 # R7 não tem elegível próprio: alerta
        self.assertEqual(acima[0]["rota"], "R7")
        self.assertEqual(acima[0]["origens"], [{"rota_cliente": "R1", "pares": 1}])
        self.assertIn("R7", avisos[0])
        self.assertIn("R1", avisos[0])      # o alerta nomeia as DUAS rotas (decisão da Karen em 18/11/2026)

    def test_invariante_fecha_sempre_mesmo_com_rota_cruzada(self):
        cob = {(9001, "P1"): ("R7", False), (9002, "P1"): ("R1", True), (9003, "P2"): ("R2", False)}
        missoes, _, _ = self.cruzar(cob)
        self.assertEqual(gm.conferir_invariante(missoes, base(), cob), [])
        total = sum(m["realizado"] + m["realizado_online"] for m in missoes)
        self.assertEqual(total, 3)      # = pares elegíveis cobertos no mês, qualquer que seja a rota

    def test_invariante_acusa_quando_nao_fecha(self):
        missoes, _, _ = self.cruzar({(9001, "P1"): ("R1", False)})
        missoes[0]["realizado"] = 99
        self.assertTrue(gm.conferir_invariante(missoes, base(), {(9001, "P1"): ("R1", False)}))

    def test_rota_com_elegivel_e_sem_realizacao_fica_com_zero_nunca_ausente(self):
        alfa = por_nome(self.cruzar({})[0])["Missão Alfa"]
        self.assertEqual(alfa["rotas"], {"R1": 0})

    def test_rota_sem_elegivel_e_sem_realizacao_fica_de_fora(self):
        self.assertNotIn("R9", por_nome(self.cruzar({})[0])["Missão Alfa"]["rotas"])


# ---------------------------------------------------------------- consulta da cobertura
def _linha(rota, cliente, produto, real=0, online=0):
    return {CM.META_ROTA: rota, CM.CLIENTE: cliente, CM.PRODUTO: produto,
            CM.COB_REAL: real, CM.COB_ONLINE: online, CM.META_ANOMES: "202611",
            "CNPJ_CPF_Clien": "00000000000"}


class TestConsulta(unittest.TestCase):
    def cons(self, linhas):
        return ConsultaFalsa({M.OBJ_META: linhas})

    def test_consulta_da_cobertura(self):
        cons = self.cons([_linha("R1", "9001", "P1", real=1), _linha("R2", "9003", "P2", online=1),
                          _linha("R1", "9002", "P1")])
        cob = fontes.carregar_cobertura_missoes(cons, "202611", ["P1", "P2"])
        self.assertEqual(cob, {(9001, "P1"): ("R1", False), (9003, "P2"): ("R2", True)})

    def test_realizado_tem_precedencia_sobre_o_online_no_mesmo_par(self):
        cons = self.cons([_linha("R1", "9001", "P1", online=1), _linha("R1", "9001", "P1", real=1)])
        self.assertEqual(fontes.carregar_cobertura_missoes(cons, "202611", ["P1"]), {(9001, "P1"): ("R1", False)})

    def test_select_so_com_as_colunas_necessarias(self):
        cons = self.cons([_linha("R1", "9001", "P1", real=1)])
        fontes.carregar_cobertura_missoes(cons, "202611", ["P1"])
        (objeto, select, filtro), = cons.chamadas
        self.assertEqual(objeto, M.OBJ_META)
        self.assertEqual(set(select), {CM.META_ROTA, CM.CLIENTE, CM.PRODUTO, CM.COB_REAL, CM.COB_ONLINE})
        self.assertNotIn("CNPJ", str(select))
        self.assertIn("202611", filtro)
        self.assertIn("P1", filtro)

    def test_sem_a_coluna_do_produto_devolve_none(self):
        cons = self.cons([{CM.META_ROTA: "R1", CM.CLIENTE: "9001", CM.COB_REAL: 1}])
        with self.assertLogs("gerador.fontes", "WARNING"):
            self.assertIsNone(fontes.carregar_cobertura_missoes(cons, "202611", ["P1"]))

    def test_sem_produtos_nao_consulta(self):
        cons = self.cons([])
        self.assertEqual(fontes.carregar_cobertura_missoes(cons, "202611", []), {})
        self.assertEqual(cons.chamadas, [])


# ---------------------------------------------------------------- rede de segurança e arquivo da API
class TestComparacaoEArquivo(unittest.TestCase):
    def cruzado(self, cobertura=None):
        cob = {(9001, "P1"): ("R1", False), (9003, "P2"): ("R2", True)} if cobertura is None else cobertura
        return gm.cruzar(base(), cob, ROTAS)

    def test_comparacao_sem_divergencia(self):
        missoes, _, _ = self.cruzado()
        antigo = [{"codigo": "10", "nome": "MISSAO ALFA", "realizado": 1, "rotas": {"R1": 1}},
                  {"codigo": "20", "nome": "Missão Beta", "realizado": 0, "rotas": {"R2": 0}}]
        comp = gm.comparar(missoes, antigo, M.OBJ_MISSOES)
        self.assertEqual(comp["rotas_diferentes"], 0)
        self.assertEqual(gm.avisos_da_comparacao(comp), [])
        self.assertEqual([m["codigo"] for m in missoes], ["10", "20"])   # o código vem da fonte antiga

    def test_comparacao_com_divergencia_vira_aviso_e_nao_muda_numero(self):
        missoes, _, _ = self.cruzado()
        antigo = [{"codigo": "10", "nome": "Missão Alfa", "realizado": 5, "rotas": {"R1": 5}}]
        comp = gm.comparar(missoes, antigo, M.OBJ_MISSOES)
        self.assertEqual(comp["rotas_diferentes"], 1)
        self.assertEqual(comp["missoes"][0]["rotas"], {"R1": [1, 5]})
        self.assertEqual(por_nome(missoes)["Missão Alfa"]["realizado"], 1)   # o número não muda
        avisos = gm.avisos_da_comparacao(comp)
        self.assertTrue(any("1 rota" in a for a in avisos))
        self.assertTrue(any("não existe na fonte antiga" in a for a in avisos))

    def test_sem_fonte_antiga_nao_compara(self):
        self.assertIsNone(gm.comparar(self.cruzado()[0], None, M.OBJ_MISSOES))

    def test_arquivo_da_api_com_os_campos_novos(self):
        missoes, _, acima = self.cruzado()
        doc = api.montar_missoes(missoes, "202611", "cobertura", gm.bloco_base(base()), None, acima)
        self.assertEqual(doc["anomes"], "202611")
        self.assertEqual(doc["fonte"], "cobertura")
        self.assertEqual(doc["base"], {"arquivo": "202611.csv", "anomes": "202611", "linhas": 4, "pares": 4,
                                       "ignoradas": 0, "motivos": {}, "erro": None})
        alfa = doc["missoes"][0]
        self.assertEqual(alfa["rotas"], {"R1": 1})
        self.assertEqual(alfa["rotas_online"], {})
        self.assertEqual(alfa["elegiveis_rota_cliente"], {"R1": 2})
        self.assertEqual(doc["missoes"][1]["rotas_online"], {"R2": 1})
        self.assertNotIn("acima_dos_elegiveis", doc)

    def test_arquivo_da_api_nao_publica_cliente_nem_produto(self):
        missoes, _, acima = self.cruzado()
        texto = str(api.montar_missoes(missoes, "202611", "cobertura", gm.bloco_base(base()), None, acima))
        for proibido in ("9001", "9002", "9003", "9004", "P1", "P2"):
            self.assertNotIn(proibido, texto)

    def test_arquivo_da_api_sem_base_fica_sem_missoes(self):
        b = gm.carregar_base("209901", pasta=Path(__file__).resolve().parent)
        doc = api.montar_missoes([], "209901", "cobertura", gm.bloco_base(b))
        self.assertEqual(doc["missoes"], [])
        self.assertIn("não publicada", doc["base"]["erro"])

    def test_formato_antigo_continua_saindo_igual(self):
        doc = api.montar_missoes([{"codigo": "241", "nome": "Traga De Volta", "realizado": 7,
                                   "rotas": {"112": 0, "111": 3}}])
        self.assertEqual(doc, {"missoes": [{"codigo": "241", "nome": "Traga De Volta", "realizado": 7,
                                            "rotas": {"111": 3, "112": 0}}]})

# ---------------------------------------------------------------- formato da base do mês
REPETIDA_DA_FIXTURE = "Missão Alfa;P1;9001"     # já está no CSV: repete a chave inteira
CRUZADA = "Missão Beta;P1;9001"                 # o par P1 x 9001 numa segunda missão


def conferir_formato(texto: str) -> list[str]:
    """Confere o formato da base de elegíveis de um mês. É função do teste: o gerador não precisa dela.

    Devolve a lista de problemas (vazia = formato bom), conferindo o que a revisão do PR confere à mão:
    cabeçalho exato, três colunas por linha, nenhum campo em branco, nenhuma chave repetida e o mesmo par
    cliente + produto em uma missão só. O último caso o gerador NÃO pega — a chave dele inclui a missão, e
    por isso um par repetido em dois blocos da base de origem seria contado duas vezes.
    """
    problemas: list[str] = []
    linhas = [l for l in texto.replace("\r\n", "\n").replace("\r", "\n").split("\n") if l.strip()]
    if not linhas:
        return ["arquivo vazio"]
    if linhas[0] != CABECALHO:
        problemas.append(f"cabeçalho diferente de {CABECALHO!r}")
    vistos: set[tuple[str, str, str]] = set()
    nomes_do_par: dict[tuple[str, str], set[str]] = {}
    for n, linha in enumerate(linhas[1:], start=2):
        campos = linha.split(";")
        if len(campos) != 3:
            problemas.append(f"linha {n}: {len(campos)} coluna(s), esperado 3")
            continue
        nome, produto, cliente = (c.strip() for c in campos)
        if not (nome and produto and cliente):
            problemas.append(f"linha {n}: campo em branco")
            continue
        if (chave := (nome, produto, cliente)) in vistos:
            problemas.append(f"linha {n}: chave repetida")
            continue
        vistos.add(chave)
        nomes_do_par.setdefault((produto, cliente), set()).add(nome)
    for nomes in nomes_do_par.values():
        if len(nomes) > 1:
            problemas.append(f"mesmo par cliente + produto em {len(nomes)} missoes diferentes")
    return problemas


class TestFormatoDaBaseDoMes(unittest.TestCase):
    """Fixtures sintéticas, sempre: a base real tem código de cliente e não entra em teste nenhum."""

    def test_base_bem_formada_nao_tem_problema(self):
        self.assertEqual(conferir_formato(CSV), [])

    def test_crlf_e_linha_em_branco_no_fim_continuam_bons(self):
        self.assertEqual(conferir_formato(CSV.replace("\n", "\r\n") + "\r\n"), [])

    def test_cabecalho_diferente_e_problema(self):
        texto = CSV.replace(CABECALHO, "missao;produto;cliente", 1)
        self.assertTrue(any("cabeçalho" in x for x in conferir_formato(texto)))

    def test_cabecalho_em_outra_ordem_e_problema(self):
        """O gerador aceita a ordem trocada; a base publicada do mês, não: o formato é um só."""
        texto = CSV.replace(CABECALHO, "cod_cliente;cod_produto;missao", 1)
        self.assertTrue(any("cabeçalho" in x for x in conferir_formato(texto)))

    def test_coluna_a_mais_ou_a_menos_e_problema(self):
        self.assertTrue(any("coluna" in x for x in conferir_formato(CSV + "\nMissão Alfa;P1")))
        self.assertTrue(any("coluna" in x for x in conferir_formato(CSV + "\nMissão Alfa;P1;9009;sobra")))

    def test_campo_em_branco_e_problema(self):
        for linha in (";P1;9009", "Missão Alfa;;9009", "Missão Alfa;P1;"):
            with self.subTest(linha=linha):
                self.assertTrue(any("em branco" in x for x in conferir_formato(CSV + "\n" + linha)))

    def test_chave_repetida_e_problema(self):
        problemas = conferir_formato(CSV + "\n" + REPETIDA_DA_FIXTURE)
        self.assertTrue(any("repetida" in x for x in problemas))

    def test_mesmo_par_em_duas_missoes_e_problema(self):
        problemas = conferir_formato(CSV + "\n" + CRUZADA)
        self.assertTrue(any("mesmo par" in x for x in problemas))

    def test_par_em_duas_missoes_seria_contado_duas_vezes_pelo_gerador(self):
        """Por que a conferência do par existe: o gerador não vê problema e conta a realização duas vezes."""
        b = base(CSV + "\n" + CRUZADA)
        self.assertEqual(b.ignoradas, {})                       # nada ignorado pelo gerador
        self.assertEqual(len(b.pares), len(CSV.splitlines()))   # os 4 pares da fixture + o cruzado
        missoes, _, _ = gm.cruzar(b, {(9001, "P1"): ("R1", False)}, ROTAS)
        self.assertEqual(sum(m["realizado"] for m in missoes), 2)

    def test_nenhuma_linha_da_fixture_tem_campo_vazio(self):
        for linha in CSV.splitlines()[1:]:
            with self.subTest(linha=linha):
                self.assertEqual(len([c for c in linha.split(";") if c.strip()]), 3)


if __name__ == "__main__":
    unittest.main()
