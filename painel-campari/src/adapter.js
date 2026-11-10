/*
 * Adaptador do painel Campari Club: API -> motor.
 * Fonte: a API publicada no mesmo site (./api/v1/). Lê o index.json, localiza os dois produtos do incentivo
 * (agrupadores extras "Aperitivo" e "Skyy"), carrega cada mês da vigência pela fonte certa (API no mês aberto,
 * fechado/AAAAMM.json nos meses encerrados; a cobertura segue outra regra de fonte), aplica o canal do SV e
 * entrega os números ao motor, que devolve %, trava, soma, ordem, gatilho, posição oficial e status.
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
  // Ranking GC pela GERÊNCIA COMERCIAL AGRUPADA do SAC (regras v1.6, seção 4; decisão de 09/11/2026, pendência
  // 24): código da LINHA do ranking -> gerências da API que ela soma. Oito linhas têm uma gerência só e quatro
  // somam duas, dando 12 linhas no lugar das 16 gerências da API. Fica em configuração, nunca na lógica:
  // gerência publicada e fora deste mapa entra como linha própria, com aviso, e gerência do mapa que a API não
  // publicou simplesmente não entra na soma, também com aviso.
  gruposGC: {
    G1: ['G1'], G2: ['G2'], G3: ['G3'], AP: ['AP'], AT: ['AT'], AN: ['AN'], RV: ['RV'], SL: ['SL'],
    UR_RI: ['UR', 'RI'], IT_MO: ['IT', 'MO'], PA_DI: ['PA', 'DI'], GU_PO: ['GU', 'PO'],
  },
  // Linhas por página das tabelas paginadas (etapa 4G; regras v1.7, seção 7). Fica em configuração, nunca na
  // lógica nem na tela: a Supervisão, o Consultor e a visão Supervisão do Detalhe do mês pedem a fatia a
  // `fatiar`, que lê este número. A linha de total (Total Band ou Total da mesa) NÃO entra na conta: ela se
  // repete em toda página.
  linhasPorPagina: 15,
  // Visões do Detalhe do mês que NÃO são paginadas (etapa 4I; decisão da Karen de 09/11/2026, pendência 27): a
  // visão Gerência mostra todas as linhas e o Total Band numa tela só; a visão Supervisão continua em páginas de
  // `linhasPorPagina`. Quem decide é `paginaDoDetalhe`, que só escolhe o tamanho e chama `fatiar`.
  detalheSemPaginacao: ['gc'],
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
/** Código da linha da empresa (Diretoria e GP; regras, seção 4): o rótulo do mockup, sem nome de pessoa. */
const TOTAL_BAND = 'Total Band';

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

/**
 * Fonte da COBERTURA de cada mês (premissa P1) — diferente da do volume, de propósito:
 *   - mês = ref, aberto OU em período de fechamento da API: os blocos `cobertura` da própria API ('api'), porque
 *     a cobertura do mês de referência continua publicada lá mesmo quando o volume já vem do fechado/;
 *     `fechamento` marca a janela em que a API devolve `online_hoje` null e não há meta dia;
 *   - mês anterior a ref: 'fechado' (o arquivo do mês), que hoje NÃO traz cobertura (pendência 10 das regras);
 *   - mês posterior a ref: 'futuro'.
 * Devolve [{ mes, anomes, fonte: 'api' | 'fechado' | 'futuro', arquivo, motivo, fechamento }].
 */
function fontesDaCobertura(index, cfg) {
  cfg = cfg || CONFIG;
  const ref = String(index.mes_referencia.anomes), fech = index.mes_referencia.fechamento === true;
  const lista = Array.isArray(index.fechados) ? index.fechados : [];
  return cfg.meses.map((mes) => {
    const anomes = anomesDe(cfg.ano, mes);
    if (anomes > ref) return { mes, anomes, fonte: 'futuro', arquivo: null, motivo: null, fechamento: false };
    if (anomes === ref) return { mes, anomes, fonte: 'api', arquivo: null, motivo: null, fechamento: fech };
    const item = lista.find((x) => x && x.anomes === anomes);
    return { mes, anomes, fonte: 'fechado', fechamento: false, motivo: null,
             arquivo: item && typeof item.arquivo === 'string' ? item.arquivo : null };
  });
}

/**
 * Cobertura de um mês fechado -> { meta, real } por nível, ou null quando o arquivo não traz cobertura.
 *
 * PORTA ÚNICA da pendência 10 das regras: o `fechado/AAAAMM.json` de hoje tem `campos_produto: ["meta",
 * "realizado"]` e NENHUM campo de cobertura; o formato do campo novo ainda não existe — o Matheus vai incluí-lo
 * até 01/12/2026. Até lá esta função devolve null para qualquer arquivo, e o mês de cobertura fica
 * "indisponível" (sem gatilho, sem posição oficial, com aviso). Nada é adivinhado: quando o campo existir, é
 * só aqui que ele entra, e só aqui que os testes precisam mudar.
 * Em dezembro isso significa gatilho indisponível para todos, porque novembro já será mês fechado.
 */
// Os três parâmetros já são os definitivos (arquivo do mês, anomes e id do produto): só o corpo muda na pendência 10.
function coberturaDoFechado(fechado, anomes, pid) {
  return null;
}

const VAZIO = () => ({ meta: null, real: null, online: null, metaDia: null });
/** Bloco de produto da API (mês aberto) -> valores do mês. Produto ausente no bloco: tudo null. */
const doBlocoApi = (b) => (b ? { meta: b.meta, real: b.realizado, online: b.online_hoje, metaDia: b.meta_dia } : VAZIO());
/**
 * Bloco `cobertura` de um produto da API -> { meta, real, online } (premissa P2: os números como a API publica,
 * sem recalcular soma de rotas). Produto ausente, ou produto sem o bloco `cobertura` (modelo sem as colunas):
 * null, que vira mês "indisponível" — diferente de `cobertura.meta` null, que é "sem meta de cobertura".
 */
const doBlocoCobertura = (b) => {
  const c = b && ehObjeto(b.cobertura) ? b.cobertura : null;
  return c ? { meta: c.meta, real: c.realizado, online: c.online_hoje } : null;
};
/** Par [meta, realizado] do fechado -> valores do mês (sem online nem meta dia no fechamento: online 0). */
const doPar = (par, iMeta, iReal) => (Array.isArray(par) ? { meta: par[iMeta], real: par[iReal], online: 0, metaDia: null } : VAZIO());
const ehEventual = (rota) => /-EV$/.test(String(rota)); // rota oculta com o Real das rotas EV* (M.rota_eventuais)
const somaOuNull = (vs) => { const c = vs.filter((v) => typeof v === 'number'); return c.length ? c.reduce((a, b) => a + b, 0) : null; };

