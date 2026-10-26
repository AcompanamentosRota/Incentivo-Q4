/*
 * Adaptador: dados -> entrada do motor.
 * Fonte: a API do metas-produtos (./api/v1/, publicada no mesmo site do painel). Sem ela (HTML aberto direto do
 * computador, API em outro mês ou falha de rede), usa a base embutida (data/data.json, gerada dos Excel do SAP).
 */
const CONFIG = {
  mes: 10,
  ano: 2026,
  api: './api/v1/',
  // Agrupador do modelo SAP -> id do produto na API (index.json -> produtos)
  produtoDaApi: {
    'Powerade': 'powerade',
    'Refrigerantes': 'refrigerantes',
    'Refrigerantes Individual': 'individuais',
    'Refrigerantes Retornavel': 'retornaveis',
    'Sabores Tt': 'sabores',
    'Sucos': 'sucos',
  },
  // Pilares por canal e mês (coringas 4 e 5 mudam a cada mês: ler da configuração, não do código)
  pilaresConfig: [
    { mes: 10, canal: 'Mista', pilares: [
      { nome: 'Volume Sabores', tipo: 'volume' }, { nome: 'Volume Retornáveis', tipo: 'volume' },
      { nome: 'Missões Guiadas', tipo: 'missao' }, { nome: 'Volume Sucos', tipo: 'volume' }, { nome: 'Volume Powerade', tipo: 'volume' } ] },
    { mes: 10, canal: 'Segmentada', pilares: [
      { nome: 'Volume Sabores', tipo: 'volume' }, { nome: 'Volume Refri Single', tipo: 'volume' },
      { nome: 'Volume Powerade', tipo: 'volume' }, { nome: 'Volume Sucos', tipo: 'volume' }, { nome: 'Missões Guiadas', tipo: 'missao' } ] },
  ],
  // Pilar do desafio -> agrupador de produto no modelo SAP
  fonteDoPilar: {
    'Volume Sabores': 'Sabores Tt',
    'Volume Retornáveis': 'Refrigerantes Retornavel',
    'Volume Refri Single': 'Refrigerantes Individual',
    'Volume Powerade': 'Powerade',
    'Volume Sucos': 'Sucos',
  },
  // Gatilho de 95% e desempate: categoria Refrigerantes do SAC (agrupador com todos os itens de refri), vinda da API.
  refri: 'Refrigerantes',
  // Só para a base embutida, que não traz a categoria: soma provisória de Individual + Retornável.
  refriProvisorio: ['Refrigerantes Individual', 'Refrigerantes Retornavel'],
  // Colunas da base: [meta, real, online (WF Online), hoje, meta dia]
  idx: { meta: 0, real: 1, online: 2, hoje: 3, metaDia: 4 },
};

const svKey = (r) => r.sv + '#' + r.canal; // Supervisão por canal (SV com rotas nos dois canais aparece nos dois)

/*
 * API (index.json + gerencias/*.json) -> mesmo formato da base embutida.
 * A API ainda não traz o canal (Mista/Segmentada): ele vem da base embutida, e rota sem canal vai para semCanal.
 * Real = faturado no mês (inclui o faturado de hoje); Online = pedidos de hoje ainda não faturados.
 * Devolve null se a API estiver em outro mês (os pilares do mês ficam em CONFIG.pilaresConfig).
 */
function dadosDaApi(index, gerencias, base, cfg) {
  const ref = index.mes_referencia;
  if (ref.anomes !== cfg.ano + String(cfg.mes).padStart(2, '0')) return null;
  const I = cfg.idx;
  const canal = {};
  base.rotas.forEach((r) => { canal[r.rota] = { canal: r.canal, sub: r.sub }; });
  const titulo = (s) => s.charAt(0) + s.slice(1).toLowerCase(); // 'AN' -> 'An'
  const svNome = (sv) => sv.replace(/^SV\.([A-Z0-9]+)\.(\d+)$/, (_, g, n) => `Sv. ${titulo(g)}.${n}`); // 'SV.AN.1' -> 'Sv. An.1'
  const ids = new Set(index.produtos.map((p) => p.id));
  const faltam = Object.keys(cfg.produtoDaApi).filter((ag) => !ids.has(cfg.produtoDaApi[ag]));
  const rotas = [], semCanal = [], naApi = new Set();
  for (const g of gerencias) for (const r of g.rotas) {
    if (r.tipo === 'eventual') continue; // soma dos clientes em rotas EV*: sem meta, não é um consultor
    naApi.add(r.id);
    const gc = titulo(r.gerencia), c = canal[r.id];
    if (!c) { semCanal.push({ gc, rota: r.id }); continue; }
    const v = {};
    for (const [ag, id] of Object.entries(cfg.produtoDaApi)) {
      const b = r.produtos[id], linha = [null, null, null, null, null];
      if (b) { linha[I.meta] = b.meta; linha[I.real] = b.realizado; linha[I.online] = b.online_hoje; linha[I.metaDia] = b.meta_dia; }
      v[ag] = linha;
    }
    rotas.push({ gc, sv: svNome(r.supervisao), rota: r.id, canal: c.canal, sub: c.sub, v });
  }
  const [dia, hora] = index.atualizado_em.split('T');
  const corte = dia.split('-').reverse().join('/') + ' ' + hora.slice(0, 5);
  return {
    meta: {
      mes: cfg.mes, ano: cfg.ano, corte, corteSeg: base.meta.corteSeg, origem: 'api', fechamento: ref.fechamento,
      fonte: `API metas-produtos · SAP Datasphere · ${hora.slice(0, 5)}`,
      fonteLonga: `API metas-produtos (SAP Datasphere, atualizada a cada 15 min em dias úteis; dados de ${corte}). ` +
        `Canal Mista/Segmentada da base de segmentação de ${base.meta.corteSeg} (provisório)`,
      medidas: base.meta.medidas, produtos: Object.keys(cfg.produtoDaApi), totalRotasModelo: naApi.size,
      refriCategoria: !faltam.includes(cfg.refri),
      aviso: faltam.length ? `a API ainda não traz ${faltam.join(', ')}` : null,
    },
    rotas, semCanal, duplicadas: base.duplicadas,
    segSemInfos: base.rotas.map((r) => r.rota).filter((r) => !naApi.has(r)),
  };
}

