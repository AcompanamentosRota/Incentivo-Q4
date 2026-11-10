const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const M = require('../src/motor.js');

// Etapa 1 testava versaoRegras '1.1' e "só versaoRegras"; a etapa 2 passou para a v1.3 e a etapa 4 para a v1.4.
// A etapa 4B subiu para a v1.6 (09/11/2026) e a 4F sobe para a v1.7 (ajustes de tabela, seção 7). Os dois
// testes abaixo substituem os anteriores, com a lista exata do que o motor exporta. A 4H sobe para a v1.8 (status
// com os dois pilares, 09/11/2026, noite). A 4I sobe para a v1.9 (Detalhe do mês sem paginação na visão Gerência,
// 09/11/2026, fim da noite): só a versão muda no motor. A 4J sobe para a v1.10 (as tabelas de ranking passam a
// mostrar só a posição oficial, 10/11/2026): também só a versão muda aqui, e `numerarRanking` e `pos` continuam.
// A 4K sobe para a v1.11 (10/11/2026): o volume de Aperitivo passa a ter MÍNIMO no mês vigente, no lugar do
// gatilho por média da 4H. A 4L sobe para a v1.12 (10/11/2026): as premissas a confirmar saem da aba Regras, que
// é tela (adaptador) — no motor só a versão muda, e as duas regras citadas por elas seguem iguais.
test('motor carrega no Node e exporta versaoRegras 1.12', () => {
  assert.equal(M.versaoRegras, '1.12');
  assert.equal(M.REGRAS.versao, '1.12');
});

// A etapa 4B acrescentou `corDoPercentual` (cor do quadradinho do % de cobertura), a 4C `somarGrupo` (a soma da
// gerência comercial agrupada do Ranking GC) e a 4F `corDoPercentualAperitivo` (a cor do quadradinho do % do mês
// de Aperitivo, regras v1.7, seção 7): a lista exata substitui a da 4C. A 4H acrescentou `gatilhoVolume` e
// `gatilhoPilares` (regras v1.8, seções 2 e 5), e a 4K troca o primeiro por `minimoVolume` (regras v1.11, seção
// 2.2): a lista abaixo substitui a da 4H. A tela não pode ganhar função nova por engano, nem levar regra para
// dentro do HTML.
test('etapa 4K: motor exporta o ranking, os dois pilares, o status, as metas dia, as duas cores e a soma do grupo', () => {
  assert.deepEqual(Object.keys(M).sort(), ['MOTIVOS', 'REGRAS', 'aplicarTrava', 'apurarMeses', 'chaveCodigo',
    'corDoPercentual', 'corDoPercentualAperitivo', 'diferenca', 'gatilhoCobertura', 'gatilhoPilares',
    'hojeAtingiu',
    'metaDiaCobertura', 'metaDiaVolume', 'minimoVolume', 'montarRanking', 'numerarOficial', 'numerarRanking',
    'ordenarRanking',
    'percentualCobertura', 'percentualMes', 'somaRanking', 'somarGrupo', 'statusLinha', 'versaoRegras']);
});

