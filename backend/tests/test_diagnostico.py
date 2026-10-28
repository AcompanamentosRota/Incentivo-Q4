"""Testes do diagnóstico Real da API x Real do SAC (scripts/diagnosticar_real.py), sem rede.

Cenário sintético (nomes fictícios, nunca dados reais): 2 gerências, 3 rotas, 3 produtos.
  GA: rota R01 (Sucos 100/95, Refrigerantes 200/210, Individuais 50/44) e R02 (Sucos 50/40)
  GB: rota R03 (Refrigerantes 400/300, Individuais 100/60)
O resumo da empresa é a soma das gerências, que é a soma das rotas — é o que a consistência confere.
"""
import json
import sys
import unittest
from datetime import date
from pathlib import Path
from tempfile import TemporaryDirectory

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

import diagnosticar_real as D  # noqa: E402
from gerador import mapeamento as M  # noqa: E402
from tests.falso import ConsultaFalsa  # noqa: E402

PRODUTOS = ["sucos", "refrigerantes", "individuais"]
VENDEDOR = "VENDEDOR FICTICIO UM"
SUPERVISOR = "SUPERVISOR FICTICIO DOIS"
CLIENTE = "CLIENTE FICTICIO ALFA"


def bloco(meta, real, online=0.0):
    return {"meta": meta, "realizado": real, "atingimento_pct": None, "diferenca": None, "tendencia": None,
            "tendencia_pct": None, "meta_dia": None, "online_hoje": online, "status": "abaixo_do_ritmo"}


# rota -> gerência e blocos por produto
ROTAS = {
    "R01": ("GA", {"sucos": bloco(100.0, 95.0), "refrigerantes": bloco(200.0, 210.0),
                   "individuais": bloco(50.0, 44.0)}),
    "R02": ("GA", {"sucos": bloco(50.0, 40.0)}),
    "R03": ("GB", {"refrigerantes": bloco(400.0, 300.0), "individuais": bloco(100.0, 60.0)}),
}


def _somar(rotas):
    total = {}
    for _, prods in rotas:
        for k, b in prods.items():
            alvo = total.setdefault(k, bloco(0.0, 0.0))
            for campo in ("meta", "realizado", "online_hoje"):
                alvo[campo] += b[campo]
    return {k: total.get(k) or bloco(None, None) for k in PRODUTOS}