/**
 * Lê um fechado/AAAAMM.json para o produto `pid`: { ok, motivo, estado, simulado, gc: {GC: valores} | null,
 * empresa: valores | null, sv: {SV: valores}, gcDoSv: {SV: GC}, rotas: [{rota, gc, sv, valores}] }.
 * GC vem de totais.gerencias e o Total Band de totais.empresa (sem os totais: nível indisponível no mês,
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
           simulado: f.simulado === true, gc, empresa: temTotais ? doPar(f.totais.empresa[pid], iMeta, iReal) : null,
           sv, gcDoSv, rotas };
}

/**
 * Linhas do Ranking GC pela gerência comercial agrupada (regras v1.6, seção 4; decisão de 09/11/2026).
 * `codigos` = as gerências que a API publicou (index.json -> gerencias, mais as que só aparecem num mês fechado).
 * O mapa é `cfg.gruposGC`: código da linha -> gerências que ela soma. Nada é fixo aqui.
 * Devolve { grupos: [{ codigo, gerencias, faltantes, agrupada, foraDoMapa }], avisos: [...] }:
 *   - gerência do mapa que a API não publicou: fica em `faltantes`, o grupo sai só com as que existem, com aviso;
 *   - grupo sem nenhuma gerência publicada: não entra no ranking, com aviso (nunca uma linha de zeros);
 *   - gerência publicada e fora do mapa: linha própria (`foraDoMapa`), com aviso — o ranking nunca esconde uma
 *     gerência que a API passou a publicar.
 * A ordem não importa: o motor ordena pela Soma e desempata pelo código da linha em minúsculas ("ur_ri").
 */
function gruposDoRankingGC(codigos, cfg) {
  cfg = cfg || CONFIG;
  const mapa = ehObjeto(cfg.gruposGC) ? cfg.gruposGC : {};
  const publicadas = Array.isArray(codigos) ? codigos.slice() : [];
  const grupos = [], avisos = [], usadas = {};
  for (const [codigo, membros] of Object.entries(mapa)) {
    const lista = Array.isArray(membros) ? membros : [];
    const gerencias = lista.filter((g) => publicadas.indexOf(g) >= 0);
    const faltantes = lista.filter((g) => publicadas.indexOf(g) < 0);
    for (const g of gerencias) usadas[g] = true;
    if (!gerencias.length) {
      avisos.push(`a linha ${codigo} do Ranking GC não entra: a API não publicou ${lista.join(' nem ') || 'nenhuma gerência'}`);
      continue;
    }
    if (faltantes.length) {
      avisos.push(`a linha ${codigo} do Ranking GC soma só ${gerencias.join(' + ')}: a API não publicou ${faltantes.join(', ')}`);
    }
    grupos.push({ codigo, gerencias, faltantes, agrupada: gerencias.length > 1, foraDoMapa: false });
  }
  for (const g of publicadas.filter((x) => !usadas[x]).sort()) {
    avisos.push(`a gerência ${g} não está no agrupamento do Ranking GC (regras v1.6, seção 4): entra como linha própria`);
    grupos.push({ codigo: g, gerencias: [g], faltantes: [], agrupada: false, foraDoMapa: true });
  }
  return { grupos, avisos };
}

/**
 * Estrutura das tabelas de ranking (premissa P7; regras, seção 7) de UMA linha: o que a tela lê sem calcular nada.
 * Dois blocos, Aperitivo (volume) e Skyy (cobertura), e dentro de cada um `porMes[10|11|12]` com
 * { meta, real, online, metaDia, dif, pct, hojeOk, fonte, estado, situacao, aberto, motivo }.
 *   - `online`, `metaDia` e `metaDiaExib` só existem no mês ABERTO (mês de referência fora do período de
 *     fechamento da API); `metaDiaExib` é o valor que a TELA mostra (regras v1.4) e `metaDia` o de origem;
 *     nos outros meses vêm null, e a tela mostra "—" (não é zero, é ausência de medida);
 *   - Aperitivo traz ainda `pctTravado` e `travado` por mês (as colunas Out | Nov | Dez são os % travados) e,
 *     no bloco, `soma` (a pontuação do ranking), `incompleta` e `mesesSemPct`;
 *   - Skyy traz `pctNov`, `pctDez` e `acumulado` (o valor do gatilho; em novembro, parcial), que NÃO mudam com o
 *     seletor de mês; `acumulado` é null nas linhas sem gatilho (consultor).
 *   - `hojeOk` é o "Hoje" colorido do motor (Online > 0 e Online ≥ Meta dia), já resolvido por mês e produto.
 */
function tabelaDaLinha(vol, cob, extra, motor) {
  const comum = (m) => {
    const online = m.aberto ? (m.online === undefined ? null : m.online) : null;
    const metaDia = m.aberto ? (m.metaDia === undefined ? null : m.metaDia) : null;
    // metaDiaExib = o que a TELA mostra (regras v1.4): no volume passa por motor.metaDiaVolume; na cobertura é o
    // próprio valor do motor (já 0 com a meta batida e inteiro para cima). `metaDia` guarda a origem.
    const metaDiaExib = m.aberto ? (m.metaDiaExib === undefined ? null : m.metaDiaExib) : null;
    return { mes: m.mes, anomes: m.anomes, fonte: m.fonte, estado: m.estado || null, situacao: m.situacao,
             aberto: !!m.aberto, meta: m.meta, real: m.real, online, metaDia, metaDiaExib,
             dif: m.dif === undefined ? null : m.dif, pct: m.pct === undefined ? null : m.pct,
             hojeOk: motor.hojeAtingiu(online, metaDiaExib), motivo: m.motivo || null };
  };
  const porMes = (meses, mais) => Object.fromEntries(meses.map((m) => [m.mes, Object.assign(comum(m), mais ? mais(m) : null)]));
  const doMes = (meses, mes) => meses.find((m) => m.mes === mes) || {};
  const g = (extra && extra.gatilho) || null;
  return {
    aperitivo: Object.assign({ porMes: porMes(vol.meses, (m) => ({ pctTravado: m.pctTravado, travado: m.travado })) },
                             { soma: vol.soma, incompleta: vol.incompleta, mesesSemPct: vol.mesesSemPct }),
    skyy: { porMes: porMes(cob), pctNov: doMes(cob, 11).pct === undefined ? null : doMes(cob, 11).pct,
            pctDez: doMes(cob, 12).pct === undefined ? null : doMes(cob, 12).pct,
            acumulado: g ? g.valor : null, parcial: g ? g.parcial : false,
            indisponivel: g ? g.indisponivel : true, motivo: g ? g.motivo : null },
  };
}

