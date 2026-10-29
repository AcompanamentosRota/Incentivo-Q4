const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/motor.js');
const { CONFIG, montarEntrada, dadosDaApi, carregarDados, normalizarAjustes, normalizarConfrontos, aplicarAjustes,
        carregarAjustes, urlPublicacao, montarEstrat, CHAVE_REFRI, aplicarCanalSV } = require('../src/adapter.js');

// ── fixtures: base embutida (só o canal importa) e uma API com uma gerência ──
const BASE = {
  meta: { mes: 10, ano: 2026, corte: '25/10/2026 10:29', corteSeg: '25/10/2026 13:11', fonte: 'SAP Analytics Cloud',
          fonteLonga: 'SAP Analytics Cloud', medidas: ['Meta', 'Real', 'WF Online', 'Hoje', 'MetaDia'], produtos: [], totalRotasModelo: 3 },
  rotas: [
    { gc: 'An', sv: 'Sv. An.1', rota: 'A11', canal: 'Segmentada', sub: 'Mod', v: {} },
    { gc: 'An', sv: 'Sv. An.1', rota: 'A12', canal: 'Mista', sub: null, v: {} },
    { gc: 'An', sv: 'Sv. An.2', rota: 'A99', canal: 'Mista', sub: null, v: {} }, // não está na API
  ],
  semCanal: [], duplicadas: [], segSemInfos: [],
};
const b = (meta, realizado, online, dia) => ({ meta, realizado, online_hoje: online, meta_dia: dia });
const rota = (id, sv, produtos, tipo = 'normal') => ({ id, tipo, gerencia: 'AN', supervisao: sv, produtos });
const INDEX = {
  atualizado_em: '2026-10-23T17:43:06',
  mes_referencia: { anomes: '202610', rotulo: 'Outubro/26', fechamento: false },
  produtos: ['sucos', 'powerade', 'sabores', 'retornaveis', 'individuais', 'refrigerantes'].map((id) => ({ id, nome: id })),
  gerencias: [{ id: 'AN', arquivo: 'gerencias/AN.json' }],
};
const GERENCIAS = [{ rotas: [
  rota('A11', 'SV.AN.1', { sucos: b(100, 80, 5, 3), powerade: b(50, 40, 0, 2), sabores: b(200, 150, 10, 8),
                           retornaveis: b(300, 290, 0, 5), individuais: b(120, 118, 4, 1), refrigerantes: b(1000, 900, 10, 40) }),
  rota('A12', 'SV.AN.1', { sucos: b(100, 104, 1, 3), powerade: b(50, 53, 0, 2), sabores: b(200, 210, 0, 8),
                           retornaveis: b(300, 310, 0, 5), individuais: b(null, null, 0, null), refrigerantes: b(800, 790, 5, 30) }),
  rota('A13', 'SV.AN.2', { sucos: b(10, 1, 0, 1) }),              // sem canal na base
  rota('AN-EV', 'SV.AN.EV', { sucos: b(0, 9, 0, 0) }, 'eventual'), // soma dos clientes em rotas EV*
] }];

test('API -> formato da base: códigos no estilo do painel, canal da base, [meta, real, online, hoje, meta dia]', () => {
  const d = dadosDaApi(INDEX, GERENCIAS, BASE, CONFIG);
  const a11 = d.rotas.find((r) => r.rota === 'A11');
  assert.deepEqual({ gc: a11.gc, sv: a11.sv, canal: a11.canal, sub: a11.sub }, { gc: 'An', sv: 'Sv. An.1', canal: 'Segmentada', sub: 'Mod' });
  assert.deepEqual(a11.v['Refrigerantes Individual'], [120, 118, 4, null, 1]);
  assert.deepEqual(a11.v['Sabores Tt'], [200, 150, 10, null, 8]);
  assert.equal(d.meta.origem, 'api');
  assert.equal(d.meta.corte, '23/10/2026 17:43');
  assert.equal(d.meta.aviso, null);
  assert.equal(d.meta.refriCategoria, true);
});

test('rota eventual fica fora; rota sem canal vai para semCanal; rota da base fora da API vai para segSemInfos', () => {
  const d = dadosDaApi(INDEX, GERENCIAS, BASE, CONFIG);
  assert.deepEqual(d.rotas.map((r) => r.rota).sort(), ['A11', 'A12']);
  assert.deepEqual(d.semCanal, [{ gc: 'An', rota: 'A13' }]);
  assert.deepEqual(d.segSemInfos, ['A99']);
  assert.equal(d.meta.totalRotasModelo, 3); // A11, A12 e A13
});

test('API fora do Q4: null; mês do Q4 sem pilares configurados: dados com aviso e sem cálculo', () => {
  const set = { ...INDEX, mes_referencia: { anomes: '202609', rotulo: 'Setembro/26', fechamento: false } };
  assert.equal(dadosDaApi(set, GERENCIAS, BASE, CONFIG), null);
  const nov = { ...INDEX, mes_referencia: { anomes: '202611', rotulo: 'Novembro/26', fechamento: false } };
  const d = dadosDaApi(nov, GERENCIAS, BASE, CONFIG);
  assert.equal(d.meta.mes, 11);
  assert.equal(d.meta.semCalculo, 'Pilares de novembro ainda não configurados');
});

test('produto que a API ainda não traz: valores vazios e aviso, sem inventar número', () => {
  const index = { ...INDEX, produtos: INDEX.produtos.filter((p) => p.id !== 'individuais') };
  const gerencias = [{ rotas: GERENCIAS[0].rotas.map((r) => ({ ...r, produtos: { ...r.produtos, individuais: undefined } })) }];
  const d = dadosDaApi(index, gerencias, BASE, CONFIG);
  assert.deepEqual(d.rotas.find((r) => r.rota === 'A11').v['Refrigerantes Individual'], [null, null, null, null, null]);
  assert.match(d.meta.aviso, /Refrigerantes Individual/);
});

test('ponta a ponta: gatilho de 95% pela categoria Refrigerantes da API, não pela soma de Individual + Retornável', () => {
  const { entrada } = montarEntrada(dadosDaApi(INDEX, GERENCIAS, BASE, CONFIG), CONFIG);
  const res = M.calcular(entrada), p = (id) => res.pessoas.find((x) => x.id === id);
  assert.equal(p('A11').pilares.find((x) => x.nome === 'Volume Refri Single').pontos, 3); // (118 + 4) / 120 = 101,7%
  assert.equal(p('A11').volume.pctTexto, '91,0%');   // (900 + 10) / 1000; a soma provisória daria 98,1%
  assert.equal(p('A11').volume.atingido, false);
  assert.equal(p('A12').volume.atingido, true);      // (790 + 5) / 800 = 99,3%
});

test('API sem a categoria Refrigerantes: gatilho pela soma provisória de Individual + Retornável', () => {
  const index = { ...INDEX, produtos: INDEX.produtos.filter((x) => x.id !== 'refrigerantes') };
  const d = dadosDaApi(index, GERENCIAS, BASE, CONFIG);
  assert.equal(d.meta.refriCategoria, false);
  const a11 = M.calcular(montarEntrada(d, CONFIG).entrada).pessoas.find((x) => x.id === 'A11');
  assert.equal(a11.volume.pctTexto, '98,0%');        // (118 + 4 + 290) / (120 + 300) = 98,09%, truncado
  assert.equal(a11.volume.atingido, true);
});

// ── ajustes do admin ──
test('ajustes: o canal do admin troca a rota de canal, tira do ranking ou inclui rota que estava sem canal', () => {
  const d = dadosDaApi(INDEX, GERENCIAS, BASE, CONFIG,
    { A11: { canal: 'Mista', sub: null }, A12: { canal: null, sub: null }, A13: { canal: 'Segmentada', sub: 'Mini' } });
  const por = Object.fromEntries(d.rotas.map((r) => [r.rota, r]));
  assert.equal(por.A11.canal, 'Mista');
  assert.deepEqual([por.A13.canal, por.A13.sub], ['Segmentada', 'Mini']);
  assert.deepEqual(d.semCanal.map((x) => x.rota), ['A12']);
});

test('ajustes: só campos válidos entram; sem nenhum válido, null', () => {
  assert.equal(normalizarAjustes({ regras: { gatilhoVolumePct: -1 }, pilares: { Mista: ['Volume Água', 'Volume Sucos'] } }), null);
  const aj = normalizarAjustes({ regras: { faixas: [{ min: 90, pontos: 2 }, { min: 110, pontos: 6 }, { min: 100, pontos: 3 }], gatilhoVolumePct: 90 },
                                 canais: { X1: { canal: 'Segmentada', sub: 'Outro' } } });
  assert.deepEqual(aj.regras.faixas.map((f) => f.min), [110, 100, 90]); // ordena as faixas
  assert.equal(aj.regras.gatilhoVolumePct, 90);
  assert.deepEqual(aj.canais.X1, { canal: 'Segmentada', sub: null });
});

test('ajustes: regras e pilares coringa do admin mudam o cálculo', () => {
  const cfg = JSON.parse(JSON.stringify(CONFIG));
  const guardado = JSON.parse(JSON.stringify(M.REGRAS));
  try {
    aplicarAjustes(normalizarAjustes({
      regras: { gatilhoVolumePct: 90, faixas: [{ min: 105, pontos: 5 }, { min: 100, pontos: 4 }, { min: 90, pontos: 2 }] },
      pilares: { Mista: ['Volume Sucos', 'Volume Refri Single'], Segmentada: ['Volume Sabores', 'Missões Guiadas'] }, // Segmentada repete o pilar 1
    }), cfg, M.REGRAS, 10);
    const res = M.calcular(montarEntrada(dadosDaApi(INDEX, GERENCIAS, BASE, cfg), cfg).entrada);
    const p = (id) => res.pessoas.find((x) => x.id === id);
    assert.equal(p('A11').volume.atingido, true);                                           // 91% >= 90%
    assert.equal(p('A12').pilares.find((x) => x.nome === 'Volume Retornáveis').pontos, 4);  // 310 / 300 = 103,3%
    assert.deepEqual(p('A12').pilares.slice(3).map((x) => x.nome), ['Volume Sucos', 'Volume Refri Single']);
    assert.deepEqual(p('A11').pilares.slice(3).map((x) => x.nome), ['Volume Sucos', 'Missões Guiadas']); // ignorado
  } finally {
    Object.assign(M.REGRAS, guardado);
  }
});

test('confrontos: só os válidos entram, na ordem de registro', () => {
  const c = (mes, a, b, pilar) => ({ mes, id_sv_desafiante: a, id_sv_desafiado: b, pilar });
  const out = normalizarConfrontos([
    c(10, 'A#Mista', 'B#Mista', 'Volume Sabores'),
    c(9, 'A#Mista', 'C#Mista', 'Volume Sabores'),      // mês fora do Q4
    c(11, 'A#Mista', 'A#Mista', 'Volume Sabores'),     // autodesafio
    c(11, 'A#Mista', 'C#Mista', '  '),                 // sem pilar
    c(10, 'A#Mista', 'B#Mista', 'Volume Sucos'),       // mesmo par e mês: repetido
    c(11, 'A#Mista', 'B#Mista', 'Volume Sucos'),
  ]);
  assert.deepEqual(out.map((x) => [x.mes, x.pilar, x.ordem_registro]), [[10, 'Volume Sabores', 1], [11, 'Volume Sucos', 2]]);
  assert.equal(normalizarConfrontos(null).length, 0);
  // um confronto sozinho já é um ajuste válido
  assert.deepEqual(normalizarAjustes({ confrontos: [c(10, 'A#Mista', 'B#Mista', 'Volume Sabores')] }).confrontos.length, 1);
});

test('confrontos do admin chegam ao motor e dão o bônus ao vencedor e à mesa dele', () => {
  const base = { ...BASE, rotas: BASE.rotas.concat([{ gc: 'An', sv: 'Sv. An.3', rota: 'A14', canal: 'Mista', sub: null, v: {} }]) };
  const gerencias = [{ rotas: GERENCIAS[0].rotas.concat([
    rota('A14', 'SV.AN.3', { sucos: b(100, 100, 0, 3), powerade: b(50, 50, 0, 2), sabores: b(200, 230, 0, 8),
                             retornaveis: b(300, 300, 0, 5), individuais: b(120, 120, 0, 1), refrigerantes: b(800, 800, 0, 30) }),
  ]) }];
  // Sv. An.1 tem 1 rota Mista e 1 Segmentada (empate): o admin escolhe o canal do SV
  const aj = normalizarAjustes({ canaisSV: { 'Sv. An.1': 'Mista' }, confrontos: [
    { mes: 10, id_sv_desafiante: 'Sv. An.1#Mista', id_sv_desafiado: 'Sv. An.3#Mista', pilar: 'Volume Sabores' },
  ] });
  const dados = aplicarCanalSV(dadosDaApi(INDEX, gerencias, base, CONFIG), aj.canaisSV);
  const res = M.calcular(montarEntrada(dados, CONFIG, aj.confrontos).entrada);
  const det = res.confrontos[0];
  assert.equal(det.valido, true);
  assert.equal(det.vencedor, 'Sv. An.3#Mista');                                    // 115% contra 92,5% em Sabores (A11 + A12)
  assert.equal(res.pessoas.find((x) => x.id === 'Sv. An.3#Mista').pontosConfronto, M.REGRAS.bonusConfronto);
  assert.equal(res.pessoas.find((x) => x.id === 'A14').pontosConfronto, M.REGRAS.bonusConfronto); // a mesa inteira
  assert.equal(res.pessoas.find((x) => x.id === 'A12').pontosConfronto, 0);        // mesa de quem perdeu não ganha
  assert.deepEqual(M.conferir(res), []);
  // sem confronto, ninguém ganha o bônus
  const semConf = M.calcular(montarEntrada(dados, CONFIG).entrada);
  assert.equal(semConf.pessoas.find((x) => x.id === 'A14').pontosConfronto, 0);
});