def escrever_api(pasta: Path, agrupador_repetido: bool = False) -> Path:
    """Escreve uma API sintética no formato de api/v1 e devolve a pasta."""
    pasta.mkdir(parents=True, exist_ok=True)
    (pasta / "rotas").mkdir(exist_ok=True)
    produtos = [{"id": "sucos", "nome": "Vol. Sucos", "agrupadores": ["Sucos"], "extra": False},
                {"id": "refrigerantes", "nome": "Vol. Refrigerantes", "agrupadores": ["Refrigerantes"],
                 "extra": False},
                {"id": "individuais", "nome": "Vol. Individuais",
                 "agrupadores": ["Refrigerantes" if agrupador_repetido else "Refrigerantes Individual"],
                 "extra": False}]
    gerencias = sorted({gc for gc, _ in ROTAS.values()})
    (pasta / "index.json").write_text(json.dumps({
        "versao_api": "1", "atualizado_em": "2026-10-28T16:00:00", "simulado": False,
        "mes_referencia": {"anomes": "202610", "rotulo": "Outubro/26", "fechamento": False},
        "calendario": {"hoje": "2026-10-28", "dias_uteis_mes": 21, "dia_util_hoje": 19},
        "produtos": produtos,
        "gerencias": [{"id": gc, "nome": f"Praça {gc}", "arquivo": f"gerencias/{gc}.json"} for gc in gerencias],
        "avisos": []}, ensure_ascii=False), encoding="utf-8")

    por_gc = {gc: [(r, p) for r, (g, p) in ROTAS.items() if g == gc] for gc in gerencias}
    for gc, itens in por_gc.items():
        (pasta / "gerencias" / f"{gc}.json").parent.mkdir(exist_ok=True)
        (pasta / "gerencias" / f"{gc}.json").write_text(json.dumps({
            "gerencia": {"id": gc, "nome": f"Praça {gc}"},
            "produtos": _somar(itens),
            "supervisoes": [{"id": f"SV.{gc}.1", "nome": SUPERVISOR, "rotas": [r for r, _ in itens],
                             "produtos": _somar(itens)}],
            "rotas": [{"id": r, "tipo": "normal", "gerencia": gc, "supervisao": f"SV.{gc}.1",
                       "vendedor": VENDEDOR, "produtos": p} for r, p in itens]}, ensure_ascii=False),
            encoding="utf-8")
    (pasta / "resumo.json").write_text(json.dumps({
        "empresa": {"produtos": _somar(list(ROTAS.values()))},
        "gerencias": [{"id": gc, "produtos": _somar(itens)} for gc, itens in por_gc.items()]},
        ensure_ascii=False), encoding="utf-8")
    for r, (gc, prods) in ROTAS.items():
        (pasta / "rotas" / f"{r}.json").write_text(json.dumps({
            "rota": {"id": r, "tipo": "normal", "gerencia": gc, "supervisao": f"SV.{gc}.1",
                     "vendedor": VENDEDOR, "nome_supervisor": SUPERVISOR},
            "produtos": prods,
            "clientes": [{"pv": 1, "nome": CLIENTE, "segmento": "Boteco", "na_base": True, "produtos": {}}]},
            ensure_ascii=False), encoding="utf-8")
    return pasta


class Base(unittest.TestCase):
    def setUp(self):
        self._tmp = TemporaryDirectory()
        self.pasta = escrever_api(Path(self._tmp.name) / "v1")
        self.api = D.ler_api(self.pasta)

    def tearDown(self):
        self._tmp.cleanup()

    def sac(self, **reais):
        """SAC com Real por produto; meta None (não informada) salvo se vier 'meta_<produto>'."""
        produtos = {}
        for k in PRODUTOS:
            produtos[k] = {"real": reais.get(k), "meta": reais.get(f"meta_{k}")}
        return {"corte": "28/10/2026 16:07", "produtos": produtos}

    def niveis(self, achados):
        return {a["nivel"] for a in achados}


class TestComparacaoDeTotais(Base):
    def test_api_soma_igual_nos_tres_caminhos(self):
        t = D.totais_api(self.api)
        for campo in ("meta", "realizado", "online_hoje"):
            self.assertEqual(t["empresa"][campo], t["gerencias"][campo], campo)
            self.assertEqual(t["gerencias"][campo], t["rotas"][campo], campo)
        self.assertEqual(t["empresa"]["realizado"], {"sucos": 135.0, "refrigerantes": 510.0, "individuais": 104.0})
        self.assertEqual(t["empresa"]["meta"], {"sucos": 150.0, "refrigerantes": 600.0, "individuais": 150.0})

    def test_tabela_de_diferencas_tem_absoluto_e_relativo(self):
        linhas = D.tabela_diferencas(D.totais_api(self.api), self.sac(sucos=130.0), PRODUTOS)
        sucos = next(l for l in linhas if l["produto"] == "sucos")
        self.assertEqual((sucos["api_real"], sucos["sac_real"], sucos["dif_real"]), (135.0, 130.0, 5.0))
        self.assertAlmostEqual(sucos["dif_real_pct"], 5.0 / 130.0)
        refri = next(l for l in linhas if l["produto"] == "refrigerantes")
        self.assertIsNone(refri["sac_real"])      # produto sem valor do SAC não inventa número
        self.assertIsNone(refri["dif_real"])

    def test_meta_divergente_aponta_escopo(self):
        sac = self.sac(sucos=135.0, meta_sucos=100.0)
        veredito, porque = D.veredito_escopo_ou_medida(D.tabela_diferencas(D.totais_api(self.api), sac, PRODUTOS))
        self.assertEqual(veredito, "escopo")
        self.assertIn("ESCOPO/FILTRO", porque)

    def test_so_o_real_divergente_aponta_medida(self):
        sac = self.sac(sucos=130.0, meta_sucos=150.0)
        veredito, porque = D.veredito_escopo_ou_medida(D.tabela_diferencas(D.totais_api(self.api), sac, PRODUTOS))
        self.assertEqual(veredito, "medida")
        self.assertIn("MEDIDA/CORTE/REGRA", porque)

    def test_sem_meta_do_sac_fica_indeterminado(self):
        sac = self.sac(sucos=130.0)
        veredito, porque = D.veredito_escopo_ou_medida(D.tabela_diferencas(D.totais_api(self.api), sac, PRODUTOS))
        self.assertEqual(veredito, "indeterminado")
        self.assertIn("meta do SAC não foi informada", porque)

    def test_tudo_dentro_da_tolerancia_fica_ok(self):
        sac = self.sac(sucos=135.0, meta_sucos=150.0)
        veredito, _ = D.veredito_escopo_ou_medida(D.tabela_diferencas(D.totais_api(self.api), sac, PRODUTOS))
        self.assertEqual(veredito, "ok")


