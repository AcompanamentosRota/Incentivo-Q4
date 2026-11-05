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
  const dez = { ...INDEX, mes_referencia: { anomes: '202612', rotulo: 'Dezembro/26', fechamento: false } };
  const d = dadosDaApi(dez, GERENCIAS, BASE, CONFIG);
  assert.equal(d.meta.mes, 12);
  assert.equal(d.meta.semCalculo, 'Pilares de dezembro ainda não configurados');
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

test('confrontos do admin chegam ao motor e dão o bônus só ao SV vencedor, no fechamento do mês (a mesa não recebe, 03/11/2026)', () => {
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
  // mês aberto (a API não está em fechamento): o vencedor já aparece, mas o +5 fica pendente (regra de 30/10/2026), só no SV
  const aberto = M.calcular(montarEntrada(dados, CONFIG, aj.confrontos).entrada);
  assert.equal(aberto.confrontos[0].vencedor, 'Sv. An.3#Mista');
  assert.deepEqual(['Sv. An.3#Mista', 'A14'].map((id) => { const p = aberto.pessoas.find((x) => x.id === id); return [p.pontosConfronto, p.bonusPendente]; }),
    [[0, M.REGRAS.bonusConfronto], [0, 0]]);
  // período de fechamento (meta.fechamento da API): o adaptador avisa o motor e o +5 entra
  const res = M.calcular(montarEntrada({ ...dados, meta: { ...dados.meta, fechamento: true } }, CONFIG, aj.confrontos).entrada);
  const det = res.confrontos[0];
  assert.equal(det.valido, true);
  assert.equal(det.mesFechado, true);
  assert.equal(det.vencedor, 'Sv. An.3#Mista');                                    // 115% contra 92,5% em Sabores (A11 + A12)
  assert.equal(res.pessoas.find((x) => x.id === 'Sv. An.3#Mista').pontosConfronto, M.REGRAS.bonusConfronto);
  assert.equal(res.pessoas.find((x) => x.id === 'A14').pontosConfronto, 0);        // a mesa do vencedor não recebe
  assert.equal(res.pessoas.find((x) => x.id === 'A14').id_supervisor, 'Sv. An.3#Mista'); // mas continua na mesa
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
    // data fixa em outubro: a base embutida só vale no mês dela (sem `hoje`, o teste dependia do relógio)
    const d = await carregarDados(BASE, CONFIG, null, new Date(2026, 9, 28));
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
// novembro (só nos testes): coringas 4 e 5 diferentes dos reais, para exercitar a virada com pilares que mudam de mês
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
  simulado: false, fechamento_final: true, oficial_em: '2026-11-12T14:30:00', fonte_selo: 'flash',
  campos: ['rota', 'gerencia', 'supervisao', 'produtos'], campos_produto: ['meta', 'realizado'],
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
  fechados: [{ anomes: '202610', rotulo: 'Outubro/26', arquivo: 'fechado/202610.json', gerado_em: '2026-11-03T18:46:02',
               fechamento_final: true, oficial_em: '2026-11-12T14:30:00', fonte_selo: 'flash' }],
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
// dezembro: desde 04/11/2026 é o único mês do Q4 sem os 5 pilares no CONFIG (coringas 4 e 5 a decidir)
const API_DEZ = { ...API_NOV, 'index.json': { ...INDEX_NOV, atualizado_em: '2026-12-02T10:00:00',
  mes_referencia: { anomes: '202612', rotulo: 'Dezembro/26', fechamento: false } } };
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
  const { d, res } = await comApi(API_DEZ, async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = async (url) => { lidos.push(url); return orig(url); };
    const d = await carregarDados(BASE_V, CONFIG);       // CONFIG real: dezembro ainda sem os coringas 4 e 5
    return { d, res: d.meta.semCalculo ? null : 'calculou' };
  });
  assert.equal(d.meta.semCalculo, 'Pilares de dezembro ainda não configurados');
  assert.match(d.meta.aviso, /^Pilares de dezembro ainda não configurados/);
  assert.equal(d.meta.origem, 'api');
  assert.equal(d.meta.mes, 12);                          // nunca vira novembro nem outubro
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
  // regra de 30/10/2026: outubro (fechado) entra no acumulado; novembro (aberto) fica pendente até o fechamento
  assert.deepEqual(sv1.porMes.map((m) => [m.pontosConfronto, m.bonusPendente]), [[0, 0], [0, 5]]);
  assert.deepEqual(sv2.porMes.map((m) => [m.pontosConfronto, m.bonusPendente]), [[5, 0], [0, 0]]);
  assert.equal(sv1.pontosAcumulados, 21);
  assert.deepEqual([pessoaDe(res, 'N1').pontosConfronto, pessoaDe(res, 'N1').bonusPendente], [0, 0]); // a mesa não recebe (03/11/2026)
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
  assert.deepEqual(nov.d.meta.acumulado.usados, [{ mes: 10, anomes: '202610', rotulo: 'Outubro/26', final: true,
    oficialEm: '2026-11-12T14:30:00', fonteSelo: 'flash',
    estado: { previa: false, marcado: false, oficialEm: '2026-11-12T14:30:00', curto: 'oficial', longo: 'Oficial, selado em 12/11/2026' } }]);
  assert.deepEqual(nov.d.meta.acumulado.previa, []);
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
  const vazio = JSON.parse(JSON.stringify(CONFIG));
  mista(vazio, 12).length = 0; // mês sem nenhum pilar
  const antes = JSON.parse(JSON.stringify(cfg.pilaresConfig));
  aplicarCoringas(aj, cfg, 12);   // dezembro só com os pilares 1 a 3 no CONFIG: o admin não completa
  aplicarCoringas(aj, vazio, 12); // mês sem nenhum pilar: idem
  assert.deepEqual(cfg.pilaresConfig, antes);
  assert.deepEqual(mista(cfg, 12).map((p) => p.nome), ['Volume Sabores', 'Volume Retornáveis', 'Missões Guiadas']);
  assert.deepEqual(mista(vazio, 12), []);
  // mês com os 5 pilares (outubro e, desde 04/11/2026, novembro): o admin troca os coringas 4 e 5 do mês de referência
  for (const mes of [10, 11]) {
    aplicarCoringas(normalizarAjustes({ pilares: { Mista: ['Volume Refri Single', 'Volume Sucos'] } }), cfg, mes);
    assert.deepEqual(mista(cfg, mes).map((p) => p.nome), ['Volume Sabores', 'Volume Retornáveis', 'Missões Guiadas', 'Volume Refri Single', 'Volume Sucos'], String(mes));
  }
});

// ── regressão: outubro continua idêntico ao de antes da virada ──
const resumoRes = (res) => res.pessoas.map((p) => [p.id, p.cargo, p.canal, p.pilares.map((x) => [x.nome, x.pontos, x.pctTexto]),
  p.pontosMes, p.pontosAcumulados ?? null, p.volume.pctTexto, p.volume.atingido, p.elegivel, p.posicao, p.status]);

test('regressão: outubro pela API (fixture) dá o mesmo resultado de antes da virada', () => {
  const res = M.calcular(montarEntrada(dadosDaApi(INDEX, GERENCIAS, BASE, CONFIG), CONFIG).entrada);
  assert.deepEqual(resumoRes(res), [
    ['A11', 'RT', 'Segmentada', [['Volume Sabores', 0, '80,0%'], ['Volume Refri Single', 3, '101,6%'], ['Volume Powerade', 0, '80,0%'], ['Volume Sucos', 0, '85,0%'], ['Missões Guiadas', 3, '100,0%']], 6, null, '91,0%', false, false, null, '-'],
    ['A12', 'RT', 'Mista', [['Volume Sabores', 5, '105,0%'], ['Volume Retornáveis', 3, '103,3%'], ['Missões Guiadas', 3, '100,0%'], ['Volume Sucos', 5, '105,0%'], ['Volume Powerade', 5, '106,0%']], 21, null, '99,3%', true, true, 1, 'Bateu!'],
    // Sv. An.1 tem 1 rota Mista e 1 Segmentada: empate, o SV fica sem canal (fora do ranking) até o admin escolher (29/10/2026)
  ]);
  assert.deepEqual(res.mesesIncompletos, []);
});

// As fixtures de regressão foram gravadas quando o mínimo do Consultor no padrão do motor era 20 (hoje é 17,
// desde 29/10/2026). Compará-las com o mínimo de então mantém a regressão inteira: pilares, pontos, % e canais
// não podem mudar. O que o 17 muda está no teste do impacto, logo abaixo.
const comMinimoRT = (valor, fn) => {
  const guardado = M.REGRAS.gatilhoPontos.RT;
  M.REGRAS.gatilhoPontos.RT = valor;
  try { return fn(); } finally { M.REGRAS.gatilhoPontos.RT = guardado; }
};

test('regressão: outubro pela base embutida (data.json) dá o mesmo resultado de antes da virada', () => {
  const base = require('../data/data.json');
  const esperado = require('./fixtures/regressao-outubro-base.json').base;
  const res = comMinimoRT(20, () => resumoRes(M.calcular(montarEntrada(base, CONFIG).entrada)));
  assert.deepEqual(res, esperado);
});