test('agrupadores extras: viram pilar coringa e coluna da API; inválidos ficam de fora', () => {
  const aj = normalizarAjustes({ agrupadores: [
    { id: 'agua', nome: 'Água', agrupador: 'Agua Crystal' },
    { id: 'sucos', nome: 'X', agrupador: 'X' },          // id de um fixo
    { id: 'y', nome: 'Sucos', agrupador: 'Outro' },      // o pilar "Volume Sucos" já existe
    { id: 'z', nome: 'Z', agrupador: 'REFRIGERANTES' },  // agrupador de um fixo
  ], pilares: { Mista: ['Volume Sucos', 'Volume Água'] } });
  assert.deepEqual(aj.agrupadores, [{ id: 'agua', nome: 'Água', agrupador: 'Agua Crystal' }]);
  assert.deepEqual(aj.pilares.Mista, ['Volume Sucos', 'Volume Água']);
  const cfg = JSON.parse(JSON.stringify(CONFIG));
  aplicarAjustes(aj, cfg, JSON.parse(JSON.stringify(M.REGRAS)), 10);
  assert.match(dadosDaApi(INDEX, GERENCIAS, BASE, cfg).meta.aviso, /Agua Crystal/); // API ainda sem o extra
  const index = { ...INDEX, produtos: INDEX.produtos.concat([{ id: 'agua', nome: 'Vol. Água' }]) };
  const gerencias = [{ rotas: GERENCIAS[0].rotas.map((r) => (r.id === 'A12' ? { ...r, produtos: { ...r.produtos, agua: b(40, 42, 1, 2) } } : r)) }];
  const a12 = M.calcular(montarEntrada(dadosDaApi(index, gerencias, BASE, cfg), cfg).entrada).pessoas.find((p) => p.id === 'A12');
  assert.equal(a12.pilares.find((p) => p.nome === 'Volume Água').pontos, 5); // (42 + 1) / 40 = 107,5%
});

test('publicação por PR: cria o arquivo já preenchido ou abre a edição se ele já existe', () => {
  assert.equal(urlPublicacao(CONFIG, '{"a":1}', true), 'https://github.com/AcompanamentosRota/Incentivo-Q4/edit/main/frontend/ajustes.json');
  const u = new URL(urlPublicacao(CONFIG, '{"a":1}', false));
  assert.equal(u.pathname, '/AcompanamentosRota/Incentivo-Q4/new/main/frontend');
  assert.deepEqual([u.searchParams.get('filename'), u.searchParams.get('value')], ['ajustes.json', '{"a":1}']);
});

test('carregarAjustes: os deste navegador valem antes dos publicados', async () => {
  const fetchOriginal = globalThis.fetch;
  const publicado = { regras: { gatilhoVolumePct: 92 } }, local = { regras: { gatilhoVolumePct: 90 } };
  try {
    globalThis.fetch = async (url) => (url === './ajustes.json' ? { ok: true, json: async () => publicado } : { ok: false, status: 404 });
    let aj = await carregarAjustes(CONFIG);
    assert.deepEqual([aj.origem, aj.ativo.regras.gatilhoVolumePct], ['publicado', 92]);
    globalThis.localStorage = { getItem: () => JSON.stringify(local) };
    aj = await carregarAjustes(CONFIG);
    assert.deepEqual([aj.origem, aj.ativo.regras.gatilhoVolumePct], ['local', 90]);
  } finally {
    globalThis.fetch = fetchOriginal;
    delete globalThis.localStorage;
  }
});

test('carregarDados: lê index e gerências da API; se falhar, usa a base embutida com o motivo', async () => {
  const original = globalThis.fetch;
  try {
    const arquivos = { './api/v1/index.json': INDEX, './api/v1/gerencias/AN.json': GERENCIAS[0] };
    globalThis.fetch = async (url) => (url in arquivos ? { ok: true, json: async () => arquivos[url] } : { ok: false, status: 404 });
    assert.equal((await carregarDados(BASE, CONFIG)).meta.origem, 'api');

    globalThis.fetch = async () => { throw new Error('Failed to fetch'); };
    const d = await carregarDados(BASE, CONFIG);
    assert.equal(d.meta.origem, 'base');
    assert.match(d.meta.aviso, /API indisponível/);
    assert.deepEqual(d.rotas.map((r) => r.rota), BASE.rotas.map((r) => r.rota)); // a base inteira (com o canal do SV)
  } finally {
    globalThis.fetch = original;
  }
});

// ── Estratégicos: gerência inteira (todas as rotas com Real), vinda dos totais da API ──
// Fixture própria: 2 gerências (G9 com rotas no incentivo, ZZ sem nenhuma) e os totais da API bem acima
// da soma das rotas do canal, como no dado real (sem canal, Neutraliza, virtuais, eventuais e item sem meta).
const ITENS_EST = ['Sabores Tt', 'Refrigerantes Retornavel', 'Sucos', 'Powerade']; // Refri Single fica fora
const prodG9 = {
  sucos: b(400, 300, 10, 20), powerade: b(200, 150, 0, 10), sabores: b(800, 600, 20, 40),
  retornaveis: b(1000, 900, 0, 50), individuais: b(500, 480, 10, 25), refrigerantes: b(4000, 3000, 100, 200),
};
const prodZZ = {
  sucos: b(100, 90, 0, 5), powerade: b(50, 40, 0, 2), sabores: b(200, 180, 0, 10),
  retornaveis: b(300, 280, 0, 15), individuais: b(150, 140, 0, 7), refrigerantes: b(1000, 950, 50, 60),
};
const somaProd = (a, c) => Object.fromEntries(Object.keys(a).map((k) => [k,
  b(a[k].meta + c[k].meta, a[k].realizado + c[k].realizado, a[k].online_hoje + c[k].online_hoje, a[k].meta_dia + c[k].meta_dia)]));
const BASE_EST = {
  ...BASE,
  rotas: [
    { gc: 'G9', sv: 'Sv. G9.1', rota: 'R01', canal: 'Mista', sub: null, v: {} },
    { gc: 'G9', sv: 'Sv. G9.1', rota: 'R02', canal: 'Mista', sub: null, v: {} },
  ],
};
const INDEX_EST = {
  ...INDEX,
  gerencias: [{ id: 'G9', nome: 'Gerência Nove', arquivo: 'gerencias/G9.json' },
              { id: 'ZZ', nome: 'Gerência Zeta', arquivo: 'gerencias/ZZ.json' }],
};
const rotaEst = (id, produtos, tipo = 'normal', ger = 'G9') =>
  ({ id, tipo, gerencia: ger, supervisao: 'SV.' + ger + '.1', produtos });
const GERENCIAS_EST = [
  { produtos: prodG9, rotas: [
    // no incentivo: R01 com tudo e R02 com Sucos sem meta (fica fora da soma do item, como no resto do painel)
    rotaEst('R01', { sucos: b(100, 80, 5, 5), powerade: b(50, 45, 0, 2), sabores: b(200, 190, 10, 10),
                     retornaveis: b(300, 290, 0, 15), individuais: b(120, 118, 4, 6), refrigerantes: b(900, 800, 20, 45) }),
    rotaEst('R02', { sucos: b(0, 70, 0, 0), powerade: b(40, 38, 0, 2), sabores: b(150, 140, 5, 8),
                     retornaveis: b(200, 195, 0, 10), individuais: b(90, 88, 2, 4), refrigerantes: b(700, 650, 15, 35) }),
    // fora do incentivo: sem canal na base, Neutraliza, virtual e eventual — só entram pelos totais da API
    rotaEst('R03', { refrigerantes: b(500, 400, 10, 25) }),
    rotaEst('R04', { refrigerantes: b(900, 700, 20, 45) }, 'neutraliza'),
    rotaEst('R05', { refrigerantes: b(300, 250, 5, 15) }, 'virtual'),
    rotaEst('G9-EV', { refrigerantes: b(0, 200, 0, 0) }, 'eventual'),
  ] },
  { produtos: prodZZ, rotas: [rotaEst('Z01', { refrigerantes: b(1000, 950, 50, 60) }, 'normal', 'ZZ')] },
];
const RESUMO_EST = { empresa: { produtos: somaProd(prodG9, prodZZ) } };
const dadosEst = (resumo = RESUMO_EST) => dadosDaApi(INDEX_EST, GERENCIAS_EST, BASE_EST, CONFIG, null, resumo);

test('Estratégicos: a linha da gerência é o total da API, não a soma das rotas do incentivo', () => {
  const est = montarEstrat(dadosEst(), ITENS_EST, CONFIG);
  assert.equal(est.origem, 'api');
  const g9 = est.linhas.find((l) => l.gc === 'G9');
  // Sabores: total da gerência 800/600 (+20 online); as 2 rotas do incentivo somam só 350/330
  assert.deepEqual([g9.v['Sabores Tt'].meta, g9.v['Sabores Tt'].real, g9.v['Sabores Tt'].online], [800, 600, 20]);
  // % Refri da gerência: categoria Refrigerantes do total, com Neutraliza, virtual e eventual dentro
  assert.deepEqual([g9.v[CHAVE_REFRI].meta, g9.v[CHAVE_REFRI].real], [4000, 3000]);
  // Sucos: R02 tem Real sem meta e ficaria fora da soma das rotas; no total da API ele está dentro
  assert.deepEqual([g9.v['Sucos'].meta, g9.v['Sucos'].real], [400, 300]);
  assert.deepEqual([g9.v['Sabores Tt'].temMdia, g9.v['Sabores Tt'].mdia], [true, 40]);
});

test('Estratégicos: TOTAL = soma das gerências e vem do resumo.json; Refri Single fora dos itens', () => {
  const est = montarEstrat(dadosEst(), ITENS_EST, CONFIG);
  for (const k of ITENS_EST.concat([CHAVE_REFRI])) {
    const real = est.linhas.reduce((s, l) => s + l.v[k].real, 0);
    const meta = est.linhas.reduce((s, l) => s + l.v[k].meta, 0);
    assert.ok(Math.abs(est.total.v[k].real - real) <= 0.1, `${k}: TOTAL ${est.total.v[k].real} != Σ gerências ${real}`);
    assert.ok(Math.abs(est.total.v[k].meta - meta) <= 0.1, `${k}: meta do TOTAL fora da soma das gerências`);
  }
  assert.equal(est.total.v[CHAVE_REFRI].real, 3000 + 950);
  assert.equal(Object.keys(est.total.v).includes('Refrigerantes Individual'), false);
});

test('Estratégicos: gerência sem nenhuma rota no incentivo aparece com os números dela', () => {
  const est = montarEstrat(dadosEst(), ITENS_EST, CONFIG);
  assert.deepEqual(est.linhas.map((l) => l.gc), ['G9', 'Zz']);
  const zz = est.linhas.find((l) => l.gc === 'Zz');
  assert.equal(zz.v['Sabores Tt'].meta, 200);
  assert.equal(zz.v[CHAVE_REFRI].real, 950);
});

test('Estratégicos: sem resumo.json, o TOTAL é a soma das gerências e carregarDados avisa', async () => {
  const d = dadosEst(null);
  assert.equal(d.meta.totalEmpresaOrigem, 'gerencias');
  const est = montarEstrat(d, ITENS_EST, CONFIG);
  assert.equal(est.total.v['Sabores Tt'].meta, 800 + 200);
  assert.equal(est.total.v[CHAVE_REFRI].real, 3000 + 950);
  const original = globalThis.fetch;
  try {
    const arquivos = { './api/v1/index.json': INDEX_EST, './api/v1/gerencias/G9.json': GERENCIAS_EST[0],
                       './api/v1/gerencias/ZZ.json': GERENCIAS_EST[1] };   // sem resumo.json
    globalThis.fetch = async (url) => (url in arquivos ? { ok: true, json: async () => arquivos[url] } : { ok: false, status: 404 });
    const carregado = await carregarDados(BASE_EST, CONFIG);
    assert.equal(carregado.meta.origem, 'api');                            // o resumo que falta não derruba a API
    assert.equal(carregado.meta.totalEmpresaOrigem, 'gerencias');
    assert.match(carregado.meta.aviso, /total da empresa veio da soma das gerências/);
  } finally {
    globalThis.fetch = original;
  }
});