class TestConsistenciaInterna(Base):
    def test_api_consistente_nao_tem_erro(self):
        achados = D.consistencia(self.api)
        self.assertNotIn("erro", self.niveis(achados), [a["texto"] for a in achados if a["nivel"] == "erro"])

    def test_soma_das_rotas_divergente_da_gerencia_vira_erro(self):
        arquivo = self.pasta / "rotas" / "R01.json"
        dados = json.loads(arquivo.read_text(encoding="utf-8"))
        dados["produtos"]["refrigerantes"]["realizado"] += 1000.0   # rota deixa de bater com a gerência
        arquivo.write_text(json.dumps(dados, ensure_ascii=False), encoding="utf-8")
        achados = D.consistencia(D.ler_api(self.pasta))
        erros = [a["texto"] for a in achados if a["nivel"] == "erro"]
        self.assertTrue(any("realizado" in t and "Refrigerantes" in t for t in erros), erros)

    def test_rota_listada_sem_arquivo_vira_erro(self):
        (self.pasta / "rotas" / "R02.json").unlink()
        erros = [a["texto"] for a in D.consistencia(D.ler_api(self.pasta)) if a["nivel"] == "erro"]
        self.assertTrue(any("R02" in t for t in erros), erros)

    def test_rota_em_duas_gerencias_vira_erro(self):
        arquivo = self.pasta / "gerencias" / "GB.json"
        dados = json.loads(arquivo.read_text(encoding="utf-8"))
        dados["rotas"].append({"id": "R01", "tipo": "normal", "gerencia": "GB", "supervisao": "SV.GB.1",
                               "vendedor": VENDEDOR, "produtos": {}})
        arquivo.write_text(json.dumps(dados, ensure_ascii=False), encoding="utf-8")
        erros = [a["texto"] for a in D.consistencia(D.ler_api(self.pasta)) if a["nivel"] == "erro"]
        self.assertTrue(any("mais de uma gerência" in t and "R01" in t for t in erros), erros)

    def test_agrupador_em_dois_produtos_vira_erro(self):
        pasta = escrever_api(Path(self._tmp.name) / "repetido", agrupador_repetido=True)
        achados = D.agrupadores_sobrepostos(D.ler_api(pasta)["index"]["produtos"])
        self.assertEqual([a["nivel"] for a in achados], ["erro"])
        self.assertIn("Refrigerantes", achados[0]["texto"])
        self.assertIn("dois pilares", achados[0]["texto"])

    def test_agrupadores_sem_sobreposicao_ficam_ok(self):
        achados = D.agrupadores_sobrepostos(self.api["index"]["produtos"])
        self.assertEqual([a["nivel"] for a in achados], ["ok"])

    def test_refrigerantes_menor_que_as_partes_vira_erro(self):
        a = D.relacao_refrigerantes({"refrigerantes": 10.0, "retornaveis": 8.0, "individuais": 9.0})
        self.assertEqual(a["nivel"], "erro")

    def test_refrigerantes_igual_a_soma_das_partes_vira_alerta(self):
        a = D.relacao_refrigerantes({"refrigerantes": 100.0, "retornaveis": 30.0, "individuais": 20.0,
                                     "sabores": 50.0})
        self.assertEqual(a["nivel"], "alerta")

    def test_refrigerantes_contendo_as_partes_fica_ok(self):
        a = D.relacao_refrigerantes({"refrigerantes": 500.0, "retornaveis": 30.0, "individuais": 20.0,
                                     "sabores": 50.0})
        self.assertEqual(a["nivel"], "ok")


