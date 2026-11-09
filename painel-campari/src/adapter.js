/*
 * Adaptador do painel Campari Club: API -> motor.
 * Fonte: a API publicada no mesmo site (./api/v1/). Lê o index.json, localiza os dois produtos do incentivo
 * (agrupadores extras "Aperitivo" e "Skyy"), carrega cada mês da vigência pela fonte certa (API no mês aberto,
 * fechado/AAAAMM.json nos meses encerrados), aplica o canal do SV e entrega os números ao motor.
 * Não calcula regra: %, trava, soma, ordem e posição são do motor (src/motor.js). Nunca inventa valor: o que falta
 * vira motivo ou aviso.
 */
const CONFIG = {
  ano: 2026,          // ano do incentivo
  meses: [10, 11, 12], // vigência: outubro, novembro e dezembro
  api: './api/v1/',
  ajustes: './ajustes.json', // ajustes do admin publicados (só `canais` e `canaisSV` interessam ao Campari)
  // Papel no incentivo -> nome EXATO do agrupador do modelo SAP (maiúsculas e acentos contam).
  // O id do produto na API não é fixo: é achado em index.json -> produtos pelo campo `agrupadores`.
  agrupadores: { aperitivo: 'Aperitivo', skyy: 'Skyy' },
};

/*
 * Acha os produtos do incentivo em index.json -> produtos. Um produto casa com um papel quando é extra
 * (`extra: true`) e o seu `agrupadores` é exatamente [nome do CONFIG] (um único agrupador, grafia exata).
 * Devolve { ok, ids: {aperitivo, skyy}, motivos: [...] }; ok só quando os dois foram achados sem ambiguidade.
 */
function localizarProdutos(index, cfg) {
  cfg = cfg || CONFIG;
  const papeis = Object.keys(cfg.agrupadores);
  const ids = Object.fromEntries(papeis.map((p) => [p, null]));
  const produtos = index && Array.isArray(index.produtos) ? index.produtos : null;
  if (!produtos) return { ok: false, ids, motivos: ['index.json sem a lista de produtos'] };
  const motivos = [];
  for (const papel of papeis) {
    const nome = cfg.agrupadores[papel];
    const comNome = produtos.filter((p) => p && Array.isArray(p.agrupadores) && p.agrupadores.includes(nome));
    const validos = comNome.filter((p) => p.extra === true && p.agrupadores.length === 1 && typeof p.id === 'string' && p.id);
    if (validos.length === 1) { ids[papel] = validos[0].id; continue; }
    if (validos.length > 1) motivos.push(`agrupador "${nome}" em mais de um produto (${validos.map((p) => p.id).join(', ')})`);
    else if (!comNome.length) motivos.push(`agrupador "${nome}" não publicado na API`);
    else if (comNome.some((p) => p.extra !== true)) motivos.push(`agrupador "${nome}" num produto sem "extra": true`);
    else motivos.push(`agrupador "${nome}" somado a outros agrupadores no mesmo produto`);
  }
  return { ok: motivos.length === 0, ids, motivos };
}

/*
 * Lê ./api/v1/index.json (cache: no-cache) e devolve o que a tela usa nesta etapa:
 * { ok, erro, mesReferencia, fechados, atualizadoEm, simulado, produtos } (produtos = localizarProdutos).
 * Falha de leitura (rede, HTTP ≠ 200, JSON inválido): ok false e o motivo em `erro`, sem nenhum valor inventado.
 */
async function carregarDados(base, fetchFn) {
  base = base || CONFIG.api;
  fetchFn = fetchFn || (typeof fetch === 'function' ? fetch : null);
  const vazio = { ok: false, erro: null, mesReferencia: null, fechados: [], atualizadoEm: null, simulado: false, produtos: null };
  let index;
  try {
    if (!fetchFn) throw new Error('fetch indisponível');
    const r = await fetchFn(base + 'index.json', { cache: 'no-cache' });
    if (!r || r.status !== 200) throw new Error(`HTTP ${r ? r.status : '?'}`);
    index = await r.json();
    if (!index || typeof index !== 'object' || Array.isArray(index)) throw new Error('conteúdo não é um objeto JSON');
  } catch (e) {
    return Object.assign(vazio, { erro: `index.json: ${e.message}` });
  }
  return {
    ok: true,
    erro: null,
    mesReferencia: index.mes_referencia || null,
    fechados: Array.isArray(index.fechados) ? index.fechados : [],
    atualizadoEm: index.atualizado_em || null,
    simulado: index.simulado === true,
    produtos: localizarProdutos(index),
  };
}


/* ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * Etapa 2 — dados do ranking de volume de Aperitivo
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Motor: no painel vem de window.MotorCampari; no Node, de motor.js. */
const MotorCampariAqui = () => (typeof MotorCampari !== 'undefined' ? MotorCampari : require('./motor.js'));
/** Base de canais (cópia da base embutida do Q4): no painel vem embutida pelo build; no Node, de data/data.json. */
const BaseCanaisAqui = () => (typeof BASE_CANAIS_CAMPARI !== 'undefined' ? BASE_CANAIS_CAMPARI : require('../data/data.json'));

const NOMES_MES = ['', 'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const anomesDe = (ano, mes) => String(ano) + String(mes).padStart(2, '0');

/* ─── Canal das rotas e do SV: CÓPIA de painel-q4/src/adapter.js (premissa P3; nada é importado de lá) ───────────
 * titulo, svNome, SEGMENTOS, ehObjeto, textoOk, validarCanalRota e mapaCanal: cópias literais.
 * canaisDosSVs: cópia com UMA diferença — SV sem nenhuma rota com canal na mesa (no Q4 ele nem aparece, porque as
 * rotas sem canal ficam fora) sai com origem 'sem canal' em vez de 'empate'. Rota sem canal não vota.
 * Extração para uma pasta comum: proposta para uma etapa futura. */
const titulo = (s) => s.charAt(0) + s.slice(1).toLowerCase(); // 'AN' -> 'An'
const svNome = (sv) => sv.replace(/^SV\.([A-Z0-9]+)\.(\d+)$/, (_, g, n) => `Sv. ${titulo(g)}.${n}`); // 'SV.AN.1' -> 'Sv. An.1'
const SEGMENTOS = { Mista: [], Segmentada: ['Mini', 'Mod'], '': ['Neutraliza', 'Eventual', 'Coke Net', 'Virtual'] };
const ehObjeto = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const textoOk = (s, n) => typeof s === 'string' && s.trim().length > 0 && s.trim().length <= n && !/[\u0000-\u001f\u007f]/.test(s);

/** Canal e segmento de uma rota no ajustes.json -> {canal, sub}; inválido é ignorado e vira aviso, nunca em silêncio. */
function validarCanalRota(rota, c, avisos) {
  const av = (t) => { if (avisos) avisos.push(`rota ${rota}: ${t}`); };
  if (!c || typeof c !== 'object' || !(c.canal === null || c.canal === 'Mista' || c.canal === 'Segmentada')) {
    av(`canal ${JSON.stringify(c && typeof c === 'object' ? c.canal : c)} não é Mista, Segmentada nem sem canal (null): ajuste ignorado`);
    return null;
  }
  const seg = c.segmento !== undefined && c.segmento !== null ? c.segmento : c.sub;
  if (seg === undefined || seg === null || seg === '') return { canal: c.canal, sub: null };
  if (SEGMENTOS[c.canal || ''].includes(seg)) return { canal: c.canal, sub: seg };
  av(`segmento ${JSON.stringify(seg)} não vale para ${c.canal || 'sem canal'}: segmento ignorado, canal mantido`);
  return { canal: c.canal, sub: null };
}

/** Canal de cada rota: o da base de segmentação, trocado pelos ajustes do admin (`canais`). `sub` é o segmento. */
function mapaCanal(base, canais) {
  const canal = {};
  base.rotas.forEach((r) => { canal[r.rota] = { canal: r.canal, sub: r.sub, origem: 'base' }; });
  for (const [rota, c] of Object.entries(canais || {})) canal[rota] = Object.assign({}, c, { origem: 'ajuste' });
  return canal;
}

/** Canal do SV: o do admin (canaisSV) ou a maioria das rotas da mesa com canal; empate sem escolha: canal null. */
function canaisDosSVs(rotas, ajusteSV) {
  const cont = {};
  for (const r of rotas || []) {
    if (!r.sv) continue;
    const c = (cont[r.sv] = cont[r.sv] || { Mista: 0, Segmentada: 0 });
    if (r.canal in c) c[r.canal]++;
  }
  const out = {};
  for (const [sv, c] of Object.entries(cont)) {
    const aj = ajusteSV && ajusteSV[sv];
    const semVoto = c.Mista + c.Segmentada === 0; // diferença do Q4: mesa sem nenhuma rota com canal
    const maioria = c.Mista === c.Segmentada ? null : c.Mista > c.Segmentada ? 'Mista' : 'Segmentada';
    out[sv] = { canal: aj || maioria, padrao: maioria,
                origem: aj ? 'ajuste' : maioria ? 'maioria' : semVoto ? 'sem canal' : 'empate',
                rotas: c, misto: c.Mista > 0 && c.Segmentada > 0 };
  }
  return out;
}
/* ─── fim da cópia ─────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * `canais` e `canaisSV` de um ajustes.json já lido (objeto) -> { canais, canaisSV, avisos }. Mesma validação do Q4
 * (cópia do trecho de normalizarAjustes); o resto do arquivo não interessa ao Campari.
 */
function ajustesDeCanal(aj) {
  const avisos = [], canais = {}, canaisSV = {};
  if (!ehObjeto(aj)) return { canais, canaisSV, avisos };
  if (aj.canais !== undefined && !ehObjeto(aj.canais)) avisos.push('canais: precisa ser um objeto: ignorado');
  if (aj.canaisSV !== undefined && !ehObjeto(aj.canaisSV)) avisos.push('canaisSV: precisa ser um objeto: ignorado');
  for (const [rota, c] of Object.entries(ehObjeto(aj.canais) ? aj.canais : {})) {
    const v = validarCanalRota(rota, c, avisos);
    if (v) canais[rota] = v;
  }
  for (const [sv, c] of Object.entries(ehObjeto(aj.canaisSV) ? aj.canaisSV : {})) {
    if (textoOk(sv, 120) && (c === 'Mista' || c === 'Segmentada')) canaisSV[sv] = c;
    else avisos.push(`SV ${sv}: canal do SV ${JSON.stringify(c)} não é Mista nem Segmentada: ajuste ignorado`);
  }
  return { canais, canaisSV, avisos };
}

/**
 * Lê o ajustes.json PUBLICADO (o Campari não tem Administração nem ajustes do navegador).
 * 404: ninguém publicou, vale a base. Ilegível ou HTTP ≠ 200/404: nenhum ajuste vale, com aviso (como no Q4).
 */
async function lerAjustes(fetchFn, cfg) {
  cfg = cfg || CONFIG;
  const vazio = (situacao, aviso) => ({ situacao, canais: {}, canaisSV: {}, avisos: aviso ? [aviso] : [] });
  let r;
  try { r = await fetchFn(cfg.ajustes, { cache: 'no-cache' }); } catch (e) {
    return vazio('sem-acesso', `ajustes.json não pôde ser lido (${e.message}): canais só da base embutida`);
  }
  if (r && r.status === 404) return vazio('ausente', null);
  if (!r || r.status !== 200) return vazio('erro', `ajustes.json ilegível (HTTP ${r ? r.status : '?'}): nenhum ajuste publicado vale`);
  let aj;
  try { aj = await r.json(); } catch (e) { return vazio('erro', `ajustes.json ilegível (${e.message}): nenhum ajuste publicado vale`); }
  if (!ehObjeto(aj)) return vazio('erro', 'ajustes.json ilegível (o conteúdo não é um objeto JSON): nenhum ajuste publicado vale');
  return Object.assign({ situacao: 'ok' }, ajustesDeCanal(aj));
}

/**
 * Fonte de cada mês da vigência (premissa P1), com ref = index.json -> mes_referencia.anomes:
 *   - mês anterior a ref, ou mês = ref com mes_referencia.fechamento = true: fechado/AAAAMM.json (só Real, Online 0);
 *     sem o arquivo na lista `fechados`: 'indisponivel' (nunca usa a API de outro mês no lugar);
 *   - mês = ref sem fechamento: 'api' (Real + online_hoje);
 *   - mês posterior a ref: 'futuro' (sem dado, não conta na soma).
 * Devolve [{ mes, anomes, fonte: 'api' | 'fechado' | 'indisponivel' | 'futuro', arquivo, motivo }].
 */
function fontesDosMeses(index, cfg) {
  cfg = cfg || CONFIG;
  const ref = String(index.mes_referencia.anomes), fech = index.mes_referencia.fechamento === true;
  const lista = Array.isArray(index.fechados) ? index.fechados : [];
  return cfg.meses.map((mes) => {
    const anomes = anomesDe(cfg.ano, mes);
    if (anomes > ref) return { mes, anomes, fonte: 'futuro', arquivo: null, motivo: null };
    if (anomes < ref || fech) {
      const item = lista.find((x) => x && x.anomes === anomes);
      if (item && typeof item.arquivo === 'string') return { mes, anomes, fonte: 'fechado', arquivo: item.arquivo, motivo: null };
      return { mes, anomes, fonte: 'indisponivel', arquivo: null, motivo: `${NOMES_MES[mes]} não está nos meses fechados da API` };
    }
    return { mes, anomes, fonte: 'api', arquivo: null, motivo: null };
  });
}

const VAZIO = () => ({ meta: null, real: null, online: null, metaDia: null });
/** Bloco de produto da API (mês aberto) -> valores do mês. Produto ausente no bloco: tudo null. */
const doBlocoApi = (b) => (b ? { meta: b.meta, real: b.realizado, online: b.online_hoje, metaDia: b.meta_dia } : VAZIO());
/** Par [meta, realizado] do fechado -> valores do mês (sem online nem meta dia no fechamento: online 0). */
const doPar = (par, iMeta, iReal) => (Array.isArray(par) ? { meta: par[iMeta], real: par[iReal], online: 0, metaDia: null } : VAZIO());
const ehEventual = (rota) => /-EV$/.test(String(rota)); // rota oculta com o Real das rotas EV* (M.rota_eventuais)
const somaOuNull = (vs) => { const c = vs.filter((v) => typeof v === 'number'); return c.length ? c.reduce((a, b) => a + b, 0) : null; };

/**
 * Lê um fechado/AAAAMM.json para o produto `pid`: { ok, motivo, estado, simulado, gc: {GC: valores} | null,
 * sv: {SV: valores}, gcDoSv: {SV: GC}, rotas: [{rota, gc, sv, valores}] }. GC vem de totais.gerencias (sem eles: GC indisponível,
 * nunca soma rotas); SV é a soma das linhas de `rotas` pelo campo supervisão (todas as rotas da mesa, premissa P2).
 */
function lerFechado(f, anomes, pid) {
  if (!ehObjeto(f)) return { ok: false, motivo: 'arquivo ilegível' };
  if (f.anomes !== anomes) return { ok: false, motivo: `o arquivo traz o mês ${f.anomes}` };
  const col = (n) => (f.campos || []).indexOf(n), cp = (n) => (f.campos_produto || []).indexOf(n);
  const [iRota, iGer, iSv, iProd, iMeta, iReal] = [col('rota'), col('gerencia'), col('supervisao'), col('produtos'), cp('meta'), cp('realizado')];
  if ([iRota, iGer, iSv, iProd, iMeta, iReal].some((x) => x < 0) || !Array.isArray(f.rotas)) return { ok: false, motivo: 'formato inesperado' };
  const temTotais = ehObjeto(f.totais) && ehObjeto(f.totais.gerencias) && ehObjeto(f.totais.empresa);
  const temProduto = (temTotais && f.totais.empresa[pid] !== undefined) || f.rotas.some((l) => ehObjeto(l[iProd]) && l[iProd][pid] !== undefined);
  if (!temProduto) return { ok: false, motivo: 'o arquivo não traz o produto Aperitivo' };
  const gc = temTotais ? Object.fromEntries(Object.keys(f.totais.gerencias).map((g) => [g, doPar((f.totais.gerencias[g] || {})[pid], iMeta, iReal)])) : null;
  const porSv = {}, gcDoSv = {}, rotas = [];
  for (const l of f.rotas) {
    const v = doPar((l[iProd] || {})[pid], iMeta, iReal);
    (porSv[l[iSv]] = porSv[l[iSv]] || []).push(v);
    if (!gcDoSv[l[iSv]]) gcDoSv[l[iSv]] = l[iGer];
    if (!ehEventual(l[iRota])) rotas.push({ rota: l[iRota], gc: l[iGer], sv: l[iSv], valores: v });
  }
  const sv = {};
  for (const [id, vs] of Object.entries(porSv)) {
    sv[id] = { meta: somaOuNull(vs.map((v) => v.meta)), real: somaOuNull(vs.map((v) => v.real)), online: 0, metaDia: null };
  }
  return { ok: true, motivo: temTotais ? null : 'sem totais por gerência', estado: f.fechamento_final === true ? 'oficial' : 'previa',
           simulado: f.simulado === true, gc, sv, gcDoSv, rotas };
}

/**
 * Monta os dados do ranking a partir do que já foi lido (função pura; carregarRanking faz a leitura):
 *   entrada = { index, gerencias: [gerencias/{GC}.json], fechados: {AAAAMM: json | Error}, base, ajustes }
 * Devolve, além de mesReferencia/calendario/simulado/avisos:
 *   meses:        [{ mes, anomes, fonte, estado ('aberto' | 'previa' | 'oficial' | null), motivo }]
 *   gc, svMista, svSegmentada: linhas ordenadas e numeradas pelo motor (pos 1..n), cada uma com
 *                 { codigo, chave, gc, canal, origemCanal, meses: [por mês: meta, real, online, metaDia, pct,
 *                   pctTravado, travado, fonte, estado, situacao], soma, incompleta, mesesSemPct, pos }
 *   fora:         SVs fora do ranking (empate de canal ou sem canal), com o motivo
 *   rotas:        consultores, só com os próprios números por mês (sem ranking nem soma)
 *   canaisSV:     canal de cada SV (pelo código do painel, "Sv. An.1"), com origem e votos
 */
function montarDados(entrada, cfg, motor) {
  cfg = cfg || CONFIG; motor = motor || MotorCampariAqui();
  const { index, gerencias } = entrada;
  const base = entrada.base || BaseCanaisAqui();
  const ajustes = entrada.ajustes || { canais: {}, canaisSV: {}, avisos: [] };
  const produtos = localizarProdutos(index, cfg);
  const comum = { mesReferencia: index.mes_referencia || null, calendario: index.calendario || null,
                  atualizadoEm: index.atualizado_em || null, simulado: index.simulado === true, produtos };
  if (!produtos.ok) {
    return Object.assign({ ok: false, erro: 'Produtos do Campari ainda não publicados (' + produtos.motivos.join('; ') + ')',
                           avisos: [], meses: [], gc: [], svMista: [], svSegmentada: [], fora: [], rotas: [], canaisSV: {} }, comum);
  }
  const pid = produtos.ids.aperitivo;
  const avisos = ajustes.avisos.slice();

  // 1. fonte de cada mês (P1) e leitura dos fechados
  const fontes = fontesDosMeses(index, cfg).map((f) => Object.assign({}, f));
  const lidos = {};
  for (const f of fontes) {
    if (f.fonte === 'api') f.estado = 'aberto';
    if (f.fonte !== 'fechado') continue;
    const bruto = (entrada.fechados || {})[f.anomes];
    const l = bruto instanceof Error ? { ok: false, motivo: bruto.message } : bruto === undefined ? { ok: false, motivo: 'não carregado' } : lerFechado(bruto, f.anomes, pid);
    if (!l.ok) { Object.assign(f, { fonte: 'indisponivel', motivo: `${f.arquivo}: ${l.motivo}` }); continue; }
    f.estado = l.estado;
    if (l.motivo) f.motivo = `${f.arquivo}: ${l.motivo} (GC indisponível neste mês)`;
    if (l.simulado !== comum.simulado) avisos.push(`${f.arquivo} ${l.simulado ? 'é' : 'não é'} simulado, e o index.json ${comum.simulado ? 'é' : 'não é'}`);
    lidos[f.anomes] = l;
  }
  for (const f of fontes) if (f.fonte === 'indisponivel') avisos.push(`${NOMES_MES[f.mes]} indisponível: ${f.motivo}; a soma das linhas fica incompleta`);
  for (const f of fontes) if (f.fonte === 'fechado' && f.motivo) avisos.push(f.motivo);

  // 2. valores por nível e mês (anomes -> código -> valores); o que a API publica, sem recalcular
  const vals = { gc: {}, sv: {}, rota: {} }, info = { gc: {}, sv: {}, rota: {} };
  const por = (nivel, anomes, cod, v) => { ((vals[nivel][cod] = vals[nivel][cod] || {}))[anomes] = v; };
  const anotar = (nivel, cod, dados) => { info[nivel][cod] = Object.assign(info[nivel][cod] || {}, dados); };
  // estrutura atual (API): todas as gerências, supervisões e rotas aparecem, mesmo sem número em algum mês
  for (const g of gerencias) {
    const gid = g.gerencia.id;
    anotar('gc', gid, {});
    for (const s of g.supervisoes || []) anotar('sv', s.id, { gc: gid });
    for (const r of g.rotas || []) if (r.tipo !== 'eventual' && !ehEventual(r.id)) anotar('rota', r.id, { gc: gid, sv: r.supervisao });
  }
  for (const f of fontes) {
    if (f.fonte === 'api') {
      for (const g of gerencias) {
        por('gc', f.anomes, g.gerencia.id, doBlocoApi((g.produtos || {})[pid]));
        for (const s of g.supervisoes || []) por('sv', f.anomes, s.id, doBlocoApi((s.produtos || {})[pid]));
        for (const r of g.rotas || []) if (r.tipo !== 'eventual' && !ehEventual(r.id)) por('rota', f.anomes, r.id, doBlocoApi((r.produtos || {})[pid]));
      }
    } else if (f.fonte === 'fechado') {
      const l = lidos[f.anomes];
      if (l.gc) for (const [g, v] of Object.entries(l.gc)) { anotar('gc', g, {}); por('gc', f.anomes, g, v); }
      for (const [s, v] of Object.entries(l.sv)) { if (!info.sv[s]) anotar('sv', s, { gc: null }); por('sv', f.anomes, s, v); }
      for (const r of l.rotas) {
        if (!info.rota[r.rota]) anotar('rota', r.rota, { gc: r.gc, sv: r.sv });
        por('rota', f.anomes, r.rota, r.valores);
      }
    }
  }
  // gerência do SV que só existe num fechado: a das rotas dele naquele mês
  for (const f of fontes) if (lidos[f.anomes]) for (const [s, g] of Object.entries(lidos[f.anomes].gcDoSv)) if (info.sv[s] && !info.sv[s].gc) info.sv[s].gc = g;

  // 3. meses de uma linha -> motor (situação: dado | indisponivel | futuro)
  const situacao = (f, nivel) => (f.fonte === 'futuro' ? 'futuro' : f.fonte === 'indisponivel' ? 'indisponivel'
    : nivel === 'gc' && f.fonte === 'fechado' && !lidos[f.anomes].gc ? 'indisponivel' : 'dado');
  const apurar = (nivel, cod) => motor.apurarMeses(fontes.map((f) => {
    const s = situacao(f, nivel);
    const v = s === 'dado' ? ((vals[nivel][cod] || {})[f.anomes] || VAZIO()) : VAZIO();
    return Object.assign({ mes: f.mes, anomes: f.anomes, fonte: f.fonte, estado: f.estado || null, situacao: s }, v,
                         { metaDia: f.fonte === 'api' && s === 'dado' ? v.metaDia : null });
  }));

  // 4. canal das rotas e do SV (admin -> maioria das rotas da mesa com canal -> empate fora, com aviso)
  const canalRota = mapaCanal(base, ajustes.canais);
  const votoDe = (rota, sv) => ({ sv: sv ? svNome(sv) : null, canal: (canalRota[rota] && canalRota[rota].canal) || null });
  const canaisSV = canaisDosSVs(gerencias.flatMap((g) => (g.rotas || []).filter((r) => r.tipo !== 'eventual' && !ehEventual(r.id))
    .map((r) => votoDe(r.id, r.supervisao))), ajustes.canaisSV);
  // SV que só existe num mês fechado: a maioria das rotas dele no mês fechado mais recente
  for (const f of fontes.slice().reverse()) if (lidos[f.anomes]) {
    const doMes = canaisDosSVs(lidos[f.anomes].rotas.map((r) => votoDe(r.rota, r.sv)), ajustes.canaisSV);
    for (const [sv, c] of Object.entries(doMes)) if (!canaisSV[sv]) canaisSV[sv] = c;
  }

  // 5. linhas e ranking (ordem e posição: motor)
  const linha = (nivel, cod, extra) => Object.assign({ codigo: cod, chave: motor.chaveCodigo(cod) }, extra, apurar(nivel, cod));
  const gc = motor.montarRanking(Object.keys(info.gc).map((g) => linha('gc', g, { gc: g, canal: null, origemCanal: null })));
  const svs = { Mista: [], Segmentada: [] }, fora = [];
  for (const s of Object.keys(info.sv)) {
    const c = canaisSV[svNome(s)] || { canal: null, origem: 'sem canal', rotas: { Mista: 0, Segmentada: 0 } };
    const l = linha('sv', s, { gc: info.sv[s].gc, canal: c.canal, origemCanal: c.origem, votos: c.rotas });
    if (c.canal) svs[c.canal].push(l);
    else fora.push(Object.assign(l, { motivo: c.origem === 'empate'
      ? 'empate de canal (mesmo número de rotas Mista e Segmentada): escolha o canal do SV na Administração'
      : 'sem canal (nenhuma rota da mesa tem canal Mista ou Segmentada)' }));
  }
  fora.sort((a, b) => (a.chave < b.chave ? -1 : a.chave > b.chave ? 1 : 0));
  const empates = fora.filter((l) => l.origemCanal === 'empate').map((l) => l.codigo);
  if (empates.length) avisos.push(`mesa com o mesmo número de rotas Mista e Segmentada (${empates.join(', ')}): escolha o canal do SV na Administração; até lá o SV fica fora do ranking`);
  const rotas = Object.keys(info.rota).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })).map((r) => {
    const a = apurar('rota', r), c = canalRota[r];
    return { codigo: r, gc: info.rota[r].gc, sv: info.rota[r].sv, canal: (c && c.canal) || null, sub: (c && c.sub) || null, meses: a.meses };
  });
  const svMista = motor.montarRanking(svs.Mista), svSegmentada = motor.montarRanking(svs.Segmentada);
  return Object.assign({ ok: true, erro: null, avisos, meses: fontes.map(({ mes, anomes, fonte, estado, motivo, arquivo }) =>
    ({ mes, anomes, fonte, estado: estado || null, motivo: motivo || null, arquivo: arquivo || null })),
    gc, svMista, svSegmentada, fora, rotas, canaisSV,
    baseCanais: { foto: (base.meta || {}).foto || null, corteSeg: (base.meta || {}).corteSeg || null } }, comum);
}