test('Estratégicos: nota de conciliação compara o Refrigerantes do incentivo com o total da empresa', () => {
  const est = montarEstrat(dadosEst(), ITENS_EST, CONFIG);
  assert.equal(est.conciliacao.refriCanal, 800 + 650);       // só R01 e R02, as rotas do canal
  assert.equal(est.conciliacao.refriTotal, 3000 + 950);
  assert.equal(M.fmtPct(est.conciliacao.pct), '36,7%');      // 1450 / 3950 = 36,70%, truncado
});

test('Estratégicos sem a API: só as rotas do incentivo, sem conciliação e sem misturar origens', () => {
  const v = { 'Sabores Tt': [200, 190, 10, null, 10], 'Refrigerantes Retornavel': [300, 290, 0, null, 15],
              'Sucos': [100, 80, 5, null, 5], 'Powerade': [50, 45, 0, null, 2],
              'Refrigerantes Individual': [120, 118, 4, null, 6] };
  const base = { ...BASE_EST, rotas: BASE_EST.rotas.map((r) => ({ ...r, v })),
                 meta: { ...BASE_EST.meta, origem: 'base', refriCategoria: false } };
  const est = montarEstrat(base, ITENS_EST, CONFIG);
  assert.equal(est.origem, 'rotas');
  assert.equal(est.conciliacao, null);
  assert.equal(est.nRotas, 2);
  assert.equal(est.linhas.length, 1);
  assert.equal(est.total.v['Sabores Tt'].real, 190 * 2);
  // sem a categoria, o % Refri volta à soma provisória de Individual + Retornável
  assert.equal(est.total.v[CHAVE_REFRI].meta, (120 + 300) * 2);
});

// ── virada de mês: outubro fechado (fechado/202610.json) + novembro corrente ──
// Fixture sintética: gerência NV, SV.NV.1 (rotas N1 e N2) e SV.NV.2 (rota N3), todas Mista.
const { fechadoDaApi, aplicarCoringas } = require('../src/adapter.js');
const BASE_V = { ...BASE, rotas: [
  { gc: 'Nv', sv: 'Sv. Nv.1', rota: 'N1', canal: 'Mista', sub: null, v: {} },
  { gc: 'Nv', sv: 'Sv. Nv.1', rota: 'N2', canal: 'Mista', sub: null, v: {} },
  { gc: 'Nv', sv: 'Sv. Nv.2', rota: 'N3', canal: 'Mista', sub: null, v: {} },
] };
// novembro (só nos testes): pilares fictícios para exercitar a virada; os reais ainda não foram definidos
const cfgNov = (missoes) => {
  const cfg = JSON.parse(JSON.stringify(CONFIG));
  const pl = (nome) => ({ nome, tipo: nome === 'Missões Guiadas' ? 'missao' : 'volume' });
  cfg.pilaresConfig.find((c) => c.mes === 11 && c.canal === 'Mista').pilares =
    ['Volume Sabores', 'Volume Retornáveis', 'Missões Guiadas', 'Volume Powerade', 'Volume Refri Single'].map(pl);
  cfg.pilaresConfig.find((c) => c.mes === 11 && c.canal === 'Segmentada').pilares =
    ['Volume Sabores', 'Volume Refri Single', 'Volume Powerade', 'Volume Sucos', 'Missões Guiadas'].map(pl);
  if (missoes) { cfg.produtoDaApi['Missoes Guiadas'] = 'missoes'; cfg.fonteDoPilar['Missões Guiadas'] = 'Missoes Guiadas'; }
  return cfg;
};
const FECHADO_OUT = {
  anomes: '202610', rotulo: 'Outubro/26', gerado_em: '2026-11-03T18:46:02', atualizado_em: '2026-11-03T18:45:10',
  simulado: false, fechamento_final: true, campos: ['rota', 'gerencia', 'supervisao', 'produtos'], campos_produto: ['meta', 'realizado'],
  rotas: [
    ['N1', 'NV', 'SV.NV.1', { sabores: [100, 105], retornaveis: [100, 100], sucos: [100, 90], powerade: [100, 80], individuais: [100, 100], refrigerantes: [1000, 900] }],
    ['N2', 'NV', 'SV.NV.1', { sabores: [100, 100], retornaveis: [100, 95], sucos: [100, 100], powerade: [100, 106], individuais: [100, 100], refrigerantes: [1000, 850] }],
    ['N3', 'NV', 'SV.NV.2', { sabores: [200, 220], retornaveis: [100, 100], sucos: [100, 100], powerade: [100, 100], individuais: [100, 100], refrigerantes: [1000, 1000] }],
    ['NV-EV', 'NV', 'SV.NV.EV', { refrigerantes: [0, 30] }],
  ],
};
const INDEX_NOV = {
  atualizado_em: '2026-11-04T10:00:00', simulado: false,
  mes_referencia: { anomes: '202611', rotulo: 'Novembro/26', fechamento: false },
  produtos: ['sucos', 'powerade', 'sabores', 'retornaveis', 'individuais', 'refrigerantes', 'missoes'].map((id) => ({ id, nome: id })),
  gerencias: [{ id: 'NV', nome: 'Gerência Nova', arquivo: 'gerencias/NV.json' }],
  fechados: [{ anomes: '202610', rotulo: 'Outubro/26', arquivo: 'fechado/202610.json', gerado_em: '2026-11-03T18:46:02', fechamento_final: true }],
};
const rotaNv = (id, sv, produtos) => ({ id, tipo: 'normal', gerencia: 'NV', supervisao: sv, produtos });
const GER_NOV = { rotas: [
  rotaNv('N1', 'SV.NV.1', { sabores: b(100, 50, 10, 4), retornaveis: b(100, 100, 5, 4), powerade: b(100, 95, 0, 4), individuais: b(100, 100, 0, 4),
                            sucos: b(100, 100, 0, 4), refrigerantes: b(1000, 900, 50, 40), missoes: b(10, 9, 1, 0) }),
  rotaNv('N2', 'SV.NV.1', { sabores: b(100, 100, 0, 4), retornaveis: b(100, 90, 0, 4), powerade: b(100, 100, 0, 4), individuais: b(100, 110, 0, 4),
                            sucos: b(100, 100, 0, 4), refrigerantes: b(1000, 1000, 0, 40) }),
  rotaNv('N3', 'SV.NV.2', { sabores: b(100, 50, 0, 4), retornaveis: b(100, 100, 0, 4), powerade: b(100, 100, 0, 4), individuais: b(100, 100, 0, 4),
                            sucos: b(100, 100, 0, 4), refrigerantes: b(1000, 1000, 0, 40) }),
] };
/** carregarDados com uma API falsa: `arquivos` por caminho; `falhar` = caminhos que dão erro de rede. */
async function comApi(arquivos, fn, falhar = []) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const k = url.replace('./api/v1/', '');
    if (falhar.includes(k)) throw new Error('Failed to fetch');
    return k in arquivos ? { ok: true, json: async () => JSON.parse(JSON.stringify(arquivos[k])) } : { ok: false, status: 404 };
  };
  try { return await fn(); } finally { globalThis.fetch = original; }
}
const API_NOV = { 'index.json': INDEX_NOV, 'gerencias/NV.json': GER_NOV, 'fechado/202610.json': FECHADO_OUT };
const calcularNov = async (cfg, arquivos = API_NOV, confrontos, falhar) => comApi(arquivos, async () => {
  const d = await carregarDados(BASE_V, cfg);
  return { d, res: d.meta.semCalculo ? null : M.calcular(montarEntrada(d, cfg, confrontos).entrada) };
}, falhar);
const pessoaDe = (res, id) => res.pessoas.find((x) => x.id === id);

test('virada: mês fechado vira rotas no formato do mês corrente (online 0, sem meta dia), sem a rota eventual', () => {
  const f = fechadoDaApi(FECHADO_OUT, BASE_V, CONFIG);
  assert.deepEqual([f.mes, f.final, f.rotas.map((r) => r.rota)], [10, true, ['N1', 'N2', 'N3']]);
  const n1 = f.rotas[0];
  assert.deepEqual([n1.gc, n1.sv, n1.canal], ['Nv', 'Sv. Nv.1', 'Mista']);
  assert.deepEqual(n1.v['Sabores Tt'], [100, 105, 0, null, null]);
  assert.deepEqual(n1.v['Refrigerantes'], [1000, 900, 0, null, null]);
});

test('virada: acumulado do SV = pontos de outubro (pilares de outubro) + novembro (pilares de novembro)', async () => {
  const { d, res } = await calcularNov(cfgNov());
  assert.deepEqual([d.meta.mes, d.meta.acumulado.usados.map((x) => [x.mes, x.final]), d.meta.acumulado.faltando], [11, [[10, true]], []]);
  const sv1 = pessoaDe(res, 'Sv. Nv.1#Mista');
  // outubro: Sabores 205/200 = 102,5% (3) · Retornáveis 195/200 (2) · Missões validada (3) · Sucos 190/200 (2) · Powerade 186/200 (2)
  // novembro: Sabores 160/200 (0) · Retornáveis 195/200 (2) · Missões sem fonte (0) · Powerade 195/200 (2) · Refri Single 210/200 (5)
  assert.deepEqual(sv1.porMes.map((m) => [m.mes, m.pontosMes]), [[10, 12], [11, 9]]);
  assert.equal(sv1.pontosAcumulados, 21);
  assert.equal(sv1.pontosMes, 9);
  assert.deepEqual(sv1.acumuladoIncompleto, []);
  assert.deepEqual(sv1.pilares.map((p) => p.nome), ['Volume Sabores', 'Volume Retornáveis', 'Missões Guiadas', 'Volume Powerade', 'Volume Refri Single']);
  assert.deepEqual(M.conferir(res), []);
});

test('virada: gatilho de volume do SV = Σ(Real + Online) ÷ Σ Meta de Refrigerantes de outubro a novembro', async () => {
  const { res } = await calcularNov(cfgNov());
  const sv1 = pessoaDe(res, 'Sv. Nv.1#Mista');
  // outubro 1750/2000 (87,5%) + novembro (900 + 50 + 1000)/2000 (97,5%) = 3700/4000 = 92,5%: não bate, mesmo com novembro acima de 95%
  assert.equal(sv1.volume.pctTexto, '92,5%');
  assert.equal(sv1.volume.atingido, false);
  assert.equal(pessoaDe(res, 'Sv. Nv.2#Mista').volume.pctTexto, '100,0%');
});

test('virada: o consultor zera em novembro (pontos, gatilho de pontos e de volume só do mês vigente)', async () => {
  const { res } = await calcularNov(cfgNov());
  const n2 = pessoaDe(res, 'N2');
  // novembro: Sabores 100% (3) · Retornáveis 90% (2) · Missões sem fonte (0) · Powerade 100% (3) · Refri Single 110% (5) = 13
  assert.equal(n2.pontosMes, 13);
  assert.equal(n2.gatilhoPontos.valor, 13);              // outubro (14) não soma
  assert.equal(n2.pontosAcumulados, undefined);
  assert.equal(n2.volume.escopo, 'mês');
  assert.equal(n2.volume.pctTexto, '100,0%');            // outubro (85%) não entra
});

test('virada: mês sem pilares configurados mostra o aviso e não calcula nada (nem lê os meses fechados)', async () => {
  const lidos = [];
  const { d, res } = await comApi(API_NOV, async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = async (url) => { lidos.push(url); return orig(url); };
    const d = await carregarDados(BASE_V, CONFIG);       // CONFIG real: novembro ainda sem pilares
    return { d, res: d.meta.semCalculo ? null : 'calculou' };
  });
  assert.equal(d.meta.semCalculo, 'Pilares de novembro ainda não configurados');
  assert.match(d.meta.aviso, /^Pilares de novembro ainda não configurados/);
  assert.equal(d.meta.origem, 'api');
  assert.equal(d.meta.mes, 11);                          // nunca vira outubro
  assert.equal(res, null);
  assert.equal(lidos.some((u) => u.includes('fechado/')), false);
});

test('virada: mês fechado ausente ou que falha ao carregar deixa o acumulado do SV "incompleto", com aviso', async () => {
  const semLista = { ...API_NOV, 'index.json': { ...INDEX_NOV, fechados: [] } };
  for (const [arquivos, falhar, motivo] of [[semLista, [], /outubro não está nos meses fechados/], [API_NOV, ['fechado/202610.json'], /outubro não carregou/]]) {
    const { d, res } = await calcularNov(cfgNov(), arquivos, undefined, falhar);
    assert.match(d.meta.aviso, /acumulado do trimestre incompleto/);
    assert.match(d.meta.aviso, motivo);
    const sv2 = pessoaDe(res, 'Sv. Nv.2#Mista');
    assert.deepEqual(sv2.acumuladoIncompleto, [10]);
    assert.equal(sv2.pontosAcumulados, sv2.pontosMes);  // só novembro: por isso marcado como incompleto
    assert.equal(sv2.volume.pct, null);                 // sem outubro não há % acumulado
    assert.equal(sv2.elegivel, false);
    assert.equal(sv2.posicao, null);
    assert.deepEqual(sv2.porMes.map((m) => [m.mes, m.pontosMes, !!m.semDado]), [[10, 0, true], [11, 9, false]]); // nem a Missões validada
    assert.equal(pessoaDe(res, 'N3').pontosMes, 9);     // o consultor (mês vigente) não é afetado
  }
});