# --------------------------------------------------------------------------- consulta direta (Datasphere falso)
AG = {"sucos": "Sucos", "refrigerantes": "Refrigerantes", "individuais": "Refrigerantes Individual"}


def fato(rota, agrupador, gc="Gc. G1", nf="Acertado", data="2026-10-20", fat=0.0, online=0.0,
         fonte="Basis", situacao="Inc. e Exp."):
    return {"ANOMES_REF": "202610", "CD_ROTA_Clien": rota, "DS_GC_AGRUPADA_ATUAL_Clien": gc,
            "DS_AGRUPADOR_Agrupador_Prod": agrupador, "NF_STATUS_Nota_Fiscal": nf, "DATA_MOVIMENTO": data,
            "FONTE": fonte, "SITUACAO_Pedido": situacao, "FX_VOL_PADRAO_FAT": fat,
            "FX_VOL_PADRAO_WF_ONLINE": online, "RETORNO_Nota_Fiscal": "Não", "TROCA_Nota_Fiscal": "Não",
            "CANCELAMENTO_Nota_Fiscal": "Não", "NF_TIPOOPER_Nota_Fiscal": "A Prazo",
            "FONTE_Nota_Fiscal": "NF SAIDA", "NF_UNID_Nota_Fiscal": "52", "VL_PADRAO": fat}


def consulta_falsa(linhas):
    return ConsultaFalsa({M.OBJ_META: linhas}, tipos={M.OBJ_META: {"DATA_MOVIMENTO": "Edm.Date"}})