/**
 * Monta os dados do ranking a partir do que já foi lido (função pura; carregarRanking faz a leitura):
 *   entrada = { index, gerencias: [gerencias/{GC}.json], resumo: resumo.json, fechados: {AAAAMM: json | Error},
 *               base, ajustes }
 * Devolve, além de mesReferencia/calendario/simulado/avisos:
 *   meses:        [{ mes, anomes, fonte, estado ('aberto' | 'previa' | 'oficial' | null), motivo }] — volume
 *   mesesCobertura: o mesmo para a cobertura de Skyy, que segue outra regra de fonte (fontesDaCobertura)
 *   mesGatilho:   o mês da vigência que está valendo para o gatilho (10, 11, 12 ou null)
 *   gc:           as linhas do RANKING GC, pela gerência comercial agrupada (regras v1.6, seção 4; 12 linhas no
 *                 lugar das 16 gerências da API), já somadas, ordenadas e numeradas; `codigo` é o da LINHA
 *                 ("UR_RI"), e `gerencias` lista as gerências da API que ela soma
 *   gcApi:        uma linha por gerência da API, SEM ranking (sem pos, sem posição oficial e sem status): é o que
 *                 a aba Detalhe do mês e o filtro de gerência usam, que seguem com as 16 (premissa (d) da seção 4)
 *   gc, svMista, svSegmentada: linhas ordenadas e numeradas pelo motor (pos 1..n), cada uma com
 *                 { codigo, chave, gc, canal, origemCanal,
 *                   meses: [volume de Aperitivo, por mês: meta, real, online, metaDia, dif, pct, pctTravado,
 *                           travado, fonte, estado, situacao, aberto], soma, incompleta, mesesSemPct, pos,
 *                   cobertura: [cobertura de Skyy, por mês: meta, real, online, metaDia, dif, pct, fonte,
 *                               estado, situacao, aberto, motivo],
 *                   gatilho: { valor, batido, parcial, indisponivel, motivo }, oficial, status: { status, motivo },
 *                   tabela: { aperitivo, skyy } (estrutura da P7, pronta para a tela) }
 *   fora:         SVs fora do ranking (empate de canal ou sem canal), com o motivo; têm gatilho, mas não têm
 *                 posição oficial nem status (não disputam ranking)
 *   rotas:        consultores, só com os próprios números por mês (sem ranking, sem gatilho e sem status);
 *                 `tipo` é o da API ('normal', 'neutraliza', 'virtual'...) ou null quando a rota só existe num
 *                 mês fechado, que não publica o tipo — a aba Consultor filtra por ele (rotasDaMesa)
 *   totalBand:    linha da empresa (resumo.json -> empresa), com meta dia de volume da API e meta dia de
 *                 cobertura do motor; sem posição oficial e sem status (Diretoria e GP não têm apuração própria)
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
                           avisos: [], meses: [], mesesCobertura: [], mesGatilho: null, gc: [], gcApi: [], svMista: [],
                           svSegmentada: [], fora: [], rotas: [], totalBand: null, canaisSV: {} }, comum);
  }
  const pid = produtos.ids.aperitivo, pidSkyy = produtos.ids.skyy;
  const avisos = ajustes.avisos.slice();
  // Total Band: só do resumo.json -> empresa.produtos (nunca soma de gerências). Sem o arquivo, o nível fica
  // indisponível no mês de referência, com aviso.
  const empresaApi = ehObjeto(entrada.resumo) && ehObjeto(entrada.resumo.empresa) && ehObjeto(entrada.resumo.empresa.produtos)
    ? entrada.resumo.empresa.produtos : null;
  if (!empresaApi) avisos.push('resumo.json indisponível ou em formato inesperado: o Total Band do mês de referência fica sem números');

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

  // 2. valores por nível e mês (anomes -> código -> valores); o que a API publica, sem recalcular.
  // O nível `grupo` é o do Ranking GC agrupado (passo 2c): ele não vem da API, é a soma das gerências do grupo.
  const vals = { gc: {}, grupo: {}, sv: {}, rota: {}, empresa: {} }, info = { gc: {}, sv: {}, rota: {} };
  const por = (nivel, anomes, cod, v) => { ((vals[nivel][cod] = vals[nivel][cod] || {}))[anomes] = v; };
  const anotar = (nivel, cod, dados) => { info[nivel][cod] = Object.assign(info[nivel][cod] || {}, dados); };
  // estrutura atual (API): todas as gerências, supervisões e rotas aparecem, mesmo sem número em algum mês
  for (const g of gerencias) {
    const gid = g.gerencia.id;
    anotar('gc', gid, {});
    for (const s of g.supervisoes || []) anotar('sv', s.id, { gc: gid });
    for (const r of g.rotas || []) if (r.tipo !== 'eventual' && !ehEventual(r.id)) anotar('rota', r.id, { gc: gid, sv: r.supervisao, tipo: r.tipo || null });
  }
  for (const f of fontes) {
    if (f.fonte === 'api') {
      for (const g of gerencias) {
        por('gc', f.anomes, g.gerencia.id, doBlocoApi((g.produtos || {})[pid]));
        for (const s of g.supervisoes || []) por('sv', f.anomes, s.id, doBlocoApi((s.produtos || {})[pid]));
        for (const r of g.rotas || []) if (r.tipo !== 'eventual' && !ehEventual(r.id)) por('rota', f.anomes, r.id, doBlocoApi((r.produtos || {})[pid]));
      }
      if (empresaApi) por('empresa', f.anomes, TOTAL_BAND, doBlocoApi(empresaApi[pid]));
    } else if (f.fonte === 'fechado') {
      const l = lidos[f.anomes];
      if (l.empresa) por('empresa', f.anomes, TOTAL_BAND, l.empresa);
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

  // 2b. cobertura de Skyy por nível e mês (premissa P1): o mês de referência pelos blocos `cobertura` da API
  // (inclusive em período de fechamento) e os meses anteriores pelo fechado, que hoje não traz cobertura.
  const fontesCob = fontesDaCobertura(index, cfg).map((f) => Object.assign({}, f));
  const cob = { gc: {}, grupo: {}, sv: {}, rota: {}, empresa: {} };
  const porCob = (nivel, anomes, cod, v) => { ((cob[nivel][cod] = cob[nivel][cod] || {}))[anomes] = v; };
  for (const f of fontesCob) {
    if (f.fonte === 'api') {
      f.estado = f.fechamento ? 'fechamento' : 'aberto';
      for (const g of gerencias) {
        porCob('gc', f.anomes, g.gerencia.id, doBlocoCobertura((g.produtos || {})[pidSkyy]));
        for (const s of g.supervisoes || []) porCob('sv', f.anomes, s.id, doBlocoCobertura((s.produtos || {})[pidSkyy]));
        for (const r of g.rotas || []) if (r.tipo !== 'eventual' && !ehEventual(r.id)) porCob('rota', f.anomes, r.id, doBlocoCobertura((r.produtos || {})[pidSkyy]));
      }
      if (empresaApi) porCob('empresa', f.anomes, TOTAL_BAND, doBlocoCobertura(empresaApi[pidSkyy]));
    } else if (f.fonte === 'fechado') {
      // porta única de `coberturaDoFechado`: hoje sempre null -> mês de cobertura indisponível, nunca um valor
      // assumido. O motivo chega à tela (regras v1.12): diz só o fato do dado, sem citar a pendência das regras.
      if (coberturaDoFechado((entrada.fechados || {})[f.anomes], f.anomes, pidSkyy) === null) {
        Object.assign(f, { fonte: 'indisponivel',
          motivo: `${f.arquivo || `fechado/${f.anomes}.json`} não traz cobertura` });
      }
    }
  }
  // aviso só dos meses que contam no gatilho (outubro nunca conta, então o "—" do Skyy de outubro não é alarme)
  for (const f of fontesCob) {
    if (f.fonte === 'indisponivel' && motor.REGRAS.gatilho.meses.indexOf(f.mes) >= 0) {
      avisos.push(`cobertura de ${NOMES_MES[f.mes]} indisponível: ${f.motivo}; o gatilho fica indisponível e ninguém recebe posição oficial`);
    }
  }

  // 2c. Ranking GC pela GERÊNCIA COMERCIAL AGRUPADA (regras v1.6, seção 4; decisão de 09/11/2026, pendência 24):
  // a linha do ranking soma, por mês e por produto, as gerências do grupo ANTES de qualquer conta — o % é o da
  // soma, nunca a média dos % das gerências. A soma é do motor (`somarGrupo`); aqui só se decide quem soma com
  // quem (CONFIG.gruposGC, por `gruposDoRankingGC`) e o que fazer quando falta o mês de uma das gerências:
  // o mês do grupo fica indisponível e a linha, incompleta — nunca uma soma parcial passando por total.
  const agrupamento = gruposDoRankingGC(Object.keys(info.gc), cfg);
  for (const a of agrupamento.avisos) avisos.push(a);
  const semMesNoGrupo = {}; // código da linha -> { anomes: true } dos meses que faltam em alguma gerência do grupo
  for (const grupo of agrupamento.grupos) {
    const falta = {};
    for (const f of fontes) {
      const doMes = grupo.gerencias.map((g) => (vals.gc[g] || {})[f.anomes]);
      if (doMes.some((v) => v === undefined)) falta[f.anomes] = true;
      por('grupo', f.anomes, grupo.codigo, motor.somarGrupo(doMes));
    }
    semMesNoGrupo[grupo.codigo] = falta;
    for (const f of fontesCob) {
      const doMes = grupo.gerencias.map((g) => (cob.gc[g] || {})[f.anomes]);
      // bloco `cobertura` ausente em alguma gerência do grupo: o mês do grupo fica sem cobertura (nunca soma
      // parcial), e `apurarCobertura` o trata como indisponível, igual a uma gerência sem o bloco
      porCob('grupo', f.anomes, grupo.codigo,
             doMes.some((v) => !v) ? null : motor.somarGrupo(doMes, ['meta', 'real', 'online']));
    }
  }

  // 3. meses de uma linha -> motor (situação: dado | indisponivel | futuro)
  const situacao = (f, nivel, cod) => (f.fonte === 'futuro' ? 'futuro' : f.fonte === 'indisponivel' ? 'indisponivel'
    : nivel === 'grupo' ? ((semMesNoGrupo[cod] || {})[f.anomes] ? 'indisponivel' : 'dado')
    : nivel === 'gc' && f.fonte === 'fechado' && !lidos[f.anomes].gc ? 'indisponivel'
    : nivel === 'empresa' && f.fonte === 'fechado' && !lidos[f.anomes].empresa ? 'indisponivel'
    : nivel === 'empresa' && f.fonte === 'api' && !empresaApi ? 'indisponivel' : 'dado');
  const apurar = (nivel, cod) => {
    const a = motor.apurarMeses(fontes.map((f) => {
      const s = situacao(f, nivel, cod);
      const v = s === 'dado' ? ((vals[nivel][cod] || {})[f.anomes] || VAZIO()) : VAZIO();
      return Object.assign({ mes: f.mes, anomes: f.anomes, fonte: f.fonte, estado: f.estado || null, situacao: s,
                             aberto: f.fonte === 'api' }, v,
                           { metaDia: f.fonte === 'api' && s === 'dado' ? v.metaDia : null });
    }));
    a.meses = a.meses.map((m) => Object.assign(m, { dif: motor.diferenca(m.real, m.online, m.meta),
      metaDiaExib: motor.metaDiaVolume(m.metaDia, m.real, m.meta) })); // regra de exibição da v1.4: só no motor
    return a;
  };

  // 3b. meses de COBERTURA de uma linha (premissas P2 e P5): % bruto e meta dia do motor; nada recalculado da API.
  //  - bloco `cobertura` ausente no produto (modelo sem as colunas) ou mês sem fonte: 'indisponivel';
  //  - `cobertura.meta` null ou ≤ 0: mês com dado, mas % null e motivo "sem meta de cobertura";
  //  - meta dia só no mês aberto: em período de fechamento não há dia útil a recuperar e o online vem null.
  const diasRestantes = (index.calendario || {}).dias_uteis_restantes;
  const apurarCobertura = (nivel, cod) => fontesCob.map((f) => {
    const bruto = (cob[nivel][cod] || {})[f.anomes];
    const s = f.fonte === 'futuro' ? 'futuro' : f.fonte !== 'api' || !bruto ? 'indisponivel' : 'dado';
    const aberto = f.fonte === 'api' && f.fechamento !== true;
    const v = s === 'dado' ? bruto : { meta: null, real: null, online: null };
    const pct = s === 'dado' ? motor.percentualCobertura(v.real, v.online, v.meta) : null;
    const motivo = s === 'futuro' ? null : s === 'indisponivel' ? motor.MOTIVOS.indisponivel
      : pct === null ? motor.MOTIVOS.semMeta : null;
    // a meta dia de cobertura do motor já é a de exibição (0 com a meta batida, inteiro para cima): metaDiaExib
    // repete o valor para a tela ler o mesmo campo nos dois blocos.
    const md = aberto && s === 'dado' ? motor.metaDiaCobertura(v.meta, v.real, diasRestantes) : null;
    return { mes: f.mes, anomes: f.anomes, fonte: f.fonte, estado: f.estado || null, situacao: s, aberto,
             meta: v.meta === undefined ? null : v.meta, real: v.real === undefined ? null : v.real,
             online: v.online === undefined ? null : v.online, metaDia: md, metaDiaExib: md,
             dif: s === 'dado' ? motor.diferenca(v.real, v.online, v.meta) : null, pct, motivo };
  });
  // mês da vigência que está valendo para o gatilho: o maior mês de CONFIG.meses já alcançado pela referência
  // (referência antes de outubro: null, e o gatilho fica indisponível; depois de dezembro: dezembro)
  const alcancados = cfg.meses.filter((m) => anomesDe(cfg.ano, m) <= String(index.mes_referencia.anomes));
  const mesGatilho = alcancados.length ? alcancados[alcancados.length - 1] : null;

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

  // 5. linhas e ranking (ordem, posição, gatilhos, posição oficial e status: motor)
  /**
   * Os dois pilares de uma linha (e o par deles), todos do motor (regras v1.11, seções 2 e 5):
   *   - `gatilho`: cobertura de Skyy, o único gatilho por média (é o "% Médio" da tela; não mudou de nome nem de
   *     forma);
   *   - `minimoVolume`: o MÍNIMO de volume de Aperitivo (v1.11, etapa 4K, no lugar do gatilho por média da 4H):
   *     o % do MÊS VIGENTE (`mesGatilho`, o mês de referência da API), sobre os MESMOS meses que o ranking da
   *     linha recebe (`vol.meses`: meta, real, online e situação de cada mês). Na linha agrupada do Ranking GC os
   *     meses já são a soma das gerências do grupo (passo 2c), então o % é o da soma;
   *   - `gatilhoPilares`: os dois juntos, que decidem a coluna "RANK" (posição oficial) e o "Bateu!".
   */
  const pilaresDaLinha = (vol, cobertura) => {
    const gatilho = motor.gatilhoCobertura(cobertura, mesGatilho);
    const minimoVolume = motor.minimoVolume(vol.meses, mesGatilho);
    return { gatilho, minimoVolume, gatilhoPilares: motor.gatilhoPilares(gatilho, minimoVolume) };
  };
  const linha = (nivel, cod, extra) => {
    const vol = apurar(nivel, cod), cobertura = apurarCobertura(nivel, cod);
    const l = Object.assign({ codigo: cod, chave: motor.chaveCodigo(cod) }, extra, vol,
                            { cobertura }, pilaresDaLinha(vol, cobertura));
    l.tabela = tabelaDaLinha(vol, cobertura, l, motor);
    return l;
  };
  /** Um nível de ranking: ordem e `pos` (Etapa 2), posição oficial (a coluna "RANK") só de quem bateu os dois
      pilares e status (4H/4K). */
  const ranquear = (linhas, nivel) => motor.numerarOficial(motor.montarRanking(linhas))
    .map((l) => Object.assign(l, { status: motor.statusLinha(l, nivel) }));
  // Ranking GC: uma linha por GRUPO (gerência comercial agrupada), somada no passo 2c. `codigo` é o da linha
  // ("UR_RI"), que é o que a coluna Gerência mostra e também a chave de desempate ("ur_ri", no motor).
  const gc = ranquear(agrupamento.grupos.map((grupo) => linha('grupo', grupo.codigo,
    { gc: grupo.codigo, gerencias: grupo.gerencias, agrupada: grupo.agrupada, canal: null, origemCanal: null })), 'gc');
  // As 16 gerências da API, sem ranking: a aba Detalhe do mês e o filtro de gerência continuam com elas
  // (premissa (d) da seção 4). Sem pos, sem posição oficial e sem status, para ninguém confundir com o ranking.
  const gcApi = Object.keys(info.gc).sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .map((g) => linha('gc', g, { gc: g, canal: null, origemCanal: null }));
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
  // consultor: só os próprios números, sem ranking, sem gatilho e sem status (regras, seção 1). `soma` fica null
  // na tabela porque a rota não tem pontuação de ranking.
  const rotas = Object.keys(info.rota).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true })).map((r) => {
    const a = apurar('rota', r), c = canalRota[r], cobertura = apurarCobertura('rota', r);
    const l = { codigo: r, gc: info.rota[r].gc, sv: info.rota[r].sv, tipo: info.rota[r].tipo || null,
                canal: (c && c.canal) || null, sub: (c && c.sub) || null, meses: a.meses, cobertura };
    l.tabela = tabelaDaLinha({ meses: a.meses, soma: null, incompleta: a.incompleta, mesesSemPct: a.mesesSemPct }, cobertura, null, motor);
    return l;
  });
  // Total Band (Diretoria e GP): resumo.json -> empresa; meta dia de volume da API e meta dia de cobertura do
  // motor. Tem os gatilhos (o de cobertura é o % Médio da empresa), mas não tem posição oficial nem status.
  const totalBand = (() => {
    const vol = apurar('empresa', TOTAL_BAND), cobertura = apurarCobertura('empresa', TOTAL_BAND);
    const l = Object.assign({ codigo: TOTAL_BAND, nivel: 'empresa' }, vol, { cobertura }, pilaresDaLinha(vol, cobertura));
    l.tabela = tabelaDaLinha(vol, cobertura, l, motor);
    return l;
  })();
  const svMista = ranquear(svs.Mista, 'svMista'), svSegmentada = ranquear(svs.Segmentada, 'svSegmentada');
  const doMes = ({ mes, anomes, fonte, estado, motivo, arquivo }) =>
    ({ mes, anomes, fonte, estado: estado || null, motivo: motivo || null, arquivo: arquivo || null });
  return Object.assign({ ok: true, erro: null, avisos, meses: fontes.map(doMes), mesesCobertura: fontesCob.map(doMes),
    mesGatilho, gc, gcApi, svMista, svSegmentada, fora, rotas, totalBand, canaisSV,
    baseCanais: { foto: (base.meta || {}).foto || null, corteSeg: (base.meta || {}).corteSeg || null } }, comum);
}