test('virada: cada confronto é apurado com os dados do mês dele (fechado ou corrente)', async () => {
  const conf = normalizarAjustes({ confrontos: [
    { mes: 10, id_sv_desafiante: 'Sv. Nv.1#Mista', id_sv_desafiado: 'Sv. Nv.2#Mista', pilar: 'Volume Sabores' },
    { mes: 11, id_sv_desafiante: 'Sv. Nv.2#Mista', id_sv_desafiado: 'Sv. Nv.1#Mista', pilar: 'Volume Sabores' },
  ] }).confrontos;
  const { res } = await calcularNov(cfgNov(), API_NOV, conf);
  const [out, nov] = res.confrontos;
  // outubro: Sabores 102,5% × 110% (dados de outubro) -> SV.NV.2; com os dados de novembro daria SV.NV.1
  assert.deepEqual([out.mes, out.vencedor, M.fmtPct(out.pctDesafiante), M.fmtPct(out.pctDesafiado)], [10, 'Sv. Nv.2#Mista', '102,5%', '110,0%']);
  assert.deepEqual([nov.mes, nov.vencedor, M.fmtPct(nov.pctDesafiante), M.fmtPct(nov.pctDesafiado)], [11, 'Sv. Nv.1#Mista', '50,0%', '80,0%']);
  const sv1 = pessoaDe(res, 'Sv. Nv.1#Mista'), sv2 = pessoaDe(res, 'Sv. Nv.2#Mista');
  assert.deepEqual(sv1.porMes.map((m) => m.pontosConfronto), [0, 5]);
  assert.deepEqual(sv2.porMes.map((m) => m.pontosConfronto), [5, 0]);
  assert.equal(sv1.pontosAcumulados, 21 + 5);
  assert.equal(pessoaDe(res, 'N1').pontosConfronto, 5);  // a mesa leva o +5 do mês
  assert.equal(pessoaDe(res, 'N3').pontosConfronto, 0);  // o +5 de outubro não passa para novembro
});

test('virada: Missões Guiadas de novembro sem fonte fica "sem dados" e não pontua; com fonte pontua como os demais', async () => {
  const sem = (await calcularNov(cfgNov(false))).res;
  const mgSem = pessoaDe(sem, 'N1').pilares.find((p) => p.nome === 'Missões Guiadas');
  assert.deepEqual([mgSem.pontos, mgSem.validada, mgSem.pct], [0, false, null]); // nunca 100% em novembro
  assert.ok(mgSem.alertas.includes('META_AUSENTE'));
  const com = (await calcularNov(cfgNov(true))).res;
  const mgCom = pessoaDe(com, 'N1').pilares.find((p) => p.nome === 'Missões Guiadas');
  assert.deepEqual([mgCom.pontos, mgCom.pctTexto, mgCom.validada], [3, '100,0%', false]); // (9 + 1) / 10
  // outubro do mesmo SV continua com Missões validada em 100% (3 pontos)
  assert.equal(pessoaDe(com, 'Sv. Nv.1#Mista').porMes[0].pontosPilares, 12);
});

test('virada: no fechamento de outubro (1º dia útil de novembro) o painel mostra outubro, e o fechado de novembro vem como final', async () => {
  const idx = { ...INDEX, mes_referencia: { anomes: '202610', rotulo: 'Outubro/26', fechamento: true },
                fechados: [{ anomes: '202610', rotulo: 'Outubro/26', arquivo: 'fechado/202610.json', fechamento_final: false }] };
  const { d, res } = await comApi({ 'index.json': idx, 'gerencias/AN.json': GERENCIAS[0] }, async () => {
    const d = await carregarDados(BASE, CONFIG);
    return { d, res: M.calcular(montarEntrada(d, CONFIG).entrada) };
  });
  assert.deepEqual([d.meta.mes, d.meta.fechamento, d.meta.semCalculo, d.fechados.length], [10, true, null, 0]); // o próprio mês não vira "fechado"
  assert.ok(res.pessoas.length > 0);
  const nov = await calcularNov(cfgNov());
  assert.deepEqual(nov.d.meta.acumulado.usados, [{ mes: 10, rotulo: 'Outubro/26', final: true }]);
});

test('virada: API indisponível usa a base embutida só no mês dela, com o rótulo "base embutida (outubro)"', async () => {
  const falha = async (hoje) => comApi({}, () => carregarDados(BASE, CONFIG, null, hoje), ['index.json']);
  const out = await falha(new Date(2026, 9, 29));
  assert.deepEqual([out.meta.origem, out.meta.mes, out.meta.rotuloBase, out.meta.semCalculo], ['base', 10, 'base embutida (outubro)', null]);
  assert.match(out.meta.fonte, /base embutida \(outubro\)$/);
  assert.deepEqual(out.rotas.map((r) => r.rota), BASE.rotas.map((r) => r.rota));
  const nov = await falha(new Date(2026, 10, 4));
  assert.equal(nov.meta.origem, 'base');
  assert.match(nov.meta.semCalculo, /^Sem dados de novembro: API indisponível/);
  assert.deepEqual(nov.rotas, []);
});

test('virada: pilares coringa do admin valem para o mês de referência e nunca completam mês sem os 5 pilares', () => {
  const aj = normalizarAjustes({ pilares: { Mista: ['Volume Sucos', 'Volume Powerade'] } });
  const cfg = JSON.parse(JSON.stringify(CONFIG));
  const mista = (c, mes) => c.pilaresConfig.find((x) => x.mes === mes && x.canal === 'Mista').pilares;
  mista(cfg, 12).length = 0; // mês sem nenhum pilar
  const antes = JSON.parse(JSON.stringify(cfg.pilaresConfig));
  aplicarCoringas(aj, cfg, 11); // novembro só com os pilares 1 a 3 no CONFIG
  aplicarCoringas(aj, cfg, 12);
  assert.deepEqual(cfg.pilaresConfig, antes);
  assert.deepEqual(mista(cfg, 11).map((p) => p.nome), ['Volume Sabores', 'Volume Retornáveis', 'Missões Guiadas']);
  assert.deepEqual(mista(cfg, 12), []);
  // mês com os 5 pilares (outubro): o admin troca os coringas 4 e 5 do mês de referência
  aplicarCoringas(normalizarAjustes({ pilares: { Mista: ['Volume Refri Single', 'Volume Sucos'] } }), cfg, 10);
  assert.deepEqual(mista(cfg, 10).map((p) => p.nome), ['Volume Sabores', 'Volume Retornáveis', 'Missões Guiadas', 'Volume Refri Single', 'Volume Sucos']);
});

// ── regressão: outubro continua idêntico ao de antes da virada ──
const resumoRes = (res) => res.pessoas.map((p) => [p.id, p.cargo, p.canal, p.pilares.map((x) => [x.nome, x.pontos, x.pctTexto]),
  p.pontosMes, p.pontosAcumulados ?? null, p.volume.pctTexto, p.volume.atingido, p.elegivel, p.posicao, p.status]);

test('regressão: outubro pela API (fixture) dá o mesmo resultado de antes da virada', () => {
  const res = M.calcular(montarEntrada(dadosDaApi(INDEX, GERENCIAS, BASE, CONFIG), CONFIG).entrada);
  assert.deepEqual(resumoRes(res), [
    ['A11', 'RT', 'Segmentada', [['Volume Sabores', 0, '80,0%'], ['Volume Refri Single', 3, '101,6%'], ['Volume Powerade', 0, '80,0%'], ['Volume Sucos', 0, '85,0%'], ['Missões Guiadas', 3, '100,0%']], 6, null, '91,0%', false, false, null, '-'],
    ['A12', 'RT', 'Mista', [['Volume Sabores', 5, '105,0%'], ['Volume Retornáveis', 3, '103,3%'], ['Missões Guiadas', 3, '100,0%'], ['Volume Sucos', 5, '105,0%'], ['Volume Powerade', 5, '106,0%']], 21, null, '99,3%', true, true, 1, 'No total'],
    // Sv. An.1 tem 1 rota Mista e 1 Segmentada: empate, o SV fica sem canal (fora do ranking) até o admin escolher (29/10/2026)
  ]);
  assert.deepEqual(res.mesesIncompletos, []);
});

test('regressão: outubro pela base embutida (data.json) dá o mesmo resultado de antes da virada', () => {
  const base = require('../data/data.json');
  const esperado = require('./fixtures/regressao-outubro-base.json').base;
  const res = M.calcular(montarEntrada(base, CONFIG).entrada);
  assert.deepEqual(resumoRes(res), esperado);
});

// ── pilares de novembro e dezembro (etapa 9): 1 a 3 do Back Office no CONFIG, coringas 4 e 5 a decidir ──
// Fixture sintética: gerência PX, SV.PX.1 (rota P1, Mista) e SV.PX.2 (rotas P2 Mini e P3 Mod, Segmentada).
const { pilaresDoMes, pilaresDefinidos, mesConfigurado, PILARES_NO_MES } = require('../src/adapter.js');
const BASE_P = { ...BASE, rotas: [
  { gc: 'Px', sv: 'Sv. Px.1', rota: 'P1', canal: 'Mista', sub: null, v: {} },
  { gc: 'Px', sv: 'Sv. Px.2', rota: 'P2', canal: 'Segmentada', sub: 'Mini', v: {} },
  { gc: 'Px', sv: 'Sv. Px.2', rota: 'P3', canal: 'Segmentada', sub: 'Mod', v: {} },
] };
const rotaPx = (id, sv, produtos) => ({ id, tipo: 'normal', gerencia: 'PX', supervisao: sv, produtos });
const GER_PX = { rotas: [
  rotaPx('P1', 'SV.PX.1', { sabores: b(200, 190, 20, 5), retornaveis: b(100, 95, 0, 4), sucos: b(100, 100, 0, 4), powerade: b(50, 40, 4, 2),
                            individuais: b(100, 80, 0, 4), refrigerantes: b(1000, 940, 20, 40), missoes: b(10, 9, 1, 0) }),
  rotaPx('P2', 'SV.PX.2', { sabores: b(100, 99.99, 0, 4), individuais: b(200, 210, 0, 6), powerade: b(100, 100, 0, 3), sucos: b(100, 89.999, 0, 3),
                            retornaveis: b(100, 104.99, 0, 3), refrigerantes: b(1000, 900, 0, 40) }),
  rotaPx('P3', 'SV.PX.2', { sabores: b(100, 120, 0, 4), individuais: b(100, 90, 0, 4), powerade: b(100, 50, 0, 4), sucos: b(100, 105, 0, 4),
                            retornaveis: b(100, 100, 0, 4), refrigerantes: b(1000, 1000, 0, 40) }),
] };
const itemPx = (anomes, rotulo) => ({ anomes, rotulo, arquivo: `fechado/${anomes}.json`, gerado_em: '2026-12-02T18:46:02', fechamento_final: true });
const fechadoPx = (anomes, rotulo) => ({ ...itemPx(anomes, rotulo), atualizado_em: '2026-12-02T18:45:10', simulado: false,
  campos: ['rota', 'gerencia', 'supervisao', 'produtos'], campos_produto: ['meta', 'realizado'],
  rotas: GER_PX.rotas.map((r) => [r.id, 'PX', r.supervisao, Object.fromEntries(Object.entries(r.produtos).map(([k, x]) => [k, [x.meta, x.realizado]]))]) });
const apiPx = (anomes, rotulo, fechados, extras = []) => {
  const arquivos = { 'gerencias/PX.json': GER_PX, 'index.json': {
    atualizado_em: `${anomes.slice(0, 4)}-${anomes.slice(4)}-04T10:00:00`, simulado: false,
    mes_referencia: { anomes, rotulo, fechamento: false },
    produtos: ['sucos', 'powerade', 'sabores', 'retornaveis', 'individuais', 'refrigerantes'].concat(extras).map((id) => ({ id, nome: id })),
    gerencias: [{ id: 'PX', nome: 'Gerência Px', arquivo: 'gerencias/PX.json' }], fechados: fechados.map(([a, r]) => itemPx(a, r)) } };
  fechados.forEach(([a, r]) => { arquivos[`fechado/${a}.json`] = fechadoPx(a, r); });
  return arquivos;
};
const OUT_PX = ['202610', 'Outubro/26'], NOV_PX = ['202611', 'Novembro/26'];
// Coringas FICTÍCIOS, só nos testes: os 4 e 5 reais ainda não foram decididos pelo Back Office
const CORINGAS_TESTE = { Mista: ['Volume Sucos', 'Volume Powerade'], Segmentada: ['Volume Sucos', 'Volume Retornáveis'] };
const cfgComCoringas = (meses, canais = ['Mista', 'Segmentada'], missoes = false) => {
  const cfg = JSON.parse(JSON.stringify(CONFIG));
  for (const c of cfg.pilaresConfig) if (meses.includes(c.mes) && canais.includes(c.canal))
    c.pilares = c.pilares.concat(CORINGAS_TESTE[c.canal].map((nome) => ({ nome, tipo: 'volume' })));
  if (missoes) { cfg.produtoDaApi['Missoes Guiadas'] = 'missoes'; cfg.fonteDoPilar['Missões Guiadas'] = 'Missoes Guiadas'; }
  return cfg;
};
const calcularPx = (cfg, arquivos) => comApi(arquivos, async () => {
  const d = await carregarDados(BASE_P, cfg);
  return { d, res: d.meta.semCalculo ? null : M.calcular(montarEntrada(d, cfg).entrada) };
});
const pts = (p) => p.pilares.map((x) => [x.nome, x.pontos]);
const nomes = (cfg, mes, canal) => pilaresDefinidos(cfg, mes, canal).map((p) => [p.nome, p.tipo]);