class TestConsultaDireta(unittest.TestCase):
    def test_classifica_o_que_o_gerador_inclui_e_o_que_deixa_de_fora(self):
        linhas = [fato("R01", "Sucos", fat=100.0),
                  fato("R01", "Sucos", nf="Cancelada", fat=7.0),
                  fato("R99", "Sucos", fat=30.0),                    # rota fora da base de clientes
                  fato("EV5", "Sucos", fat=5.0),                     # rota eventual
                  fato("EXT", "Sucos", gc="--", fat=1000.0),         # GC não atribuída
                  fato("R01", "Cervejas", fat=999.0)]                # agrupador fora da API
        recortes, status_fora, rotas_fora = D.classificar_linhas(linhas, {"R01"})
        self.assertEqual(recortes[D.BUCKET_API], {"sucos": 100.0})
        self.assertEqual(recortes[D.BUCKET_FORA_BASE], {"sucos": 30.0})
        self.assertEqual(recortes[D.BUCKET_EV], {"sucos": 5.0})
        self.assertEqual(recortes[f"{D.BUCKET_GC} (--)"], {"sucos": 1000.0})
        self.assertEqual(status_fora["Cancelada"], {"sucos": 7.0})
        self.assertEqual(rotas_fora[D.BUCKET_FORA_BASE], {"R99": 30.0})
        self.assertNotIn("R01", rotas_fora.get(D.BUCKET_FORA_BASE, {}))

    def test_sobreposicao_real_online_detectada_quando_hoje_tem_faturado(self):
        com = D.sobreposicao_real_online([fato("R01", "Sucos", data="2026-10-28", fat=12.0, online=3.0)])
        self.assertEqual(com["sucos"], (12.0, 3.0))
        sem = D.sobreposicao_real_online([fato("R01", "Sucos", data="2026-10-28", fat=0.0, online=3.0)])
        self.assertEqual(sem["sucos"], (0.0, 3.0))

    def test_por_dia_separa_faturado_de_pedido(self):
        dias = D.por_dia([fato("R01", "Refrigerantes", data="2026-10-27", fat=500.0, online=10.0),
                          fato("R01", "Refrigerantes", data="2026-10-27", nf="Cancelada", fat=3.0),
                          fato("R01", "Refrigerantes", data="2026-10-28", fonte="WF Online", online=700.0)])
        self.assertEqual(dias["2026-10-27"], (500.0, 3.0, 10.0))
        self.assertEqual(dias["2026-10-28"], (0.0, 0.0, 700.0))
        self.assertEqual(list(dias), ["2026-10-27", "2026-10-28"])      # em ordem de data

    def test_consulta_direta_monta_todas_as_secoes(self):
        cons = consulta_falsa([
            fato("R01", "Sucos", fat=100.0),
            fato("R01", "Sucos", data="2026-10-28", fonte="WF Online", online=9.0),
            fato("R01", "Refrigerantes", fat=500.0),
            fato("EXT", "Refrigerantes", gc="--", fat=40.0),
        ])
        ds = D.consultar_datasphere(cons, "202610", date(2026, 10, 28), {"R01"})
        self.assertEqual(ds["recortes"][D.BUCKET_API], {"sucos": 100.0, "refrigerantes": 500.0})
        self.assertEqual(ds["recortes"][f"{D.BUCKET_GC} (--)"], {"refrigerantes": 40.0})
        self.assertEqual(ds["hoje_fat_online"]["sucos"], (0.0, 9.0))
        self.assertEqual(ds["medidas"]["FX_VOL_PADRAO_FAT"], {"Sucos": 100.0, "Refrigerantes": 540.0})
        self.assertIsNone(ds["medidas"]["FX_CAIXA_FISICA_FAT"])     # medida que não existe no modelo falso
        self.assertEqual(ds["corte"]["RETORNO_Nota_Fiscal"]["no_vol_real"], {"Não": 640.0})
        self.assertEqual(ds["agrupador_do_dia"], "Refrigerantes")
        self.assertEqual(ds["por_dia"]["2026-10-20"], (540.0, 0.0, 0.0))

    def test_hipotese_do_hoje_confirma_quando_o_faturado_ja_inclui_hoje(self):
        cons = consulta_falsa([fato("R01", "Sucos", fat=100.0),
                               fato("R01", "Sucos", data="2026-10-28", fat=15.0, online=9.0)])
        ds = D.consultar_datasphere(cons, "202610", date(2026, 10, 28), {"R01"})
        h4 = next(h for h in D.hipoteses([], ds) if h["id"] == "H4")
        self.assertEqual(h4["resultado"], D.CONFIRMADA)

    def test_hipotese_do_hoje_descarta_quando_o_faturado_vai_so_ate_ontem(self):
        cons = consulta_falsa([fato("R01", "Sucos", fat=100.0),
                               fato("R01", "Sucos", data="2026-10-28", fonte="WF Online", online=9.0)])
        ds = D.consultar_datasphere(cons, "202610", date(2026, 10, 28), {"R01"})
        h4 = next(h for h in D.hipoteses([], ds) if h["id"] == "H4")
        self.assertEqual(h4["resultado"], D.DESCARTADA)

    def test_sem_datasphere_as_hipoteses_de_modelo_ficam_nao_testaveis(self):
        por_id = {h["id"]: h for h in D.hipoteses([], None)}
        for i in ("H1", "H2", "H3", "H4", "H7"):
            self.assertEqual(por_id[i]["resultado"], D.NAO_TESTAVEL, i)
        self.assertEqual(len(por_id), 9)

    def test_agrupador_sobreposto_confirma_a_hipotese_do_mapeamento(self):
        h6 = next(h for h in D.hipoteses([], None, agrupadores_ok=False) if h["id"] == "H6")
        self.assertEqual(h6["resultado"], D.CONFIRMADA)
        self.assertIn("dois pilares", h6["evidencia"])


