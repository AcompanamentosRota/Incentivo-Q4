/*
 * Adaptador: dados -> entrada do motor.
 * Fonte: a API do metas-produtos (./api/v1/, publicada no mesmo site do painel). Sem ela (HTML aberto direto do
 * computador, API em outro mês ou falha de rede), usa a base embutida (data/data.json, gerada dos Excel do SAP).
 */
const CONFIG = {
  mes: 10,
  ano: 2026,
  api: './api/v1/',
  ajustes: './ajustes.json', // ajustes do admin publicados para todos (aba Regras > Administração)
  // onde o ajustes.json é publicado por PR (botão "Publicar no GitHub (PR)" da Administração)
  repo: 'AcompanamentosRota/Incentivo-Q4', branch: 'main', arquivoAjustes: 'frontend/ajustes.json',
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
const VAZIO = [null, null, null, null, null]; // agrupador sem dado (ex.: extra que a API ainda não traz)

/*
 * API (index.json + gerencias/*.json) -> mesmo formato da base embutida.
 * A API ainda não traz o canal (Mista/Segmentada): ele vem da base embutida, e rota sem canal vai para semCanal.
 * Real = faturado no mês (inclui o faturado de hoje); Online = pedidos de hoje ainda não faturados.
 * `canais` (ajuste do admin) troca o canal de rotas; {canal: null} tira a rota do ranking.
 * Devolve null se a API estiver em outro mês (os pilares do mês ficam em CONFIG.pilaresConfig).
 */
function dadosDaApi(index, gerencias, base, cfg, canais) {
  const ref = index.mes_referencia;
  if (ref.anomes !== cfg.ano + String(cfg.mes).padStart(2, '0')) return null;
  const I = cfg.idx;
  const canal = {};
  base.rotas.forEach((r) => { canal[r.rota] = { canal: r.canal, sub: r.sub }; });
  Object.assign(canal, canais || {});
  const titulo = (s) => s.charAt(0) + s.slice(1).toLowerCase(); // 'AN' -> 'An'
  const svNome = (sv) => sv.replace(/^SV\.([A-Z0-9]+)\.(\d+)$/, (_, g, n) => `Sv. ${titulo(g)}.${n}`); // 'SV.AN.1' -> 'Sv. An.1'
  const ids = new Set(index.produtos.map((p) => p.id));
  const faltam = Object.keys(cfg.produtoDaApi).filter((ag) => !ids.has(cfg.produtoDaApi[ag]));
  const rotas = [], semCanal = [], naApi = new Set();
  for (const g of gerencias) for (const r of g.rotas) {
    if (r.tipo === 'eventual') continue; // soma dos clientes em rotas EV*: sem meta, não é um consultor
    naApi.add(r.id);
    const gc = titulo(r.gerencia), c = canal[r.id];
    if (!c || !c.canal) { semCanal.push({ gc, rota: r.id }); continue; }
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
      refriCategoria: !faltam.includes(cfg.refri), produtosApi: [...ids],
      aviso: faltam.length ? `a API ainda não traz ${faltam.join(', ')}` : null,
    },
    rotas, semCanal, duplicadas: base.duplicadas,
    segSemInfos: base.rotas.map((r) => r.rota).filter((r) => !naApi.has(r)),
  };
}

function comAviso(base, aviso) {
  return Object.assign({}, base, { meta: Object.assign({}, base.meta, { origem: 'base', aviso, fonte: base.meta.fonte + ' · base embutida' }) });
}

/** Base embutida com o canal ajustado pelo admin (rota da base sem canal não tem valores: não entra). */
function comCanais(base, canais) {
  if (!canais || !Object.keys(canais).length) return base;
  const rotas = [], semCanal = base.semCanal.slice();
  for (const r of base.rotas) {
    const c = canais[r.rota];
    if (!c) rotas.push(r);
    else if (c.canal) rotas.push(Object.assign({}, r, { canal: c.canal, sub: c.sub }));
    else semCanal.push({ gc: r.gc, rota: r.rota });
  }
  return Object.assign({}, base, { rotas, semCanal });
}

/** Lê a API no mesmo site; qualquer falha cai na base embutida, com o motivo em meta.aviso. */
async function carregarDados(base, cfg, ajustes) {
  cfg = cfg || CONFIG;
  const canais = ajustes ? ajustes.canais : null;
  const ler = async (caminho) => {
    const r = await fetch(cfg.api + caminho, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`${caminho}: HTTP ${r.status}`);
    return r.json();
  };
  try {
    const index = await ler('index.json');
    const gerencias = await Promise.all(index.gerencias.map((g) => ler(g.arquivo)));
    return dadosDaApi(index, gerencias, base, cfg, canais) ||
      comAviso(comCanais(base, canais), `a API está em ${index.mes_referencia.rotulo} e o painel está configurado para ${cfg.mes}/${cfg.ano}`);
  } catch (erro) {
    return comAviso(comCanais(base, canais), `API indisponível (${erro.message})`);
  }
}