test('pilares de novembro: o CONFIG traz os pilares 1 a 3 do Back Office (dezembro igual) e os coringas vazios', () => {
  const mista = [['Volume Sabores', 'volume'], ['Volume Retornáveis', 'volume'], ['Missões Guiadas', 'missao']];
  const seg = [['Volume Sabores', 'volume'], ['Volume Refri Single', 'volume'], ['Volume Powerade', 'volume']]; // "Volume Individuais" = Refri Single
  for (const mes of [11, 12]) {
    assert.deepEqual([nomes(CONFIG, mes, 'Mista'), nomes(CONFIG, mes, 'Segmentada')], [mista, seg]);
    assert.deepEqual([pilaresDoMes(CONFIG, mes, 'Mista'), pilaresDoMes(CONFIG, mes, 'Segmentada'), mesConfigurado(CONFIG, mes)], [null, null, false]);
  }
  assert.equal(PILARES_NO_MES, 5);
  assert.equal(CONFIG.fonteDoPilar['Missões Guiadas'], undefined); // sem fonte ainda: nunca assume 100%
  // todo pilar de volume de novembro e dezembro lê um agrupador fixo da API (nenhum agrupador extra é necessário)
  for (const c of CONFIG.pilaresConfig.filter((x) => x.mes > 10)) for (const p of c.pilares.filter((x) => x.tipo === 'volume'))
    assert.ok(['sabores', 'retornaveis', 'individuais', 'powerade'].includes(CONFIG.produtoDaApi[CONFIG.fonteDoPilar[p.nome]]), p.nome);
});

test('pilares de novembro: outubro continua idêntico (nomes, tipos e ordem dos 5 pilares de cada canal)', () => {
  assert.deepEqual([nomes(CONFIG, 10, 'Mista'), nomes(CONFIG, 10, 'Segmentada')], [
    [['Volume Sabores', 'volume'], ['Volume Retornáveis', 'volume'], ['Missões Guiadas', 'missao'], ['Volume Sucos', 'volume'], ['Volume Powerade', 'volume']],
    [['Volume Sabores', 'volume'], ['Volume Refri Single', 'volume'], ['Volume Powerade', 'volume'], ['Volume Sucos', 'volume'], ['Missões Guiadas', 'missao']],
  ]);
  assert.equal(mesConfigurado(CONFIG, 10), true);
});

test('pilares de novembro: com os 5 pilares, calcula os pontos nos pilares novos de cada canal', async () => {
  const { d, res } = await calcularPx(cfgComCoringas([11]), apiPx(...NOV_PX, [OUT_PX]));
  assert.deepEqual([d.meta.mes, d.meta.semCalculo, d.meta.acumulado.faltando], [11, null, []]);
  // P1 (Mista): Sabores 210/200 (5) · Retornáveis 95% (2) · Missões sem fonte (0) · Sucos 100% (3) · Powerade 44/50 = 88% (0)
  assert.deepEqual(pts(pessoaDe(res, 'P1')), [['Volume Sabores', 5], ['Volume Retornáveis', 2], ['Missões Guiadas', 0], ['Volume Sucos', 3], ['Volume Powerade', 0]]);
  // P2 (Segmentada): Sabores 99,99% (2, na tela 99,9%) · Refri Single 105% (5) · Powerade 100% (3) · Sucos 89,999% (0) · Retornáveis 104,99% (3)
  const p2 = pessoaDe(res, 'P2');
  assert.deepEqual(pts(p2), [['Volume Sabores', 2], ['Volume Refri Single', 5], ['Volume Powerade', 3], ['Volume Sucos', 0], ['Volume Retornáveis', 3]]);
  assert.equal(p2.pilares[0].pctTexto, '99,9%');
  assert.deepEqual(pts(pessoaDe(res, 'P3')).map((x) => x[1]), [5, 2, 0, 5, 3]);
  assert.deepEqual(['P1', 'P2', 'P3'].map((id) => pessoaDe(res, id).pontosMes), [10, 13, 15]);
  // SV.PX.2 = P2 + P3: Sabores 219,99/200 (5) · Refri Single 300/300 (3) · Powerade 150/200 (0) · Sucos 194,999/200 (2) · Retornáveis 204,99/200 (3)
  const sv2 = pessoaDe(res, 'Sv. Px.2#Segmentada');
  assert.deepEqual(pts(sv2).map((x) => x[1]), [5, 3, 0, 2, 3]);
  assert.deepEqual([sv2.pontosMes, pessoaDe(res, 'Sv. Px.1#Mista').pontosMes], [13, 10]);
  assert.deepEqual(M.conferir(res), []);
});

test('pilares de novembro: mês sem os 5 pilares mostra o aviso e não calcula (novembro, dezembro e um canal só completo)', async () => {
  for (const [cfg, api, aviso] of [
    [CONFIG, apiPx(...NOV_PX, [OUT_PX]), 'Pilares de novembro ainda não configurados'],
    [CONFIG, apiPx('202612', 'Dezembro/26', [OUT_PX, NOV_PX]), 'Pilares de dezembro ainda não configurados'],
    [cfgComCoringas([11], ['Mista']), apiPx(...NOV_PX, [OUT_PX]), 'Pilares de novembro ainda não configurados'],
  ]) {
    const { d, res } = await calcularPx(cfg, api);
    assert.equal(d.meta.semCalculo, aviso);
    assert.equal(res, null);
    assert.deepEqual(d.fechados, []); // nem lê os meses fechados
  }
  const cfg = JSON.parse(JSON.stringify(CONFIG));
  cfg.pilaresConfig.find((c) => c.mes === 11 && c.canal === 'Mista').pilares.push({ nome: 'Volume Sucos', tipo: 'volume' }); // só o pilar 4
  assert.equal(pilaresDoMes(cfg, 11, 'Mista'), null);
});

test('pilares de novembro: mês fechado só com os pilares 1 a 3 deixa o acumulado do SV incompleto (nunca calcula com 3 pilares)', async () => {
  const { d, res } = await calcularPx(cfgComCoringas([12]), apiPx('202612', 'Dezembro/26', [OUT_PX, NOV_PX]));
  assert.equal(d.meta.semCalculo, null);
  assert.deepEqual(d.meta.acumulado.faltando, [{ mes: 11, motivo: 'Pilares de novembro ainda não configurados' }]);
  assert.match(d.meta.aviso, /acumulado do trimestre incompleto: Pilares de novembro ainda não configurados/);
  const sv2 = pessoaDe(res, 'Sv. Px.2#Segmentada');
  // outubro (pilares de outubro): Sabores 5 · Refri Single 3 · Powerade 0 · Sucos 2 · Missões validada 3 = 13
  assert.deepEqual(sv2.porMes.map((m) => [m.mes, m.pontosPilares, !!m.semDado]), [[10, 13, false], [11, 0, true], [12, 13, false]]);
  assert.deepEqual([sv2.acumuladoIncompleto, sv2.elegivel, sv2.posicao], [[11], false, null]);
  assert.equal(pessoaDe(res, 'P2').pontosMes, 13); // o consultor (mês vigente) não é afetado
});

test('pilares de novembro: Missões Guiadas (pilar 3 da Mista) sem fonte fica "sem dados"; com fonte pontua com meta, real e online', async () => {
  const sem = (await calcularPx(cfgComCoringas([11]), apiPx(...NOV_PX, [OUT_PX]))).res;
  for (const id of ['P1', 'Sv. Px.1#Mista']) {
    const mg = pessoaDe(sem, id).pilares.find((p) => p.nome === 'Missões Guiadas');
    assert.deepEqual([mg.pontos, mg.validada, mg.pct, mg.pctTexto], [0, false, null, '-'], id); // nunca 100% em novembro
    assert.ok(mg.alertas.includes('META_AUSENTE'), id);
  }
  const com = (await calcularPx(cfgComCoringas([11], undefined, true), apiPx(...NOV_PX, [OUT_PX], ['missoes']))).res;
  const p1 = pessoaDe(com, 'P1'), mg = p1.pilares.find((p) => p.nome === 'Missões Guiadas');
  assert.deepEqual([mg.meta, mg.real, mg.online, mg.pctTexto, mg.pontos, mg.validada], [10, 9, 1, '100,0%', 3, false]); // (9 + 1) / 10
  assert.equal(p1.pontosMes, 13);
  // outubro continua com Missões validada em 100%: Sabores 95% (2) · Retornáveis (2) · Missões (3) · Sucos (3) · Powerade 80% (0)
  assert.equal(p1.porMes[0].pontosPilares, 10);
});

test('pilares de novembro: pilar de volume com agrupador que a API não traz fica sem dados, com aviso, e não pontua', async () => {
  const cfg = cfgComCoringas([11]);
  aplicarAjustes(normalizarAjustes({ agrupadores: [{ id: 'chas', nome: 'Chás', agrupador: 'Chas Tt' }] }), cfg, {});
  cfg.pilaresConfig.find((c) => c.mes === 11 && c.canal === 'Mista').pilares[4] = { nome: 'Volume Chás', tipo: 'volume' };
  const { d, res } = await calcularPx(cfg, apiPx(...NOV_PX, [OUT_PX]));
  assert.match(d.meta.aviso, /a API ainda não traz Chas Tt/);
  const p1 = pessoaDe(res, 'P1'), chas = p1.pilares.find((p) => p.nome === 'Volume Chás');
  assert.deepEqual([chas.meta, chas.real, chas.pct, chas.pontos], [null, null, null, 0]);
  assert.ok(chas.alertas.includes('META_AUSENTE'));
  assert.equal(p1.pontosMes, 10); // 5 + 2 + 0 + 3 + 0: nenhum número inventado
});

// ── segmentação da supervisão (etapa 7): canal para o motor, segmento só como etiqueta ──
const A = require('../src/adapter.js');
const SEG_BASE = {
  meta: BASE.meta,
  rotas: [
    { gc: 'Fx', sv: 'Sv. Fx.1', rota: 'F11', canal: 'Mista', sub: null, v: {} },
    { gc: 'Fx', sv: 'Sv. Fx.1', rota: 'F12', canal: 'Mista', sub: null, v: {} },
    { gc: 'Fx', sv: 'Sv. Fx.2', rota: 'F21', canal: 'Segmentada', sub: 'Mini', v: {} },
    { gc: 'Fx', sv: 'Sv. Fx.3', rota: 'F31', canal: 'Segmentada', sub: 'Mod', v: {} },
    { gc: 'Fx', sv: 'Sv. Fx.4', rota: 'F41', canal: 'Mista', sub: null, v: {} },
  ],
  semCanal: [{ gc: 'Fx', rota: 'F91' }], duplicadas: [], segSemInfos: [],
};
// todos os pilares no mesmo % (pct) e Refrigerantes em refri%: 4 pilares de volume em 106% = 20 + 3 (Missões) = 23 pontos
const prods = (pct, refri) => Object.fromEntries(['sucos', 'powerade', 'sabores', 'retornaveis', 'individuais']
  .map((id) => [id, b(100, pct, 0, 1)]).concat([['refrigerantes', b(1000, refri * 10, 0, 1)]]));
const SEG_INDEX = { ...INDEX, gerencias: [{ id: 'FX', arquivo: 'gerencias/FX.json' }] };
const rotaFx = (id, sv, pct, refri) => ({ id, tipo: 'normal', gerencia: 'FX', supervisao: sv, produtos: prods(pct, refri) });
const SEG_GER = [{ rotas: [
  rotaFx('F11', 'SV.FX.1', 106, 99), rotaFx('F12', 'SV.FX.1', 106, 97), rotaFx('F21', 'SV.FX.2', 106, 98),
  rotaFx('F31', 'SV.FX.3', 106, 96), rotaFx('F41', 'SV.FX.4', 101, 99), rotaFx('F91', 'SV.FX.9', 106, 99),
] }];
const calcSeg = (ajustes, confrontos) => {
  const aj = ajustes ? normalizarAjustes(ajustes) : null;
  const d = dadosDaApi(SEG_INDEX, SEG_GER, SEG_BASE, CONFIG, aj && aj.canais);
  const res = M.calcular(montarEntrada(d, CONFIG, confrontos || (aj && aj.confrontos)).entrada);
  return { d, res, p: (id) => res.pessoas.find((x) => x.id === id) };
};