/**
 * Lê a API (index.json, gerencias/*.json, resumo.json e os fechados necessários) e o ajustes.json publicado, e monta
 * os dados do ranking (montarDados). Falha no index.json ou numa gerência: ok false, com o motivo em `erro`, sem
 * valor inventado. Fechado que falha: só aquele mês fica indisponível. resumo.json que falha: só o Total Band
 * fica sem os números do mês de referência, com aviso (o resto do painel continua).
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
    return { ok: false, erro: `API indisponível (${e.message})`, avisos: [], meses: [], mesesCobertura: [],
             mesGatilho: null, gc: [], gcApi: [], svMista: [], svSegmentada: [], fora: [], rotas: [], totalBand: null,
             canaisSV: {} };
  }
  let resumo = null;
  try { resumo = await ler('resumo.json'); } catch (e) { resumo = null; } // só o Total Band depende dele
  const fechados = {};
  for (const f of fontesDosMeses(index, cfg)) {
    if (f.fonte !== 'fechado') continue;
    try { fechados[f.anomes] = await ler(f.arquivo); } catch (e) { fechados[f.anomes] = e; }
  }
  const ajustes = await lerAjustes(fetchFn, cfg);
  return montarDados({ index, gerencias, resumo, fechados, base: opcoes.baseCanais, ajustes }, cfg, opcoes.motor);
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
 * Etapa 4 — formatação e recortes para a tela (funções PURAS e testadas)
 *
 * A tela só lê: nenhuma conta de regra aqui. Formatar e recortar não é calcular — o % já vem bruto do motor e
 * estas funções apenas o truncam para a exibição; a soma mostrada é a `soma` do motor, nunca a soma dos valores
 * truncados da tela.
 * ═════════════════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Primeira letra em maiúscula, para nome de mês ("outubro" -> "Outubro"); `titulo` serve a siglas ("AN" -> "An"). */
