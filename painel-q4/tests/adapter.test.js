const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/motor.js');
const { CONFIG, montarEntrada, dadosDaApi, carregarDados, normalizarAjustes, normalizarConfrontos, aplicarAjustes,
        carregarAjustes, urlPublicacao, montarEstrat, CHAVE_REFRI } = require('../src/adapter.js');

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
  const aj = normalizarAjustes({ confrontos: [
    { mes: 10, id_sv_desafiante: 'Sv. An.1#Mista', id_sv_desafiado: 'Sv. An.3#Mista', pilar: 'Volume Sabores' },
  ] });
  const res = M.calcular(montarEntrada(dadosDaApi(INDEX, gerencias, base, CONFIG), CONFIG, aj.confrontos).entrada);
  const det = res.confrontos[0];
  assert.equal(det.valido, true);
  assert.equal(det.vencedor, 'Sv. An.3#Mista');                                    // 115% contra 105% em Sabores
  assert.equal(res.pessoas.find((x) => x.id === 'Sv. An.3#Mista').pontosConfronto, M.REGRAS.bonusConfronto);
  assert.equal(res.pessoas.find((x) => x.id === 'A14').pontosConfronto, M.REGRAS.bonusConfronto); // a mesa inteira
  assert.equal(res.pessoas.find((x) => x.id === 'A12').pontosConfronto, 0);        // mesa de quem perdeu não ganha
  assert.deepEqual(M.conferir(res), []);
  // sem confronto, ninguém ganha o bônus
  const semConf = M.calcular(montarEntrada(dadosDaApi(INDEX, gerencias, base, CONFIG), CONFIG).entrada);
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
    assert.equal(d.rotas, BASE.rotas);
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
  assert.equal(out.rotas, BASE.rotas);
  const nov = await falha(new Date(2026, 10, 4));
  assert.equal(nov.meta.origem, 'base');
  assert.match(nov.meta.semCalculo, /^Sem dados de novembro: API indisponível/);
  assert.deepEqual(nov.rotas, []);
});

test('virada: pilares coringa do admin valem para o mês de referência e nunca para mês sem pilares 1 a 3', () => {
  const aj = normalizarAjustes({ pilares: { Mista: ['Volume Sucos', 'Volume Powerade'] } });
  const cfg = JSON.parse(JSON.stringify(CONFIG));
  aplicarCoringas(aj, cfg, 11);
  assert.deepEqual(cfg.pilaresConfig.find((c) => c.mes === 11 && c.canal === 'Mista').pilares, []);
});

// ── regressão: outubro continua idêntico ao de antes da virada ──
const resumoRes = (res) => res.pessoas.map((p) => [p.id, p.cargo, p.canal, p.pilares.map((x) => [x.nome, x.pontos, x.pctTexto]),
  p.pontosMes, p.pontosAcumulados ?? null, p.volume.pctTexto, p.volume.atingido, p.elegivel, p.posicao, p.status]);

test('regressão: outubro pela API (fixture) dá o mesmo resultado de antes da virada', () => {
  const res = M.calcular(montarEntrada(dadosDaApi(INDEX, GERENCIAS, BASE, CONFIG), CONFIG).entrada);
  assert.deepEqual(resumoRes(res), [
    ['A11', 'RT', 'Segmentada', [['Volume Sabores', 0, '80,0%'], ['Volume Refri Single', 3, '101,6%'], ['Volume Powerade', 0, '80,0%'], ['Volume Sucos', 0, '85,0%'], ['Missões Guiadas', 3, '100,0%']], 6, null, '91,0%', false, false, null, '-'],
    ['A12', 'RT', 'Mista', [['Volume Sabores', 5, '105,0%'], ['Volume Retornáveis', 3, '103,3%'], ['Missões Guiadas', 3, '100,0%'], ['Volume Sucos', 5, '105,0%'], ['Volume Powerade', 5, '106,0%']], 21, null, '99,3%', true, true, 1, 'No total'],
    ['Sv. An.1#Segmentada', 'SV', 'Segmentada', [['Volume Sabores', 0, '80,0%'], ['Volume Refri Single', 3, '101,6%'], ['Volume Powerade', 0, '80,0%'], ['Volume Sucos', 0, '85,0%'], ['Missões Guiadas', 3, '100,0%']], 6, 6, '91,0%', false, false, null, '-'],
    ['Sv. An.1#Mista', 'SV', 'Mista', [['Volume Sabores', 5, '105,0%'], ['Volume Retornáveis', 3, '103,3%'], ['Missões Guiadas', 3, '100,0%'], ['Volume Sucos', 5, '105,0%'], ['Volume Powerade', 5, '106,0%']], 21, 21, '99,3%', true, false, null, '-'],
  ]);
  assert.deepEqual(res.mesesIncompletos, []);
});

test('regressão: outubro pela base embutida (data.json) dá o mesmo resultado de antes da virada', () => {
  const base = require('../data/data.json');
  const esperado = require('./fixtures/regressao-outubro-base.json').base;
  const res = M.calcular(montarEntrada(base, CONFIG).entrada);
  assert.deepEqual(resumoRes(res), esperado);
});
