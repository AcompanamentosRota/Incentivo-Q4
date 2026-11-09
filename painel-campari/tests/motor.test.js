const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const M = require('../src/motor.js');

// Etapa 1 testava versaoRegras '1.1' e "só versaoRegras": a etapa 2 troca as regras para a v1.3 e acrescenta as
// funções do ranking de volume. Os dois testes abaixo substituem aqueles, com a lista exata do que o motor exporta.
test('motor carrega no Node e exporta versaoRegras 1.3', () => {
  assert.equal(M.versaoRegras, '1.3');
  assert.equal(M.REGRAS.versao, '1.3');
});

test('etapa 2: motor exporta só o ranking de volume (sem gatilho, status nem meta dia)', () => {
  assert.deepEqual(Object.keys(M).sort(), ['REGRAS', 'aplicarTrava', 'apurarMeses', 'chaveCodigo', 'montarRanking',
    'numerarRanking', 'ordenarRanking', 'percentualMes', 'somaRanking', 'versaoRegras']);
});

test('no navegador o motor fica em window.MotorCampari', () => {
  const codigo = fs.readFileSync(path.join(__dirname, '..', 'src', 'motor.js'), 'utf8');
  const janela = {};
  janela.self = janela;
  vm.runInNewContext(codigo, janela);
  assert.equal(janela.MotorCampari.versaoRegras, '1.3');
  assert.equal(typeof janela.MotorCampari.percentualMes, 'function');
});

test('REGRAS: trava de 130 em outubro e novembro, dezembro sem trava', () => {
  assert.deepEqual(M.REGRAS.trava, { 10: 130, 11: 130, 12: null });
  assert.deepEqual(M.REGRAS.meses, [10, 11, 12]);
});

test('percentualMes: (Real + Online) ÷ Meta em pontos percentuais, bruto, sem arredondar', () => {
  assert.equal(M.percentualMes(100, 42.3, 100), (142.3 / 100) * 100);
  const p = M.percentualMes(1, 0, 3);
  assert.equal(p, (1 / 3) * 100); // 33.333…: nada de arredondar
  assert.notEqual(p, 33.3);
  assert.equal(M.percentualMes(99.96, 0, 100), 99.96); // nunca vira 100
  assert.equal(M.percentualMes(0, 0, 50), 0);
});

test('percentualMes: online ausente conta 0 (mês fechado)', () => {
  assert.equal(M.percentualMes(80, null, 100), 80);
  assert.equal(M.percentualMes(80, undefined, 100), 80);
});

test('percentualMes: meta 0, negativa, nula ou não numérica dá null (nunca 0 nem 100)', () => {
  for (const meta of [0, -5, null, undefined, NaN, '100']) assert.equal(M.percentualMes(10, 1, meta), null);
  assert.equal(M.percentualMes(null, 1, 100), null);
  assert.equal(M.percentualMes(10, 'x', 100), null);
});

test('aplicarTrava: trava em outubro e novembro, sem trava em dezembro', () => {
  assert.deepEqual(M.aplicarTrava(150.5, 10), { valor: 130, travado: true });
  assert.deepEqual(M.aplicarTrava(150.5, 11), { valor: 130, travado: true });
  assert.deepEqual(M.aplicarTrava(150.5, 12), { valor: 150.5, travado: false });
  assert.deepEqual(M.aplicarTrava(99.9, 10), { valor: 99.9, travado: false });
});

test('aplicarTrava: no limite exato (130,0) não trava; 130,00001 trava', () => {
  assert.deepEqual(M.aplicarTrava(130, 10), { valor: 130, travado: false });
  assert.deepEqual(M.aplicarTrava(130.0, 11), { valor: 130, travado: false });
  assert.deepEqual(M.aplicarTrava(130.00001, 10), { valor: 130, travado: true });
  assert.deepEqual(M.aplicarTrava(130.00001, 12), { valor: 130.00001, travado: false });
});

test('aplicarTrava: % null fica null; mês fora da vigência é erro; limite vem das regras', () => {
  assert.deepEqual(M.aplicarTrava(null, 10), { valor: null, travado: false });
  assert.throws(() => M.aplicarTrava(100, 9), /fora da vigência/);
  const outra = { trava: { 10: 110, 11: null, 12: null } };
  assert.deepEqual(M.aplicarTrava(120, 10, outra), { valor: 110, travado: true });
  assert.deepEqual(M.aplicarTrava(120, 11, outra), { valor: 120, travado: false });
});