const maiusc1 = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

/** Ausência de medida (null): "—". Nunca zero — zero é um número medido. */
const TRACO = '—';
const numeroOk = (v) => typeof v === 'number' && Number.isFinite(v);

/** Volume: 1 casa decimal, padrão pt-BR (1234.56 -> "1.234,6"; -0,04 -> "0,0"). Null ou não numérico: "—". */
function fmtVolume(v) {
  if (!numeroOk(v)) return TRACO;
  const r = Math.round(v * 10) / 10 || 0; // o "|| 0" tira o -0 dos valores que arredondam para zero
  return r.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Cobertura: clientes, sem casa decimal, padrão pt-BR (1738 -> "1.738"). Null ou não numérico: "—". */
function fmtCobertura(v) {
  if (!numeroOk(v)) return TRACO;
  return (Math.round(v) || 0).toLocaleString('pt-BR');
}

/**
 * % TRUNCADO em 1 casa, com o sinal (a tela nunca arredonda o que a regra trunca): 99.96 -> "99,9%",
 * 100 -> "100,0%". É a mesma truncagem que o motor usa no motivo "cobertura em X%" (um teste compara as duas).
 * Null ou não numérico: "—".
 */
function fmtPct(v) {
  if (!numeroOk(v)) return TRACO;
  return ((Math.floor(v * 10 + 1e-9) / 10) || 0).toFixed(1).replace('.', ',') + '%';
}

/** "2026-11-09T10:00:34" -> "09/11/2026 · 10:00". Sem hora: só a data. Ilegível ou ausente: "—". */
function fmtDataHora(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(String(s === null || s === undefined ? '' : s));
  if (!m) return TRACO;
  return m[3] + '/' + m[2] + '/' + m[1] + (m[4] ? ' · ' + m[4] + ':' + m[5] : '');
}

/** "dia útil 5/19", do calendário da API; sem os dois números: null (a tela não mostra a parte). */
function rotuloDiaUtil(cal) {
  if (!ehObjeto(cal) || !numeroOk(cal.dia_util_hoje) || !numeroOk(cal.dias_uteis_mes)) return null;
  return 'dia útil ' + cal.dia_util_hoje + '/' + cal.dias_uteis_mes;
}

/** Rótulo de um mês da vigência: "Novembro/26", e "Outubro/26 (prévia)" enquanto o flash não é marcado. */
const rotuloDoMes = (mes, ano, estado) =>
  maiusc1(NOMES_MES[mes] || '?') + '/' + String(ano).slice(-2) + (estado === 'previa' ? ' (prévia)' : '');

/**
 * Opções do seletor "Mês de referência" (premissa P4), o mês padrão e o mês vigente.
 * Devolve { meses: [{ mes, anomes, rotulo, fonte, estado, aberto, habilitado, motivo }], padrao, referencia }.
 *   - `habilitado` = o mês tem fonte de volume ('api' ou 'fechado'); mês futuro ou indisponível fica DESABILITADO;
 *   - `aberto` = mês de referência fora do período de fechamento da API (é o único com M. Dia e Online);
 *   - `padrao` = o mês de referência do index.json, quando habilitado; senão o último habilitado; nenhum: null.
 *   - `referencia` = o mês VIGENTE: o mês da vigência que o index.json publica como referência, mesmo sem fonte
 *     de volume e mesmo no período de fechamento da API; referência fora da vigência: null. É ele, e não a
 *     escolha do seletor, que decide as colunas que só existem em dezembro e em qual coluna de mês fica o
 *     quadradinho do % de Aperitivo (regras v1.7, seção 7).
 * O seletor troca só Meta, Real, Dif e o % do mês: Out, Nov, Dez, % Acum., % Nov e % Médio não dependem dele.
 */
function mesesDoSeletor(dados, cfg) {
  cfg = cfg || CONFIG;
  const doVolume = (dados && dados.meses) || [];
  const meses = cfg.meses.map((mes) => {
    const f = doVolume.find((m) => m.mes === mes)
      || { mes, anomes: anomesDe(cfg.ano, mes), fonte: 'futuro', estado: null, motivo: null };
    return { mes, anomes: f.anomes, fonte: f.fonte, estado: f.estado || null, aberto: f.fonte === 'api',
             habilitado: f.fonte === 'api' || f.fonte === 'fechado',
             rotulo: rotuloDoMes(mes, cfg.ano, f.estado), motivo: f.motivo || null };
  });
  const ref = String(dados && dados.mesReferencia ? dados.mesReferencia.anomes : '');
  const doRef = meses.find((m) => m.anomes === ref && m.habilitado);
  const naVigencia = meses.find((m) => m.anomes === ref);
  const hab = meses.filter((m) => m.habilitado);
  return { meses, padrao: doRef ? doRef.mes : hab.length ? hab[hab.length - 1].mes : null,
           referencia: naVigencia ? naVigencia.mes : null };
}

/** Mês sem nenhuma medida: a tela mostra "—" em tudo, nunca zero. */
const SEM_MES = { meta: null, real: null, online: null, metaDia: null, metaDiaExib: null, dif: null, pct: null,
                  pctTravado: null, travado: false, hojeOk: false, fonte: null, estado: null,
                  situacao: 'indisponivel', aberto: false, motivo: null };

/** Valores de um produto ('aperitivo' | 'skyy') num mês, da estrutura `tabela` da linha. Sem o mês: SEM_MES. */
function valoresDoMes(tabela, produto, mes) {
  const b = tabela && tabela[produto];
  const m = b && b.porMes ? b.porMes[mes] : null;
  return m || Object.assign({ mes }, SEM_MES);
}

/** Todas as linhas de supervisão (os dois canais e as que estão fora do ranking), em ordem de código. */
const todosOsSVs = (dados) => [].concat((dados && dados.svMista) || [], (dados && dados.svSegmentada) || [],
                                        (dados && dados.fora) || [])
  .slice().sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }));