/**
 * Lê a API (index.json, gerencias/*.json e os fechados necessários) e o ajustes.json publicado, e monta os dados do
 * ranking (montarDados). Falha no index.json ou numa gerência: ok false, com o motivo em `erro`, sem valor inventado.
 * Fechado que falha: só aquele mês fica indisponível.
 */
async function carregarRanking(base, opcoes) {
  opcoes = opcoes || {};
  const cfg = opcoes.cfg || CONFIG;
  base = base || cfg.api;
  const fetchFn = opcoes.fetchFn || (typeof fetch === 'function' ? fetch : null);
  const ler = async (caminho) => {
    const r = await fetchFn(base + caminho, { cache: 'no-cache' });
    if (!r || r.status !== 200) throw new Error(`${caminho}: HTTP ${r ? r.status : '?'}`);
    return r.json();
  };
  let index, gerencias;
  try {
    if (!fetchFn) throw new Error('fetch indisponível');
    index = await ler('index.json');
    if (!ehObjeto(index) || !ehObjeto(index.mes_referencia) || !Array.isArray(index.gerencias)) throw new Error('index.json: formato inesperado');
    gerencias = await Promise.all(index.gerencias.map((g) => ler(g.arquivo)));
  } catch (e) {
    return { ok: false, erro: `API indisponível (${e.message})`, avisos: [], meses: [], gc: [], svMista: [], svSegmentada: [], fora: [], rotas: [], canaisSV: {} };
  }
  const fechados = {};
  for (const f of fontesDosMeses(index, cfg)) {
    if (f.fonte !== 'fechado') continue;
    try { fechados[f.anomes] = await ler(f.arquivo); } catch (e) { fechados[f.anomes] = e; }
  }
  const ajustes = await lerAjustes(fetchFn, cfg);
  return montarDados({ index, gerencias, fechados, base: opcoes.baseCanais, ajustes }, cfg, opcoes.motor);
}

if (typeof module === 'object' && module.exports) {
  module.exports = { CONFIG, localizarProdutos, carregarDados, fontesDosMeses, lerFechado, montarDados, carregarRanking,
                     lerAjustes, ajustesDeCanal, mapaCanal, canaisDosSVs, validarCanalRota, svNome };
}