test('mínimo 17 no padrão (29/10/2026): em outubro mudam só elegibilidade, posição e status; pontos, % e canais ficam iguais', () => {
  const base = require('../data/data.json');
  const esperado = require('./fixtures/regressao-outubro-base.json').base; // gravada com o mínimo 20
  const agora = resumoRes(M.calcular(montarEntrada(base, CONFIG).entrada)); // padrão de hoje: 17
  // resumoRes: [id, cargo, canal, pilares, pontosMes, pontosAcumulados, pctTexto, volume.atingido, elegivel, posicao, status]
  assert.equal(agora.length, esperado.length);
  assert.deepEqual(agora.map((l) => l.slice(0, 8)), esperado.map((l) => l.slice(0, 8)));
  const mudaram = agora.filter((l, i) => JSON.stringify(l.slice(8)) !== JSON.stringify(esperado[i].slice(8)));
  // só Consultores com 17, 18 ou 19 pontos e o gatilho de volume: antes não batiam o mínimo de 20, agora batem
  assert.ok(mudaram.length > 0, 'o 17 tem de mudar alguma coisa no padrão puro');
  for (const l of mudaram) {
    assert.deepEqual([l[1], l[7], l[8]], ['RT', true, true], `${l[0]}: só Consultor com volume passa a ser elegível`);
    assert.ok(l[4] >= 17 && l[4] < 20, `${l[0]}: ${l[4]} pontos fora da faixa 17-19`);
  }
  // nenhum SV muda: o mínimo do SV continua 60
  assert.equal(agora.filter((l) => l[1] === 'SV').length, esperado.filter((l) => l[1] === 'SV').length);
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
// Coringas FICTÍCIOS, só nos testes (os de dezembro ainda não foram decididos pelo Back Office): sempre nas posições 4 e 5
const CORINGAS_TESTE = { Mista: ['Volume Sucos', 'Volume Powerade'], Segmentada: ['Volume Sucos', 'Volume Retornáveis'] };
const comMissoes = (cfg) => { cfg.produtoDaApi['Missoes Guiadas'] = 'missoes'; cfg.fonteDoPilar['Missões Guiadas'] = 'Missoes Guiadas'; return cfg; };
const cfgComCoringas = (meses, canais = ['Mista', 'Segmentada'], missoes = false) => {
  const cfg = JSON.parse(JSON.stringify(CONFIG));
  for (const c of cfg.pilaresConfig) if (meses.includes(c.mes) && canais.includes(c.canal))
    c.pilares = c.pilares.slice(0, 3).concat(CORINGAS_TESTE[c.canal].map((nome) => ({ nome, tipo: 'volume' })));
  return missoes ? comMissoes(cfg) : cfg;
};
// Mês só com os pilares 1 a 3, como dezembro no CONFIG (coringas 4 e 5 a decidir)
const cfgSemCoringas = (meses, canais = ['Mista', 'Segmentada']) => {
  const cfg = JSON.parse(JSON.stringify(CONFIG));
  for (const c of cfg.pilaresConfig) if (meses.includes(c.mes) && canais.includes(c.canal)) c.pilares = c.pilares.slice(0, 3);
  return cfg;
};
const calcularPx = (cfg, arquivos) => comApi(arquivos, async () => {
  const d = await carregarDados(BASE_P, cfg);
  return { d, res: d.meta.semCalculo ? null : M.calcular(montarEntrada(d, cfg).entrada) };
});
const pts = (p) => p.pilares.map((x) => [x.nome, x.pontos]);
const nomes = (cfg, mes, canal) => pilaresDefinidos(cfg, mes, canal).map((p) => [p.nome, p.tipo]);

test('pilares de novembro: o CONFIG traz os 5 pilares, com os coringas 4 e 5 iguais aos de outubro (04/11/2026)', () => {
  const mista = [['Volume Sabores', 'volume'], ['Volume Retornáveis', 'volume'], ['Missões Guiadas', 'missao'],
                 ['Volume Sucos', 'volume'], ['Volume Powerade', 'volume']];
  const seg = [['Volume Sabores', 'volume'], ['Volume Refri Single', 'volume'], ['Volume Powerade', 'volume'], // "Volume Individuais" = Refri Single
               ['Volume Sucos', 'volume'], ['Missões Guiadas', 'missao']];
  // novembro: pilares 1 a 3 do Back Office (29/10/2026) + coringas 4 e 5 iguais aos de outubro (Karen, 04/11/2026)
  assert.deepEqual([nomes(CONFIG, 11, 'Mista'), nomes(CONFIG, 11, 'Segmentada')], [mista, seg]);
  assert.deepEqual([nomes(CONFIG, 10, 'Mista'), nomes(CONFIG, 10, 'Segmentada')], [mista, seg]); // iguais aos de outubro
  assert.deepEqual([nomes(CONFIG, 11, 'Mista').slice(3), nomes(CONFIG, 11, 'Segmentada').slice(3)],
                   [[['Volume Sucos', 'volume'], ['Volume Powerade', 'volume']], [['Volume Sucos', 'volume'], ['Missões Guiadas', 'missao']]]);
  assert.equal(mesConfigurado(CONFIG, 11), true);
  // dezembro continua só com os pilares 1 a 3: coringas 4 e 5 ainda a decidir
  assert.deepEqual([nomes(CONFIG, 12, 'Mista'), nomes(CONFIG, 12, 'Segmentada')], [mista.slice(0, 3), seg.slice(0, 3)]);
  assert.deepEqual([pilaresDoMes(CONFIG, 12, 'Mista'), pilaresDoMes(CONFIG, 12, 'Segmentada'), mesConfigurado(CONFIG, 12)], [null, null, false]);
  assert.equal(PILARES_NO_MES, 5);
  assert.equal(CONFIG.fonteDoPilar['Missões Guiadas'], undefined); // sem fonte ainda: nunca assume 100%
  // todo pilar de volume de novembro e dezembro lê um agrupador fixo da API (nenhum agrupador extra é necessário)
  for (const c of CONFIG.pilaresConfig.filter((x) => x.mes > 10)) for (const p of c.pilares.filter((x) => x.tipo === 'volume'))
    assert.ok(['sabores', 'retornaveis', 'individuais', 'powerade', 'sucos'].includes(CONFIG.produtoDaApi[CONFIG.fonteDoPilar[p.nome]]), p.nome);
});

test('pilares de novembro: outubro continua idêntico (nomes, tipos e ordem dos 5 pilares de cada canal)', () => {
  assert.deepEqual([nomes(CONFIG, 10, 'Mista'), nomes(CONFIG, 10, 'Segmentada')], [
    [['Volume Sabores', 'volume'], ['Volume Retornáveis', 'volume'], ['Missões Guiadas', 'missao'], ['Volume Sucos', 'volume'], ['Volume Powerade', 'volume']],
    [['Volume Sabores', 'volume'], ['Volume Refri Single', 'volume'], ['Volume Powerade', 'volume'], ['Volume Sucos', 'volume'], ['Missões Guiadas', 'missao']],
  ]);
  assert.equal(mesConfigurado(CONFIG, 10), true);
});

test('pilares de novembro: com os 5 pilares do CONFIG (coringas de outubro), calcula os pontos de cada canal', async () => {
  const { d, res } = await calcularPx(CONFIG, apiPx(...NOV_PX, [OUT_PX]));
  assert.deepEqual([d.meta.mes, d.meta.semCalculo, d.meta.acumulado.faltando], [11, null, []]);
  // P1 (Mista): Sabores 210/200 (5) · Retornáveis 95% (2) · Missões sem fonte (0) · Sucos 100% (3) · Powerade 44/50 = 88% (0)
  assert.deepEqual(pts(pessoaDe(res, 'P1')), [['Volume Sabores', 5], ['Volume Retornáveis', 2], ['Missões Guiadas', 0], ['Volume Sucos', 3], ['Volume Powerade', 0]]);
  // P2 (Segmentada): Sabores 99,99% (2, na tela 99,9%) · Refri Single 105% (5) · Powerade 100% (3) · Sucos 89,999% (0) · Missões sem fonte (0)
  const p2 = pessoaDe(res, 'P2');
  assert.deepEqual(pts(p2), [['Volume Sabores', 2], ['Volume Refri Single', 5], ['Volume Powerade', 3], ['Volume Sucos', 0], ['Missões Guiadas', 0]]);
  assert.equal(p2.pilares[0].pctTexto, '99,9%');
  // P3 (Segmentada): Sabores 120% (5) · Refri Single 90% (2) · Powerade 50% (0) · Sucos 105% (5) · Missões sem fonte (0)
  assert.deepEqual(pts(pessoaDe(res, 'P3')).map((x) => x[1]), [5, 2, 0, 5, 0]);
  assert.deepEqual(['P1', 'P2', 'P3'].map((id) => pessoaDe(res, id).pontosMes), [10, 10, 12]);
  // SV.PX.2 = P2 + P3: Sabores 219,99/200 (5) · Refri Single 300/300 (3) · Powerade 150/200 (0) · Sucos 194,999/200 (2) · Missões (0)
  const sv2 = pessoaDe(res, 'Sv. Px.2#Segmentada');
  assert.deepEqual(pts(sv2).map((x) => x[1]), [5, 3, 0, 2, 0]);
  assert.deepEqual([sv2.pontosMes, pessoaDe(res, 'Sv. Px.1#Mista').pontosMes], [10, 10]);
  // acumulado do SV: outubro fechado (pilares de outubro, Missões validada) + novembro corrente
  assert.deepEqual(sv2.porMes.map((m) => [m.mes, m.pontosPilares]), [[10, 13], [11, 10]]);
  assert.deepEqual([sv2.pontosAcumulados, sv2.acumuladoIncompleto], [23, []]);
  assert.deepEqual(M.conferir(res), []);
});

test('pilares de novembro: mês sem os 5 pilares mostra o aviso e não calcula (dezembro e um canal só completo)', async () => {
  for (const [cfg, api, aviso] of [
    [CONFIG, apiPx('202612', 'Dezembro/26', [OUT_PX, NOV_PX]), 'Pilares de dezembro ainda não configurados'],
    [cfgSemCoringas([11]), apiPx(...NOV_PX, [OUT_PX]), 'Pilares de novembro ainda não configurados'],
    [cfgSemCoringas([11], ['Segmentada']), apiPx(...NOV_PX, [OUT_PX]), 'Pilares de novembro ainda não configurados'],
  ]) {
    const { d, res } = await calcularPx(cfg, api);
    assert.equal(d.meta.semCalculo, aviso);
    assert.equal(res, null);
    assert.deepEqual(d.fechados, []); // nem lê os meses fechados
  }
  const cfg = cfgSemCoringas([12]);
  cfg.pilaresConfig.find((c) => c.mes === 12 && c.canal === 'Mista').pilares.push({ nome: 'Volume Sucos', tipo: 'volume' }); // só o pilar 4
  assert.equal(pilaresDoMes(cfg, 12, 'Mista'), null);
});

test('pilares de novembro: mês fechado só com os pilares 1 a 3 deixa o acumulado do SV incompleto (nunca calcula com 3 pilares)', async () => {
  const cfg = cfgComCoringas([12]); // dezembro corrente, com coringas fictícios
  for (const c of cfg.pilaresConfig) if (c.mes === 11) c.pilares = c.pilares.slice(0, 3); // novembro sem os coringas, só neste teste
  const { d, res } = await calcularPx(cfg, apiPx('202612', 'Dezembro/26', [OUT_PX, NOV_PX]));
  assert.equal(d.meta.semCalculo, null);
  assert.deepEqual(d.meta.acumulado.faltando, [{ mes: 11, motivo: 'Pilares de novembro ainda não configurados' }]);
  assert.match(d.meta.aviso, /acumulado do trimestre incompleto: Pilares de novembro ainda não configurados/);
  const sv2 = pessoaDe(res, 'Sv. Px.2#Segmentada');
  // outubro (pilares de outubro): Sabores 5 · Refri Single 3 · Powerade 0 · Sucos 2 · Missões validada 3 = 13
  assert.deepEqual(sv2.porMes.map((m) => [m.mes, m.pontosPilares, !!m.semDado]), [[10, 13, false], [11, 0, true], [12, 13, false]]);
  assert.deepEqual([sv2.acumuladoIncompleto, sv2.elegivel, sv2.posicao], [[11], false, null]);
  assert.equal(pessoaDe(res, 'P2').pontosMes, 13); // o consultor (mês vigente) não é afetado
});

test('pilares de novembro: Missões Guiadas sem fonte fica "sem dados" na Mista (3º) e na Segmentada (5º); com fonte pontua com meta, real e online', async () => {
  const sem = (await calcularPx(CONFIG, apiPx(...NOV_PX, [OUT_PX]))).res;
  for (const [id, pos] of [['P1', 3], ['Sv. Px.1#Mista', 3], ['P2', 5], ['Sv. Px.2#Segmentada', 5]]) {
    const pilares = pessoaDe(sem, id).pilares, i = pilares.findIndex((p) => p.nome === 'Missões Guiadas'), mg = pilares[i];
    assert.equal(i + 1, pos, id);                                                             // Mista: pilar 3; Segmentada: coringa 5
    assert.deepEqual([mg.pontos, mg.validada, mg.pct, mg.pctTexto], [0, false, null, '-'], id); // nunca 100% em novembro
    assert.ok(mg.alertas.includes('META_AUSENTE'), id);
  }
  const com = (await calcularPx(comMissoes(JSON.parse(JSON.stringify(CONFIG))), apiPx(...NOV_PX, [OUT_PX], ['missoes']))).res;
  const p1 = pessoaDe(com, 'P1'), mg = p1.pilares.find((p) => p.nome === 'Missões Guiadas');
  assert.deepEqual([mg.meta, mg.real, mg.online, mg.pctTexto, mg.pontos, mg.validada], [10, 9, 1, '100,0%', 3, false]); // (9 + 1) / 10
  assert.equal(p1.pontosMes, 13);
  // outubro continua com Missões validada em 100%: Sabores 95% (2) · Retornáveis (2) · Missões (3) · Sucos (3) · Powerade 80% (0)
  assert.equal(p1.porMes[0].pontosPilares, 10);
});

test('pilares de novembro: pilar de volume com agrupador que a API não traz fica sem dados, com aviso, e não pontua', async () => {
  const cfg = JSON.parse(JSON.stringify(CONFIG));
  aplicarAjustes(normalizarAjustes({ agrupadores: [{ id: 'chas', nome: 'Chás', agrupador: 'Chas Tt' }] }), cfg, {});
  cfg.pilaresConfig.find((c) => c.mes === 11 && c.canal === 'Mista').pilares[4] = { nome: 'Volume Chás', tipo: 'volume' };
  const { d, res } = await calcularPx(cfg, apiPx(...NOV_PX, [OUT_PX]));
  assert.match(d.meta.aviso, /a API ainda não traz Chas Tt/);
  const p1 = pessoaDe(res, 'P1'), chas = p1.pilares.find((p) => p.nome === 'Volume Chás');
  assert.deepEqual([chas.meta, chas.real, chas.pct, chas.pontos], [null, null, null, 0]);
  assert.ok(chas.alertas.includes('META_AUSENTE'));
  assert.equal(p1.pontosMes, 10); // 5 + 2 + 0 + 3 + 0: nenhum número inventado
});

// ── coringas 4 e 5 de novembro iguais aos de outubro (etapa 14; informado pela Karen em 04/11/2026) ──
// Fixture sintética: gerência NB, uma rota por SV (B1 e B2 Mista, B3 Segmentada), todos os pilares de volume no mesmo %.
const BASE_B = { ...BASE, rotas: [
  { gc: 'Nb', sv: 'Sv. Nb.1', rota: 'B1', canal: 'Mista', sub: null, v: {} },
  { gc: 'Nb', sv: 'Sv. Nb.2', rota: 'B2', canal: 'Mista', sub: null, v: {} },
  { gc: 'Nb', sv: 'Sv. Nb.3', rota: 'B3', canal: 'Segmentada', sub: 'Mini', v: {} },
] };
// os 5 agrupadores dos pilares no mesmo % e Refrigerantes em `refri`%
const prodsNb = (pct, refri) => Object.fromEntries(['sabores', 'retornaveis', 'individuais', 'powerade', 'sucos']
  .map((id) => [id, b(100, pct, 0, 3)]).concat([['refrigerantes', b(1000, refri * 10, 0, 30)]]));
const GER_NB = { rotas: [
  { id: 'B1', tipo: 'normal', gerencia: 'NB', supervisao: 'SV.NB.1', produtos: prodsNb(105, 98) },
  { id: 'B2', tipo: 'normal', gerencia: 'NB', supervisao: 'SV.NB.2', produtos: prodsNb(105, 96) },
  { id: 'B3', tipo: 'normal', gerencia: 'NB', supervisao: 'SV.NB.3', produtos: prodsNb(106, 94) },
] };
const FECHADO_NB = { anomes: '202610', rotulo: 'Outubro/26', gerado_em: '2026-11-03T18:46:02', atualizado_em: '2026-11-03T18:45:10',
  simulado: false, fechamento_final: true, campos: ['rota', 'gerencia', 'supervisao', 'produtos'], campos_produto: ['meta', 'realizado'],
  rotas: GER_NB.rotas.map((r) => [r.id, 'NB', r.supervisao, Object.fromEntries(Object.entries(r.produtos).map(([k, x]) => [k, [x.meta, x.realizado]]))]) };
const apiNb = (anomes, rotulo, fechados) => ({ 'gerencias/NB.json': GER_NB, 'fechado/202610.json': FECHADO_NB, 'index.json': {
  atualizado_em: '2026-11-04T10:00:00', simulado: false, mes_referencia: { anomes, rotulo, fechamento: false },
  produtos: ['sucos', 'powerade', 'sabores', 'retornaveis', 'individuais', 'refrigerantes'].map((id) => ({ id, nome: id })),
  gerencias: [{ id: 'NB', nome: 'Gerência Nb', arquivo: 'gerencias/NB.json' }], fechados } });
const FECH_NB = [{ anomes: '202610', rotulo: 'Outubro/26', arquivo: 'fechado/202610.json', fechamento_final: true }];
const calcularNb = (cfg, arquivos) => comApi(arquivos, async () => {
  const d = await carregarDados(BASE_B, cfg);
  return { d, res: d.meta.semCalculo ? null : M.calcular(montarEntrada(d, cfg).entrada) };
});

test('coringas de novembro: o aviso "ainda não configurados" sai e novembro calcula pontos, status e ranking', async () => {
  const { d, res } = await calcularNb(CONFIG, apiNb('202611', 'Novembro/26', FECH_NB));
  assert.deepEqual([d.meta.mes, d.meta.semCalculo], [11, null]);
  assert.doesNotMatch(d.meta.aviso || '', /Pilares de novembro/); // o aviso de mês não configurado saiu
  // 4 pilares de volume em 105% (5 cada) + Missões Guiadas sem fonte (0): teto da rota em novembro = 20, não 25
  const b1 = pessoaDe(res, 'B1'), b2 = pessoaDe(res, 'B2'), b3 = pessoaDe(res, 'B3');
  assert.deepEqual(pts(b1), [['Volume Sabores', 5], ['Volume Retornáveis', 5], ['Missões Guiadas', 0], ['Volume Sucos', 5], ['Volume Powerade', 5]]);
  assert.deepEqual(pts(b3), [['Volume Sabores', 5], ['Volume Refri Single', 5], ['Volume Powerade', 5], ['Volume Sucos', 5], ['Missões Guiadas', 0]]);
  assert.deepEqual([b1.pontosMes, b2.pontosMes, b3.pontosMes], [20, 20, 20]);
  // ranking da Mista: empate em 20 pontos, desempate pelo maior % de Refrigerantes (98% × 96%)
  assert.deepEqual([b1.posicao, b1.elegivel, b1.volume.pctTexto], [1, true, '98,0%']);
  assert.deepEqual([b2.posicao, b2.elegivel, b2.volume.pctTexto], [2, true, '96,0%']);
  // B3 não bate o gatilho de volume: os pontos aparecem, mas o status fica "-" e ele não entra no ranking
  assert.deepEqual([b3.posicao, b3.elegivel, b3.volume.pctTexto, b3.status], [null, false, '94,0%', '-']);
  assert.equal(res.ranking['RT|Mista'].elegiveis, 2);
  assert.deepEqual(res.ranking['RT|Mista'].premiados, ['B1', 'B2']);
  assert.deepEqual(M.conferir(res), []);
});

test('coringas de novembro: acumulado do SV = outubro fechado (Missões validada) + novembro corrente', async () => {
  const { d, res } = await calcularNb(CONFIG, apiNb('202611', 'Novembro/26', FECH_NB));
  assert.deepEqual([d.meta.acumulado.usados.map((x) => x.mes), d.meta.acumulado.faltando], [[10], []]);
  const sv1 = pessoaDe(res, 'Sv. Nb.1#Mista');
  // outubro: 4 pilares de volume em 105% (20) + Missões validada em 100% (3) = 23; novembro: 20 (Missões sem fonte)
  assert.deepEqual(sv1.porMes.map((m) => [m.mes, m.pontosPilares]), [[10, 23], [11, 20]]);
  assert.deepEqual([sv1.pontosAcumulados, sv1.acumuladoIncompleto], [43, []]);
  // 43 < 60: o SV não bate o gatilho de pontos do trimestre, mesmo com o gatilho de volume atingido
  assert.deepEqual([sv1.volume.atingido, sv1.gatilhoPontos.atingido, sv1.elegivel, sv1.posicao, sv1.status], [true, false, false, null, '-']);
});

test('coringas de novembro: dezembro continua "ainda não configurado" e não pontua', async () => {
  const { d, res } = await calcularNb(CONFIG, apiNb('202612', 'Dezembro/26', FECH_NB));
  assert.deepEqual([d.meta.mes, d.meta.semCalculo, res], [12, 'Pilares de dezembro ainda não configurados', null]);
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
  // fixture gravada com o mínimo do Consultor em 20 (hoje o padrão é 17): comparada com o mínimo de então
  const res = comMinimoRT(20, () => M.calcular(montarEntrada(d, CONFIG).entrada));
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
  // a rota Segmentada continua no ranking do canal dela, com os pilares dela, e na mesa do SV
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
// ajustes.json com dois objetos seguidos, como o de 29/10/2026 (texto colado depois do antigo); dados fictícios.
// O mínimo da Rota nestas fixtures é 25, de propósito diferente do padrão do motor (17, desde 29/10/2026):
// é o que deixa os testes verem se um valor veio do arquivo ou do padrão.
const DOIS_OBJETOS = '{\n  "atualizado_em": "2026-10-29T10:00",\n  "regras": { "gatilhoPontos": { "SV": 60, "RT": 25 } }\n}\n'
  + '{\n  "atualizado_em": "2026-10-29T11:00",\n  "regras": { "gatilhoPontos": { "SV": 60, "RT": 25 } }\n}\n';
const PUB = { versao: 1, atualizado_em: '2026-10-29T15:00', regras: { gatilhoPontos: { SV: 60, RT: 25 } },
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
    assert.equal(regras.gatilhoPontos.RT, 17); // o 25 do arquivo ilegível não entra: vale o padrão (17), com o aviso na tela
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
    itens: { 'regras:gatilhoPontos.RT': 25, 'canais:X2': { canal: 'Segmentada', sub: 'Mini' } } };
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
      ['Mínimo da Rota (pontos no mês)', '25', '18'],
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
  // cópia completa salva às 09:00 (formato de antes), sem o mínimo 25, o X2 e o confronto publicados às 15:00
  const copia = { versao: 1, atualizado_em: '2026-10-29T09:00', regras: { bonusConfronto: 7 }, canais: { X3: { canal: 'Mista', sub: null, segmento: null } } };
  await comAjustes(JSON.stringify(PUB), copia, async ({ ler }) => {
    const aj = await carregarAjustes(CONFIG);
    assert.equal(aj.navegadorAnterior, true);
    assert.deepEqual(aj.diferencas.map((d) => d.chave), ['regras:bonusConfronto', 'canais:X3']);
    assert.equal(aj.ativo.regras.gatilhoPontos.RT, 25); // publicado depois da cópia: vale sobre o padrão 17 (decisão de 29/10/2026)
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
    // o admin volta o mínimo para o publicado (25) e muda o bônus para 6: só o bônus fica na lista (o que já está publicado não aparece)
    const form = normalizarAjustes({ regras: { gatilhoPontos: { SV: 60, RT: 25 }, bonusConfronto: 6 }, canais: PUB.canais, confrontos: PUB.confrontos });
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
    assert.equal(aj.ativo.regras.gatilhoPontos.RT, 25); // vale o publicado, não o padrão 17
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
    // fixture gravada com o mínimo do Consultor em 20 (hoje o padrão é 17): comparada com o mínimo de então
    const res = comMinimoRT(20, () => M.calcular(montarEntrada(d, CONFIG).entrada));
    assert.deepEqual(res.pessoas.map((p) => [p.id, p.canal, p.pontosMes, p.volume.pctTexto, p.elegivel, p.posicao, p.status]), fx.esperado.res);
  });
});

// ── mínimo de pontos do Consultor: 17, padrão do motor desde 29/10/2026 (gerência de planejamento e IM) ──
// rotas fictícias na Mista de outubro: Missões Guiadas validada (3) + 4 pilares de volume; Refrigerantes em 96% para todas
const PCT_MIN = { R16: [105, 105, 100, 80], R17: [105, 105, 90, 90], R19: [105, 105, 100, 100], R20: [105, 105, 105, 90] };
const PIL_MIN = ['Volume Sabores', 'Volume Retornáveis', 'Volume Sucos', 'Volume Powerade'];
const ENTRADA_MIN = { mesRef: 10, pilaresConfig: CONFIG.pilaresConfig, confrontos: [],
  pessoas: Object.keys(PCT_MIN).map((id) => ({ id, nome: id, cargo: 'RT', canal: 'Mista', unidade: 'Fx', id_supervisor: null })),
  medidas: Object.entries(PCT_MIN).flatMap(([id, ps]) => ps.map((p, i) => ({ id, mes: 10, pilar: PIL_MIN[i], meta: 100, real: p, online: 0 }))
    .concat([{ id, mes: 10, pilar: 'Refrigerantes', meta: 100, real: 96, online: 0 }])) };
const PREMIADAS_MIN = { SV: { Mista: 12, Segmentada: 2 }, RT: { Mista: 2, Segmentada: 10 } }; // 2 premiadas, para ver os dois status
/** Carrega o ajustes.json publicado (texto; null = 404), aplica nas REGRAS e devolve [pontos, status] de cada rota. */
const statusMinimo = async (texto) => {
  const guardado = JSON.parse(JSON.stringify(M.REGRAS));
  try {
    const aj = await comAjustes(texto, undefined, () => carregarAjustes(CONFIG));
    aplicarAjustes(aj.ativo, JSON.parse(JSON.stringify(CONFIG)), M.REGRAS);
    return Object.fromEntries(M.calcular(ENTRADA_MIN).pessoas.map((p) => [p.id, [p.pontosMes, p.status]]));
  } finally { Object.assign(M.REGRAS, guardado); }
};

test('mínimo do Consultor: 17 vem do padrão do motor (16 = "-", 17 a 19 com status) e o ajuste do admin ainda troca o valor', async () => {
  // o ajustes.json daqui só reduz as posições premiadas: o mínimo não é ajustado e vale o padrão (17)
  assert.deepEqual(await statusMinimo(JSON.stringify({ regras: { premiadas: PREMIADAS_MIN } })), {
    R16: [16, '-'], R17: [17, 'Bateu, mas não está no total'], R19: [19, 'Bateu!'], R20: [20, 'Bateu!'] });
  // o caminho de configuração continua vivo: o admin leva o mínimo para 20 e as rotas de 17 e 19 perdem o status
  assert.deepEqual(await statusMinimo(JSON.stringify({ regras: { gatilhoPontos: { SV: 60, RT: 20 }, premiadas: PREMIADAS_MIN } })), {
    R16: [16, '-'], R17: [17, '-'], R19: [19, '-'], R20: [20, 'Bateu!'] });
});

test('mínimo do Consultor: sem nenhum ajuste (ajustes.json ausente ou ilegível) o mínimo é 17 e a rota com 17 pontos bate o gatilho', async () => {
  assert.equal(A.MotorPadrao.gatilhoPontos.RT, 17, 'o padrão do motor é a regra em vigor (29/10/2026)');
  assert.equal(M.REGRAS.gatilhoPontos.SV, 60, 'o mínimo do SV não muda');
  // 404 (ninguém publicou) e arquivo ilegível (dois objetos seguidos, como em 29/10/2026): em nenhum dos dois
  // o painel pode voltar a 20 em silêncio. Sem ajuste de premiadas valem as 40 posições do padrão.
  for (const [publicado, caso] of [[null, 'ajustes.json ausente'], [DOIS_OBJETOS, 'ajustes.json ilegível']]) {
    assert.deepEqual(await statusMinimo(publicado),
      { R16: [16, '-'], R17: [17, 'Bateu!'], R19: [19, 'Bateu!'], R20: [20, 'Bateu!'] }, caso);
  }
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

test('status "Bateu!" (31/10/2026): a tela lê os textos de R.status e o HTML gerado não tem mais "No total"', () => {
  const fs = require('fs'), path = require('path');
  const tpl = fs.readFileSync(path.join(__dirname, '../src/app.tpl.html'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../../frontend/desafio-q4.html'), 'utf8');
  // nenhum texto de status fixo no template: pílulas, legenda da aba Regras e largura da coluna vêm do motor
  assert.doesNotMatch(tpl, /No total|Bateu!|Bateu, mas não está no total/);
  assert.equal((tpl.match(/\$\{CK\}\$\{R\.status\.dentro\}/g) || []).length, 2);
  assert.equal((tpl.match(/\$\{UP\}\$\{R\.status\.fora\}/g) || []).length, 2);
  assert.match(tpl, /textos:\[R\.status\.fora, R\.status\.dentro\], flex:true/);
  // classes da tela e chaves do motor não mudaram
  assert.match(tpl, /<span class="pill tot">\$\{CK\}/);
  assert.match(tpl, /<span class="pill bat">\$\{UP\}/);
  assert.match(html, /status: \{ nenhum: '-', fora: 'Bateu, mas não está no total', dentro: 'Bateu!' \}/);
  assert.doesNotMatch(html, /No total/, 'rode python painel-q4/scripts/build.py');
});

// ── aba Confrontos (etapa 11): cartões de duelo; só apresentação, o resultado continua vindo do motor ──
// Fixture sintética: SVs fictícios Sv. Fa.* (Mista) e Sv. Fb.* (Segmentada).
const { distribuirConfrontos, resumoConfrontos, estadoConfronto, larguraBarra, lugarEtiquetas, confrontoInvalidadoPorAjuste,
        CF_ALTURA_MAX, CF_ALTURA_MIN, CONFRONTOS_MAX } = require('../src/adapter.js');

test('confrontos na tela: duas colunas na ordem do motor, ceil(n/2) linhas; a legenda fica fora do quadro (rodapé)', () => {
  const ver = (n) => { const d = distribuirConfrontos(n); return [d.linhas, d.esquerda, d.direita]; };
  assert.deepEqual(ver(0), [0, 0, 0]);
  assert.deepEqual(ver(1), [1, 1, 0]);
  assert.deepEqual(ver(4), [2, 2, 2]);
  assert.deepEqual(ver(16), [8, 8, 8]);
  assert.deepEqual(ver(17), [9, 9, 8]); // o caso de outubro: 9 + 8
  assert.deepEqual(ver(18), [9, 9, 9]);
  assert.deepEqual(ver(30), [15, 15, 15]);
  assert.deepEqual(ver(CONFRONTOS_MAX), [30, 30, 30]);
  for (const n of [0, 1, 4, 16, 17, 18, 30, 60]) assert.equal(distribuirConfrontos(n).esquerda + distribuirConfrontos(n).direita, n, `n=${n}: as colunas somam n`);
});

test('confrontos na tela: altura da linha = o que sobra ÷ linhas, de 62 a 84 px; abaixo do mínimo as colunas rolam', () => {
  const alt = (n, disp) => { const d = distribuirConfrontos(n, disp, 6); return [d.altura, d.rola]; };
  assert.deepEqual(alt(17, 618), [63, false]);            // janela maximizada (~1920×940): 9 linhas de 63 px, sem rolagem
  assert.deepEqual(alt(1, 618), [CF_ALTURA_MAX, false]);   // poucas linhas: no máximo 84 px, alinhadas ao topo
  assert.deepEqual(alt(4, 618), [CF_ALTURA_MAX, false]);
  assert.deepEqual(alt(18, 638), [65, false]);
  assert.deepEqual(alt(30, 638), [CF_ALTURA_MIN, true]);   // 30 e 60: 62 px e as duas colunas rolam juntas
  assert.deepEqual(alt(60, 638), [CF_ALTURA_MIN, true]);
  assert.equal(distribuirConfrontos(0, 678, 6).altura, null);
});

const CF_PESSOAS = {
  'Sv. Fa.1#Mista': { id: 'Sv. Fa.1#Mista', canal: 'Mista' }, 'Sv. Fa.2#Mista': { id: 'Sv. Fa.2#Mista', canal: 'Mista' },
  'Sv. Fa.3#Mista': { id: 'Sv. Fa.3#Mista', canal: 'Mista' }, 'Sv. Fb.1#Segmentada': { id: 'Sv. Fb.1#Segmentada', canal: 'Segmentada' },
  'Sv. Fb.2#Segmentada': { id: 'Sv. Fb.2#Segmentada', canal: 'Segmentada' },
};
const cf = (desafiante, desafiado, pilar, extra) => Object.assign({ mes: 10, desafiante, desafiado, pilar, valido: true, motivo: null, vencedor: null }, extra);

test('confrontos na tela: contagens por canal (do desafiante) e por pilar somam os cadastrados; empate pelo rótulo', () => {
  const lista = [
    cf('Sv. Fa.1#Mista', 'Sv. Fa.2#Mista', 'Volume Sabores', { vencedor: 'Sv. Fa.1#Mista', pctDesafiante: 90, pctDesafiado: 80 }),
    cf('Sv. Fa.2#Mista', 'Sv. Fa.3#Mista', 'Volume Sucos', { motivo: 'EMPATE_SEM_VENCEDOR', pctDesafiante: 80, pctDesafiado: 80 }),
    cf('Sv. Fb.1#Segmentada', 'Sv. Fb.2#Segmentada', 'Volume Refri Single', { vencedor: 'Sv. Fb.2#Segmentada' }),
    cf('Sv. Fb.2#Segmentada', 'Sv. Fa.1#Mista', 'Volume Sabores', { valido: false, motivo: 'CANAIS_DIFERENTES' }),
    cf('Sv. Fz.9#Mista', 'Sv. Fa.3#Mista', 'Volume Retornáveis', { valido: false, motivo: 'SV_NAO_ENCONTRADO' }), // SV fora do mês
    cf('Sv. Fa.3#Mista', 'Sv. Fa.1#Mista', 'Missões Guiadas', { valido: false, motivo: 'PILAR_NAO_VOLUME' }),
  ];
  const r = resumoConfrontos(lista, CF_PESSOAS);
  assert.deepEqual([r.cadastrados, r.validos, r.comVencedor], [6, 3, 2]);
  assert.deepEqual(r.porCanal, [{ rotulo: 'Mista', n: 3 }, { rotulo: 'Segmentada', n: 2 }, { rotulo: 'Sem canal', n: 1 }]);
  // Sabores 2; os outros empatam em 1 e seguem a ordem do rótulo (sem "Volume ")
  assert.deepEqual(r.porPilar, [{ rotulo: 'Sabores', n: 2 }, { rotulo: 'Missões Guiadas', n: 1 }, { rotulo: 'Refri Single', n: 1 },
                                { rotulo: 'Retornáveis', n: 1 }, { rotulo: 'Sucos', n: 1 }]);
  const soma = (l) => l.reduce((s, x) => s + x.n, 0);
  assert.equal(soma(r.porCanal), r.cadastrados);
  assert.equal(soma(r.porPilar), r.cadastrados);
  assert.deepEqual(resumoConfrontos([], CF_PESSOAS), { cadastrados: 0, validos: 0, comVencedor: 0, porCanal: [], porPilar: [] });
  assert.equal(lista[0].vencedor, 'Sv. Fa.1#Mista'); // só lê o que o motor devolveu
});

test('confrontos na tela: estado S1 a S4 de cada confronto e o lado vencedor, só a partir do que o motor apurou', () => {
  const achou = (id) => Object.prototype.hasOwnProperty.call(CF_PESSOAS, id);
  const ver = (c) => { const e = estadoConfronto(c, achou); return [e.estado, e.caixa, e.vencedor, e.desempate, e.desafiante, e.desafiado]; };
  const A = 'Sv. Fa.1#Mista', B = 'Sv. Fa.2#Mista';
  assert.deepEqual(ver(cf(A, B, 'Volume Sabores', { vencedor: A })), ['S1', 'S1', 'desafiante', false, 'vencedor', 'normal']);
  assert.deepEqual(ver(cf(A, B, 'Volume Sabores', { vencedor: B })), ['S1', 'S1', 'desafiado', false, 'normal', 'vencedor']);
  assert.deepEqual(ver(cf(A, B, 'Volume Sabores', { vencedor: B, motivo: 'DESEMPATE_REFRI' })), ['S1', 'S1', 'desafiado', true, 'normal', 'vencedor']);
  assert.deepEqual(ver(cf(A, B, 'Volume Sabores', { motivo: 'EMPATE_SEM_VENCEDOR' })), ['S2', 'S2', null, false, 'neutro', 'neutro']);
  assert.deepEqual(ver(cf(A, B, 'Volume Sucos', { motivo: 'SEM_DADO_PARA_APURAR' })), ['S2', 'S2', null, false, 'neutro', 'neutro']);
  assert.deepEqual(ver(cf(A, 'Sv. Fb.1#Segmentada', 'Volume Sabores', { valido: false, motivo: 'CANAIS_DIFERENTES' })),
    ['S3', 'S3', null, false, 'neutro', 'neutro']);
  // canal ajustado: a mesa de Sv. Fa.3 saiu da Mista; o id antigo não é mais encontrado (S4) e o motivo explica o ajuste
  const det = cf('Sv. Fa.3#Mista', B, 'Volume Sabores', { valido: false, motivo: 'SV_NAO_ENCONTRADO' });
  const semFa3 = (id) => id !== 'Sv. Fa.3#Mista' && achou(id);
  const linhas = [{ rota: 'F31', sv: 'Sv. Fa.3', origem: 'ajuste', padrao: 'Mista', canal: 'Segmentada' }];
  assert.equal(confrontoInvalidadoPorAjuste(det, linhas, {}).texto, 'canal ajustado: a mesa de Sv. Fa.3 saiu da Mista (rota F31)');
  const e = estadoConfronto(det, semFa3);
  assert.deepEqual([e.estado, e.caixa, e.desafiante, e.desafiado], ['S4', 'S3', 'S4', 'neutro']);
  // SV não encontrado no mês (sem ajuste de canal): o lado que falta é S4, a caixa segue o motor (não vale)
  assert.deepEqual(ver(cf(A, 'Sv. Fz.9#Mista', 'Volume Sabores', { valido: false, motivo: 'SV_NAO_ENCONTRADO' })),
    ['S4', 'S3', null, false, 'neutro', 'S4']);
  // sem a função de busca, os dois lados contam como encontrados
  assert.equal(estadoConfronto(cf(A, B, 'Volume Sabores', { vencedor: A })).desafiado, 'normal');
});

test('confrontos na tela: barra do SV vai de 0 a 100 (sem valor, negativo ou NaN = 0) e não arredonda', () => {
  assert.deepEqual([0, 3.5, 61.8, 99.96, 100, 110.7, -4, NaN, null, undefined, '80'].map(larguraBarra),
    [0, 3.5, 61.8, 99.96, 100, 100, 0, 0, 0, 0, 0]);
  assert.ok(larguraBarra(99.96) < 100); // 99,96% não enche a barra
});

test('confrontos na tela: uma etiqueta fica na linha do nome; duas ou mais vão juntas para o subtexto', () => {
  assert.deepEqual(lugarEtiquetas([]), { nome: [], sub: [] });
  assert.deepEqual(lugarEtiquetas(undefined), { nome: [], sub: [] });
  assert.deepEqual(lugarEtiquetas(['Mod']), { nome: ['Mod'], sub: [] });
  assert.deepEqual(lugarEtiquetas(['2 canais']), { nome: ['2 canais'], sub: [] });
  assert.deepEqual(lugarEtiquetas(['Mini', 'Mod']), { nome: [], sub: ['Mini', 'Mod'] });
  assert.deepEqual(lugarEtiquetas(['Mini', 'Mod', '2 canais']), { nome: [], sub: ['Mini', 'Mod', '2 canais'] });
  const l = ['Mod']; lugarEtiquetas(l).nome.push('x'); assert.deepEqual(l, ['Mod']); // não altera a lista recebida
});

test('confrontos na tela: o bloco da aba não tem bônus fixo, "Mockup", fonte externa nem emoji; o HTML gerado está em dia', () => {
  const fs = require('fs'), path = require('path');
  const tpl = fs.readFileSync(path.join(__dirname, '../src/app.tpl.html'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../../frontend/desafio-q4.html'), 'utf8');
  const trecho = (t, ini, fim) => { const i = t.indexOf(ini), j = t.indexOf(fim, i); assert.ok(i >= 0 && j > i, `trecho ${ini}`); return t.slice(i, j); };
  const blocos = (t) => [trecho(t, '/* confrontos: cartões de duelo', '/* pendencias'),
                         trecho(t, '<section class="view wide" id="v-confrontos"', '</section>'),
                         trecho(t, '/* ---------- confrontos entre supervisores ---------- */', '/* ---------- abas ---------- */')];
  const [css, sec, js] = blocos(tpl);
  for (const b of [css, sec, js]) {
    assert.doesNotMatch(b, /\+\s*5(?![\d%])|\b5\s*(pts|pontos)\b/, 'bônus do confronto fixo: use R.bonusConfronto');
    assert.doesNotMatch(b, /mockup/i);
    assert.doesNotMatch(b, /https?:|fonts\.googleapis|fonts\.gstatic|@import/);
    assert.doesNotMatch(b, /\p{Extended_Pictographic}/u, 'sem emoji: ícones em SVG');
  }
  assert.match(js, /\+\$\{R\.bonusConfronto\} pts · /);
  for (const f of ['distribuirConfrontos', 'resumoConfrontos', 'estadoConfronto', 'larguraBarra', 'lugarEtiquetas']) assert.match(js, new RegExp(f + '\\('));
  assert.doesNotMatch(js, /\.vencedor\s*=[^=]|pctDesafiante\s*=[^=]/, 'a tela não apura vencedor nem %');
  // as etiquetas só mudam de estilo dentro da aba: a regra geral de .sg continua igual
  assert.match(tpl, /\n\.sg\{display:inline-block;margin-left:6px;/);
  // a legenda fica fora do quadro: no rodapé da página (#rodleg), não dentro de #v-confrontos
  assert.doesNotMatch(sec + js, /cfleg|cffaixa/);
  assert.match(tpl, /<div class="foot">.*<span id="rodleg" hidden><\/span>/);
  assert.match(js, /\$\('rodleg'\)\.innerHTML = /);
  // o HTML gerado é o build do template atual e não carrega fonte de fora
  assert.deepEqual(blocos(html), [css, sec, js], 'rode python painel-q4/scripts/build.py');
  assert.doesNotMatch(html, /mockup/i);
  assert.doesNotMatch(html, /fonts\.googleapis|fonts\.gstatic|@import\s+url/);
  const faces = html.match(/@font-face\{[^}]*\}/g) || [];
  assert.ok(faces.length >= 3 && faces.every((f) => /src:url\(data:font\/woff2;base64,/.test(f)), 'fontes só embutidas');
  assert.ok(faces.some((f) => /font-family:Barlow Condensed;.*font-weight:800;font-style:normal/.test(f)));
});

test('fonte nova: Barlow Condensed 800 (subset latino, woff2) no fonts.json e na lista manter do build.py', () => {
  const fs = require('fs'), path = require('path');
  const fontes = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/assets/fonts.json'), 'utf8'));
  const bc = fontes.filter((f) => f.fam === 'Barlow Condensed');
  assert.deepEqual(bc.map((f) => [f.w, f.st]), [[800, 'normal']]);
  assert.deepEqual(Object.keys(bc[0]).sort(), ['b64', 'fam', 'st', 'w']);
  assert.equal(Buffer.from(bc[0].b64, 'base64').subarray(0, 4).toString('latin1'), 'wOF2');
  const build = fs.readFileSync(path.join(__dirname, '../scripts/build.py'), 'utf8');
  assert.match(build, /manter = \[\('Anton', 400, 'normal'\), \('Barlow', 800, 'italic'\), \('Barlow Condensed', 800, 'normal'\)\]/);
});

// ── etapa 16: fechamento oficial só depois do flash de vendas (prévia × oficial) ──
// Fixtures sintéticas: a mesma FECHADO_OUT de novembro, com o selo tirado ou posto.
const { normalizarFlash, estadoFechado, dataBr } = require('../src/adapter.js');
const semSelo = (f) => ({ ...f, fechamento_final: false, oficial_em: null, fonte_selo: null });
const itemFech = (final, oficialEm) => ({ anomes: '202610', rotulo: 'Outubro/26', arquivo: 'fechado/202610.json',
  gerado_em: '2026-11-03T18:46:02', fechamento_final: final, oficial_em: oficialEm || null, fonte_selo: final ? 'flash' : null });
const API_PREVIA = { ...API_NOV, 'index.json': { ...INDEX_NOV, fechados: [itemFech(false)] },
                     'fechado/202610.json': semSelo(FECHADO_OUT) };

test('flash: mês fechado em prévia vem marcado como provisório, e oficial traz a data do selo', async () => {
  const nov = await calcularNov(cfgNov(), API_PREVIA);
  const u = nov.d.meta.acumulado.usados[0];
  assert.deepEqual([u.mes, u.anomes, u.final, u.oficialEm], [10, '202610', false, null]);
  assert.deepEqual(nov.d.meta.acumulado.previa, [10]);
  assert.deepEqual([u.estado.previa, u.estado.curto, u.estado.longo],
    [true, 'prévia', 'Prévia (pode mudar até o fechamento do flash)']);
  // oficial: o mesmo mês com o selo do gerador
  const oficial = await calcularNov(cfgNov());
  assert.deepEqual(oficial.d.meta.acumulado.previa, []);
  assert.deepEqual(oficial.d.meta.acumulado.usados[0].estado,
    { previa: false, marcado: false, oficialEm: '2026-11-12T14:30:00', curto: 'oficial', longo: 'Oficial, selado em 12/11/2026' });
});

test('flash: prévia e oficial não mudam nenhum número; só o rótulo (o cálculo é todo do motor)', async () => {
  const comPrevia = await calcularNov(cfgNov(), API_PREVIA);
  const comSelo = await calcularNov(cfgNov());
  const limpar = (res) => res.pessoas.map((p) => [p.id, p.pontosAtuais, p.pontosAcumulados, p.volume.pct, p.posicao, p.elegivel]);
  assert.deepEqual(limpar(comPrevia.res), limpar(comSelo.res));
  assert.deepEqual(comPrevia.res.mesesIncompletos, comSelo.res.mesesIncompletos);
  // o mês em prévia não é "incompleto": os dados existem, só podem mudar
  assert.deepEqual(comPrevia.d.meta.acumulado.faltando, []);
});

test('flash: marcado nos ajustes e ainda não selado pela API => prévia, com o aviso de que vale depois do PR', () => {
  const marcado = { fechado: true, em: '2026-11-12T09:00' };
  const e = estadoFechado({ mes: 10, anomes: '202610', final: false, oficialEm: null }, marcado);
  assert.deepEqual([e.previa, e.marcado, e.curto], [true, true, 'prévia']);
  assert.match(e.longo, /^Prévia · flash de vendas marcado em 12\/11\/2026/);
  assert.match(e.longo, /continua em prévia até o PR ser mesclado/);
  // já selado: a marca não muda o rótulo de oficial
  const sel = estadoFechado({ mes: 10, anomes: '202610', final: true, oficialEm: '2026-11-12T14:30:00' }, marcado);
  assert.deepEqual([sel.previa, sel.marcado, sel.longo], [false, true, 'Oficial, selado em 12/11/2026']);
  // oficial sem data (snapshot antigo) não inventa data
  assert.equal(estadoFechado({ mes: 10, final: true }, null).longo, 'Oficial (data do selo não informada)');
  assert.equal(estadoFechado(null, null), null);
  assert.deepEqual([dataBr('2026-11-12T14:30:00'), dataBr(null), dataBr('qualquer')], ['12/11/2026', '', '']);
});

test('flash: só meses do Q4 do painel, só com fechado: true, e data inválida vira "marcado sem data"', () => {
  const avisos = [];
  const flash = normalizarFlash({
    '202610': { fechado: true, em: '2026-11-12T14:30' },
    '202611': { fechado: false, em: '2026-12-12T10:00' },   // não marcado = ainda não fechou
    '202612': { fechado: true },                             // marcado sem data
    '202509': { fechado: true },                             // fora do trimestre do painel
    '202610x': { fechado: true },                            // fora do formato
    '202601': true,                                          // não é objeto
  }, 2026, avisos);
  assert.deepEqual(flash, { '202610': { fechado: true, em: '2026-11-12T14:30' }, '202612': { fechado: true, em: null } });
  assert.equal(avisos.length, 3);
  assert.ok(avisos.every((a) => /flash de vendas de/.test(a)));
  const av2 = [];
  assert.deepEqual(normalizarFlash({ '202610': { fechado: true, em: '  ' } }, 2026, av2), { '202610': { fechado: true, em: null } });
  assert.equal(av2.length, 1);
  assert.deepEqual(normalizarFlash(undefined, 2026, []), {});
  const av3 = [];
  assert.deepEqual(normalizarFlash([], 2026, av3), {});
  assert.equal(av3.length, 1);
});

test('flash: entra no ajustes.json como um item só dele, com a mesma precedência dos outros ajustes', async () => {
  const pub = { versao: 1, atualizado_em: '2026-11-12T15:00', flashFechado: { '202610': { fechado: true, em: '2026-11-12T14:30' } } };
  const aj = normalizarAjustes(pub);
  assert.deepEqual(aj.flashFechado, { '202610': { fechado: true, em: '2026-11-12T14:30' } });
  const itens = A.itensDosAjustes(aj);
  assert.deepEqual(itens['flash:202610'], { fechado: true, em: '2026-11-12T14:30' });
  assert.deepEqual(A.objetoDosItens(itens).flashFechado, { '202610': { fechado: true, em: '2026-11-12T14:30' } });
  assert.equal(A.rotuloItem('flash:202610'), 'Flash de vendas de outubro');
  assert.equal(A.textoItem('flash:202610', itens['flash:202610']), 'fechado em 12/11/2026');
  assert.equal(A.textoItem('flash:202610', null), 'ainda não fechou');
  // navegador tira o item publicado (null) e põe outro mês: item a item, como os demais ajustes
  const nav = { formato: 2, atualizado_em: '2026-11-12T16:00', publicado_em: '2026-11-12T15:00',
                itens: { 'flash:202610': null, 'flash:202611': { fechado: true, em: '2026-12-12T10:00' } } };
  await comAjustes(JSON.stringify(pub), nav, async () => {
    const carregado = await carregarAjustes(CONFIG);
    assert.deepEqual(carregado.ativo.flashFechado, { '202611': { fechado: true, em: '2026-12-12T10:00' } });
    assert.deepEqual(carregado.diferencas.map((d) => [d.chave, d.textoPublicado, d.textoNovo]),
      [['flash:202610', 'fechado em 12/11/2026', 'ainda não fechou'],
       ['flash:202611', 'ainda não fechou', 'fechado em 12/12/2026']]);
  });
  // ajustes.json só com o flash continua sendo um ajuste válido; sem nada válido, null
  assert.deepEqual(normalizarAjustes({ flashFechado: { '202610': { fechado: true } } }).flashFechado,
    { '202610': { fechado: true, em: null } });
  assert.equal(normalizarAjustes({ flashFechado: { '202509': { fechado: true } } }), null);
  // arquivo publicado sem a chave (retrocompatível) continua válido e não marca nada
  assert.deepEqual(normalizarAjustes({ regras: { bonusConfronto: 5 } }).flashFechado, {});
});

test('flash: a tela mostra prévia x oficial e o botão da Administração, sem data de flash fixa no código', () => {
  const fs = require('fs'), path = require('path');
  const tpl = fs.readFileSync(path.join(__dirname, '../src/app.tpl.html'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../../frontend/desafio-q4.html'), 'utf8');
  // o rótulo do estado vem do adaptador (estadoFechado), não de texto montado na tela
  assert.match(tpl, /const estadoMes = \(u\)=> u\.estado \|\|/);
  assert.match(tpl, /const PREVIA = ACUM\.previa/);
  // provisório na Supervisão, no Ranking e no rodapé
  assert.match(tpl, /\$\('rk-sv-pv'\)\.innerHTML = tagPrevia\(true\)/);
  assert.match(tpl, /\+ tagPrevia\(\);/);
  assert.match(tpl, /acumulado do SV provisório: \$\{listaPrevia\(\)\} em prévia/);
  // botão de duas vias na Administração, com confirmação e o aviso do PR
  assert.match(tpl, /data-flash="\$\{esc\(u\.anomes\)\}"/);
  assert.match(tpl, /Isto congela o resultado de \$\{nome\}/);
  assert.match(tpl, /desmarcar não reabre o mês/);
  assert.match(tpl, /continua em <b>prévia<\/b> para o resto da empresa/);
  // o selo nunca sai de data no código: nenhum dia fixo de flash no template
  assert.doesNotMatch(tpl, /getDate\(\) *[<>=]+ *1[0-9]/);
  assert.match(html, /Flash de vendas \(fechamento oficial do mês\)/, 'rode python painel-q4/scripts/build.py');
});

// ── etapa 17: consulta do fechamento do mês, com exportação em .xlsx (Administração) ──
// Fixtures sintéticas: a gerência Nova (NV) de novembro, com outubro fechado (FECHADO_OUT). Nomes fictícios.
const { consultaFechamento, dadosDoFechado, tabelaFechamento, filtrarFechamento, contextoFechamento, abasFechamento,
        nomeArquivoFechamento, VISOES_FECHAMENTO, pilaresDaConsulta, posicoesDeTela, ordemPainel, totaisDoFechado,
        planilhaXlsx, colunaXlsx, nomeAba, crc32 } = require('../src/adapter.js');

// totais por gerência e da empresa, como o gerador grava no snapshot (etapa 16): a gerência INTEIRA, com todas as
// rotas que tiveram Real — de propósito acima da soma das 3 rotas do incentivo, para a visão Estratégicos não poder
// estar somando rotas por conta própria.
const TOTAIS_OUT = {
  empresa: { sabores: [500, 540], retornaveis: [400, 395], sucos: [350, 330], powerade: [320, 300],
             individuais: [300, 310], refrigerantes: [4000, 3900] },
  gerencias: { NV: { sabores: [500, 540], retornaveis: [400, 395], sucos: [350, 330], powerade: [320, 300],
                     individuais: [300, 310], refrigerantes: [4000, 3900] } },
};
const comTotais = (f) => ({ ...f, totais: JSON.parse(JSON.stringify(TOTAIS_OUT)) });
const API_FECH = { ...API_NOV, 'fechado/202610.json': comTotais(FECHADO_OUT) };                       // outubro OFICIAL
const API_FECH_PREVIA = { ...API_PREVIA, 'fechado/202610.json': comTotais(semSelo(FECHADO_OUT)) };    // outubro em PRÉVIA
const CONF_OUT = [{ mes: 10, id_sv_desafiante: 'Sv. Nv.1#Mista', id_sv_desafiado: 'Sv. Nv.2#Mista', pilar: 'Volume Sabores' }];

/** Carrega os dados de novembro e devolve a consulta de um mês fechado, como a Administração faz. */
const consultaDe = async (mes, arquivos = API_FECH, confrontos, cfg) => comApi(arquivos, async () => {
  const c = cfg || cfgNov();
  const d = await carregarDados(BASE_V, c);
  return { d, c: consultaFechamento(d, mes, c, confrontos), cfg: c };
});
const ROT_PILAR_T = (n) => n.replace('Volume ', '').replace('Missões Guiadas', 'Missões');
const porCodigo = (t, cod) => t.linhas.find((l) => l.codigo === cod);
const celula = (t, cod, rotulo) => porCodigo(t, cod).celulas[t.colunas.findIndex((x) => x.rotulo === rotulo)];

test('consulta: cabeçalho de corte do mês oficial (estado, selo, gerado_em e atualizado_em) e as colunas dos pilares do mês', async () => {
  const { c } = await consultaDe(10);
  assert.equal(c.disponivel, true);
  assert.deepEqual([c.anomes, c.rotulo, c.previa], ['202610', 'Outubro/26', false]);
  assert.equal(c.estado.longo, 'Oficial, selado em 12/11/2026');
  assert.deepEqual([c.oficialEm, c.fonteSelo], ['2026-11-12T14:30:00', 'flash']);
  assert.deepEqual([c.geradoEm, c.atualizadoEm], ['2026-11-03T18:46:02', '2026-11-03T18:45:10']);
  assert.equal(c.corte, '03/11/2026 18:45'); // o corte é o do mês consultado, não o de novembro
  // pilares dos DOIS canais daquele mês, sem repetir: nada fixo no código
  assert.deepEqual(c.pilares.map((p) => p.nome),
    ['Volume Sabores', 'Volume Retornáveis', 'Missões Guiadas', 'Volume Sucos', 'Volume Powerade', 'Volume Refri Single']);
  assert.deepEqual(pilaresDaConsulta(cfgNov(), 11).map((p) => p.nome), // novembro tem outros coringas: a consulta segue o mês
    ['Volume Sabores', 'Volume Retornáveis', 'Missões Guiadas', 'Volume Powerade', 'Volume Refri Single', 'Volume Sucos']);
});

test('consulta: mês em prévia avisa que os números ainda mudam, e nenhum número muda entre prévia e oficial', async () => {
  const previa = await consultaDe(10, API_FECH_PREVIA);
  assert.equal(previa.c.previa, true);
  assert.deepEqual([previa.c.oficialEm, previa.c.fonteSelo], [null, null]);
  assert.equal(previa.c.estado.longo, 'Prévia (pode mudar até o fechamento do flash)');
  assert.equal(nomeArquivoFechamento(previa.c), 'fechamento-202610-previa.xlsx');
  const oficial = await consultaDe(10);
  assert.equal(nomeArquivoFechamento(oficial.c), 'fechamento-202610-oficial.xlsx');
  // só o rótulo muda: linhas idênticas nas três visões
  for (const v of VISOES_FECHAMENTO) {
    assert.deepEqual(tabelaFechamento(previa.c, v.id).linhas.map((l) => l.celulas),
                     tabelaFechamento(oficial.c, v.id).linhas.map((l) => l.celulas), 'visão ' + v.id);
  }
  // a advertência da prévia entra na aba Contexto; no mês oficial, não
  const txt = (x) => contextoFechamento(x, CONFIG).linhas.map((l) => l.celulas.join(' = ')).join('\n');
  assert.match(txt(previa.c), /ADVERTÊNCIA = Os números deste mês ainda podem mudar até o fechamento do flash/);
  assert.match(txt(previa.c), /Estado = PRÉVIA/);
  assert.doesNotMatch(txt(oficial.c), /ADVERTÊNCIA/);
  assert.match(txt(oficial.c), /Estado = OFICIAL/);
  assert.match(txt(oficial.c), /Data do selo oficial = 12\/11\/2026/);
});

test('consulta: mês sem arquivo em fechados fica indisponível, sem apurar nada', async () => {
  const semLista = { ...API_FECH, 'index.json': { ...INDEX_NOV, fechados: [] } };
  const { c } = await consultaDe(10, semLista);
  assert.deepEqual([c.disponivel, c.motivo], [false, 'fechamento de outubro indisponível']);
  assert.deepEqual(tabelaFechamento(c, 'consultor'), { colunas: [], linhas: [] });
  // mês que nem é do trimestre anterior ao de referência também não existe na consulta
  const { c: c12 } = await consultaDe(12);
  assert.deepEqual([c12.disponivel, c12.motivo], [false, 'fechamento de dezembro indisponível']);
  // arquivo que falha ao carregar: o mês não entra na consulta
  const falhou = await comApi(API_FECH, async () => {
    const d = await carregarDados(BASE_V, cfgNov());
    return consultaFechamento(d, 10, cfgNov());
  }, ['fechado/202610.json']);
  assert.equal(falhou.disponivel, false);
});

test('consulta: mês sem os 5 pilares configurados não apura nada (nem com parte dos pilares)', async () => {
  const cfg = cfgNov();
  cfg.pilaresConfig.find((x) => x.mes === 10 && x.canal === 'Mista').pilares =
    cfg.pilaresConfig.find((x) => x.mes === 10 && x.canal === 'Mista').pilares.slice(0, 3); // só os pilares 1 a 3
  const { c } = await consultaDe(10, API_FECH, undefined, cfg);
  assert.equal(c.disponivel, true);
  assert.equal(c.semPilares, 'Pilares de outubro ainda não configurados');
  assert.deepEqual([c.consultor, c.supervisao, c.pilares, c.estrat], [[], [], [], null]);
  assert.deepEqual(tabelaFechamento(c, 'consultor').linhas, []);
  assert.match(contextoFechamento(c, cfg).linhas.map((l) => l.celulas.join(' = ')).join('\n'),
    /ATENÇÃO = Pilares de outubro ainda não configurados: nada foi calculado/);
});

test('consulta: snapshot sem os totais por gerência => Estratégicos indisponível, sem somar rotas por conta própria', async () => {
  const { c } = await consultaDe(10, API_NOV); // FECHADO_OUT original, sem o campo `totais`
  assert.equal(c.disponivel, true);
  assert.equal(c.estrat, null);
  assert.match(c.motivoEstrat, /Estratégicos indisponível para este mês/);
  assert.match(c.motivoEstrat, /fechado\/202610\.json não traz os totais/);
  assert.deepEqual(tabelaFechamento(c, 'estrategicos').linhas, []);
  // as outras duas visões continuam inteiras
  assert.equal(tabelaFechamento(c, 'consultor').linhas.length, 3);
  assert.equal(tabelaFechamento(c, 'supervisao').linhas.length, 2);
  assert.equal(totaisDoFechado(FECHADO_OUT, CONFIG), null);
  assert.equal(totaisDoFechado({ ...FECHADO_OUT, totais: { empresa: {} } }, CONFIG), null); // sem gerencias
});

test('consulta Consultor: uma linha por rota, com os pilares do canal e os pontos, o status e a posição do motor', async () => {
  const { c } = await consultaDe(10, API_FECH, CONF_OUT);
  const t = tabelaFechamento(c, 'consultor');
  assert.deepEqual(t.linhas.map((l) => l.codigo).sort(), ['N1', 'N2', 'N3']);
  assert.deepEqual(t.colunas.slice(0, 5).map((x) => x.rotulo), ['Rota', 'Gerência', 'Supervisão', 'Canal', 'Segmento']);
  // N1 (Mista): sabores 105% = 5, retornáveis 100% = 3, Missões validada em outubro = 3, sucos 90% = 2, powerade 80% = 0
  assert.deepEqual([celula(t, 'N1', 'Sabores · Meta'), celula(t, 'N1', 'Sabores · Real'),
                    celula(t, 'N1', 'Sabores · %'), celula(t, 'N1', 'Sabores · Pts')], [100, 105, 105, 5]);
  assert.deepEqual([celula(t, 'N1', 'Sucos · %'), celula(t, 'N1', 'Sucos · Pts')], [90, 2]);
  assert.deepEqual([celula(t, 'N1', 'Powerade · %'), celula(t, 'N1', 'Powerade · Pts')], [80, 0]);
  // Missões Guiadas de outubro entra validada em 100%, sem meta e sem real
  assert.deepEqual([celula(t, 'N1', 'Missões · Meta'), celula(t, 'N1', 'Missões · Real'),
                    celula(t, 'N1', 'Missões · %'), celula(t, 'N1', 'Missões · Pts')], [null, null, 100, 3]);
  // pilar do outro canal fica vazio, nunca zero
  for (const col of ['Refri Single · Meta', 'Refri Single · Real', 'Refri Single · %', 'Refri Single · Pts']) {
    assert.equal(celula(t, 'N1', col), null, col);
  }
  assert.deepEqual([celula(t, 'N1', 'Pontos dos pilares'), celula(t, 'N1', 'Pontos do mês')], [13, 13]);
  assert.deepEqual([celula(t, 'N2', 'Pontos dos pilares'), celula(t, 'N3', 'Pontos dos pilares')], [16, 17]);
  // o +5 do confronto é só do SV: a rota da mesa vencedora não recebe (decisão de 03/11/2026)
  assert.deepEqual(t.linhas.map((l) => celula(t, l.codigo, 'Bônus de confronto')), [0, 0, 0]);
  // gatilho de volume pelo % da categoria Refrigerantes do mês
  assert.deepEqual([celula(t, 'N1', '% Refrigerantes'), celula(t, 'N1', 'Gatilho de volume')], [90, 'não']);
  assert.deepEqual([celula(t, 'N3', '% Refrigerantes'), celula(t, 'N3', 'Gatilho de volume')], [100, 'sim']);
  assert.deepEqual([celula(t, 'N1', 'Gerência'), celula(t, 'N1', 'Supervisão'), celula(t, 'N1', 'Canal'), celula(t, 'N1', 'Segmento')],
    ['Nv', 'Sv. Nv.1', 'Mista', '—']);
});

test('consulta Supervisão: uma linha por SV, com o acumulado do trimestre até o mês e o +5 do confronto vencido', async () => {
  const { c } = await consultaDe(10, API_FECH, CONF_OUT);
  const t = tabelaFechamento(c, 'supervisao');
  assert.deepEqual(t.linhas.map((l) => l.codigo), ['Sv. Nv.2', 'Sv. Nv.1']); // ordem da tela: mais pontos primeiro
  assert.deepEqual(t.colunas.slice(0, 4).map((x) => x.rotulo), ['Supervisão', 'Canal', 'Gerência', 'Rotas na mesa']);
  assert.deepEqual([celula(t, 'Sv. Nv.1', 'Rotas na mesa'), celula(t, 'Sv. Nv.2', 'Rotas na mesa')], [2, 1]);
  // a mesa soma todas as rotas: Sv. Nv.1 = N1 + N2 em sabores (200 de meta, 205 de real = 102,5%)
  assert.deepEqual([celula(t, 'Sv. Nv.1', 'Sabores · Meta'), celula(t, 'Sv. Nv.1', 'Sabores · Real'),
                    celula(t, 'Sv. Nv.1', 'Sabores · %'), celula(t, 'Sv. Nv.1', 'Sabores · Pts')], [200, 205, 102.5, 3]);
  assert.deepEqual([celula(t, 'Sv. Nv.1', 'Pontos dos pilares'), celula(t, 'Sv. Nv.1', 'Bônus de confronto'),
                    celula(t, 'Sv. Nv.1', 'Pontos do mês'), celula(t, 'Sv. Nv.1', 'Pontos acumulados do trimestre')], [12, 0, 12, 12]);
  // Sv. Nv.2 venceu o confronto de sabores (110% x 102,5%): +5 só para o SV, e o mês já fechou
  assert.deepEqual([celula(t, 'Sv. Nv.2', 'Pontos dos pilares'), celula(t, 'Sv. Nv.2', 'Bônus de confronto'),
                    celula(t, 'Sv. Nv.2', 'Pontos do mês'), celula(t, 'Sv. Nv.2', 'Pontos acumulados do trimestre')], [17, 5, 22, 22]);
  // % de Refrigerantes do SV: acumulado do trimestre até o mês consultado (em outubro, só outubro)
  assert.deepEqual([celula(t, 'Sv. Nv.1', '% Refrigerantes acumulado'), celula(t, 'Sv. Nv.2', '% Refrigerantes acumulado')], [87.5, 100]);
  assert.deepEqual([celula(t, 'Sv. Nv.1', 'Gatilho de volume'), celula(t, 'Sv. Nv.2', 'Gatilho de volume')], ['não', 'sim']);
  // nenhum SV chega aos 60 do trimestre em outubro: status "-" e posição só de tela
  assert.deepEqual(t.linhas.map((l) => [celula(t, l.codigo, 'Gatilho de pontos'), celula(t, l.codigo, 'Status'),
                                        celula(t, l.codigo, 'Posição'), celula(t, l.codigo, 'Posição oficial')]),
    [['não', '-', 1, 'não'], ['não', '-', 2, 'não']]);
});

test('consulta: pontos, status e posição de cada linha são os do motor, e a soma dos pilares fecha com os pontos do mês', async () => {
  const { c } = await consultaDe(10, API_FECH, CONF_OUT);
  assert.deepEqual(c.res.alertas, []);
  assert.deepEqual(M.conferir(c.res, c.dados ? null : null), []); // o recálculo do próprio motor não acha divergência
  for (const visao of ['consultor', 'supervisao']) {
    const t = tabelaFechamento(c, visao);
    for (const l of t.linhas) {
      const p = c.res.pessoas.find((x) => (visao === 'consultor' ? x.id : x.nome) === l.codigo);
      const col = (r) => l.celulas[t.colunas.findIndex((x) => x.rotulo === r)];
      assert.equal(col('Status'), p.status, `${l.codigo}: status`);
      assert.equal(col('Gatilho de volume'), p.volume.atingido ? 'sim' : 'não', `${l.codigo}: gatilho de volume`);
      assert.equal(col('Gatilho de pontos'), p.gatilhoPontos.atingido ? 'sim' : 'não', `${l.codigo}: gatilho de pontos`);
      assert.equal(col('Posição oficial'), p.posicao !== null ? 'sim' : 'não', `${l.codigo}: posição oficial`);
      assert.equal(col('Pontos dos pilares'), p.pontosPilares, `${l.codigo}: pontos dos pilares`);
      assert.equal(col('Pontos do mês'), p.pontosMes, `${l.codigo}: pontos do mês`);
      assert.equal(col('Bônus de confronto'), p.pontosConfronto, `${l.codigo}: bônus`);
      // a soma dos pontos por pilar é a coluna de pontos dos pilares; com o bônus, os pontos do mês
      const soma = c.pilares.reduce((s, pl) => s + (col(ROT_PILAR_T(pl.nome) + ' · Pts') || 0), 0);
      assert.equal(soma, p.pontosPilares, `${l.codigo}: soma dos pilares`);
      assert.equal(soma + col('Bônus de confronto'), col('Pontos do mês'), `${l.codigo}: pilares + bônus`);
      // % de cada pilar: o do motor, truncado em 1 casa (nunca arredondado)
      for (const pl of p.pilares) {
        assert.equal(col(ROT_PILAR_T(pl.nome) + ' · %'), pl.pct === null ? null : Math.floor(pl.pct * 10 + 1e-9) / 10, `${l.codigo}: % ${pl.nome}`);
      }
    }
  }
});
test('consulta: a numeração da tela é a mesma das abas Rota e Supervisão (elegíveis primeiro, pela posição oficial)', async () => {
  const { c } = await consultaDe(10, API_FECH, CONF_OUT);
  const pos = posicoesDeTela(c.res.pessoas);
  for (const cargo of ['RT', 'SV']) for (const canal of ['Mista', 'Segmentada']) {
    const g = c.res.pessoas.filter((p) => p.cargo === cargo && p.canal === canal).slice().sort(ordemPainel);
    assert.deepEqual(g.map((p) => pos[p.id]), g.map((_, i) => i + 1), `${cargo} ${canal}`);
    g.filter((p) => p.elegivel).forEach((p) => assert.equal(pos[p.id], p.posicao, `${p.id}: elegível na posição oficial`));
  }
});

test('consulta Estratégicos: volume por gerência dos totais do snapshot, com o TOTAL da empresa e sem pontos', async () => {
  const { c } = await consultaDe(10, API_FECH, CONF_OUT);
  const t = tabelaFechamento(c, 'estrategicos');
  assert.deepEqual(t.linhas.map((l) => l.codigo), ['Nv', 'TOTAL']);
  assert.equal(t.linhas[1].total, true);
  assert.deepEqual(t.colunas.slice(0, 2).map((x) => x.rotulo), ['Gerência', 'Nome']);
  // sem coluna de pontos, gatilho, status, posição ou premiação em nenhuma coluna
  const rot = t.colunas.map((x) => x.rotulo).join(' | ');
  assert.doesNotMatch(rot, /Pts|Pontos|Gatilho|Status|Posição|Prêmio|Premia/);
  // Refri Single fica fora (já está dentro do % Refrigerantes), como na aba Estratégicos
  assert.doesNotMatch(rot, /Refri Single/);
  assert.equal(t.colunas[t.colunas.length - 1].rotulo, '% Refrigerantes');
  // os números são os do snapshot (gerência inteira), não a soma das 3 rotas do incentivo (que daria 400 de meta)
  assert.deepEqual([celula(t, 'Nv', 'Sabores · Meta'), celula(t, 'Nv', 'Sabores · Real'),
                    celula(t, 'Nv', 'Sabores · Dif'), celula(t, 'Nv', 'Sabores · %')], [500, 540, 40, 108]);
  assert.equal(celula(t, 'Nv', '% Refrigerantes'), 97.5); // 3900 / 4000
  assert.deepEqual([celula(t, 'TOTAL', 'Sabores · Meta'), celula(t, 'TOTAL', 'Nome')], [500, 'TOTAL da empresa']);
  assert.equal(c.estrat.origem, 'api');
});

test('consulta: o filtro é só da TELA (canal e busca); o arquivo leva sempre todas as linhas', async () => {
  const { c } = await consultaDe(10, API_FECH, CONF_OUT);
  const t = tabelaFechamento(c, 'consultor');
  assert.equal(filtrarFechamento(t.linhas, 'Mista', '').length, 3);
  assert.equal(filtrarFechamento(t.linhas, 'Segmentada', '').length, 0);
  assert.equal(filtrarFechamento(t.linhas, 'Todos', 'n1').length, 1);
  assert.equal(filtrarFechamento(t.linhas, 'Todos', '').length, 3);
  // a linha de TOTAL do Estratégicos nunca é recortada por canal
  const te = tabelaFechamento(c, 'estrategicos');
  assert.deepEqual(filtrarFechamento(te.linhas, 'Mista', '').map((l) => l.codigo), ['TOTAL']);
  // as abas do arquivo são montadas das linhas inteiras
  const abas = abasFechamento(c, CONFIG);
  assert.deepEqual(abas.map((a) => a.nome), ['Contexto', 'Consultores', 'Supervisões', 'Estratégicos']);
  assert.deepEqual(abas.slice(1).map((a) => a.linhas.length), [3, 2, 2]);
});

// ── a planilha .xlsx: lida de volta com um leitor de ZIP independente (CRC bit a bit, não a tabela do gerador) ──
/** CRC-32 bit a bit: implementação diferente da do gerador, para a conferência do CRC não ser circular. */
function crc32Bit(buf) {
  let c = 0xFFFFFFFF >>> 0;
  for (let i = 0; i < buf.length; i++) {
    c = (c ^ buf[i]) >>> 0;
    for (let k = 0; k < 8; k++) c = (c & 1 ? (c >>> 1) ^ 0xEDB88320 : c >>> 1) >>> 0;
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}
/** Lê um ZIP com arquivos "stored" pelo diretório central, conferindo o CRC de cada um. */
function lerZip(bytes) {
  const b = Buffer.from(bytes);
  const fim = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(fim > 0, 'ZIP sem fim de diretório central');
  const n = b.readUInt16LE(fim + 10), inicio = b.readUInt32LE(fim + 16), tamCentral = b.readUInt32LE(fim + 12);
  assert.equal(b.readUInt16LE(fim + 8), n, 'contagem de entradas inconsistente');
  const out = {};
  let p = inicio;
  for (let i = 0; i < n; i++) {
    assert.equal(b.readUInt32LE(p), 0x02014b50, 'assinatura do diretório central');
    const metodo = b.readUInt16LE(p + 10), crc = b.readUInt32LE(p + 16), tam = b.readUInt32LE(p + 24);
    const nl = b.readUInt16LE(p + 28), el = b.readUInt16LE(p + 30), cl = b.readUInt16LE(p + 32), desl = b.readUInt32LE(p + 42);
    const nome = b.subarray(p + 46, p + 46 + nl).toString('utf8');
    assert.equal(metodo, 0, 'arquivo comprimido (o gerador grava "stored"): ' + nome);
    assert.equal(b.readUInt32LE(p + 20), tam, nome + ': tamanho comprimido diferente do original');
    assert.equal(b.readUInt32LE(desl), 0x04034b50, nome + ': assinatura do cabeçalho local');
    assert.equal(b.readUInt32LE(desl + 14), crc, nome + ': CRC diferente entre o cabeçalho local e o central');
    const ini = desl + 30 + b.readUInt16LE(desl + 26) + b.readUInt16LE(desl + 28);
    const dados = b.subarray(ini, ini + tam);
    assert.equal(crc32Bit(dados), crc, nome + ': CRC do ZIP não bate');
    out[nome] = dados.toString('utf8');
    p += 46 + nl + el + cl;
  }
  assert.equal(p - inicio, tamCentral, 'tamanho do diretório central');
  return out;
}
const linhasDaAba = (xml) => (xml.match(/<row /g) || []).length;
const celulasDaLinha = (xml, r) => {
  const m = new RegExp(`<row r="${r}">(.*?)</row>`, 's').exec(xml);
  return m ? (m[1].match(/<c [^>]*>.*?<\/c>/gs) || []) : [];
};

test('xlsx: o arquivo gerado abre, tem as quatro abas e o CRC de cada parte do ZIP bate', async () => {
  const { c } = await consultaDe(10, API_FECH, CONF_OUT);
  const z = lerZip(planilhaXlsx(abasFechamento(c, CONFIG)));
  assert.deepEqual(Object.keys(z), ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels',
    'xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/worksheets/sheet3.xml', 'xl/worksheets/sheet4.xml']);
  const nomes = [...z['xl/workbook.xml'].matchAll(/<sheet name="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(nomes, ['Contexto', 'Consultores', 'Supervisões', 'Estratégicos']);
  // cada aba tem a mesma contagem de linhas da visão (mais o cabeçalho), congelamento e filtro
  const abas = abasFechamento(c, CONFIG);
  abas.forEach((a, i) => {
    const xml = z[`xl/worksheets/sheet${i + 1}.xml`];
    assert.equal(linhasDaAba(xml), a.linhas.length + 1, a.nome + ': linhas');
    assert.match(xml, /<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"\/>/, a.nome + ': cabeçalho congelado');
    assert.match(xml, /<autoFilter ref="A1:[A-Z]+1"\/>/, a.nome + ': filtro');
    assert.match(xml, /<cols><col min="1"/, a.nome + ': larguras de coluna');
    // cabeçalho na 1ª linha, com o estilo de negrito (s="1")
    const cab = celulasDaLinha(xml, 1);
    assert.equal(cab.length, a.colunas.length, a.nome + ': colunas do cabeçalho');
    cab.forEach((cel) => assert.match(cel, /s="1" t="inlineStr"/, a.nome + ': cabeçalho em texto e negrito'));
  });
  assert.equal((z['[Content_Types].xml'].match(/worksheets\/sheet/g) || []).length, 4);
  assert.match(z['xl/styles.xml'], /formatCode="#,##0.0"/);
  assert.match(z['xl/styles.xml'], /formatCode="0.0&quot;%&quot;"/);
});

test('xlsx: número é NÚMERO (nunca texto) e o % vai truncado em 1 casa, com formato de 1 casa', async () => {
  const { c } = await consultaDe(10, API_FECH, CONF_OUT);
  const abas = abasFechamento(c, CONFIG);
  const z = lerZip(planilhaXlsx(abas));
  const iCons = abas.findIndex((a) => a.nome === 'Consultores');
  const xml = z[`xl/worksheets/sheet${iCons + 1}.xml`];
  const cols = abas[iCons].colunas;
  // toda célula de coluna numérica preenchida sai como <v>, e nenhuma como texto
  abas[iCons].linhas.forEach((l, i) => {
    const cels = celulasDaLinha(xml, i + 2);
    const porRef = {};
    cels.forEach((cel) => { porRef[/r="([A-Z]+)\d+"/.exec(cel)[1]] = cel; });
    l.celulas.forEach((v, j) => {
      const cel = porRef[colunaXlsx(j + 1)], tipo = cols[j].tipo;
      if (v === null || v === undefined || v === '') return assert.equal(cel, undefined, `linha ${i + 2} col ${j + 1}: vazia`);
      if (tipo === 'volume' || tipo === 'pct' || tipo === 'inteiro') {
        assert.doesNotMatch(cel, /inlineStr/, `${cols[j].rotulo}: número gravado como texto`);
        assert.match(cel, /<v>-?[0-9.]+<\/v>/, `${cols[j].rotulo}: sem valor numérico`);
        const lido = Number(/<v>(-?[0-9.]+)<\/v>/.exec(cel)[1]);
        assert.equal(lido, tipo === 'volume' ? Math.round(v * 10) / 10 : v, `${cols[j].rotulo}: valor`);
      } else {
        assert.match(cel, /t="inlineStr"/, `${cols[j].rotulo}: texto`);
      }
    });
  });
  // o % do pilar na planilha é o truncado do motor: 102,5% do SV não vira 103
  const abaSv = abas.find((a) => a.nome === 'Supervisões');
  const jPct = abaSv.colunas.findIndex((x) => x.rotulo === 'Sabores · %');
  const lSv = abaSv.linhas.find((l) => l.codigo === 'Sv. Nv.1');
  assert.equal(lSv.celulas[jPct], 102.5);
  assert.equal(abaSv.colunas[jPct].tipo, 'pct');
  // nenhum valor de prêmio, orçamento ou custo e nenhum dado de cliente em nenhuma aba
  const tudo = Object.values(z).join('\n');
  assert.doesNotMatch(tudo, /iPhone|PS5|Air Fryer|Lava-louças|R\$|orçament|\bcusto\b|\bcliente/i);
});

test('xlsx: utilitários (coluna, nome de aba e CRC) e recusa sem aba', () => {
  assert.deepEqual([1, 26, 27, 28, 52, 53].map(colunaXlsx), ['A', 'Z', 'AA', 'AB', 'AZ', 'BA']);
  assert.equal(nomeAba('Supervisões'), 'Supervisões');
  assert.equal(nomeAba('a/b[c]:d*e?f\\g'), 'a b c  d e f g');
  assert.equal(nomeAba('x'.repeat(40)).length, 31);
  assert.equal(nomeAba(''), 'Planilha');
  assert.equal(crc32(Buffer.from('123456789', 'utf8')), crc32Bit(Buffer.from('123456789', 'utf8')));
  assert.equal(crc32(Buffer.from('', 'utf8')), 0);
  assert.throws(() => planilhaXlsx([]), /nenhuma aba/);
});

test('xlsx: a aba Contexto diz o estado, a origem e o cálculo, e conta as linhas das três visões', async () => {
  const { c } = await consultaDe(10, API_FECH_PREVIA, CONF_OUT);
  const ctx = contextoFechamento(c, CONFIG);
  const mapa = Object.fromEntries(ctx.linhas.map((l) => l.celulas));
  assert.equal(mapa['Mês do fechamento'], 'Outubro/26');
  assert.equal(mapa['Estado'], 'PRÉVIA');
  assert.equal(mapa['gerado_em (gravação do arquivo)'], '2026-11-03T18:46:02');
  assert.equal(mapa['atualizado_em (execução de origem)'], '2026-11-03T18:45:10');
  assert.match(mapa['Origem dos dados'], /api\/v1\/fechado\/202610\.json/);
  assert.match(mapa['Cálculo'], /motor do painel/);
  assert.match(mapa['% exibido'], /truncado/);
  assert.match(mapa['Gatilho de volume'], /95%/);
  assert.match(mapa['Gatilho de pontos'], new RegExp(`Consultor ${M.REGRAS.gatilhoPontos.RT} no mês`));
  assert.match(mapa['Bônus de confronto'], /as rotas da mesa não recebem/);
  assert.match(mapa['Estratégicos'], /sem pontos, sem gatilhos e sem premiação/);
  assert.equal(mapa['Linhas'], 'Consultores: 3 · Supervisões: 2 · Estratégicos: 2');
  assert.match(mapa['Missões Guiadas'], /em outubro entra validada em 100%/);
  assert.deepEqual(ctx.colunas.map((x) => x.rotulo), ['Item', 'Conteúdo']);
});

test('consulta: o bloco da Administração tem o seletor de mês, as três visões, o filtro e o botão de exportar', () => {
  const fs = require('fs'), path = require('path');
  const tpl = fs.readFileSync(path.join(__dirname, '../src/app.tpl.html'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '../../frontend/desafio-q4.html'), 'utf8');
  assert.match(tpl, /<h3>Fechamento do mês \(consulta e exportação\)<\/h3>/);
  assert.match(tpl, /id="fc-mes"/);
  assert.match(tpl, /id="fc-visoes"/);
  assert.match(tpl, /id="fc-canal"/);
  assert.match(tpl, /id="fc-busca"/);
  assert.match(tpl, /id="fc-exportar"[^>]*>Exportar \.xlsx/);
  // acessibilidade e print: cabeçalho de coluna e de linha marcados, status com cor E texto
  assert.match(tpl, /<th scope="col"/);
  assert.match(tpl, /<th scope="row">/);
  assert.match(tpl, /class="fcst \$\{fcStatusCls\(v\)\}">\$\{esc\(v\)\}/);
  // a consulta não recalcula nada: as linhas e as abas vêm do adaptador
  assert.match(tpl, /tabelaFechamento\(c, FC\.visao\)/);
  assert.match(tpl, /planilhaXlsx\(abasFechamento\(c, CONFIG\)\)/);
  assert.match(html, /Fechamento do mês \(consulta e exportação\)/, 'rode python painel-q4/scripts/build.py');
  assert.match(html, /function planilhaXlsx/, 'rode python painel-q4/scripts/build.py');
});

// ───────────── Administração em tópicos (etapa 15): contagens e estados, fixtures sintéticas ─────────────
const A15 = require('../src/adapter.js');

test('admin tópicos: cada alteração para publicar cai no selo do tópico dela', () => {
  assert.deepEqual(A15.TOPICOS_ADMIN.map((t) => t.id), ['resumo', 'confrontos', 'pilares', 'canais', 'regras', 'fechamento']);
  const dif = ['regras:gatilhoPontos.RT', 'regras:faixas', 'pilares:Mista', 'agrupadores:agua', 'canais:R01', 'canaisSV:Sv. Xx.1',
               'confrontos:11|Sv. Xx.1#Mista|Sv. Xx.2#Mista', 'flash:202610'].map((chave) => ({ chave }));
  assert.deepEqual(A15.contagemPorTopico(dif), { regras: 2, pilares: 2, canais: 2, confrontos: 1, fechamento: 1 });
  assert.deepEqual(A15.contagemPorTopico([]), {});
  assert.equal(A15.topicoDoItem('desconhecido:x'), null);
});

test('admin resumo: mês da API x mês esperado pelo calendário (no fechamento, o anterior); sem API, alerta', () => {
  const meta = (mes, fechamento, origem = 'api') => ({ mes, ano: 2026, fechamento, origem });
  assert.equal(A15.estadoMesApi(meta(11, false), new Date(2026, 10, 5)).ok, true);
  assert.equal(A15.estadoMesApi(meta(11, true), new Date(2026, 11, 1)).ok, true);   // 1º dia útil de dezembro: novembro fechando
  const velho = A15.estadoMesApi(meta(10, false), new Date(2026, 10, 5));          // API parada em outubro
  assert.deepEqual([velho.ok, velho.motivo, velho.esperado], [false, 'outro-mes', { mes: 11, ano: 2026 }]);
  assert.equal(A15.estadoMesApi(meta(12, true), new Date(2027, 0, 2)).ok, true);   // virada de ano
  const base = A15.estadoMesApi(meta(11, false, 'base'), new Date(2026, 10, 5));
  assert.deepEqual([base.ok, base.motivo], [false, 'sem-api']);
});

test('admin resumo: pilares do mês — 5 pilares nos dois canais e a fonte das Missões Guiadas quando o mês tem meta', () => {
  const C = A15.CONFIG;
  const out = A15.estadoPilaresMes(C, 10, [10]);
  assert.deepEqual([out.ok, out.configurado, out.exigeMeta], [true, true, false]);       // outubro: validada em 100%
  const nov = A15.estadoPilaresMes(C, 11, [10]);
  assert.deepEqual([nov.ok, nov.configurado, nov.exigeMeta, nov.missaoSemFonte], [false, true, true, true]); // sem fonte: Pendente
  const dez = A15.estadoPilaresMes(C, 12, [10]);
  assert.equal(dez.configurado, false);
  assert.deepEqual(dez.canais.map((c) => [c.canal, c.n, c.ok]), [['Mista', 3, false], ['Segmentada', 3, false]]);
  // com fonte definida para Missões Guiadas, novembro fica OK (a fonte vem da configuração, nunca de 100% assumido)
  const comFonte = Object.assign({}, C, { fonteDoPilar: Object.assign({}, C.fonteDoPilar, { 'Missões Guiadas': 'Missoes Teste' }) });
  assert.equal(A15.estadoPilaresMes(comFonte, 11, [10]).ok, true);
});

test('admin resumo: meses fechados — ok, incompleto (sem pilares) e indisponível (sem arquivo)', () => {
  const ok = A15.estadoMesesFechados(11, { usados: [{ mes: 10, final: false }], faltando: [] });
  assert.deepEqual([ok.estado, ok.meses.map((m) => [m.mes, m.estado, m.previa])], ['ok', [[10, 'ok', true]]]);
  const ind = A15.estadoMesesFechados(12, { usados: [{ mes: 10, final: true }], faltando: [{ mes: 11, motivo: 'novembro não está nos meses fechados da API' }] });
  assert.deepEqual([ind.estado, ind.meses.map((m) => m.estado)], ['indisponivel', ['ok', 'indisponivel']]);
  const inc = A15.estadoMesesFechados(11, { usados: [{ mes: 10 }], faltando: [{ mes: 10, motivo: 'Pilares de outubro ainda não configurados' }] });
  assert.deepEqual([inc.estado, inc.meses[0].estado], ['incompleto', 'incompleto']);
  assert.deepEqual(A15.estadoMesesFechados(10, null), { estado: 'ok', meses: [] });
});

// mesas fictícias: Sv. Xx.1 (2 Mista + 1 Segmentada, uma rota sem canal), Sv. Xx.2 (empate), Sv. Xx.3 (toda sem canal)
const SEG15 = A15.linhasSegmentacao([
  { rota: 'R01', gc: 'Xx', sv: 'Sv. Xx.1' }, { rota: 'R02', gc: 'Xx', sv: 'Sv. Xx.1' }, { rota: 'R03', gc: 'Xx', sv: 'Sv. Xx.1' },
  { rota: 'R04', gc: 'Xx', sv: 'Sv. Xx.1' },
  { rota: 'R05', gc: 'Xx', sv: 'Sv. Xx.2' }, { rota: 'R06', gc: 'Xx', sv: 'Sv. Xx.2' },
  { rota: 'R07', gc: 'Yy', sv: 'Sv. Yy.3' },
  { rota: 'R08', gc: 'Yy', sv: null },
], { rotas: [
  { rota: 'R01', canal: 'Mista' }, { rota: 'R02', canal: 'Mista' }, { rota: 'R03', canal: 'Segmentada', sub: 'Mini' },
  { rota: 'R05', canal: 'Mista' }, { rota: 'R06', canal: 'Segmentada', sub: 'Mod' }, { rota: 'R08', canal: 'Mista' },
] }, null);

test('admin canal das rotas: pendências (SV sem canal, empate e rota sem canal) e as contagens do Resumo', () => {
  const p = A15.pendenciasCanais(SEG15, {}, {});
  assert.deepEqual(p.map((x) => [x.sv, x.svSemCanal, x.empate, x.rotasSemCanal]),
    [['Sv. Xx.1', false, false, ['R04']], ['Sv. Xx.2', true, true, []], ['Sv. Yy.3', true, false, ['R07']]]);
  const confs = [{ mes: 11 }, { mes: 11 }, { mes: 10 }];
  assert.deepEqual(A15.contagensCanal(SEG15, {}, {}, confs, 11), { svsSemCanal: 2, svsEmpate: 1, rotasSemCanal: 2, rotasSemSV: 1, confrontosMes: 2 });
  // a edição em curso conta: escolher o canal do SV resolve o empate; dar canal à R04 tira a pendência da Xx.1
  assert.deepEqual(A15.pendenciasCanais(SEG15, { R04: 'Mista' }, { 'Sv. Xx.2': 'Mista' }).map((x) => x.sv), ['Sv. Yy.3']);
  assert.equal(A15.contagensCanal(SEG15, { R04: 'Mista' }, { 'Sv. Xx.2': 'Mista' }, confs, 10).confrontosMes, 1);
  assert.equal(A15.contagensCanal(SEG15, { R01: '|Neutraliza' }, {}, [], 11).rotasSemCanal, 3);
  // etiquetas da rota: Sem canal (amarelo) e Difere do SV (azul, só informativo)
  assert.deepEqual([A15.etiquetaRota(null, 'Mista'), A15.etiquetaRota('Segmentada', 'Mista'), A15.etiquetaRota('Mista', 'Mista'),
                    A15.etiquetaRota('Mista', null)], ['sem-canal', 'difere-sv', null, null]);
});

test('admin canal das rotas: gravar e ler canal e segmento continua idêntico (regressão do ajustes.json)', () => {
  const ed = { R01: '|Neutraliza', R02: 'Segmentada|Mod', R04: 'Mista' };
  const canais = A15.canaisDaEdicao(SEG15, ed, { R99: { canal: 'Mista', sub: null } });
  assert.deepEqual(canais, {
    R99: { canal: 'Mista', sub: null, segmento: null },               // ajuste de rota fora da lista é mantido
    R01: { canal: null, sub: null, segmento: 'Neutraliza' },
    R02: { canal: 'Segmentada', sub: 'Mod', segmento: 'Mod' },
    R04: { canal: 'Mista', sub: null, segmento: null },
  });
  const lido = A15.normalizarAjustes({ canais }).canais;
  const de = A15.linhasSegmentacao(SEG15.map((l) => ({ rota: l.rota, gc: l.gc, sv: l.sv })),
    { rotas: [{ rota: 'R01', canal: 'Mista' }, { rota: 'R02', canal: 'Mista' }, { rota: 'R03', canal: 'Segmentada', sub: 'Mini' },
              { rota: 'R05', canal: 'Mista' }, { rota: 'R06', canal: 'Segmentada', sub: 'Mod' }, { rota: 'R08', canal: 'Mista' }] }, lido);
  for (const [rota, v] of Object.entries(ed)) assert.equal(de.find((l) => l.rota === rota).atual, v, rota);
});

test('admin confrontos: estado do mês (fechado, em andamento, futuro) e quando o cadastro abre', () => {
  const C = A15.CONFIG;
  const e = (m, ref, fech) => { const x = A15.estadoMesConfrontos(m, ref, fech, C); return [x.estado, x.rotulo, x.editavel, x.bloqueio]; };
  assert.deepEqual(e(10, 11, false), ['fechado', 'Fechado', false, 'fechado']);
  assert.deepEqual(e(11, 11, false), ['andamento', 'Em andamento', true, null]);
  assert.deepEqual(e(11, 11, true), ['fechado', 'Fechado', false, 'fechado']);         // período de fechamento da API
  assert.deepEqual(e(12, 11, false), ['futuro', 'Futuro', false, 'sem-pilares']);      // dezembro sem os 5 pilares: bloqueado
  const comDez = Object.assign({}, C, { pilaresConfig: C.pilaresConfig.map((x) => x.mes !== 12 ? x
    : Object.assign({}, x, { pilares: x.pilares.concat([{ nome: 'Volume Sucos', tipo: 'volume' }, { nome: 'Volume Teste', tipo: 'volume' }]) })) });
  assert.deepEqual(A15.estadoMesConfrontos(12, 11, false, comDez).editavel, true);       // futuro com os 5 pilares: abre
  const lista = [{ mes: 10, id: 'a' }, { mes: 11, id: 'b' }, { mes: 11, id: 'c' }];
  assert.deepEqual(A15.confrontosDoMes(lista, 11).map((c) => c.id), ['b', 'c']);
  assert.deepEqual(A15.confrontosDoMes(null, 11), []);
});

test('admin confrontos: o resultado vem do motor; mês fechado sem arquivo fica indisponível e não apura', () => {
  const cfg = [10, 11].flatMap((mes) => ['Mista'].map((canal) => ({ mes, canal, pilares: [
    { nome: 'Volume Sabores', tipo: 'volume' }, { nome: 'Volume Sucos', tipo: 'volume' }, { nome: 'Volume Powerade', tipo: 'volume' },
    { nome: 'Volume Retornáveis', tipo: 'volume' }, { nome: 'Missões Guiadas', tipo: 'missao' }] })));
  const sv = (id) => ({ id, nome: id, cargo: 'SV', canal: 'Mista', id_supervisor: null, unidade: 'Xx' });
  const md = (id, mes, pilar, pct) => ({ id, mes, pilar, meta: 100, real: pct, online: 0 });
  const medidas = [];
  for (const mes of [10, 11]) for (const [id, s, r] of [['A#Mista', 98, 96], ['B#Mista', 101, 96], ['C#Mista', 101, 97], ['D#Mista', 101, 90]]) {
    medidas.push(md(id, mes, 'Volume Sabores', s), md(id, mes, 'Refrigerantes', r));
    for (const p of ['Volume Sucos', 'Volume Powerade', 'Volume Retornáveis']) medidas.push(md(id, mes, p, 90));
  }
  const confrontos = [
    { mes: 11, id_sv_desafiante: 'A#Mista', id_sv_desafiado: 'B#Mista', pilar: 'Volume Sabores', ordem_registro: 1 }, // B à frente
    { mes: 11, id_sv_desafiante: 'C#Mista', id_sv_desafiado: 'D#Mista', pilar: 'Volume Sabores', ordem_registro: 2 }, // empate: desempate
    { mes: 11, id_sv_desafiante: 'A#Mista', id_sv_desafiado: 'B#Mista', pilar: 'Volume Sucos', ordem_registro: 3 },   // B já recebeu
    { mes: 10, id_sv_desafiante: 'A#Mista', id_sv_desafiado: 'B#Mista', pilar: 'Volume Sabores', ordem_registro: 4 },
  ];
  const res = M.calcular({ mesRef: 11, pessoas: ['A#Mista', 'B#Mista', 'C#Mista', 'D#Mista'].map(sv), pilaresConfig: cfg, medidas, confrontos });
  const est = (m) => A15.estadoMesConfrontos(m, 11, false, { pilaresConfig: cfg, fonteDoPilar: {} });
  const r = (c, f) => A15.resultadoConfrontoAdmin(c, res.confrontos, est(c.mes), f);
  assert.deepEqual([r(confrontos[0]).tipo, r(confrontos[0]).vencedor], ['parcial', 'B#Mista']);     // mês aberto: parcial
  assert.deepEqual([r(confrontos[1]).tipo, r(confrontos[1]).desempate, r(confrontos[1]).vencedor], ['parcial', true, 'C#Mista']);
  assert.deepEqual([r(confrontos[2]).tipo, r(confrontos[2]).motivo], ['nao-vale', 'DESAFIADO_JA_RECEBEU']);
  assert.deepEqual([r(confrontos[3], { estado: 'ok' }).tipo, r(confrontos[3], { estado: 'ok' }).vencedor], ['venceu', 'B#Mista']);
  // mês fechado sem o arquivo: nada de apuração, mesmo que o motor tenha devolvido um detalhe
  assert.deepEqual(r(confrontos[3], { estado: 'indisponivel' }), { tipo: 'indisponivel', det: null });
  assert.deepEqual(r(confrontos[3], { estado: 'incompleto' }), { tipo: 'sem-pilares', det: null });
  // incluído na tela e ainda não salvo: o motor não o viu
  assert.equal(r({ mes: 11, id_sv_desafiante: 'C#Mista', id_sv_desafiado: 'A#Mista', pilar: 'Volume Sucos' }).tipo, 'pendente');
  // mês futuro: não apura
  assert.equal(A15.resultadoConfrontoAdmin({ mes: 12 }, res.confrontos, { estado: 'futuro' }, null).tipo, 'futuro');
  // empate sem desempate: tipo "empate"; sem dado: "sem-dado" (detalhes sintéticos no formato do motor)
  const d0 = res.confrontos.find((d) => d.mes === 11 && d.pilar === 'Volume Sabores' && d.desafiado === 'B#Mista');
  assert.equal(A15.resultadoConfrontoAdmin(confrontos[0], [Object.assign({}, d0, { vencedor: null, motivo: 'EMPATE_SEM_VENCEDOR' })], est(11), null).tipo, 'empate');
  assert.equal(A15.resultadoConfrontoAdmin(confrontos[0], [Object.assign({}, d0, { vencedor: null, motivo: 'SEM_DADO_PARA_APURAR' })], est(11), null).tipo, 'sem-dado');
});

test('admin pilares do mês: etiqueta Fixo, Coringa ou "Validada em 100%"; mês sem os 5 pilares mostra o que falta', () => {
  const C = A15.CONFIG;
  assert.deepEqual(A15.pilaresDoTopico(C, 10, 'Segmentada', [10]).map((l) => [l.n, l.etiqueta]),
    [[1, 'Fixo'], [2, 'Fixo'], [3, 'Fixo'], [4, 'Coringa'], [5, 'Validada em 100%']]);
  const nov = A15.pilaresDoTopico(C, 11, 'Mista', [10]);
  assert.deepEqual(nov.find((l) => l.nome === 'Missões Guiadas'), { n: 3, nome: 'Missões Guiadas', tipo: 'missao', coringa: false, etiqueta: 'Fixo', semFonte: true });
  assert.equal(nov.filter((l) => l.semFonte).length, 1);
  const dez = A15.pilaresDoTopico(C, 12, 'Mista', [10]);
  assert.deepEqual(dez.map((l) => l.nome === null), [false, false, false, true, true]);
  assert.deepEqual(dez.slice(3).map((l) => l.etiqueta), ['Coringa', 'Coringa']);
});

test('admin: o template usa as funções do adaptador e mantém os ids dos botões; número de regra nunca fixo', () => {
  const fs = require('fs'), path = require('path');
  const tpl = fs.readFileSync(path.join(__dirname, '../src/app.tpl.html'), 'utf8');
  for (const id of ['adm-salvar', 'adm-publicar', 'adm-baixar', 'adm-descartar', 'adm-sair', 'adm-npend', 'adm-msg', 'adm-pend', 'adm-login'])
    assert.match(tpl, new RegExp(`id="${id}"`), id);
  assert.match(tpl, /role="tablist" aria-label="Tópicos da Administração"/);
  assert.match(tpl, /id="adm-como"[^>]*aria-expanded="false"/);
  for (const f of ['estadoMesApi', 'estadoPilaresMes', 'estadoMesesFechados', 'contagensCanal', 'pendenciasCanais', 'estadoMesConfrontos',
                   'resultadoConfrontoAdmin', 'pilaresDoTopico', 'contagemPorTopico', 'etiquetaRota'])
    assert.match(tpl, new RegExp(f + '\\('), f);
  // o bloco novo da Administração lê os valores de R (nunca 17, 20, 60, 95, 90/100/105, 40, 12, 10, 2 ou 5 fixos no texto)
  const ini = tpl.indexOf('let ADM_TOP'), fim = tpl.indexOf('// campo do formulário -> chave do ajuste');
  const bloco = tpl.slice(ini, fim).replace(/\$\{[^}]*\}/g, '').replace(/maxlength="\d+"|(min-)?width:\d+px/g, '');
  assert.ok(ini > 0 && fim > ini);
  for (const n of ['17', '20', '60', '95', '105', ' 40', ' 12 ']) assert.doesNotMatch(bloco.replace(/04\/11\/2026|28 e 30\/10|29\/10|30\/10|3\.6|dia 12/g, ''), new RegExp('[^0-9]' + n.trim() + '[^0-9/]'), n);
});