test('segmentação: ajustes.json antigo (canal + sub, sem segmento) dá o mesmo resultado de hoje (regressão de outubro)', () => {
  const fx = require('./fixtures/regressao-ajustes-antigo.json');
  const aj = normalizarAjustes(fx.ajustes);
  assert.deepEqual(aj.canais, fx.esperado.canais);
  const d = A.comCanais(require('../data/data.json'), aj.canais);
  const res = M.calcular(montarEntrada(d, CONFIG).entrada);
  assert.deepEqual([d.rotas.length, d.semCanal.length], [fx.esperado.rotas, fx.esperado.semCanal]);
  assert.deepEqual(res.pessoas.map((p) => [p.id, p.canal, p.pontosMes, p.volume.pctTexto, p.elegivel, p.posicao, p.status]), fx.esperado.res);
});

test('segmentação: rota sem ajuste fica como na base, com origem "base"; ajuste vira origem "ajuste"', () => {
  const { d } = calcSeg({ canais: { F12: { canal: 'Segmentada', sub: 'Mod', segmento: 'Mod' } } });
  const l = Object.fromEntries(d.segmentacao.map((x) => [x.rota, x]));
  assert.deepEqual([l.F11.atual, l.F11.origem, l.F21.atual, l.F31.atual], ['Mista', 'base', 'Segmentada|Mini', 'Segmentada|Mod']);
  assert.deepEqual([l.F91.atual, l.F91.padrao, l.F91.origem], ['', '', 'base']);       // sem canal na base: sem segmento inventado
  assert.deepEqual([l.F12.atual, l.F12.padrao, l.F12.origem], ['Segmentada|Mod', 'Mista', 'ajuste']);
  assert.equal(d.rotas.find((r) => r.rota === 'F12').origemCanal, 'ajuste');
});

test('segmentação: mover rota de Mista para Segmentada muda os pilares dela, a mesa do SV e o ranking', () => {
  const antes = calcSeg(null), depois = calcSeg({ canais: { F12: { canal: 'Segmentada', sub: 'Mini', segmento: 'Mini' } } });
  assert.deepEqual(antes.p('F12').pilares.map((x) => x.nome), CONFIG.pilaresConfig.find((c) => c.mes === 10 && c.canal === 'Mista').pilares.map((x) => x.nome));
  assert.deepEqual(depois.p('F12').pilares.map((x) => x.nome), CONFIG.pilaresConfig.find((c) => c.mes === 10 && c.canal === 'Segmentada').pilares.map((x) => x.nome));
  assert.deepEqual(antes.res.ranking['RT|Segmentada'].premiados, ['F21', 'F31']);
  assert.deepEqual(depois.res.ranking['RT|Segmentada'].premiados, ['F21', 'F12', 'F31']); // 98% > 97% > 96% de Refri no desempate
  assert.deepEqual(depois.res.ranking['RT|Mista'].premiados, ['F11']); // F41 (101%) fica com 15 pontos, abaixo de 20
  assert.deepEqual(M.conferir(depois.res), []);
});

test('segmentação: Segmentada Mini e Mod ficam no mesmo ranking (canal Segmentada), com a etiqueta do segmento', () => {
  const { res, d } = calcSeg(null);
  assert.deepEqual(res.ranking['RT|Segmentada'].premiados, ['F21', 'F31']);
  assert.deepEqual(res.ranking['SV|Segmentada'].elegiveis, 0); // outubro: nenhum SV chega a 60
  assert.deepEqual(d.rotas.filter((r) => r.canal === 'Segmentada').map((r) => [r.rota, r.sub]), [['F21', 'Mini'], ['F31', 'Mod']]);
  assert.ok(res.pessoas.every((p) => ['Mista', 'Segmentada'].includes(p.canal))); // o motor só vê o canal
});

test('segmentação: rota Sem canal (cada um dos 4 segmentos) fica fora de pontos, ranking e premiação e vai aos alertas com o segmento', () => {
  for (const seg of ['Neutraliza', 'Eventual', 'Coke Net', 'Virtual']) {
    const { d, res, p } = calcSeg({ canais: { F11: { canal: null, sub: null, segmento: seg } } });
    assert.equal(p('F11'), undefined, seg);
    assert.ok(d.semCanal.some((x) => x.rota === 'F11'), seg);
    assert.equal(d.segmentacao.find((x) => x.rota === 'F11').sub, seg);
    assert.equal(A.rotuloSeg(d.segmentacao.find((x) => x.rota === 'F11').atual), 'Sem canal – ' + seg);
    assert.ok(!res.ranking['RT|Mista'].premiados.includes('F11'));
    // a mesa do SV deixa de somar a rota
    assert.equal(p('Sv. Fx.1#Mista').refri.meta, 1000);
  }
});

test('segmentação: valor inválido no ajustes.json é ignorado com aviso (nunca em silêncio); o resto vale', () => {
  const avisos = [];
  const aj = normalizarAjustes({ canais: {
    F11: { canal: 'Varejo' },                              // canal inválido: rota ignorada
    F12: { canal: 'Mista', segmento: 'Mini' },             // Mista não tem segmento: canal mantido, segmento cai
    F21: { canal: 'Segmentada', segmento: 'Neutraliza' },  // segmento de outro canal
    F31: { canal: null, segmento: 'Atacado' },             // segmento que não existe
    F41: { canal: null, segmento: 'Coke Net' },            // válido
    F91: 'Mista',                                          // formato errado
  } }, avisos);
  assert.deepEqual(aj.canais, { F12: { canal: 'Mista', sub: null }, F21: { canal: 'Segmentada', sub: null },
                                F31: { canal: null, sub: null }, F41: { canal: null, sub: 'Coke Net' } });
  assert.equal(avisos.length, 5);
  assert.match(avisos.join('|'), /rota F11: canal "Varejo"/);
  assert.match(avisos.join('|'), /rota F12: segmento "Mini" não vale para Mista/);
  assert.match(avisos.join('|'), /rota F91/);
});

test('segmentação: carregarAjustes devolve os avisos dos ajustes em uso', async () => {
  const fetchOriginal = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ canais: { X1: { canal: 'Segmentada', segmento: 'Grande' } } }) });
    const aj = await carregarAjustes(CONFIG);
    assert.deepEqual(aj.ativo.canais.X1, { canal: 'Segmentada', sub: null });
    assert.equal(aj.avisos.length, 1);
  } finally { globalThis.fetch = fetchOriginal; }
});

test('segmentação: "aplicar a toda a mesa", "restaurar padrão", resumo pendente e o ajustes.json gerado (ida e volta)', () => {
  const { d } = calcSeg({ canais: { F41: { canal: 'Segmentada', sub: 'Mod', segmento: 'Mod' } } });
  const linhas = d.segmentacao, mesa1 = A.rotasDoFiltro(linhas, 'Sv. Fx.1');
  assert.deepEqual(mesa1.map((l) => l.rota), ['F11', 'F12']);
  let ed = A.aplicarNaMesa({}, mesa1, 'Segmentada|Mini');
  assert.deepEqual(ed, { F11: 'Segmentada|Mini', F12: 'Segmentada|Mini' });
  assert.deepEqual(A.canalDaMesa(mesa1, ed), { canais: ['Segmentada'], mista: false, maioria: 'Segmentada', canal: 'Segmentada' });
  assert.deepEqual(A.canalDaMesa(mesa1, { F11: '|Virtual' }), { canais: ['Sem canal', 'Mista'], mista: false, maioria: 'Mista', canal: 'Mista' });
  // 1 Mista + 1 Segmentada: aviso na tela, empate sem canal até o admin escolher
  assert.deepEqual(A.canalDaMesa(mesa1, { F11: 'Segmentada|Mod' }), { canais: ['Segmentada', 'Mista'], mista: true, maioria: null, canal: null });
  assert.equal(A.canalDaMesa(mesa1, { F11: 'Segmentada|Mod' }, 'Mista').canal, 'Mista');
  ed = A.restaurarPadrao(ed, mesa1.filter((l) => l.rota === 'F12'));             // restaurar uma rota
  ed = A.restaurarPadrao(ed, A.rotasDoFiltro(linhas, 'Sv. Fx.4'));               // restaurar a mesa (F41 volta a Mista)
  assert.deepEqual(A.pendenciasSegmentacao(linhas, ed).map((x) => [x.rota, x.base, x.novo, x.situacao]),
    [['F11', 'Mista', 'Segmentada|Mini', 'nova'], ['F41', 'Mista', 'Mista', 'volta ao padrão']]);
  const canais = A.canaisDaEdicao(linhas, ed, { Z99: { canal: null, sub: 'Virtual' } });
  assert.deepEqual(canais, { Z99: { canal: null, sub: null, segmento: 'Virtual' }, F11: { canal: 'Segmentada', sub: 'Mini', segmento: 'Mini' } });
  // o arquivo gerado volta pelo mesmo caminho do ajustes.json publicado
  const de = calcSeg({ canais });
  assert.deepEqual(de.d.rotas.find((r) => r.rota === 'F11').sub, 'Mini');
  assert.equal(de.d.rotas.find((r) => r.rota === 'F41').canal, 'Mista');
});

test('segmentação: filtro por SV (código exibido, código da API ou gerência) e "Rotas sem SV"', () => {
  const linhas = A.linhasSegmentacao(SEG_BASE.rotas.map((r) => ({ rota: r.rota, gc: r.gc, sv: r.sv }))
    .concat([{ rota: 'F91', gc: 'Fx', sv: null }]), SEG_BASE, null);
  const svs = A.svsDaSegmentacao(linhas);
  assert.deepEqual(svs.map((s) => [s.sv, s.n]), [['Sv. Fx.1', 2], ['Sv. Fx.2', 1], ['Sv. Fx.3', 1], ['Sv. Fx.4', 1], [A.SEM_SV, 1]]);
  assert.equal(svs[svs.length - 1].rotulo, 'Rotas sem SV');
  assert.deepEqual(A.buscarSVs(svs, 'Sv. Fx.1').map((s) => s.sv), ['Sv. Fx.1']);
  assert.deepEqual(A.buscarSVs(svs, 'SV.FX.1').map((s) => s.sv), ['Sv. Fx.1']);
  assert.deepEqual(A.buscarSVs(svs, 'sem sv').map((s) => s.sv), [A.SEM_SV]);
  assert.equal(A.buscarSVs(svs, 'fx').length, 5);
  assert.equal(A.buscarSVs(svs, '').length, 5);
  assert.deepEqual(A.rotasDoFiltro(linhas, A.SEM_SV).map((l) => l.rota), ['F91']);
});

test('segmentação: com a API fora do ar (base embutida), rota sem canal da base cai em "Rotas sem SV"', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => { throw new Error('offline'); };
    const d = await carregarDados(SEG_BASE, CONFIG, null, new Date(2026, 9, 28));
    assert.equal(d.meta.origem, 'base');
    assert.deepEqual(A.rotasDoFiltro(d.segmentacao, A.SEM_SV).map((l) => [l.rota, l.atual]), [['F91', '']]);
    assert.deepEqual(A.rotasDoFiltro(d.segmentacao, 'Sv. Fx.1').map((l) => l.rota), ['F11', 'F12']);
  } finally { globalThis.fetch = original; }
});

test('segmentação: confronto Mini × Mod vale; Mista × Segmentada não vale', () => {
  const c = (a, b2, pilar) => ({ mes: 10, id_sv_desafiante: a, id_sv_desafiado: b2, pilar, ordem_registro: 1 });
  const mm = calcSeg(null, [c('Sv. Fx.2#Segmentada', 'Sv. Fx.3#Segmentada', 'Volume Sabores')]).res.confrontos[0];
  assert.equal(mm.valido, true);
  assert.equal(mm.vencedor, 'Sv. Fx.2#Segmentada'); // empate em Sabores; desempate pelo % de Refri (98% × 96%)
  const ms = calcSeg(null, [c('Sv. Fx.1#Mista', 'Sv. Fx.3#Segmentada', 'Volume Sabores')]).res.confrontos[0];
  assert.deepEqual([ms.valido, ms.motivo], [false, 'CANAIS_DIFERENTES']);
});