test('no navegador o motor fica em window.MotorCampari', () => {
  const codigo = fs.readFileSync(path.join(__dirname, '..', 'src', 'motor.js'), 'utf8');
  const janela = {};
  janela.self = janela;
  vm.runInNewContext(codigo, janela);
  assert.equal(janela.MotorCampari.versaoRegras, '1.12');
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

// 4H: a lista de MOTIVOS ganhou os dois de volume (regras v1.8, seção 5); o resto do teste não mudou.
test('REGRAS: gatilho de novembro e dezembro com mínimo 100 e posições premiadas 6 / 12 / 3', () => {
  assert.deepEqual(M.REGRAS.gatilho, { meses: [11, 12], minimo: 100 });
  assert.deepEqual(M.REGRAS.premiadas, { gc: 6, svMista: 12, svSegmentada: 3 });
  assert.deepEqual(Object.keys(M.MOTIVOS).sort(), ['indisponivel', 'premiadas', 'semMeta', 'semMetaVolume', 'volumeIndisponivel']);
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

// 4H/4K: "bateu" são os DOIS pilares (regras v1.11, seção 5): a fixture põe o mínimo de volume batido em todas,
// e o teste continua medindo a numeração pelo gatilho de Skyy. A renumeração com um pilar só está mais abaixo.
test('numerarOficial: numera 1..k só quem bateu o gatilho, na ordem do ranking', () => {
  const bateu = (b) => ({ gatilho: { batido: b }, minimoVolume: { batido: true } });
  const linhas = [Object.assign({ codigo: 'A', pos: 1 }, bateu(false)), Object.assign({ codigo: 'B', pos: 2 }, bateu(true)),
                  Object.assign({ codigo: 'C', pos: 3 }, bateu(true)), { codigo: 'D', pos: 4 }];
  const o = M.numerarOficial(linhas);
  assert.deepEqual(o.map((l) => [l.codigo, l.pos, l.oficial]), [['A', 1, null], ['B', 2, 1], ['C', 3, 2], ['D', 4, null]]);
  assert.equal(linhas[1].oficial, undefined); // não altera a entrada
  assert.deepEqual(M.numerarOficial([]), []);
});

// linha pronta para o status: gatilho de Skyy batido ou não e posição oficial. 4H/4K: o status exige também o
// MÍNIMO de volume de Aperitivo (regras v1.11), então a linha traz o de volume BATIDO por padrão — os testes da
// etapa 3 abaixo continuam medindo o pilar de Skyy, o limite e o "suba N", e os casos do volume ficam na 4K.
const VOL_OK = { valor: 110, batido: true, indisponivel: false, motivo: null };
const ln = (valor, batido, oficial, minimoVolume) => ({ oficial,
  gatilho: { valor, batido, parcial: false, indisponivel: false, motivo: null },
  minimoVolume: minimoVolume === undefined ? VOL_OK : minimoVolume });

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
  const indisp = { oficial: null, minimoVolume: VOL_OK, gatilho: { valor: null, batido: false, indisponivel: true, motivo: 'cobertura indisponível' } };
  assert.deepEqual(M.statusLinha(indisp, 'gc'), { status: '-', motivo: 'cobertura indisponível' });
  const semMeta = { oficial: null, minimoVolume: VOL_OK, gatilho: { valor: null, batido: false, indisponivel: true, motivo: 'sem meta de cobertura' } };
  assert.deepEqual(M.statusLinha(semMeta, 'svMista'), { status: '-', motivo: 'sem meta de cobertura' });
  // 4H: linha sem gatilho nenhum agora não tem nenhum dos dois pilares (era só "cobertura indisponível")
  assert.deepEqual(M.statusLinha({}, 'gc'), { status: '-', motivo: 'cobertura indisponível e volume indisponível' });
  assert.deepEqual(M.statusLinha({ minimoVolume: VOL_OK }, 'gc'), { status: '-', motivo: 'cobertura indisponível' });
});

// 4H/4K: os cfg de teste ganham o `minimoVolume` (regras v1.11), que o status também lê; o que o teste mede não mudou.
test('statusLinha: limite e mínimo vêm das regras (nada fixo) e nível desconhecido é erro', () => {
  const MVR = { minimo: 100 };
  const cfg = { gatilho: { meses: [11, 12], minimo: 100 }, minimoVolume: MVR, premiadas: { gc: 2, svMista: 12, svSegmentada: 3 } };
  assert.equal(M.statusLinha(ln(120, true, 2), 'gc', cfg).status, 'Bateu!');
  assert.equal(M.statusLinha(ln(120, true, 3), 'gc', cfg).status, '-');
  assert.equal(M.statusLinha(ln(120, true, 3), 'gc').status, 'Bateu!'); // padrão do motor: 6
  assert.throws(() => M.statusLinha(ln(120, true, 1), 'rota'), /sem posições premiadas/);
  const outroMinimo = { gatilho: { meses: [11, 12], minimo: 95.5 }, minimoVolume: MVR, premiadas: { gc: 6, svMista: 12, svSegmentada: 3 } };
  assert.equal(M.statusLinha(ln(90, false, null), 'gc', outroMinimo).motivo, 'cobertura em 90,0%: precisa de 95,5%');
});

test('statusLinha: gatilho batido sem posição oficial não vira "Bateu!"', () => {
  assert.deepEqual(M.statusLinha(ln(120, true, null), 'gc'), { status: '-', motivo: null });
});

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Etapa 4K — mínimo de volume de Aperitivo (mês vigente) e os dois pilares (regras v1.11, seções 2.2 e 5)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// A v1.11 (decisão da Karen de 10/11/2026) troca o GATILHO de volume da 4H — média de novembro e dezembro, com a
// trava — por um MÍNIMO: o % de Aperitivo do MÊS VIGENTE tem de chegar a 100%, sem média e sem soma. Os testes da
// 4H que mediam a média dos dois meses, o "parcial" de novembro e o dezembro com um mês só descreviam a regra
// antiga e foram reescritos abaixo; o que continua valendo — o valor BRUTO, o % do ranking com a trava, a meta
// nula indisponível, os dois pilares, a posição oficial e o status — segue medido, com o campo `minimoVolume`.

// mês de volume pronto para o mínimo: meta 100, então o % bruto é o próprio real (online 0)
const vm_ = (mes, pct, situacao) => ({ mes, situacao: situacao || 'dado', meta: 100, real: pct, online: 0 });

test('4K REGRAS: mínimo de volume de 100, sem meses, em configuração', () => {
  assert.deepEqual(M.REGRAS.minimoVolume, { minimo: 100 });
  assert.equal('meses' in M.REGRAS.minimoVolume, false);  // não é média: não há meses nesta conta
  assert.equal('gatilhoVolume' in M.REGRAS, false);       // o gatilho por média da v1.8 saiu das regras
  assert.equal(typeof M.gatilhoVolume, 'undefined');      // e da interface do motor
  assert.equal(M.MOTIVOS.volumeIndisponivel, 'volume indisponível');
  assert.equal(M.MOTIVOS.semMetaVolume, 'sem meta de volume');
});

test('4K minimoVolume: o corte é o % do mês vigente, no valor bruto (99,99999 não bate; 100 bate)', () => {
  let m = M.minimoVolume([vm_(10, 300), vm_(11, 99.99999), vm_(12, null, 'futuro')], 11);
  assert.deepEqual([m.valor, m.batido, m.indisponivel, m.motivo], [99.99999, false, false, null]); // não arredonda
  assert.equal('parcial' in m, false);                    // sem média não existe "parcial"
  m = M.minimoVolume([vm_(11, 100), vm_(12, null, 'futuro')], 11);
  assert.deepEqual([m.valor, m.batido], [100, true]);     // 100% exatos batem
});

test('4K minimoVolume: o % é o mesmo do ranking, com a trava do mês vigente', () => {
  // novembro 200% entra como 130%, a trava do mês — o mesmo número que a coluna do mês mostra
  assert.deepEqual([M.minimoVolume([vm_(11, 200)], 11).valor, M.minimoVolume([vm_(11, 200)], 11).batido], [130, true]);
  // dezembro não tem trava: 250% entra inteiro
  assert.equal(M.minimoVolume([vm_(11, 50), vm_(12, 250)], 12).valor, 250);
  // o valor é o pctTravado do mesmo mês em apurarMeses (percentualMes + aplicarTrava), em qualquer mês vigente
  const meses = [vm_(10, 140), vm_(11, 180), { mes: 12, situacao: 'dado', meta: 300, real: 200, online: 7 }];
  const a = M.apurarMeses(meses);
  for (const mes of [10, 11, 12]) {
    assert.equal(M.minimoVolume(meses, mes).valor, a.meses.find((x) => x.mes === mes).pctTravado, String(mes));
  }
  // o Online entra (Real + Online), como no ranking
  assert.equal(M.minimoVolume([{ mes: 11, situacao: 'dado', meta: 200, real: 150, online: 50 }], 11).batido, true);
});

test('4K minimoVolume: só o mês vigente conta — nem média, nem soma, nem os outros meses', () => {
  // 130% em outubro e 0% em novembro NÃO bate: a soma do ranking seria 130, e ela não entra nesta conta
  const forte = [vm_(10, 130), vm_(11, 0), vm_(12, null, 'futuro')];
  const m11 = M.minimoVolume(forte, 11);
  assert.deepEqual([m11.valor, m11.batido, m11.indisponivel], [0, false, false]);
  assert.equal(M.somaRanking(M.apurarMeses(forte).meses.map((x) => x.pctTravado)), 130); // o ranking soma; o mínimo não
  // em novembro, um dezembro diferente não muda nada (na v1.8 a média mudava)
  for (const dez of [0, 60, 250]) {
    const m = M.minimoVolume([vm_(11, 125), vm_(12, dez)], 11);
    assert.deepEqual([m.valor, m.batido], [125, true], String(dez));
  }
  // e em dezembro é dezembro que decide, mesmo com novembro altíssimo
  const m12 = M.minimoVolume([vm_(11, 200), vm_(12, 90)], 12);
  assert.deepEqual([m12.valor, m12.batido], [90, false]);
  // dezembro sozinho basta: não precisa mais dos dois meses
  assert.deepEqual([M.minimoVolume([vm_(12, 105)], 12).valor, M.minimoVolume([vm_(12, 105)], 12).batido], [105, true]);
});

test('4K minimoVolume: sem mês vigente, mês sem fonte ou real não numérico -> "volume indisponível"', () => {
  for (const ref of [null, undefined, NaN]) {
    const m = M.minimoVolume([vm_(11, 150)], ref);
    assert.deepEqual([m.valor, m.batido, m.indisponivel, m.motivo], [null, false, true, 'volume indisponível'], String(ref));
  }
  for (const meses of [[vm_(10, 150)], [vm_(11, null, 'indisponivel')], [vm_(11, null, 'futuro')], [], null]) {
    const m = M.minimoVolume(meses, 11);
    assert.deepEqual([m.valor, m.indisponivel, m.motivo], [null, true, 'volume indisponível']);
  }
  const semReal = M.minimoVolume([{ mes: 11, situacao: 'dado', meta: 100, real: null, online: 0 }], 11);
  assert.deepEqual([semReal.indisponivel, semReal.motivo], [true, 'volume indisponível']);
});

test('4K minimoVolume: meta nula ou ≤ 0 deixa indisponível com "sem meta de volume" (nunca 0 nem 100)', () => {
  for (const meta of [null, 0, -10]) {
    const m = M.minimoVolume([{ mes: 11, situacao: 'dado', meta, real: 50, online: 0 }], 11);
    assert.deepEqual([m.valor, m.batido, m.indisponivel, m.motivo], [null, false, true, 'sem meta de volume'], String(meta));
  }
});

test('4K minimoVolume: o mínimo vem das regras (nada fixo) e mês fora da vigência é erro', () => {
  const cfg = Object.assign({}, M.REGRAS, { minimoVolume: { minimo: 90 } });
  assert.equal(M.minimoVolume([vm_(11, 95)], 11, cfg).batido, true);
  assert.equal(M.minimoVolume([vm_(11, 95)], 11).batido, false);
  assert.throws(() => M.minimoVolume([{ mes: 9, situacao: 'dado', meta: 100, real: 150, online: 0 }], 9), /fora da vigência/);
});

// pilares prontos: GS/GI = gatilho de cobertura de Skyy (tem `parcial`); MV/MI = mínimo de volume (não tem)
const GS = (valor, batido) => ({ valor, batido, parcial: true, indisponivel: false, motivo: null });
const GI = (motivo) => ({ valor: null, batido: false, parcial: false, indisponivel: true, motivo });
const MV = (valor, batido) => ({ valor, batido, indisponivel: false, motivo: null });
const MI = (motivo) => ({ valor: null, batido: false, indisponivel: true, motivo });

test('4K gatilhoPilares: batido só com os dois; motivos de quem falha com valor', () => {
  assert.deepEqual(M.gatilhoPilares(GS(120, true), MV(130, true)), { batido: true, indisponivel: false, motivo: null });
  assert.deepEqual(M.gatilhoPilares(GS(100, true), MV(0, false)),
    { batido: false, indisponivel: false, motivo: 'volume em 0,0%: precisa de 100%' });
  assert.deepEqual(M.gatilhoPilares(GS(97.46, false), MV(130, true)),
    { batido: false, indisponivel: false, motivo: 'cobertura em 97,4%: precisa de 100%' });
  assert.deepEqual(M.gatilhoPilares(GS(97.46, false), MV(99.99999, false)),
    { batido: false, indisponivel: false, motivo: 'cobertura em 97,4% e volume em 99,9%: precisam de 100%' });
});

test('4K gatilhoPilares: indisponível só quando nenhum falhou com valor', () => {
  // um falhou com valor: o motivo é dele, e não é "indisponível"
  assert.deepEqual(M.gatilhoPilares(GS(80, false), MI('volume indisponível')),
    { batido: false, indisponivel: false, motivo: 'cobertura em 80,0%: precisa de 100%' });
  assert.deepEqual(M.gatilhoPilares(GI('cobertura indisponível'), MV(50, false)),
    { batido: false, indisponivel: false, motivo: 'volume em 50,0%: precisa de 100%' });
  // o outro batido: indisponível com o motivo do que falta
  assert.deepEqual(M.gatilhoPilares(GS(120, true), MI('sem meta de volume')),
    { batido: false, indisponivel: true, motivo: 'sem meta de volume' });
  assert.deepEqual(M.gatilhoPilares(GI('sem meta de cobertura'), MV(120, true)),
    { batido: false, indisponivel: true, motivo: 'sem meta de cobertura' });
  // os dois faltando
  assert.deepEqual(M.gatilhoPilares(GI('cobertura indisponível'), MI('volume indisponível')),
    { batido: false, indisponivel: true, motivo: 'cobertura indisponível e volume indisponível' });
  // pilar ausente nunca conta como batido
  assert.deepEqual(M.gatilhoPilares(GS(120, true), undefined),
    { batido: false, indisponivel: true, motivo: 'volume indisponível' });
  assert.deepEqual(M.gatilhoPilares(null, MV(120, true)),
    { batido: false, indisponivel: true, motivo: 'cobertura indisponível' });
});

test('4K numerarOficial: RANK só para quem bateu os DOIS pilares; quem está atrás sobe', () => {
  const l = (codigo, pos, sk, vo) => ({ codigo, pos, gatilho: GS(sk ? 120 : 80, sk), minimoVolume: MV(vo ? 120 : 80, vo) });
  // o 1º bateu só o Skyy, o 2º só o volume, o 3º os dois, o 4º nenhum, o 5º os dois
  const o = M.numerarOficial([l('A', 1, true, false), l('B', 2, false, true), l('C', 3, true, true),
                              l('D', 4, false, false), l('E', 5, true, true)]);
  assert.deepEqual(o.map((x) => [x.codigo, x.pos, x.oficial]), [['A', 1, null], ['B', 2, null], ['C', 3, 1], ['D', 4, null], ['E', 5, 2]]);
  // renumeração: com o 1º só no Skyy, o 2º ranqueado que bateu os dois vira o RANK 1
  const r = M.numerarOficial([l('A', 1, true, false), l('B', 2, true, true)]);
  assert.deepEqual(r.map((x) => [x.codigo, x.oficial]), [['A', null], ['B', 1]]);
  // pilar indisponível: sem posição oficial
  const ind = M.numerarOficial([{ codigo: 'X', pos: 1, gatilho: GS(120, true), minimoVolume: MI('volume indisponível') }]);
  assert.equal(ind[0].oficial, null);
});

test('4K statusLinha: Skyy batido e volume abaixo do mínimo -> "-" e sem RANK', () => {
  const linha = { oficial: null, gatilho: GS(100, true), minimoVolume: MV(0, false) };
  assert.deepEqual(M.statusLinha(linha, 'svMista'), { status: '-', motivo: 'volume em 0,0%: precisa de 100%' });
  // e o motor não dá posição oficial a ela
  assert.equal(M.numerarOficial([Object.assign({ pos: 1 }, linha)])[0].oficial, null);
  // 99,99999% de volume também fica fora (o corte é no bruto)
  const quase = { oficial: null, gatilho: GS(100, true), minimoVolume: MV(99.99999, false) };
  assert.deepEqual(M.statusLinha(quase, 'gc'), { status: '-', motivo: 'volume em 99,9%: precisa de 100%' });
  assert.equal(M.numerarOficial([Object.assign({ pos: 1 }, quase)])[0].oficial, null);
});

test('4K statusLinha: volume batido e Skyy não -> "-"', () => {
  const linha = { oficial: null, gatilho: GS(99.99999, false), minimoVolume: MV(130, true) };
  assert.deepEqual(M.statusLinha(linha, 'gc'), { status: '-', motivo: 'cobertura em 99,9%: precisa de 100%' });
});

test('4K statusLinha: os dois batidos, dentro e fora do limite, nos três níveis', () => {
  for (const [nivel, limite] of [['gc', 6], ['svMista', 12], ['svSegmentada', 3]]) {
    const dois = (oficial) => ({ oficial, gatilho: GS(100, true), minimoVolume: MV(100, true) });
    assert.deepEqual(M.statusLinha(dois(limite), nivel), { status: 'Bateu!', motivo: 'dentro das premiadas' });
    assert.deepEqual(M.statusLinha(dois(limite + 2), nivel), { status: '-', motivo: 'suba 2 posições' });
  }
  assert.throws(() => M.statusLinha({ oficial: 1, gatilho: GS(100, true), minimoVolume: MV(100, true) }, 'rota'), /sem posições premiadas/);
});

test('4K statusLinha: pilar indisponível -> "-" com o motivo do pilar', () => {
  assert.deepEqual(M.statusLinha({ oficial: null, gatilho: GS(120, true), minimoVolume: MI('sem meta de volume') }, 'gc'),
    { status: '-', motivo: 'sem meta de volume' });
  assert.deepEqual(M.statusLinha({ oficial: null, gatilho: GS(120, true), minimoVolume: MI('volume indisponível') }, 'svSegmentada'),
    { status: '-', motivo: 'volume indisponível' });
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

/* ─── Etapa 4 — regra de EXIBIÇÃO da meta dia (regras v1.4, seção 7; decisão de 09/11/2026) ──────────────── */

test('metaDiaVolume: com o Real ainda abaixo da Meta, a meta dia da API passa inteira (nada é recalculado)', () => {
  assert.equal(M.metaDiaVolume(452.8, 83.1, 7437.9), 452.8);
  assert.equal(M.metaDiaVolume(0, 10, 100), 0);
  assert.equal(M.metaDiaVolume(3655, 6327.3, 59977.2), 3655);
  assert.equal(M.metaDiaVolume(12.5, 100, 100), 12.5); // Real IGUAL à Meta não é "maior": o valor fica
});

test('metaDiaVolume: Real maior que a Meta mostra 0', () => {
  assert.equal(M.metaDiaVolume(10, 1370.8, 870.4), 0);
  assert.equal(M.metaDiaVolume(0.1, 100.01, 100), 0);
});

test('metaDiaVolume: meta dia negativa mostra 0 (a API publica negativos, como o SAC)', () => {
  assert.equal(M.metaDiaVolume(-38.4, 1370.8, 870.4), 0);
  assert.equal(M.metaDiaVolume(-1.2, 9.8, 27.3), 0);   // negativa mesmo com o Real abaixo da Meta
  assert.equal(M.metaDiaVolume(-0.1, null, null), 0);  // sem Real nem Meta, a negativa ainda vira 0
});

test('metaDiaVolume: meta dia nula ou não numérica fica null (a tela mostra "—", nunca 0)', () => {
  for (const v of [null, undefined, NaN, Infinity, -Infinity, '10', {}]) {
    assert.equal(M.metaDiaVolume(v, 1, 2), null, String(v));
  }
});

test('metaDiaVolume: Real ou Meta ausentes não zeram uma meta dia positiva', () => {
  assert.equal(M.metaDiaVolume(7.5, null, 100), 7.5);
  assert.equal(M.metaDiaVolume(7.5, 100, null), 7.5);
  assert.equal(M.metaDiaVolume(7.5, null, null), 7.5);
});

test('metaDiaCobertura já atende a v1.4: meta batida dá 0 e valor entre 0 e 1 vira 1', () => {
  assert.equal(M.metaDiaCobertura(100, 100, 5), 0);   // Real = Meta
  assert.equal(M.metaDiaCobertura(100, 120, 5), 0);   // Real > Meta
  assert.equal(M.metaDiaCobertura(10, 9.5, 15), 1);   // 0,0333… -> 1 (cliente não se divide)
  assert.equal(M.metaDiaCobertura(10, 9.5, 1), 1);    // 0,5 -> 1
});

test('hojeAtingiu usa a meta dia EXIBIDA: com a meta dia zerada pela v1.4, qualquer Online positivo colore', () => {
  const exibida = M.metaDiaVolume(-38.4, 1370.8, 870.4); // 0
  assert.equal(M.hojeAtingiu(5, exibida), true);
  assert.equal(M.hojeAtingiu(0, exibida), false);       // Online 0 nunca colore
  assert.equal(M.hojeAtingiu(5, M.metaDiaVolume(null, 1, 2)), false); // meta dia ausente não colore
});

/* ─── Etapa 4B — cor do quadradinho do % de cobertura (regras v1.6, seção 7; decisão de 09/11/2026) ──────── */

test('corDoPercentual: verde a partir do mínimo do gatilho, vermelho abaixo dele, nada sem valor', () => {
  // os quatro casos pedidos pela etapa: o truncado da tela nunca decide a cor, só o valor BRUTO
  assert.equal(M.corDoPercentual(99.99999), 'vermelho');   // a tela mostra "99,9%" e o quadradinho fica vermelho
  assert.equal(M.corDoPercentual(100), 'verde');           // exatamente no mínimo já é verde
  assert.equal(M.corDoPercentual(100.0000001), 'verde');
  assert.equal(M.corDoPercentual(null), null);             // sem valor ("—"): a tela não desenha quadradinho
});

test('corDoPercentual: 0 é vermelho, mas não numérico é "sem quadradinho" (nunca vermelho por engano)', () => {
  assert.equal(M.corDoPercentual(0), 'vermelho');
  for (const v of [undefined, NaN, Infinity, '100', '', {}]) {
    assert.equal(M.corDoPercentual(v), null, String(v));
  }
});

test('corDoPercentual lê o mínimo das REGRAS (não um 100 fixo) e aceita outro cfg', () => {
  assert.equal(M.corDoPercentual(M.REGRAS.gatilho.minimo), 'verde');
  assert.equal(M.corDoPercentual(M.REGRAS.gatilho.minimo - 1e-9), 'vermelho');
  const cfg = { gatilho: { meses: [11, 12], minimo: 90 } };
  assert.equal(M.corDoPercentual(95, cfg), 'verde');       // com outro mínimo, 95 já é verde
  assert.equal(M.corDoPercentual(89.9, cfg), 'vermelho');
});

test('corDoPercentual concorda com o gatilho batido: mesma leitura do valor bruto', () => {
  // o quadradinho do "% Acum." nunca pode ficar verde numa linha que o gatilho diz não batida, e vice-versa
  for (const alvo of [99.99999, 100, 100.0000001, 120]) {
    const g = M.gatilhoCobertura([OUT_INDISP, cm(11, 100000, alvo * 1000, 0)], 11);
    assert.equal(M.corDoPercentual(g.valor), g.batido ? 'verde' : 'vermelho', String(alvo));
  }
});

/* ─── Etapa 4F — cor do quadradinho do % do MÊS de Aperitivo (regras v1.7, seção 7; pendência 25) ─────────── */

test('corDoPercentualAperitivo: no mês travado o verde começa no limite da trava (não no mínimo do gatilho)', () => {
  for (const mes of [10, 11]) {
    assert.equal(M.corDoPercentualAperitivo(129.99999, mes), 'vermelho', String(mes)); // a tela mostra "129,9%"
    assert.equal(M.corDoPercentualAperitivo(130, mes), 'verde', String(mes));          // exatamente no limite já é verde
    assert.equal(M.corDoPercentualAperitivo(130.0000001, mes), 'verde', String(mes));
    // e o % que basta no Skyy não basta aqui: o limite é outro
    assert.equal(M.corDoPercentualAperitivo(100, mes), 'vermelho', String(mes));
  }
});

test('corDoPercentualAperitivo: no mês SEM trava (dezembro) o verde começa em REGRAS.corAperitivoSemTrava', () => {
  assert.equal(M.corDoPercentualAperitivo(99.99999, 12), 'vermelho');
  assert.equal(M.corDoPercentualAperitivo(100, 12), 'verde');
  assert.equal(M.corDoPercentualAperitivo(100.0000001, 12), 'verde');
  assert.equal(M.corDoPercentualAperitivo(130, 12), 'verde');
});

test('corDoPercentualAperitivo: sem valor não desenha quadradinho (nunca vermelho por engano)', () => {
  for (const mes of [10, 11, 12]) {
    assert.equal(M.corDoPercentualAperitivo(null, mes), null, String(mes));
    for (const v of [undefined, NaN, Infinity, '130', '', {}]) {
      assert.equal(M.corDoPercentualAperitivo(v, mes), null, mes + ' ' + String(v));
    }
  }
  assert.equal(M.corDoPercentualAperitivo(0, 11), 'vermelho'); // 0 é um número medido: vermelho
});

test('corDoPercentualAperitivo: os limites saem das REGRAS (nenhum 130 nem 100 fixo) e aceitam outro cfg', () => {
  assert.equal(M.corDoPercentualAperitivo(M.REGRAS.trava[11], 11), 'verde');
  assert.equal(M.corDoPercentualAperitivo(M.REGRAS.trava[11] - 1e-9, 11), 'vermelho');
  assert.equal(M.corDoPercentualAperitivo(M.REGRAS.corAperitivoSemTrava, 12), 'verde');
  assert.equal(M.corDoPercentualAperitivo(M.REGRAS.corAperitivoSemTrava - 1e-9, 12), 'vermelho');
  const cfg = { trava: { 10: 120, 11: 120, 12: null }, corAperitivoSemTrava: 90 };
  assert.equal(M.corDoPercentualAperitivo(120, 11, cfg), 'verde');
  assert.equal(M.corDoPercentualAperitivo(119.9, 11, cfg), 'vermelho');
  assert.equal(M.corDoPercentualAperitivo(90, 12, cfg), 'verde');
});

test('corDoPercentualAperitivo: mês fora da vigência é erro, como em aplicarTrava (nunca adivinha o limite)', () => {
  assert.throws(() => M.corDoPercentualAperitivo(130, 9), /fora da vigência/);
  assert.throws(() => M.corDoPercentualAperitivo(null, 1), /fora da vigência/);
});

test('corDoPercentualAperitivo concorda com a trava: no mês travado, verde é o mesmo que bater o limite', () => {
  // a tela passa o % BRUTO: quem é travado chega ao limite, e quem não chega fica vermelho
  for (const bruto of [95, 129.99999, 130, 142.2631]) {
    const t = M.aplicarTrava(bruto, 11);
    const noLimite = t.travado || bruto === M.REGRAS.trava[11];
    assert.equal(M.corDoPercentualAperitivo(bruto, 11), noLimite ? 'verde' : 'vermelho', String(bruto));
  }
});

/* ─── Etapa 4C — soma da gerência comercial agrupada (regras v1.6, seção 4; pendência 24) ──────────────────── */

test('somarGrupo: soma meta, real, online e meta dia das gerências do grupo', () => {
  const r = M.somarGrupo([{ meta: 100, real: 200, online: 5, metaDia: 10 },
                          { meta: 900, real: 180, online: 0, metaDia: 5 }]);
  assert.deepEqual(r, { meta: 1000, real: 380, online: 5, metaDia: 15 });
});

test('somarGrupo: o % é o da SOMA, nunca a média dos % das gerências', () => {
  const a = { meta: 100, real: 200, online: 0, metaDia: 0 };   // 200%
  const b = { meta: 900, real: 180, online: 0, metaDia: 0 };   //  20%
  const g = M.somarGrupo([a, b]);
  assert.equal(M.percentualMes(g.real, g.online, g.meta), 38); // (200 + 180) ÷ 1000
  const media = (M.percentualMes(a.real, a.online, a.meta) + M.percentualMes(b.real, b.online, b.meta)) / 2;
  assert.equal(media, 110);
  assert.notEqual(M.percentualMes(g.real, g.online, g.meta), media);
  // e a média dos % já travados de cada gerência também é outro número: (130 + 20) ÷ 2
  const travados = [a, b].map((x) => M.aplicarTrava(M.percentualMes(x.real, x.online, x.meta), 11).valor);
  assert.deepEqual(travados, [M.REGRAS.trava[11], 20]);
  assert.equal((travados[0] + travados[1]) / 2, 75);
  assert.equal(M.aplicarTrava(38, 11).valor, 38);  // o % da soma não chega na trava: entra como é
});

test('somarGrupo: campo com algum valor soma só os numéricos; nenhum numérico fica null (nunca 0)', () => {
  const r = M.somarGrupo([{ meta: 200, real: 100, online: null, metaDia: null },
                          { meta: null, real: 50, online: null, metaDia: null }]);
  assert.deepEqual(r, { meta: 200, real: 150, online: null, metaDia: null }); // meta null não zera a do grupo
  const vazio = M.somarGrupo([{ meta: null, real: null, online: null, metaDia: null }, null, undefined]);
  assert.deepEqual(vazio, { meta: null, real: null, online: null, metaDia: null });
  assert.deepEqual(M.somarGrupo([]), { meta: null, real: null, online: null, metaDia: null });
  assert.deepEqual(M.somarGrupo(null), { meta: null, real: null, online: null, metaDia: null });
});

test('somarGrupo: valor não numérico não entra na soma (nem NaN, nem texto)', () => {
  const r = M.somarGrupo([{ meta: 100, real: NaN, online: '5', metaDia: Infinity },
                          { meta: 100, real: 10, online: 2, metaDia: 1 }]);
  assert.deepEqual(r, { meta: 200, real: 10, online: 2, metaDia: 1 });
});

test('somarGrupo: `campos` permite a cobertura, que não tem meta dia própria', () => {
  const r = M.somarGrupo([{ meta: 200, real: 210, online: 1 }, { meta: 100, real: 50, online: 0 }],
                         ['meta', 'real', 'online']);
  assert.deepEqual(r, { meta: 300, real: 260, online: 1 });
  // a meta dia de cobertura do grupo sai da meta e do real já somados (nunca da soma das metas dia)
  assert.equal(M.metaDiaCobertura(r.meta, r.real, 10), 4); // (300 − 260) ÷ 10
});

test('somarGrupo: grupo de uma gerência só devolve os próprios valores (as oito linhas sozinhas do mapa)', () => {
  const um = { meta: 1234.5, real: 1000, online: 7, metaDia: 2.5 };
  assert.deepEqual(M.somarGrupo([um]), um);
});