function comAviso(base, aviso) {
  return Object.assign({}, base, { meta: Object.assign({}, base.meta, { origem: 'base', aviso, fonte: base.meta.fonte + ' · base embutida' }) });
}

/** Lê a API no mesmo site; qualquer falha cai na base embutida, com o motivo em meta.aviso. */
async function carregarDados(base, cfg) {
  cfg = cfg || CONFIG;
  const ler = async (caminho) => {
    const r = await fetch(cfg.api + caminho, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`${caminho}: HTTP ${r.status}`);
    return r.json();
  };
  try {
    const index = await ler('index.json');
    const gerencias = await Promise.all(index.gerencias.map((g) => ler(g.arquivo)));
    return dadosDaApi(index, gerencias, base, cfg) ||
      comAviso(base, `a API está em ${index.mes_referencia.rotulo} e o painel está configurado para ${cfg.mes}/${cfg.ano}`);
  } catch (erro) {
    return comAviso(base, `API indisponível (${erro.message})`);
  }
}

/** Agrupadores que formam o Refrigerantes do gatilho: a categoria (API) ou, sem ela, a soma provisória. */
const componentesRefri = (dados, cfg) => (dados.meta.refriCategoria ? [cfg.refri] : cfg.refriProvisorio);

function montarEntrada(dados, cfg) {
  const I = cfg.idx;
  const compRefri = componentesRefri(dados, cfg);
  const pessoas = [];
  const medidas = [];
  const notasRefri = [];
  const svAgg = {};
  const somar = (k, nome, v) => { const a = (k[nome] = k[nome] || { meta: 0, real: 0, online: 0, n: 0 }); a.meta += v.meta; a.real += v.real; a.online += v.online; a.n++; };
  for (const r of dados.rotas) {
    pessoas.push({ id: r.rota, nome: 'Rota ' + r.rota, cargo: 'RT', canal: r.canal, unidade: r.gc, sub: r.sub, id_supervisor: svKey(r) });
    const ag = (svAgg[svKey(r)] = svAgg[svKey(r)] || { sv: r.sv, canal: r.canal, gc: r.gc, p: {} });
    const config = cfg.pilaresConfig.find((c) => c.mes === cfg.mes && c.canal === r.canal);
    for (const pl of config.pilares) {
      if (pl.tipo !== 'volume') continue; // Missões Guiadas: validada em outubro, sem dado
      const v = r.v[cfg.fonteDoPilar[pl.nome]];
      medidas.push({ id: r.rota, mes: cfg.mes, pilar: pl.nome, meta: v[I.meta], real: v[I.real], online: v[I.online], hoje: v[I.hoje], metaDia: v[I.metaDia] });
      if (v[I.meta] > 0 && v[I.real] !== null) somar(ag.p, pl.nome, { meta: v[I.meta], real: v[I.real], online: v[I.online] || 0 });
    }
    // Gatilho de Refrigerantes: componentes sem meta (nula ou zero) ficam fora da soma
    let meta = 0, real = 0, online = 0, usados = 0, realFalta = false, excluidos = [];
    for (const g of compRefri) {
      const v = r.v[g];
      if (!(v[I.meta] > 0)) { excluidos.push(g); continue; }
      usados++; meta += v[I.meta];
      if (v[I.real] === null) realFalta = true; else real += v[I.real];
      online += v[I.online] || 0;
    }
    if (excluidos.length) notasRefri.push({ rota: r.rota, excluidos, usados });
    medidas.push({ id: r.rota, mes: cfg.mes, pilar: 'Refrigerantes', meta: usados ? meta : null, real: realFalta || !usados ? null : real, online });
    if (usados && !realFalta) somar(ag.p, 'Refrigerantes', { meta, real, online });
  }
  // Supervisor (PROVISÓRIO): soma das rotas da mesa no canal; rota sem meta ou sem real fica fora da soma
  for (const k of Object.keys(svAgg)) {
    const a = svAgg[k];
    pessoas.push({ id: k, nome: a.sv, cargo: 'SV', canal: a.canal, unidade: a.gc, id_supervisor: null });
    const nomes = cfg.pilaresConfig.find((c) => c.mes === cfg.mes && c.canal === a.canal).pilares.filter((p) => p.tipo === 'volume').map((p) => p.nome).concat(['Refrigerantes']);
    for (const n of nomes) { const x = a.p[n]; medidas.push({ id: k, mes: cfg.mes, pilar: n, meta: x ? x.meta : null, real: x ? x.real : null, online: x ? x.online : 0 }); }
  }
  return { entrada: { mesRef: cfg.mes, dataCorte: dados.meta.corte, pessoas, pilaresConfig: cfg.pilaresConfig, medidas, confrontos: [] }, notasRefri };
}

if (typeof module === 'object' && module.exports) module.exports = { CONFIG, montarEntrada, svKey, dadosDaApi, carregarDados, componentesRefri };