class TestImpactoEFaixas(unittest.TestCase):
    def test_na_borda_conta_so_quem_cabe_na_banda_do_desvio(self):
        pcts = [89.95, 90.5, 99.99, 100.0, 104.0, 120.0]
        # desvio de 0,1% -> banda de 0,09 pp em 90 e 0,1 pp em 100
        self.assertEqual(D.na_borda(pcts, (90.0, 100.0, 105.0), 0.001), {90.0: 1, 100.0: 2, 105.0: 0})
        self.assertEqual(D.na_borda(pcts, (90.0,), 0.0), {90.0: 0})

    def test_pct_do_painel_soma_real_e_online(self):
        self.assertAlmostEqual(D.pct_painel({"meta": 200.0, "realizado": 150.0, "online_hoje": 50.0}), 100.0)
        self.assertIsNone(D.pct_painel({"meta": 0.0, "realizado": 10.0}))
        self.assertIsNone(D.pct_painel(None))

    def test_meses_fechados_vazio_quando_nao_existe_a_pasta(self):
        with TemporaryDirectory() as tmp:
            self.assertEqual(D.meses_fechados(Path(tmp)), [])
            (Path(tmp) / "fechado").mkdir()
            (Path(tmp) / "fechado" / "202609").mkdir()
            self.assertEqual(D.meses_fechados(Path(tmp)), ["202609"])


class TestPrivacidade(Base):
    def test_relatorio_nao_traz_nome_de_cliente_nem_de_pessoa(self):
        sac = self.sac(sucos=130.0, refrigerantes=505.0, individuais=90.0)
        linhas = D.tabela_diferencas(D.totais_api(self.api), sac, PRODUTOS)
        texto = D.montar_relatorio(self.api, sac, linhas, D.consistencia(self.api), D.hipoteses(linhas, None),
                                   None, impactos=D.impacto_nas_faixas(self.api, linhas), fechados=[])
        for nome in (VENDEDOR, SUPERVISOR, CLIENTE):
            self.assertNotIn(nome, texto)
        self.assertEqual(D.nomes_vazados(texto, D.nomes_da_api(self.api)), [])

    def test_a_conferencia_de_nomes_realmente_pega_um_nome_vazado(self):
        nomes = D.nomes_da_api(self.api)
        self.assertIn(CLIENTE, nomes)
        self.assertIn(VENDEDOR, nomes)
        self.assertEqual(D.nomes_vazados(f"a rota R01 atende {CLIENTE} desde ontem", nomes), [CLIENTE])

    def test_nome_que_e_pedaco_de_outra_palavra_nao_conta_como_vazamento(self):
        self.assertEqual(D.nomes_vazados("os restos da categoria", {"RESTO"}), [])
        self.assertEqual(D.nomes_vazados("o resto da categoria", {"RESTO"}), ["RESTO"])   # palavra inteira

    def test_nome_curto_de_uma_palavra_fica_fora_da_conferencia(self):
        # "META" ou "REAL" como nome fantasia colidiria com o texto do relatório: só entram nomes
        # compostos (6+) ou de uma palavra com 9+ letras.
        nomes = D.nomes_da_api({"gerencias": {}, "rotas": {"R01": {"rota": {}, "clientes": [
            {"nome": "META"}, {"nome": "COMERCIAL FICTICIA"}, {"nome": "FICTICIOSO"}]}}})
        self.assertEqual(nomes, {"COMERCIAL FICTICIA", "FICTICIOSO"})


if __name__ == "__main__":
    unittest.main()