/*
 * Ajustes do admin (aba Regras > Administração): regras, pilares coringa do mês e canal das rotas.
 * Publicados em ajustes.json (valem para todos) ou guardados só neste navegador (têm prioridade).
 * Formato: { atualizado_em, regras: {faixas, gatilhoVolumePct, gatilhoPontos, bonusConfronto, premiadas},
 *            pilares: {Mista: [pilar 4, pilar 5], Segmentada: [...]}, canais: {rota: {canal, sub}},
 *            agrupadores: [{id, nome, agrupador}] }
 * "agrupadores" são os extras: viram o pilar "Volume <nome>" e o gerador da API (scripts/gerar.py) passa a buscá-los.
 */
const AJUSTES_LOCAL = 'q4_ajustes';
const PILARES_CORINGA = ['Volume Sabores', 'Volume Retornáveis', 'Volume Refri Single', 'Volume Powerade', 'Volume Sucos', 'Missões Guiadas'];
const EXTRAS_MAX = 10;
const IDS_FIXOS = Object.values(CONFIG.produtoDaApi), AGRUPADORES_FIXOS = Object.keys(CONFIG.produtoDaApi);
/** Mesma chave de comparação do gerador (texto.normalizar): sem acento, espaços simples, maiúsculas. */
const normalizarTexto = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
const textoOk = (s, n) => typeof s === 'string' && s.trim().length > 0 && s.trim().length <= n && !/[\u0000-\u001f\u007f]/.test(s);
const pilarDoExtra = (e) => 'Volume ' + e.nome;

/** Agrupadores extras válidos (mesmas regras do gerador): id a-z0-9_, sem repetir fixos, nomes de pilar ou entre si. */
function normalizarExtras(lista) {
  const out = [], ids = new Set(IDS_FIXOS), ags = new Set(AGRUPADORES_FIXOS.map(normalizarTexto));
  const pilares = new Set(PILARES_CORINGA.map(normalizarTexto));
  for (const x of Array.isArray(lista) ? lista : []) {
    if (out.length >= EXTRAS_MAX) break;
    if (!x || !/^[a-z0-9_]{1,30}$/.test(x.id) || !textoOk(x.nome, 40) || !textoOk(x.agrupador, 80)) continue;
    const e = { id: x.id, nome: x.nome.trim(), agrupador: x.agrupador.trim() };
    if (ids.has(e.id) || ags.has(normalizarTexto(e.agrupador)) || pilares.has(normalizarTexto(pilarDoExtra(e)))) continue;
    out.push(e); ids.add(e.id); ags.add(normalizarTexto(e.agrupador)); pilares.add(normalizarTexto(pilarDoExtra(e)));
  }
  return out;
}

/** Só os campos válidos; o resto é ignorado. Sem nenhum campo válido, null. */
function normalizarAjustes(aj) {
  if (!aj || typeof aj !== 'object') return null;
  const ok = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  const r = aj.regras || {}, regras = {}, pilares = {}, canais = {};
  const agrupadores = normalizarExtras(aj.agrupadores);
  const coringas = PILARES_CORINGA.concat(agrupadores.map(pilarDoExtra));
  if (Array.isArray(r.faixas) && r.faixas.length === 3 && r.faixas.every((f) => f && ok(f.min) && ok(f.pontos)))
    regras.faixas = r.faixas.map((f) => ({ min: f.min, pontos: f.pontos })).sort((a, b) => b.min - a.min);
  if (ok(r.gatilhoVolumePct)) regras.gatilhoVolumePct = r.gatilhoVolumePct;
  if (ok(r.bonusConfronto)) regras.bonusConfronto = r.bonusConfronto;
  if (r.gatilhoPontos && ok(r.gatilhoPontos.SV) && ok(r.gatilhoPontos.RT)) regras.gatilhoPontos = { SV: r.gatilhoPontos.SV, RT: r.gatilhoPontos.RT };
  const pr = r.premiadas;
  if (pr && ['SV', 'RT'].every((c) => pr[c] && ok(pr[c].Mista) && ok(pr[c].Segmentada)))
    regras.premiadas = { SV: { Mista: pr.SV.Mista, Segmentada: pr.SV.Segmentada }, RT: { Mista: pr.RT.Mista, Segmentada: pr.RT.Segmentada } };
  for (const canal of ['Mista', 'Segmentada']) {
    const p = (aj.pilares || {})[canal];
    if (Array.isArray(p) && p.length === 2 && p[0] !== p[1] && p.every((x) => coringas.includes(x))) pilares[canal] = p.slice();
  }
  for (const [rota, c] of Object.entries(aj.canais || {})) {
    if (c && (c.canal === null || c.canal === 'Mista' || c.canal === 'Segmentada'))
      canais[rota] = { canal: c.canal, sub: c.canal === 'Segmentada' && (c.sub === 'Mini' || c.sub === 'Mod') ? c.sub : null };
  }
  if (!Object.keys(regras).length && !Object.keys(pilares).length && !Object.keys(canais).length && !agrupadores.length) return null;
  return { atualizado_em: typeof aj.atualizado_em === 'string' ? aj.atualizado_em : null, regras, pilares, canais, agrupadores };
}