test('segmentação: ajuste de canal que invalida um confronto cadastrado mostra o motivo e não apaga o cadastro', () => {
  const ajustes = {
    canais: { F41: { canal: 'Segmentada', sub: 'Mod', segmento: 'Mod' } },
    confrontos: [{ mes: 10, id_sv_desafiante: 'Sv. Fx.1#Mista', id_sv_desafiado: 'Sv. Fx.4#Mista', pilar: 'Volume Sabores' }],
  };
  const aj = normalizarAjustes(ajustes);
  assert.equal(aj.confrontos.length, 1); // o cadastro continua
  const { d, res } = calcSeg(ajustes);
  const det = res.confrontos[0];
  assert.deepEqual([det.valido, det.motivo], [false, 'SV_NAO_ENCONTRADO']);
  const exp = A.confrontoInvalidadoPorAjuste(det, d.segmentacao);
  assert.deepEqual([exp.motivo, exp.sv, exp.canal, exp.rotas], ['CANAL_AJUSTADO', 'Sv. Fx.4', 'Mista', ['F41']]);
  assert.match(exp.texto, /canal ajustado: a mesa de Sv\. Fx\.4 saiu da Mista \(rota F41\)/);
  // sem o ajuste, o mesmo confronto vale e não há motivo de ajuste
  const sem = calcSeg({ confrontos: ajustes.confrontos });
  assert.equal(sem.res.confrontos[0].valido, true);
  assert.equal(A.confrontoInvalidadoPorAjuste(sem.res.confrontos[0], sem.d.segmentacao), null);
});

// ── canal do SV (29/10/2026): cada supervisão em um canal só, somando todas as rotas da mesa ──
test('canal do SV: padrão = maioria das rotas; o SV aparece só nesse canal e soma a mesa inteira nos pilares dele', () => {
  // Sv. Fx.1 com F11 e F12 Mista + F13 Segmentada Mini: maioria Mista
  const base = { ...SEG_BASE, rotas: SEG_BASE.rotas.concat([{ gc: 'Fx', sv: 'Sv. Fx.1', rota: 'F13', canal: 'Segmentada', sub: 'Mini', v: {} }]) };
  const ger = [{ rotas: SEG_GER[0].rotas.concat([{ ...rotaFx('F13', 'SV.FX.1', 90, 95), produtos: { ...prods(90, 95), retornaveis: b(100, 50, 0, 1) } }]) }];
  const d = aplicarCanalSV(dadosDaApi(SEG_INDEX, ger, base, CONFIG), null);
  assert.deepEqual([d.canaisSV['Sv. Fx.1'].canal, d.canaisSV['Sv. Fx.1'].origem, d.canaisSV['Sv. Fx.1'].misto], ['Mista', 'maioria', true]);
  const res = M.calcular(montarEntrada(d, CONFIG).entrada), p = (id) => res.pessoas.find((x) => x.id === id);
  assert.equal(p('Sv. Fx.1#Segmentada'), undefined);                                  // um canal só
  const sv = p('Sv. Fx.1#Mista');
  // Retornáveis do SV soma as 3 rotas, inclusive a Segmentada F13: (106 + 106 + 50) / 300 = 87,3%
  assert.equal(sv.pilares.find((x) => x.nome === 'Volume Retornáveis').pctTexto, '87,3%');
  assert.equal(sv.refri.meta, 3000);                                                   // Refrigerantes das 3 rotas
  // a rota Segmentada continua no ranking do canal dela, com os pilares dela, e na mesa do SV (para o +5)
  assert.deepEqual([p('F13').canal, p('F13').id_supervisor], ['Segmentada', 'Sv. Fx.1#Mista']);
  assert.deepEqual(A.segmentosDaMesa(d.rotas, 'Sv. Fx.1#Mista'), []);                 // etiqueta: só segmentos do canal do SV
  assert.deepEqual(M.conferir(res), []);
});

test('canal do SV: o admin escolhe (canaisSV); empate sem escolha deixa o SV fora, com aviso; valor inválido vira aviso', () => {
  const ajTxt = { canais: { F12: { canal: 'Segmentada', sub: 'Mini', segmento: 'Mini' } } };   // Sv. Fx.1: 1 Mista + 1 Segmentada
  const empate = calcSeg(ajTxt);
  assert.equal(empate.res.pessoas.filter((x) => x.id.startsWith('Sv. Fx.1#')).length, 0);
  const dEmp = aplicarCanalSV(empate.d, null);
  assert.equal(dEmp.canaisSV['Sv. Fx.1'].origem, 'empate');
  assert.match(dEmp.meta.aviso, /Sv\. Fx\.1: escolha o canal do SV|\(Sv\. Fx\.1\): escolha o canal do SV/);
  const avisos = [];
  const aj = normalizarAjustes({ ...ajTxt, canaisSV: { 'Sv. Fx.1': 'Segmentada', 'Sv. Fx.2': 'Varejo' } }, avisos);
  assert.deepEqual(aj.canaisSV, { 'Sv. Fx.1': 'Segmentada' });
  assert.match(avisos.join('|'), /SV Sv\. Fx\.2: canal do SV "Varejo"/);
  const d = aplicarCanalSV(dadosDaApi(SEG_INDEX, SEG_GER, SEG_BASE, CONFIG, aj.canais), aj.canaisSV);
  const res = M.calcular(montarEntrada(d, CONFIG).entrada);
  assert.deepEqual(res.pessoas.filter((x) => x.id.startsWith('Sv. Fx.1#')).map((x) => x.id), ['Sv. Fx.1#Segmentada']);
  assert.equal(res.pessoas.find((x) => x.id === 'F11').id_supervisor, 'Sv. Fx.1#Segmentada'); // a rota Mista fica na mesa
  // resumo antes de publicar
  assert.deepEqual(A.pendenciasCanalSV({ 'Sv. Fx.1': 'Segmentada', 'Sv. Fx.3': 'Mista' }, { 'Sv. Fx.1': 'Segmentada', 'Sv. Fx.4': 'Segmentada' }),
    [{ sv: 'Sv. Fx.1', novo: 'Segmentada', situacao: 'em uso' }, { sv: 'Sv. Fx.3', novo: '', situacao: 'volta ao padrão' },
     { sv: 'Sv. Fx.4', novo: 'Segmentada', situacao: 'nova' }]);
});

test('canal do SV: confronto cadastrado com o canal antigo do SV mostra "canal ajustado" e continua no cadastro', () => {
  const conf = [{ mes: 10, id_sv_desafiante: 'Sv. Fx.4#Mista', id_sv_desafiado: 'Sv. Fx.1#Mista', pilar: 'Volume Sabores', ordem_registro: 1 }];
  const aj = normalizarAjustes({ canaisSV: { 'Sv. Fx.4': 'Segmentada' }, confrontos: conf });
  const d = aplicarCanalSV(dadosDaApi(SEG_INDEX, SEG_GER, SEG_BASE, CONFIG), aj.canaisSV);
  const det = M.calcular(montarEntrada(d, CONFIG, aj.confrontos).entrada).confrontos[0];
  assert.deepEqual([det.valido, det.motivo], [false, 'SV_NAO_ENCONTRADO']);
  const exp = A.confrontoInvalidadoPorAjuste(det, d.segmentacao, d.canaisSV);
  assert.equal(exp.motivo, 'CANAL_AJUSTADO');
  assert.match(exp.texto, /Sv\. Fx\.4 agora é da Segmentada \(canal do SV definido pelo admin\)/);
  assert.equal(aj.confrontos.length, 1);
});

// ── ajustes do admin: publicado × navegador (etapa 8) ──
// ajustes.json com dois objetos seguidos, como o de 29/10/2026 (texto colado depois do antigo); dados fictícios
const DOIS_OBJETOS = '{\n  "atualizado_em": "2026-10-29T10:00",\n  "regras": { "gatilhoPontos": { "SV": 60, "RT": 17 } }\n}\n'
  + '{\n  "atualizado_em": "2026-10-29T11:00",\n  "regras": { "gatilhoPontos": { "SV": 60, "RT": 17 } }\n}\n';
const PUB = { versao: 1, atualizado_em: '2026-10-29T15:00', regras: { gatilhoPontos: { SV: 60, RT: 17 } },
  canais: { X2: { canal: 'Segmentada', sub: 'Mini', segmento: 'Mini' } },
  confrontos: [{ mes: 10, id_sv_desafiante: 'Sv. Fx.1#Mista', id_sv_desafiado: 'Sv. Fx.4#Mista', pilar: 'Volume Sucos' }] };
// fetch devolve o texto do ajustes.json como o servidor (null = 404, número = outro HTTP); localStorage em memória
async function comAjustes(textoPublicado, salvo, fn) {
  const fetchOriginal = globalThis.fetch, gravados = [], dados = new Map();
  if (salvo !== undefined) dados.set(A.AJUSTES_LOCAL, typeof salvo === 'string' ? salvo : JSON.stringify(salvo));
  globalThis.fetch = async () => (textoPublicado === null ? { ok: false, status: 404 }
    : typeof textoPublicado === 'number' ? { ok: false, status: textoPublicado }
    : { ok: true, status: 200, json: async () => JSON.parse(textoPublicado) });
  globalThis.localStorage = { getItem: (k) => (dados.has(k) ? dados.get(k) : null),
    setItem: (k, v) => { gravados.push(['set', k]); dados.set(k, String(v)); },
    removeItem: (k) => { gravados.push(['remove', k]); dados.delete(k); } };
  try { return await fn({ ler: () => (dados.has(A.AJUSTES_LOCAL) ? JSON.parse(dados.get(A.AJUSTES_LOCAL)) : null), gravados }); }
  finally { globalThis.fetch = fetchOriginal; delete globalThis.localStorage; }
}

test('ajustes: publicado inválido (dois objetos seguidos) => aviso de arquivo ilegível e nenhum ajuste publicado aplicado', async () => {
  await comAjustes(DOIS_OBJETOS, undefined, async () => {
    const aj = await carregarAjustes(CONFIG);
    assert.equal(aj.situacaoPublicado, 'erro');
    assert.match(aj.erroPublicado, /mais de um objeto JSON seguido/);
    assert.deepEqual([aj.publicado, aj.ativo, aj.origem, aj.existePublicado], [null, null, null, true]);
    const regras = JSON.parse(JSON.stringify(A.MotorPadrao));
    aplicarAjustes(aj.ativo, JSON.parse(JSON.stringify(CONFIG)), regras);
    assert.equal(regras.gatilhoPontos.RT, 20); // o 17 do arquivo ilegível não entra: vale o padrão, com o aviso na tela
  });
  // sem como comparar com o publicado, o navegador fica como está e o ajuste dele continua valendo
  const nav = { formato: 2, atualizado_em: '2026-10-29T09:00', publicado_em: null, itens: { 'regras:bonusConfronto': 7 } };
  await comAjustes(DOIS_OBJETOS, nav, async ({ gravados }) => {
    const aj = await carregarAjustes(CONFIG);
    assert.equal(aj.ativo.regras.bonusConfronto, 7);
    assert.deepEqual(gravados, []);
  });
  // outros jeitos de não poder ler; 404 é "ninguém publicou", sem aviso
  for (const [txt, re] of [['[1, 2]', /não é um objeto JSON/], ['{"regras": ', /^JSON inválido: /], [500, /HTTP 500/]]) {
    await comAjustes(txt, undefined, async () => assert.match((await carregarAjustes(CONFIG)).erroPublicado, re));
  }
  await comAjustes(null, undefined, async () => {
    const aj = await carregarAjustes(CONFIG);
    assert.deepEqual([aj.erroPublicado, aj.situacaoPublicado, aj.existePublicado], [null, 'ausente', false]);
  });
  // a mensagem do Firefox para o mesmo erro também é reconhecida
  assert.match(A.motivoJsonInvalido(new SyntaxError('JSON.parse: unexpected non-whitespace character after JSON data at line 5 column 1 of the JSON data')),
    /mais de um objeto JSON seguido/);
});

test('ajustes: navegador igual ao publicado => o aviso some e nada sobra no navegador', async () => {
  // formato novo (só as diferenças) e formato antigo (cópia completa do arquivo), os dois iguais ao publicado
  const novo = { formato: 2, atualizado_em: '2026-10-29T16:00', publicado_em: '2026-10-29T15:00',
    itens: { 'regras:gatilhoPontos.RT': 17, 'canais:X2': { canal: 'Segmentada', sub: 'Mini' } } };
  for (const salvo of [novo, Object.assign({}, PUB, { atualizado_em: '2026-10-29T14:00' })]) {
    await comAjustes(JSON.stringify(PUB), salvo, async ({ ler, gravados }) => {
      const aj = await carregarAjustes(CONFIG);
      assert.deepEqual([aj.origem, aj.diferencas, aj.navegador, aj.navegadorAnterior], ['publicado', [], null, false]);
      assert.equal(aj.ativo, aj.publicado);
      assert.equal(ler(), null);
      assert.deepEqual(gravados, [['remove', A.AJUSTES_LOCAL]]);
      assert.ok(aj.descartados.includes('canais:X2'));
    });
  }
});

