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

test('API em outro mês: null (os pilares do mês vêm de CONFIG)', () => {
  const nov = { ...INDEX, mes_referencia: { anomes: '202611', rotulo: 'Novembro/26', fechamento: false } };
  assert.equal(dadosDaApi(nov, GERENCIAS, BASE, CONFIG), null);
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
    }), cfg, M.REGRAS);
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
  aplicarAjustes(aj, cfg, JSON.parse(JSON.stringify(M.REGRAS)));
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
