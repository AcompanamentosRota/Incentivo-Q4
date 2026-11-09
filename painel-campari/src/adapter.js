/*
 * Adaptador do painel Campari Club: API -> painel.
 * Fonte: a API publicada no mesmo site (./api/v1/). Etapa 1: só lê o index.json e localiza os dois produtos do
 * incentivo (agrupadores extras "Aperitivo" e "Skyy"). Não calcula nada e nunca inventa valor: produto ausente vira
 * motivo, e a tela avisa "Produtos do Campari ainda não publicados".
 */
const CONFIG = {
  ano: 2026,          // ano do incentivo
  meses: [10, 11, 12], // vigência: outubro, novembro e dezembro
  api: './api/v1/',
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

if (typeof module === 'object' && module.exports) {
  module.exports = { CONFIG, localizarProdutos, carregarDados };
}