test('ajustes: navegador diferente do publicado => vale por cima, item a item, e o aviso lista só as diferenças', async () => {
  const salvo = { formato: 2, atualizado_em: '2026-10-29T16:00', publicado_em: '2026-10-29T15:00', itens: {
    'regras:gatilhoPontos.RT': 18,                         // diferente do publicado
    'canais:X2': { canal: 'Segmentada', sub: 'Mini' },     // igual ao publicado: sai do navegador
    'canais:X3': { canal: 'Mista', sub: null },            // só no navegador
    'confrontos:10|Sv. Fx.1#Mista|Sv. Fx.4#Mista': null,   // tira o confronto publicado
  } };
  await comAjustes(JSON.stringify(PUB), salvo, async ({ ler }) => {
    const aj = await carregarAjustes(CONFIG);
    assert.equal(aj.origem, 'local');
    assert.deepEqual(aj.diferencas.map((d) => [d.rotulo, d.textoPublicado, d.textoNovo]), [
      ['Mínimo da Rota (pontos no mês)', '17', '18'],
      ['Canal da rota X3', 'padrão da base', 'Mista'],
      ['Confronto de outubro: Sv. Fx.1 · Mista × Sv. Fx.4 · Mista', 'pilar Sucos', 'não existe'],
    ]);
    // em uso: o publicado com as diferenças do navegador (o X2 e o mínimo do SV continuam vindo do publicado)
    assert.deepEqual(aj.ativo.regras.gatilhoPontos, { SV: 60, RT: 18 });
    assert.deepEqual(aj.ativo.canais, { X2: { canal: 'Segmentada', sub: 'Mini' }, X3: { canal: 'Mista', sub: null } });
    assert.deepEqual(aj.ativo.confrontos, []);
    assert.deepEqual(Object.keys(ler().itens), ['regras:gatilhoPontos.RT', 'canais:X3', 'confrontos:10|Sv. Fx.1#Mista|Sv. Fx.4#Mista']);
    assert.deepEqual(aj.descartados, ['canais:X2']);
    assert.equal(aj.navegadorAnterior, false);
  });
});

test('ajustes: cópia antiga do navegador, anterior ao publicado => aviso, e o que falta nela continua vindo do publicado', async () => {
  // cópia completa salva às 09:00 (formato de antes), sem o mínimo 17, o X2 e o confronto publicados às 15:00
  const copia = { versao: 1, atualizado_em: '2026-10-29T09:00', regras: { bonusConfronto: 7 }, canais: { X3: { canal: 'Mista', sub: null, segmento: null } } };
  await comAjustes(JSON.stringify(PUB), copia, async ({ ler }) => {
    const aj = await carregarAjustes(CONFIG);
    assert.equal(aj.navegadorAnterior, true);
    assert.deepEqual(aj.diferencas.map((d) => d.chave), ['regras:bonusConfronto', 'canais:X3']);
    assert.equal(aj.ativo.regras.gatilhoPontos.RT, 17); // publicado depois da cópia: vale (decisão de 29/10/2026)
    assert.ok(aj.ativo.canais.X2);
    assert.equal(aj.ativo.confrontos.length, 1);
    assert.deepEqual(ler(), { formato: 2, atualizado_em: '2026-10-29T09:00', publicado_em: '2026-10-29T15:00',
      itens: { 'regras:bonusConfronto': 7, 'canais:X3': { canal: 'Mista', sub: null } } }); // convertida para o formato novo
  });
  // salvo de novo depois do publicado: sem o aviso de anterior
  await comAjustes(JSON.stringify(PUB), { formato: 2, atualizado_em: '2026-10-29T16:00', itens: { 'regras:bonusConfronto': 7 } }, async () => {
    assert.equal((await carregarAjustes(CONFIG)).navegadorAnterior, false);
  });
});

test('ajustes: o formulário abre com o estado em uso e "Alterações para publicar" lista só o que difere do publicado', async () => {
  const salvo = { formato: 2, atualizado_em: '2026-10-29T16:00', publicado_em: '2026-10-29T15:00', itens: { 'regras:gatilhoPontos.RT': 18 } };
  await comAjustes(JSON.stringify(PUB), salvo, async () => {
    const aj = await carregarAjustes(CONFIG);
    // a tela aplica o ativo nas REGRAS e abre o formulário com elas: mínimo 18 (navegador) e SV 60 (publicado)
    const regras = JSON.parse(JSON.stringify(A.MotorPadrao));
    aplicarAjustes(aj.ativo, JSON.parse(JSON.stringify(CONFIG)), regras);
    assert.deepEqual(regras.gatilhoPontos, { SV: 60, RT: 18 });
    // formulário sem mexer = estado em uso: a lista para publicar é só o que o navegador muda
    assert.deepEqual(A.diferencasAjustes(aj.publicado, aj.ativo).map((d) => d.chave), ['regras:gatilhoPontos.RT']);
    // o admin volta o mínimo para 17 e muda o bônus para 6: só o bônus fica na lista (o que já está publicado não aparece)
    const form = normalizarAjustes({ regras: { gatilhoPontos: { SV: 60, RT: 17 }, bonusConfronto: 6 }, canais: PUB.canais, confrontos: PUB.confrontos });
    const dif = A.diferencasAjustes(aj.publicado, form);
    assert.deepEqual(dif.map((d) => [d.rotulo, d.textoPublicado, d.textoNovo]), [['Bônus do confronto (pontos)', '5', '6']]);
    // salvar neste navegador guarda só isso; tudo igual ao publicado não guarda nada
    assert.deepEqual(A.navegadorParaSalvar(dif, aj.publicado, '2026-10-29T17:00'),
      { formato: 2, atualizado_em: '2026-10-29T17:00', publicado_em: '2026-10-29T15:00', itens: { 'regras:bonusConfronto': 6 } });
    assert.equal(A.navegadorParaSalvar(A.diferencasAjustes(aj.publicado, aj.publicado), aj.publicado, 'x'), null);
    // "descartar este": sem nenhum item, o navegador fica vazio
    assert.equal(A.semItens(salvo, ['regras:gatilhoPontos.RT']), null);
  });
});

test('ajustes: item inválido salvo no navegador é ignorado com aviso e, nele, vale o publicado', async () => {
  const salvo = { formato: 2, atualizado_em: '2026-10-29T16:00', itens: { 'regras:gatilhoPontos.RT': 'dezoito', 'canais:X3': { canal: 'Varejo' } } };
  await comAjustes(JSON.stringify(PUB), salvo, async ({ ler }) => {
    const aj = await carregarAjustes(CONFIG);
    assert.deepEqual(aj.diferencas, []);
    assert.equal(aj.ativo.regras.gatilhoPontos.RT, 17);
    assert.equal(aj.avisos.filter((t) => t.startsWith('neste navegador:')).length, 2);
    assert.equal(ler(), null);
  });
  // ajustes salvos ilegíveis: aviso, e o navegador não é apagado sozinho
  await comAjustes(JSON.stringify(PUB), '{ruim', async ({ gravados }) => {
    const aj = await carregarAjustes(CONFIG);
    assert.match(aj.avisos.join('|'), /ilegíveis/);
    assert.deepEqual(gravados, []);
  });
});

test('ajustes: valor inválido num ajustes.json válido vira aviso (regras, pilares, agrupadores, confrontos e campo desconhecido)', async () => {
  const avisos = [];
  const aj = normalizarAjustes({
    regras: { gatilhoPontos: { RT: 17 }, faixas: [{ min: 90, pontos: 2 }], gatilhoVolumePct: '95', premiadas: { RT: { Mista: 40 } }, extra: 1 },
    pilares: { Mista: ['Volume Sucos', 'Volume Sucos'], Varejo: [] }, agrupadores: [{ id: 'Água', nome: 'Água', agrupador: 'Agua' }],
    confrontos: [{ mes: 9, id_sv_desafiante: 'Sv. Fx.1#Mista', id_sv_desafiado: 'Sv. Fx.4#Mista', pilar: 'Volume Sucos' }],
    gatilhoPontos: { RT: 17 }, canais: { X1: { canal: 'Mista' } } }, avisos);
  assert.deepEqual(aj.regras, {});
  assert.deepEqual(Object.keys(aj.canais), ['X1']);
  for (const re of [/campo "gatilhoPontos" desconhecido/, /regras\.extra desconhecido/, /mínimo de pontos \{"RT":17\}: precisa de SV e RT/,
    /faixas de pontos/, /gatilho de Refrigerantes "95"/, /posições premiadas/, /pilares coringa da Mista/, /pilares coringa do canal "Varejo"/,
    /agrupador extra "Água"/, /confronto 1 da lista: mês fora do Q4/]) assert.match(avisos.join('|'), re);
  assert.equal(avisos.length, 10);
  // no carregarAjustes, os avisos do publicado vão para a faixa da tela (avisosPublicado)
  await comAjustes(JSON.stringify({ regras: { gatilhoPontos: { RT: 17 } } }), undefined, async () => {
    const r = await carregarAjustes(CONFIG);
    assert.deepEqual([r.avisosPublicado.length, r.situacaoPublicado, r.ativo], [1, 'vazio', null]);
  });
});

test('ajustes: ajustes.json antigo (sem campos novos) lido pelo carregarAjustes dá o mesmo resultado de hoje (regressão de outubro)', async () => {
  const fx = require('./fixtures/regressao-ajustes-antigo.json');
  await comAjustes(JSON.stringify(fx.ajustes), undefined, async () => {
    const aj = await carregarAjustes(CONFIG);
    assert.deepEqual([aj.erroPublicado, aj.avisos, aj.diferencas, aj.origem], [null, [], [], 'publicado']);
    assert.deepEqual(aj.ativo, normalizarAjustes(fx.ajustes));
    const d = A.comCanais(require('../data/data.json'), aj.ativo.canais);
    const res = M.calcular(montarEntrada(d, CONFIG).entrada);
    assert.deepEqual(res.pessoas.map((p) => [p.id, p.canal, p.pontosMes, p.volume.pctTexto, p.elegivel, p.posicao, p.status]), fx.esperado.res);
  });
});

test('mínimo do Consultor: com 17 (ajustes.json), quem tem 17 a 19 pontos e o gatilho de volume tem status; com 16, "-"', async () => {
  // rotas fictícias na Mista de outubro: Missões Guiadas validada (3) + 4 pilares de volume; Refrigerantes em 96% para todas
  const pct = { R16: [105, 105, 100, 80], R17: [105, 105, 90, 90], R19: [105, 105, 100, 100], R20: [105, 105, 105, 90] };
  const pil = ['Volume Sabores', 'Volume Retornáveis', 'Volume Sucos', 'Volume Powerade'];
  const entrada = { mesRef: 10, pilaresConfig: CONFIG.pilaresConfig, confrontos: [],
    pessoas: Object.keys(pct).map((id) => ({ id, nome: id, cargo: 'RT', canal: 'Mista', unidade: 'Fx', id_supervisor: null })),
    medidas: Object.entries(pct).flatMap(([id, ps]) => ps.map((p, i) => ({ id, mes: 10, pilar: pil[i], meta: 100, real: p, online: 0 }))
      .concat([{ id, mes: 10, pilar: 'Refrigerantes', meta: 100, real: 96, online: 0 }])) };
  const statusCom = async (texto) => {
    const guardado = JSON.parse(JSON.stringify(M.REGRAS));
    try {
      const aj = await comAjustes(texto, undefined, () => carregarAjustes(CONFIG));
      aplicarAjustes(aj.ativo, JSON.parse(JSON.stringify(CONFIG)), M.REGRAS);
      return Object.fromEntries(M.calcular(entrada).pessoas.map((p) => [p.id, [p.pontosMes, p.status]]));
    } finally { Object.assign(M.REGRAS, guardado); }
  };
  const premiadas = { SV: { Mista: 12, Segmentada: 2 }, RT: { Mista: 2, Segmentada: 10 } }; // 2 premiadas, para ver os dois status
  assert.deepEqual(await statusCom(JSON.stringify({ regras: { gatilhoPontos: { SV: 60, RT: 17 }, premiadas } })), {
    R16: [16, '-'], R17: [17, 'Bateu, mas não está no total'], R19: [19, 'No total'], R20: [20, 'No total'] });
  assert.deepEqual(await statusCom(JSON.stringify({ regras: { premiadas } })), { // padrão do motor (20)
    R16: [16, '-'], R17: [17, '-'], R19: [19, '-'], R20: [20, 'No total'] });
});

test('mínimo de pontos: o texto exibido não tem 17, 20 nem 60 fixos (usa R.gatilhoPontos)', () => {
  const fs = require('fs'), path = require('path');
  const tpl = fs.readFileSync(path.join(__dirname, '../src/app.tpl.html'), 'utf8').replace(/<style>[\s\S]*?<\/style>/g, '');
  const achados = tpl.split('\n').filter((l) => /(^|[^\w.,#-])(17|20|60)(?![\w%])/.test(l)).map((l) => l.trim());
  assert.deepEqual(achados, ['let PAGE = 17;']); // tamanho inicial da página da tabela, não é ponto
  assert.match(tpl, /R\.gatilhoPontos\.RT/);
  assert.match(tpl, /R\.gatilhoPontos\.SV/);
  // o motor tem um texto com 60 fixo (avisoOutubro) que o painel não mostra; se passar a mostrar, troque por R.gatilhoPontos
  assert.doesNotMatch(tpl, /avisoOutubro/);
});
