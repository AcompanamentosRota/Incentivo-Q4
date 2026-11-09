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

// A etapa 3 acrescenta o gatilho de cobertura, a posição oficial, o status e a meta dia de cobertura: a lista exata
// substitui a da etapa 2 (que afirmava "só o ranking de volume"). A tela não pode ganhar função nova por engano.
test('etapa 3: motor exporta o ranking de volume mais o gatilho, o status e a meta dia', () => {
  assert.deepEqual(Object.keys(M).sort(), ['MOTIVOS', 'REGRAS', 'aplicarTrava', 'apurarMeses', 'chaveCodigo',
    'diferenca', 'gatilhoCobertura', 'hojeAtingiu', 'metaDiaCobertura', 'montarRanking', 'numerarOficial',
    'numerarRanking', 'ordenarRanking', 'percentualCobertura', 'percentualMes', 'somaRanking', 'statusLinha',
    'versaoRegras']);
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

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Etapa 3 — gatilho de cobertura de Skyy, posição oficial, status, meta dia de cobertura e "hoje atingiu"
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════

test('REGRAS: gatilho de novembro e dezembro com mínimo 100 e posições premiadas 6 / 12 / 3', () => {
  assert.deepEqual(M.REGRAS.gatilho, { meses: [11, 12], minimo: 100 });
  assert.deepEqual(M.REGRAS.premiadas, { gc: 6, svMista: 12, svSegmentada: 3 });
  assert.deepEqual(Object.keys(M.MOTIVOS).sort(), ['indisponivel', 'premiadas', 'semMeta']);
});

test('percentualCobertura: (realizado + online) ÷ meta, bruto; online ausente conta 0', () => {
  assert.equal(M.percentualCobertura(90, 10, 100), 100);
  assert.equal(M.percentualCobertura(1, 0, 3), (1 / 3) * 100); // 33,333…: nada de arredondar
  assert.equal(M.percentualCobertura(50, null, 100), 50);
  assert.equal(M.percentualCobertura(50, undefined, 100), 50);
  assert.equal(M.percentualCobertura(0, 0, 40), 0);
  assert.equal(M.percentualCobertura(99.96, 0, 100), 99.96); // nunca vira 100
});

test('percentualCobertura: meta 0, negativa ou nula dá null (nunca 0 nem 100)', () => {
  for (const meta of [0, -5, null, undefined, 'x', NaN]) assert.equal(M.percentualCobertura(10, 0, meta), null);
  assert.equal(M.percentualCobertura(null, 0, 100), null);
  assert.equal(M.percentualCobertura(10, 'x', 100), null);
});

test('diferenca: Real + Online − Meta; online nulo conta 0; sem real ou sem meta é null', () => {
  assert.equal(M.diferenca(90, 20, 100), 10);
  assert.equal(M.diferenca(80, null, 100), -20);
  assert.equal(M.diferenca(80, undefined, 100), -20);
  assert.equal(M.diferenca(0, 0, 0), 0);
  assert.equal(M.diferenca(null, 0, 100), null);
  assert.equal(M.diferenca(10, 0, null), null);
  assert.equal(M.diferenca(10, 'x', 100), null);
});

// meses do gatilho, como o adaptador entrega: { mes, situacao, meta, real, online }
const cm = (mes, meta, real, online, situacao) => ({ mes, meta, real, online, situacao: situacao || 'dado' });
const OUT_INDISP = cm(10, null, null, null, 'indisponivel');
const FUT = (mes) => cm(mes, null, null, null, 'futuro');

test('gatilhoCobertura: em novembro é parcial e vale só o % de novembro (outubro nunca entra)', () => {
  const g = M.gatilhoCobertura([OUT_INDISP, cm(11, 100, 90, 15), FUT(12)], 11);
  assert.deepEqual(g, { valor: 105, batido: true, parcial: true, indisponivel: false, motivo: null });
  // outubro com cobertura ótima não muda nada: fica fora do gatilho
  const comOut = M.gatilhoCobertura([cm(10, 10, 100, 0), cm(11, 100, 50, 0), FUT(12)], 11);
  assert.equal(comOut.valor, 50);
  assert.equal(comOut.batido, false);
  assert.equal(comOut.parcial, true);
});

test('gatilhoCobertura: em dezembro é a média simples de novembro e dezembro, sem parcial', () => {
  const g = M.gatilhoCobertura([OUT_INDISP, cm(11, 100, 90, 0), cm(12, 100, 110, 0)], 12);
  assert.deepEqual(g, { valor: 100, batido: true, parcial: false, indisponivel: false, motivo: null }); // (90 + 110) / 2
  const abaixo = M.gatilhoCobertura([OUT_INDISP, cm(11, 100, 80, 0), cm(12, 100, 110, 0)], 12);
  assert.equal(abaixo.valor, 95);
  assert.equal(abaixo.batido, false);
});

test('gatilhoCobertura: mês fechado sem cobertura deixa o gatilho indisponível (pendência 10), nunca um valor', () => {
  // dezembro de referência com novembro já fechado: hoje o fechado não traz cobertura
  const g = M.gatilhoCobertura([OUT_INDISP, cm(11, null, null, null, 'indisponivel'), cm(12, 100, 120, 0)], 12);
  assert.deepEqual(g, { valor: null, batido: false, parcial: false, indisponivel: true, motivo: 'cobertura indisponível' });
  // novembro de referência sem cobertura no mês: idem
  const nov = M.gatilhoCobertura([OUT_INDISP, cm(11, null, null, null, 'indisponivel')], 11);
  assert.deepEqual([nov.valor, nov.indisponivel, nov.motivo], [null, true, 'cobertura indisponível']);
  // mês do gatilho ausente da lista também não é adivinhado
  const sem = M.gatilhoCobertura([OUT_INDISP], 11);
  assert.deepEqual([sem.valor, sem.indisponivel], [null, true]);
});

test('gatilhoCobertura: meta de cobertura 0 ou nula dá % null e motivo "sem meta de cobertura"', () => {
  for (const meta of [0, null]) {
    const g = M.gatilhoCobertura([OUT_INDISP, cm(11, meta, 30, 0)], 11);
    assert.deepEqual([g.valor, g.batido, g.indisponivel, g.motivo], [null, false, true, 'sem meta de cobertura']);
  }
});

test('gatilhoCobertura: exatamente 100,0 bate; 99,99999 não bate (o valor bruto manda, a tela trunca)', () => {
  const cem = M.gatilhoCobertura([OUT_INDISP, cm(11, 100000, 100000, 0)], 11);
  assert.equal(cem.valor, 100);
  assert.equal(cem.batido, true);
  const quase = M.gatilhoCobertura([OUT_INDISP, cm(11, 100000, 99999.999, 0)], 11);
  assert.equal(quase.valor, (99999.999 / 100000) * 100); // 99,999998…: o bruto, sem arredondar para 100
  assert.ok(quase.valor < 100);
  assert.equal(quase.batido, false);
  // média que dá exatamente 100 em dezembro também bate
  const media = M.gatilhoCobertura([OUT_INDISP, cm(11, 100, 99, 0), cm(12, 100, 101, 0)], 12);
  assert.equal(media.valor, 100);
  assert.equal(media.batido, true);
});

test('gatilhoCobertura: referência antes de novembro (outubro) deixa o gatilho indisponível', () => {
  for (const ref of [10, null, undefined]) {
    const g = M.gatilhoCobertura([cm(10, 100, 200, 0)], ref);
    assert.deepEqual([g.valor, g.batido, g.indisponivel, g.motivo], [null, false, true, 'cobertura indisponível']);
  }
});

test('numerarOficial: numera 1..k só quem bateu o gatilho, na ordem do ranking', () => {
  const bateu = (b) => ({ gatilho: { batido: b } });
  const linhas = [Object.assign({ codigo: 'A', pos: 1 }, bateu(false)), Object.assign({ codigo: 'B', pos: 2 }, bateu(true)),
                  Object.assign({ codigo: 'C', pos: 3 }, bateu(true)), { codigo: 'D', pos: 4 }];
  const o = M.numerarOficial(linhas);
  assert.deepEqual(o.map((l) => [l.codigo, l.pos, l.oficial]), [['A', 1, null], ['B', 2, 1], ['C', 3, 2], ['D', 4, null]]);
  assert.equal(linhas[1].oficial, undefined); // não altera a entrada
  assert.deepEqual(M.numerarOficial([]), []);
});

// linha pronta para o status: gatilho batido ou não e posição oficial
const ln = (valor, batido, oficial) => ({ oficial,
  gatilho: { valor, batido, parcial: false, indisponivel: false, motivo: null } });

test('statusLinha: "Bateu!" na posição do limite de cada nível e "-" no limite + 1', () => {
  for (const [nivel, limite] of [['gc', 6], ['svMista', 12], ['svSegmentada', 3]]) {
    assert.deepEqual(M.statusLinha(ln(120, true, limite), nivel), { status: 'Bateu!', motivo: 'dentro das premiadas' });
    assert.deepEqual(M.statusLinha(ln(120, true, 1), nivel), { status: 'Bateu!', motivo: 'dentro das premiadas' });
    assert.deepEqual(M.statusLinha(ln(120, true, limite + 1), nivel), { status: '-', motivo: 'suba 1 posição' });
    assert.equal(M.statusLinha(ln(120, true, limite + 4), nivel).motivo, 'suba 4 posições');
  }
});

test('statusLinha: sem o gatilho é "-" com "cobertura em X%: precisa de 100%", X truncado em 1 casa', () => {
  assert.deepEqual(M.statusLinha(ln(97.46, false, null), 'gc'), { status: '-', motivo: 'cobertura em 97,4%: precisa de 100%' });
  assert.equal(M.statusLinha(ln(99.99999, false, null), 'svMista').motivo, 'cobertura em 99,9%: precisa de 100%');
  assert.equal(M.statusLinha(ln(0, false, null), 'svSegmentada').motivo, 'cobertura em 0,0%: precisa de 100%');
  assert.equal(M.statusLinha(ln(100, false, null), 'gc').motivo, 'cobertura em 100,0%: precisa de 100%'); // só o batido manda
});

test('statusLinha: gatilho indisponível ou sem meta repete o motivo do gatilho', () => {
  const indisp = { oficial: null, gatilho: { valor: null, batido: false, indisponivel: true, motivo: 'cobertura indisponível' } };
  assert.deepEqual(M.statusLinha(indisp, 'gc'), { status: '-', motivo: 'cobertura indisponível' });
  const semMeta = { oficial: null, gatilho: { valor: null, batido: false, indisponivel: true, motivo: 'sem meta de cobertura' } };
  assert.deepEqual(M.statusLinha(semMeta, 'svMista'), { status: '-', motivo: 'sem meta de cobertura' });
  assert.deepEqual(M.statusLinha({}, 'gc'), { status: '-', motivo: 'cobertura indisponível' }); // linha sem gatilho
});

test('statusLinha: limite e mínimo vêm das regras (nada fixo) e nível desconhecido é erro', () => {
  const cfg = { gatilho: { meses: [11, 12], minimo: 100 }, premiadas: { gc: 2, svMista: 12, svSegmentada: 3 } };
  assert.equal(M.statusLinha(ln(120, true, 2), 'gc', cfg).status, 'Bateu!');
  assert.equal(M.statusLinha(ln(120, true, 3), 'gc', cfg).status, '-');
  assert.equal(M.statusLinha(ln(120, true, 3), 'gc').status, 'Bateu!'); // padrão do motor: 6
  assert.throws(() => M.statusLinha(ln(120, true, 1), 'rota'), /sem posições premiadas/);
  const outroMinimo = { gatilho: { meses: [11, 12], minimo: 95.5 }, premiadas: { gc: 6, svMista: 12, svSegmentada: 3 } };
  assert.equal(M.statusLinha(ln(90, false, null), 'gc', outroMinimo).motivo, 'cobertura em 90,0%: precisa de 95,5%');
});

test('statusLinha: gatilho batido sem posição oficial não vira "Bateu!"', () => {
  assert.deepEqual(M.statusLinha(ln(120, true, null), 'gc'), { status: '-', motivo: null });
});

test('metaDiaCobertura: (Meta − Real) ÷ dias úteis restantes, inteiro para cima', () => {
  assert.equal(M.metaDiaCobertura(100, 40, 15), 4); // meio do mês: 60 / 15
  assert.equal(M.metaDiaCobertura(100, 40, 7), 9);  // 8,57… -> 9 (cliente não se divide)
  assert.equal(M.metaDiaCobertura(100, 40, 1), 60); // último dia útil: a diferença total
  assert.equal(M.metaDiaCobertura(161, 3, 15), 11); // 10,53… -> 11
});

test('metaDiaCobertura: meta batida dá 0; 0 dias restantes dá a diferença total', () => {
  assert.equal(M.metaDiaCobertura(100, 100, 15), 0);
  assert.equal(M.metaDiaCobertura(100, 120, 15), 0);
  assert.equal(M.metaDiaCobertura(100, 40, 0), 60);   // dia não útil: a diferença total
  assert.equal(M.metaDiaCobertura(100, 40, -3), 60);
  assert.equal(M.metaDiaCobertura(100.5, 40, 0), 61); // a diferença total também sobe para o inteiro
});

test('metaDiaCobertura: tolerância de 1e-9 (8,0000000001 não vira 9)', () => {
  assert.equal(M.metaDiaCobertura(8.0000000001, 0, 1), 8);
  assert.equal(M.metaDiaCobertura(120.0000000001, 0, 15), 8); // 8,00000000000…
  assert.equal(M.metaDiaCobertura(120.000001, 0, 15), 9);     // acima da tolerância: sobe de verdade
  assert.equal(M.metaDiaCobertura(120, 0, 15), 8);
});

test('metaDiaCobertura: meta, real ou dias não numéricos dão null (nunca 0)', () => {
  assert.equal(M.metaDiaCobertura(null, 10, 15), null);
  assert.equal(M.metaDiaCobertura(100, null, 15), null);
  assert.equal(M.metaDiaCobertura(100, 10, null), null);
  assert.equal(M.metaDiaCobertura(100, 10, undefined), null);
  assert.equal(M.metaDiaCobertura(NaN, 10, 15), null);
});

test('hojeAtingiu: Online > 0 e Online ≥ Meta dia (pendência 17)', () => {
  assert.equal(M.hojeAtingiu(0, 0), false);     // meta dia 0 com online 0: não colore
  assert.equal(M.hojeAtingiu(3, 0), true);      // meta dia 0 com online > 0: colore
  assert.equal(M.hojeAtingiu(8, 8), true);      // online igual à meta dia: colore
  assert.equal(M.hojeAtingiu(7.9, 8), false);   // online abaixo: não colore
  assert.equal(M.hojeAtingiu(10, null), false); // meta dia nula (API em fechamento): não colore
  assert.equal(M.hojeAtingiu(null, 5), false);
  assert.equal(M.hojeAtingiu(0, null), false);
  assert.equal(M.hojeAtingiu(-2, 0), false);
  assert.equal(M.hojeAtingiu('5', 1), false);
});
