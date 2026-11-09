# Painel Campari Club 2026

Painel de acompanhamento do incentivo **Campari Club** (outubro a dezembro de 2026, Coca-Cola Bandeirantes):
gatilho de **cobertura de Skyy** e ranking por **volume de aperitivo**, nos níveis Gerente Comercial, Supervisão Mista
e Supervisão Segmentada; o Consultor aparece sem ranking nem premiação, e Diretoria e GP ficam na linha "Total Band".
É um painel **independente** do Desafio Q4 (`painel-q4/`): copia a estrutura dele, mas não importa nada de lá.

Regras: [`docs/regras.md`](docs/regras.md) (v1.1, 08/11/2026). Itens ⚠️ são interpretações a confirmar: o painel
sinaliza, não decide.

## Estado: etapa 1 — esqueleto, sem cálculo

- Lê `./api/v1/index.json` e acha os dois produtos do incentivo em `produtos` pelo campo `agrupadores`
  (`"Aperitivo"` e `"Skyy"`, grafia exata, com `"extra": true`), nunca por id fixo.
- Abas Gerente Comercial, Supervisão Mista, Supervisão Segmentada e Consultor: **em construção**. A aba Regras
  resume as seções 1 a 6 e as pendências da seção 10 de `docs/regras.md`.
- Rodapé com "Dados de <atualizado_em>" e o mês de referência; API simulada (`index.json` → `simulado: true`):
  faixa vermelha e "DADOS SIMULADOS" no rodapé. API ilegível: faixa vermelha, sem dados. Produtos não achados:
  "Produtos do Campari ainda não publicados", e nada é calculado.
- O `motor.js` ainda não tem regra: exporta só `versaoRegras`. Ranking de volume, gatilho de cobertura, colunas e
  meta dia, Total Band e premiação entram nas próximas etapas, **só no motor**.

## Estrutura

```
painel-campari/
├── docs/regras.md         fonte de verdade das regras do incentivo
├── src/
│   ├── motor.js           cálculo (UMD: Node e window.MotorCampari); etapa 1: só versaoRegras
│   ├── adapter.js         CONFIG, localizarProdutos(index), carregarDados(base)
│   └── app.tpl.html       tela (palco de 1920 px, fit(), cabeçalho compacto, rodapé com a origem dos dados)
├── scripts/build.py       monta frontend/campari-club.html (determinístico)
└── tests/                 motor.test.js e adapter.test.js (fixtures sintéticas)
```

## Comandos

```bash
# monta o HTML único (comite frontend/campari-club.html junto com a fonte)
python painel-campari/scripts/build.py

# testes do painel (Node 18+)
node --test painel-campari/tests/motor.test.js painel-campari/tests/adapter.test.js

# site local, como no Pages: http://localhost:8000/campari-club.html
cd backend && python scripts/servir.py
```

Não clique em "Atualizar dados" no `servir.py`: ele grava em `api/`.

O deploy (`deploy-pages.yml`) copia `frontend/` inteiro para o site, então `frontend/campari-club.html` é publicado
sem mudança no workflow. Sem logo nem fonte embutida: o letreiro é texto em Inter (reserva na fonte do sistema).