/**
 * Opções dos filtros das abas (só CÓDIGOS, nunca nome de pessoa — privacidade na tela):
 * { gerencias: ['AN', ...], svs: [{ codigo, gc, canal, rotulo: "SV.AN.1 · Mista" }] }.
 * As gerências são as da API (`gcApi`), não as linhas agrupadas do Ranking GC: o filtro recorta supervisões e
 * rotas, que pertencem a uma gerência da API (premissa (d) da seção 4 das regras v1.6).
 */
function filtrosDoPainel(dados) {
  const svs = todosOsSVs(dados).map((l) => ({ codigo: l.codigo, gc: l.gc || null, canal: l.canal || null,
                                              rotulo: l.codigo + ' · ' + (l.canal || 'sem canal') }));
  const gerencias = Array.from(new Set(((dados && dados.gcApi) || []).map((l) => l.codigo)
    .concat(svs.map((s) => s.gc).filter(Boolean)))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  return { gerencias, svs };
}

/** Tipos de rota que a aba Consultor lista (decisão da Karen, 09/11/2026): só as rotas `tipo: "normal"` da API. */
const TIPOS_CONSULTOR = ['normal'];

/**
 * Rotas de uma mesa na aba Consultor -> { rotas, ocultas, total }.
 *   - `rotas`: só os tipos de `tipos` (padrão TIPOS_CONSULTOR);
 *   - `ocultas`: { <tipo>: quantas } do que ficou fora, inclusive 'sem tipo' (rota que só existe num mês fechado,
 *     que não publica o tipo) — nada sai da tela em silêncio;
 *   - `total`: a linha do SV, que a API soma com TODAS as rotas da mesa (regras, seção 4). Por isso o
 *     "Total da mesa" pode ser MAIOR que a soma das linhas visíveis; a tela avisa quando há rota oculta.
 */
function rotasDaMesa(dados, sv, tipos) {
  tipos = tipos || TIPOS_CONSULTOR;
  const daMesa = ((dados && dados.rotas) || []).filter((r) => r.sv === sv);
  const ocultas = {};
  for (const r of daMesa) if (tipos.indexOf(r.tipo) < 0) {
    const k = r.tipo || 'sem tipo';
    ocultas[k] = (ocultas[k] || 0) + 1;
  }
  return { rotas: daMesa.filter((r) => tipos.indexOf(r.tipo) >= 0), ocultas,
           total: todosOsSVs(dados).find((l) => l.codigo === sv) || null };
}

/** "2 rotas da mesa fora da lista (1 neutraliza, 1 virtual)" ou '' quando nenhuma ficou fora. */
function textoDasOcultas(ocultas) {
  const itens = Object.entries(ocultas || {}).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const n = itens.reduce((s, par) => s + par[1], 0);
  if (!n) return '';
  return n + ' ' + (n === 1 ? 'rota' : 'rotas') + ' da mesa fora da lista ('
    + itens.map((par) => par[1] + ' ' + par[0]).join(', ') + ')';
}

/**
 * Rotas da aba Consultor com o filtro da tela -> { rotas, ocultas, total, rotuloTotal }.
 * `filtro` = { sv, gc }. Desde a etapa 4G o Consultor ABRE em "Todas" (decisão de 09/11/2026, regras v1.7,
 * seção 7), então o SV pode vir vazio:
 *   - com SV: a mesa dele, como antes (`rotasDaMesa`), e o total é a linha do SV ("Total da mesa SV.XX.1");
 *   - sem SV e com gerência: as rotas daquela gerência, e o total é a linha da gerência da API (`gcApi`), que a
 *     API soma com TODAS as rotas dela (regras, seção 4);
 *   - sem nada: todas as rotas, e o total é o Total Band (`resumo.json` -> empresa).
 * Nenhuma soma é feita aqui: o total é sempre uma linha que a API publica. A ordem das rotas é a de `dados.rotas`
 * (código, numérica), a mesma de antes. Rotas fora dos tipos listados são contadas em `ocultas`, nunca sumidas.
 */
function rotasDoConsultor(dados, filtro, tipos) {
  filtro = filtro || {};
  tipos = tipos || TIPOS_CONSULTOR;
  if (filtro.sv) {
    const m = rotasDaMesa(dados, filtro.sv, tipos);
    return { rotas: m.rotas, ocultas: m.ocultas, total: m.total, rotuloTotal: 'Total da mesa ' + filtro.sv };
  }
  const daTela = ((dados && dados.rotas) || []).filter((r) => !filtro.gc || r.gc === filtro.gc);
  const ocultas = {};
  for (const r of daTela) if (tipos.indexOf(r.tipo) < 0) {
    const k = r.tipo || 'sem tipo';
    ocultas[k] = (ocultas[k] || 0) + 1;
  }
  const total = filtro.gc
    ? ((dados && dados.gcApi) || []).find((l) => l.codigo === filtro.gc) || null
    : (dados && dados.totalBand) || null;
  return { rotas: daTela.filter((r) => tipos.indexOf(r.tipo) >= 0), ocultas, total,
           rotuloTotal: filtro.gc ? 'Total da gerência ' + filtro.gc : TOTAL_BAND };
}

/**
 * Uma página de linhas (etapa 4G; regras v1.7, seção 7) -> { linhas, pagina, paginas, total, tamanho, inicio,
 * fim, uma }. Função PURA, e a única conta de paginação do painel: a tela só pede a fatia e desenha os botões.
 *   - `tamanho` padrão: CONFIG.linhasPorPagina (15). Tamanho inválido (≤ 0, não numérico) cai no padrão;
 *   - `pagina` fora do intervalo é TRAVADA no intervalo (0 e -3 viram 1; 99 vira a última), nunca devolve vazio
 *     por página alta: filtro que encurta a lista não pode apagar a tabela;
 *   - lista vazia: uma página, sem linhas (`paginas` nunca é 0, para o "Página 1 de 1" fazer sentido);
 *   - `uma` = cabe numa página só, e é por ele que a tela decide NÃO desenhar os botões;
 *   - `inicio`/`fim` são 1-based, para o texto "16–30 de 233"; lista vazia dá 0 e 0.
 * A linha de total (Total Band ou Total da mesa) fica FORA desta conta: ela não é passada aqui e a tela a repete
 * em todas as páginas.
 */
function fatiar(linhas, pagina, tamanho) {
  const todas = Array.isArray(linhas) ? linhas : [];
  const t = numeroOk(tamanho) && tamanho >= 1 ? Math.floor(tamanho) : CONFIG.linhasPorPagina;
  const paginas = Math.max(1, Math.ceil(todas.length / t));
  const p = Math.min(paginas, Math.max(1, numeroOk(pagina) ? Math.floor(pagina) : 1));
  const de = (p - 1) * t;
  const fatia = todas.slice(de, de + t);
  return { linhas: fatia, pagina: p, paginas, total: todas.length, tamanho: t, uma: paginas <= 1,
           inicio: fatia.length ? de + 1 : 0, fim: de + fatia.length };
}

/**
 * A página da aba Detalhe do mês (etapa 4I; decisão da Karen de 09/11/2026, pendência 27) -> o mesmo objeto de
 * `fatiar`. Função PURA e sem conta própria de paginação: só escolhe o tamanho e chama `fatiar`.
 *   - visão em CONFIG.detalheSemPaginacao ('gc', Gerência): uma página com TODAS as linhas (`uma: true`, a tela
 *     não desenha botões), qualquer que seja a página pedida;
 *   - outra visão ('sv', Supervisão): páginas de CONFIG.linhasPorPagina, como na etapa 4G.
 * A linha de total (Total Band) continua fora da conta, como em `fatiar`.
 */
function paginaDoDetalhe(linhas, visao, pagina, cfg) {
  cfg = cfg || CONFIG;
  const todas = Array.isArray(linhas) ? linhas : [];
  const semPaginacao = (cfg.detalheSemPaginacao || []).indexOf(visao) >= 0;
  return semPaginacao ? fatiar(todas, 1, Math.max(1, todas.length)) : fatiar(todas, pagina, cfg.linhasPorPagina);
}

/**
 * Linhas da aba Detalhe do mês: visão 'gc' (gerências) ou 'sv' (supervisões), com filtro de gerência opcional.
 * A visão de gerência usa as da API (`gcApi`), não as linhas agrupadas do Ranking GC: o Detalhe do mês continua
 * com as 16 (premissa (d) da seção 4 das regras v1.6).
 */
function linhasDoDetalhe(dados, visao, gc) {
  if (visao === 'sv') {
    const todas = todosOsSVs(dados);
    return gc ? todas.filter((l) => l.gc === gc) : todas;
  }
  return ((dados && dados.gcApi) || []).slice().sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR'));
}

/**
 * "Dados e alertas" da aba Regras (função pura): o estado REAL dos dados, nunca texto de regra.
 * Devolve [{ tipo: 'erro' | 'aviso' | 'nota', titulo, texto }]:
 *   - 'erro': nada é calculado (API fora, dados simulados, produtos do Campari não publicados);
 *   - 'aviso': dado faltando que muda o resultado (cobertura de um mês do gatilho, mês de volume indisponível,
 *     supervisão fora do ranking, avisos da carga);
 *   - 'nota': informação (mês em prévia, mês que ainda não começou, cobertura de outubro, que nunca conta).
 * SÓ ALERTA DE DADO (regras v1.12, seção 10; decisão da Karen de 10/11/2026): as premissas a confirmar saíram
 * daqui e ficam só no documento de regras e no checklist — nenhum texto desta lista cita "pendência" nem
 * "premissa", só o fato do dado. As regras em aberto continuam valendo no CÁLCULO (a meta dia de volume compara
 * só o Real; meta de volume nula deixa o mínimo indisponível): elas apenas não aparecem mais na tela.
 * O aviso das supervisões fora do ranking fica SÓ aqui desde a v1.6: ele saiu da tela da Supervisão.
 */
function alertasDaTela(dados, cfg, motor) {
  cfg = cfg || CONFIG; motor = motor || MotorCampariAqui();
  const out = [];
  const add = (tipo, tit, texto) => out.push({ tipo, titulo: tit, texto });
  if (!dados || !dados.ok) {
    add('erro', 'API indisponível', ((dados && dados.erro) || 'sem dados') + ': nada é calculado.');
    return out;
  }
  if (dados.simulado) add('erro', 'Dados simulados', 'A API está publicando dados fictícios: não use estes números.');
  if (dados.produtos && !dados.produtos.ok) {
    add('erro', 'Produtos do Campari não publicados', dados.produtos.motivos.join('; ') + '. Nada é calculado.');
  }
  const doGatilho = motor.REGRAS.gatilho.meses;
  for (const m of dados.mesesCobertura || []) {
    if (m.fonte !== 'indisponivel') continue;
    const conta = doGatilho.indexOf(m.mes) >= 0;
    add(conta ? 'aviso' : 'nota', 'Cobertura de ' + NOMES_MES[m.mes] + ' indisponível',
        (m.motivo || 'sem fonte de cobertura') + (conta
          ? '. Sem ela o gatilho fica indisponível e ninguém recebe posição oficial.'
          : '. ' + maiusc1(NOMES_MES[m.mes]) + ' não entra no gatilho, então a coluna fica "' + TRACO + '".'));
  }
  for (const m of dados.meses || []) {
    if (m.fonte === 'indisponivel') {
      // mês de volume sem fonte: a soma do ranking fica incompleta e, se for o MÊS VIGENTE, o mínimo de volume
      // fica indisponível (regras v1.11, seção 2.2) — ele olha só esse mês, não mais a média de novembro e dezembro
      add('aviso', maiusc1(NOMES_MES[m.mes]) + ' indisponível',
          (m.motivo || 'mês sem fonte') + '. A soma das linhas fica incompleta' +
          (m.mes === dados.mesGatilho ? ', e o mínimo de volume fica indisponível (ninguém recebe posição oficial).' : '.'));
    } else if (m.estado === 'previa') {
      add('nota', maiusc1(NOMES_MES[m.mes]) + ' em prévia',
          'Os números ainda mudam até o Back Office marcar o flash de vendas; o mês segue a chave do faturamento.');
    } else if (m.fonte === 'futuro') {
      add('nota', maiusc1(NOMES_MES[m.mes]) + ' ainda não começou',
          'Mês sem dado: as colunas ficam "' + TRACO + '" e ele não entra na soma.');
    }
  }
  const fora = (dados.fora || []).map((l) => l.codigo);
  if (fora.length) {
    add('aviso', fora.length + ' ' + (fora.length === 1 ? 'supervisão' : 'supervisões') + ' fora do ranking',
        fora.join(', ') + ' — sem canal ou com empate de canal na mesa.');
  }
  for (const a of dados.avisos || []) add('aviso', 'Aviso da carga', a);
  return out;
}

if (typeof module === 'object' && module.exports) {
  module.exports = { CONFIG, localizarProdutos, carregarDados, fontesDosMeses, fontesDaCobertura, coberturaDoFechado,
                     lerFechado, gruposDoRankingGC, tabelaDaLinha, montarDados, carregarRanking, lerAjustes,
                     ajustesDeCanal, mapaCanal,
                     canaisDosSVs, validarCanalRota, svNome,
                     // Etapa 4 (tela): formatação e recortes, todos puros
                     TRACO, TIPOS_CONSULTOR, fmtVolume, fmtCobertura, fmtPct, fmtDataHora, rotuloDiaUtil,
                     rotuloDoMes, mesesDoSeletor, valoresDoMes, filtrosDoPainel, rotasDaMesa, textoDasOcultas,
                     linhasDoDetalhe, alertasDaTela,
                     // Etapa 4G (navegação por páginas), também puras
                     rotasDoConsultor, fatiar,
                     // Etapa 4I (Detalhe do mês: visão Gerência sem paginação), pura
                     paginaDoDetalhe };
}