/** Aplica os agrupadores extras e os pilares coringa do mês (em cfg) e as regras (no REGRAS do motor).
 *  O canal entra em carregarDados. */
function aplicarAjustes(aj, cfg, regras) {
  if (!aj) return;
  for (const e of aj.agrupadores || []) { cfg.produtoDaApi[e.agrupador] = e.id; cfg.fonteDoPilar[pilarDoExtra(e)] = e.agrupador; }
  const r = aj.regras;
  if (r.faixas) regras.faixas = r.faixas.concat([{ min: 0, pontos: 0 }]);
  for (const k of ['gatilhoVolumePct', 'bonusConfronto', 'gatilhoPontos', 'premiadas']) if (r[k] !== undefined) regras[k] = r[k];
  for (const [canal, nomes] of Object.entries(aj.pilares)) {
    const c = cfg.pilaresConfig.find((x) => x.mes === cfg.mes && x.canal === canal);
    if (!c || nomes.some((n) => c.pilares.slice(0, 3).some((p) => p.nome === n))) continue; // não repete os pilares 1 a 3
    nomes.forEach((nome, i) => { c.pilares[3 + i] = { nome, tipo: nome === 'Missões Guiadas' ? 'missao' : 'volume' }; });
  }
}

/** Ajustes publicados (ajustes.json do site) e os deste navegador (localStorage); os deste navegador valem primeiro. */
async function carregarAjustes(cfg) {
  cfg = cfg || CONFIG;
  let publicado = null, local = null, existePublicado = false;
  try {
    const r = await fetch(cfg.ajustes, { cache: 'no-cache' });
    existePublicado = r.ok;
    if (r.ok) publicado = normalizarAjustes(await r.json());
  } catch (e) { /* sem ajustes publicados (ou HTML aberto direto do computador) */ }
  try { local = normalizarAjustes(JSON.parse(localStorage.getItem(AJUSTES_LOCAL) || 'null')); } catch (e) { /* sem localStorage */ }
  return { publicado, local, existePublicado, ativo: local || publicado, origem: local ? 'local' : publicado ? 'publicado' : null };
}

/** Página do GitHub para publicar o ajustes.json por PR: edição do arquivo (se já existe) ou criação já preenchida. */
function urlPublicacao(cfg, texto, existe) {
  const base = `https://github.com/${cfg.repo}`, i = cfg.arquivoAjustes.lastIndexOf('/');
  if (existe) return `${base}/edit/${cfg.branch}/${cfg.arquivoAjustes}`;
  return `${base}/new/${cfg.branch}/${cfg.arquivoAjustes.slice(0, i)}?filename=${encodeURIComponent(cfg.arquivoAjustes.slice(i + 1))}` +
    `&value=${encodeURIComponent(texto)}`;
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
      const v = r.v[cfg.fonteDoPilar[pl.nome]] || VAZIO;
      medidas.push({ id: r.rota, mes: cfg.mes, pilar: pl.nome, meta: v[I.meta], real: v[I.real], online: v[I.online], hoje: v[I.hoje], metaDia: v[I.metaDia] });
      if (v[I.meta] > 0 && v[I.real] !== null) somar(ag.p, pl.nome, { meta: v[I.meta], real: v[I.real], online: v[I.online] || 0 });
    }
    // Gatilho de Refrigerantes: componentes sem meta (nula ou zero) ficam fora da soma
    let meta = 0, real = 0, online = 0, usados = 0, realFalta = false, excluidos = [];
    for (const g of compRefri) {
      const v = r.v[g] || VAZIO;
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

if (typeof module === 'object' && module.exports) {
  module.exports = { CONFIG, montarEntrada, svKey, dadosDaApi, carregarDados, componentesRefri, comCanais,
                     AJUSTES_LOCAL, PILARES_CORINGA, EXTRAS_MAX, IDS_FIXOS, AGRUPADORES_FIXOS, normalizarTexto, pilarDoExtra,
                     normalizarExtras, normalizarAjustes, aplicarAjustes, carregarAjustes, urlPublicacao };
}