test('somaRanking: soma só os meses com %; nenhum mês: null', () => {
  assert.equal(M.somaRanking([130, 75.5, 140.25]), 130 + 75.5 + 140.25);
  assert.equal(M.somaRanking([130, null, 20]), 150);
  assert.equal(M.somaRanking([null, null]), null);
  assert.equal(M.somaRanking([]), null);
});

test('apurarMeses: trava por mês, soma dos travados e linha completa', () => {
  const r = M.apurarMeses([
    { mes: 10, situacao: 'dado', meta: 100, real: 150, online: 0 },
    { mes: 11, situacao: 'dado', meta: 200, real: 100, online: 10 },
    { mes: 12, situacao: 'futuro', meta: null, real: null, online: null },
  ]);
  assert.equal(r.meses[0].pct, 150);
  assert.equal(r.meses[0].pctTravado, 130);
  assert.equal(r.meses[0].travado, true);
  assert.equal(r.meses[1].pct, (110 / 200) * 100); // bruto, mesmo com ruído de ponto flutuante
  assert.equal(r.meses[1].travado, false);
  assert.equal(r.meses[2].pct, null);
  assert.equal(r.soma, 130 + (110 / 200) * 100);
  assert.equal(r.incompleta, false); // mês futuro não deixa incompleta
  assert.deepEqual(r.mesesSemPct, []);
  assert.equal(r.meses[0].meta, 100); // preserva a entrada
});

test('apurarMeses: meta 0 ou mês indisponível deixam a linha incompleta e fora da soma', () => {
  const r = M.apurarMeses([
    { mes: 10, situacao: 'indisponivel', meta: null, real: null, online: null },
    { mes: 11, situacao: 'dado', meta: 0, real: 10, online: 0 },
    { mes: 12, situacao: 'dado', meta: 100, real: 200, online: 0 },
  ]);
  assert.equal(r.soma, 200); // dezembro sem trava
  assert.equal(r.incompleta, true);
  assert.deepEqual(r.mesesSemPct, [10, 11]);
  const nada = M.apurarMeses([{ mes: 10, situacao: 'dado', meta: null, real: 5, online: 0 }]);
  assert.equal(nada.soma, null);
  assert.equal(nada.incompleta, true);
});

test('ordenarRanking: soma desc; empate pelo código em minúsculas, texto simples ("g2.10" antes de "g2.2")', () => {
  const linhas = [
    { codigo: 'SV.G2.2', soma: 100 }, { codigo: 'SV.G2.10', soma: 100 }, { codigo: 'SV.AA.1', soma: 250 },
    { codigo: 'sv.b.1', soma: 100 }, { codigo: 'SV.ZZ.9', soma: null }, { codigo: 'SV.AB.1', soma: null },
  ];
  const o = M.ordenarRanking(linhas).map((l) => l.codigo);
  assert.deepEqual(o, ['SV.AA.1', 'sv.b.1', 'SV.G2.10', 'SV.G2.2', 'SV.AB.1', 'SV.ZZ.9']);
  assert.equal(linhas[0].codigo, 'SV.G2.2'); // não altera a entrada
  assert.equal(M.chaveCodigo('SV.G2.10'), 'sv.g2.10');
});

test('ordenarRanking: maiúsculas não pesam no desempate (comparação sobre o código em minúsculas)', () => {
  const o = M.ordenarRanking([{ codigo: 'b', soma: 1 }, { codigo: 'A', soma: 1 }, { codigo: 'a2', soma: 1 }]).map((l) => l.codigo);
  assert.deepEqual(o, ['A', 'a2', 'b']);
});

test('ordenarRanking: ordem estável para linhas idênticas', () => {
  const a = { codigo: 'X', soma: 10, n: 1 }, b = { codigo: 'X', soma: 10, n: 2 };
  assert.deepEqual(M.ordenarRanking([a, b]).map((l) => l.n), [1, 2]);
  assert.deepEqual(M.ordenarRanking([b, a]).map((l) => l.n), [2, 1]);
});

test('numerarRanking: posição 1..n em todas as linhas (inclusive sem soma), sem alterar a entrada', () => {
  const linhas = [{ codigo: 'A', soma: 3 }, { codigo: 'B', soma: null }, { codigo: 'C', soma: 1 }];
  const n = M.numerarRanking(linhas);
  assert.deepEqual(n.map((l) => l.pos), [1, 2, 3]);
  assert.equal(linhas[0].pos, undefined);
  assert.deepEqual(M.montarRanking(linhas).map((l) => [l.codigo, l.pos]), [['A', 1], ['C', 2], ['B', 3]]);
});
