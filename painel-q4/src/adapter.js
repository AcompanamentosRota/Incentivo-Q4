/*
 * Adaptador: dados -> entrada do motor.
 * Fonte: a API do metas-produtos (./api/v1/, publicada no mesmo site do painel). O mês de referência vem da API
 * (index.json -> mes_referencia.anomes) e os meses anteriores do trimestre vêm dos meses fechados (index.json ->
 * fechados). Sem a API (HTML aberto direto do computador ou falha de rede), usa a base embutida (data/data.json,
 * gerada dos Excel do SAP), mas só no mês dela: nunca mostra um mês como se fosse outro.
 */
const CONFIG = {
  ano: 2026, // ano do trimestre (Q4); o mês vem da API
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
  // Pilares por canal e mês (coringas 4 e 5 mudam a cada mês: ler da configuração, não do código).
  // Mês sem os 5 pilares (lista vazia ou só os pilares 1 a 3) ainda não foi configurado: o painel avisa e não calcula
  // pontos nem ranking desse mês, nem como mês fechado no acumulado do SV.
  pilaresConfig: [
    { mes: 10, canal: 'Mista', pilares: [
      { nome: 'Volume Sabores', tipo: 'volume' }, { nome: 'Volume Retornáveis', tipo: 'volume' },
      { nome: 'Missões Guiadas', tipo: 'missao' }, { nome: 'Volume Sucos', tipo: 'volume' }, { nome: 'Volume Powerade', tipo: 'volume' } ] },
    { mes: 10, canal: 'Segmentada', pilares: [
      { nome: 'Volume Sabores', tipo: 'volume' }, { nome: 'Volume Refri Single', tipo: 'volume' },
      { nome: 'Volume Powerade', tipo: 'volume' }, { nome: 'Volume Sucos', tipo: 'volume' }, { nome: 'Missões Guiadas', tipo: 'missao' } ] },
    // Novembro e dezembro: pilares 1 a 3 definidos pelo Back Office (informados pela Karen em 29/10/2026), iguais aos
    // de outubro ("Volume Individuais" da Segmentada = Volume Refri Single). Coringas 4 e 5 ainda a decidir: até
    // entrarem aqui, o mês fica "ainda não configurado". Missões Guiadas sem fonte: "sem dados", não pontua.
    { mes: 11, canal: 'Mista', pilares: [
      { nome: 'Volume Sabores', tipo: 'volume' }, { nome: 'Volume Retornáveis', tipo: 'volume' }, { nome: 'Missões Guiadas', tipo: 'missao' } ] },
    { mes: 11, canal: 'Segmentada', pilares: [
      { nome: 'Volume Sabores', tipo: 'volume' }, { nome: 'Volume Refri Single', tipo: 'volume' }, { nome: 'Volume Powerade', tipo: 'volume' } ] },
    { mes: 12, canal: 'Mista', pilares: [
      { nome: 'Volume Sabores', tipo: 'volume' }, { nome: 'Volume Retornáveis', tipo: 'volume' }, { nome: 'Missões Guiadas', tipo: 'missao' } ] },
    { mes: 12, canal: 'Segmentada', pilares: [
      { nome: 'Volume Sabores', tipo: 'volume' }, { nome: 'Volume Refri Single', tipo: 'volume' }, { nome: 'Volume Powerade', tipo: 'volume' } ] },
  ],
  // Pilar do desafio -> agrupador de produto no modelo SAP
  fonteDoPilar: {
    'Volume Sabores': 'Sabores Tt',
    'Volume Retornáveis': 'Refrigerantes Retornavel',
    'Volume Refri Single': 'Refrigerantes Individual',
    'Volume Powerade': 'Powerade',
    'Volume Sucos': 'Sucos',
    // 'Missões Guiadas': em outubro entra validada em 100%, sem dado. De novembro em diante pontua com meta, real e
    // online; a fonte por rota ainda não foi definida. Quando existir, entra aqui (agrupador) e em produtoDaApi.
    // Sem fonte, o pilar aparece como "sem dados de Missões Guiadas" e não pontua.
  },
  // Gatilho de 95% e desempate: categoria Refrigerantes do SAC (agrupador com todos os itens de refri), vinda da API.
  refri: 'Refrigerantes',
  // Só para a base embutida, que não traz a categoria: soma provisória de Individual + Retornável.
  refriProvisorio: ['Refrigerantes Individual', 'Refrigerantes Retornavel'],
  // Colunas da base: [meta, real, online (WF Online), hoje, meta dia]
  idx: { meta: 0, real: 1, online: 2, hoje: 3, metaDia: 4 },
};

// Id do SV: código + canal DO SV (um só canal por SV; ver aplicarCanalSV). Rota sem svCanal (dados antigos): o canal dela.
const svKey = (r) => r.sv + '#' + (r.svCanal !== undefined ? r.svCanal : r.canal);
const NOMES_MES = ['', 'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const anomesDe = (ano, mes) => String(ano) + String(mes).padStart(2, '0');

const PILARES_NO_MES = 5; // pontos por desempenho em 5 pilares (regras, seção 1): 3 do mês + 2 coringas
/** Pilares já definidos de um canal no mês, mesmo incompletos (ex.: só os pilares 1 a 3); [] se nenhum. */
function pilaresDefinidos(cfg, mes, canal) {
  const c = cfg.pilaresConfig.find((x) => x.mes === mes && x.canal === canal);
  return c && Array.isArray(c.pilares) ? c.pilares : [];
}
/** Pilares de um canal no mês; null se o mês ainda não tem os 5 (nunca calcula com parte dos pilares). */
function pilaresDoMes(cfg, mes, canal) {
  const p = pilaresDefinidos(cfg, mes, canal);
  return p.length === PILARES_NO_MES && p.every((x) => x && x.nome) ? p : null;
}
/** O mês só é calculado com os pilares dos dois canais configurados. */
const mesConfigurado = (cfg, mes) => ['Mista', 'Segmentada'].every((c) => pilaresDoMes(cfg, mes, c));
const avisoSemPilares = (mes) => `Pilares de ${NOMES_MES[mes]} ainda não configurados`;
/** Missões Guiadas (ou outro pilar) sem fonte de meta e real por rota: aparece "sem dados" e não pontua. */
const semFonte = (cfg, nome) => !cfg.fonteDoPilar[nome];
/** Regras do motor (meses com Missões Guiadas validada): no painel vem de window.MotorQ4; no Node, de motor.js. */
const MotorRegras = () => (typeof MotorQ4 !== 'undefined' ? MotorQ4 : require('./motor.js')).REGRAS;
const VAZIO = [null, null, null, null, null]; // agrupador sem dado (ex.: extra que a API ainda não traz)
const CHAVE_REFRI = '__refri__'; // coluna % Refri do Estratégicos (a categoria, ou a soma provisória)

/** Bloco de produto da API -> linha [meta, real, online, hoje, meta dia] (cfg.idx). */
function linhaDaApi(bloco, I) {
  const linha = [null, null, null, null, null];
  if (bloco) { linha[I.meta] = bloco.meta; linha[I.real] = bloco.realizado; linha[I.online] = bloco.online_hoje; linha[I.metaDia] = bloco.meta_dia; }
  return linha;
}

/** `produtos` de um nível da API (rota, gerência ou empresa) -> uma linha por agrupador configurado. */
function valoresDaApi(produtos, cfg, I) {
  const v = {};
  for (const [ag, id] of Object.entries(cfg.produtoDaApi)) v[ag] = linhaDaApi((produtos || {})[id], I);
  return v;
}

/** Soma linhas de agrupador campo a campo; campo sem nenhum valor continua null. */
function somarLinhas(linhas, I) {
  const out = [null, null, null, null, null];
  for (const l of linhas) for (const k of [I.meta, I.real, I.online, I.metaDia]) {
    if (l[k] === null || l[k] === undefined) continue;
    out[k] = (out[k] || 0) + l[k];
  }
  return out;
}

/** Canal de cada rota: o da base de segmentação, trocado pelos ajustes do admin (`canais`). `sub` é o segmento. */
function mapaCanal(base, canais) {
  const canal = {};
  base.rotas.forEach((r) => { canal[r.rota] = { canal: r.canal, sub: r.sub, origem: 'base' }; });
  for (const [rota, c] of Object.entries(canais || {})) canal[rota] = Object.assign({}, c, { origem: 'ajuste' });
  return canal;
}
const titulo = (s) => s.charAt(0) + s.slice(1).toLowerCase(); // 'AN' -> 'An'
const svNome = (sv) => sv.replace(/^SV\.([A-Z0-9]+)\.(\d+)$/, (_, g, n) => `Sv. ${titulo(g)}.${n}`); // 'SV.AN.1' -> 'Sv. An.1'

/*
 * API (index.json + gerencias/*.json) -> mesmo formato da base embutida.
 * A API ainda não traz o canal (Mista/Segmentada): ele vem da base embutida, e rota sem canal vai para semCanal.
 * Real = faturado no mês (inclui o faturado de hoje); Online = pedidos de hoje ainda não faturados.
 * `canais` (ajuste do admin) troca o canal de rotas; {canal: null} tira a rota do ranking.
 * `resumo` (resumo.json) traz o total da empresa; sem ele, o total vira a soma das gerências.
 * Além das rotas do incentivo, devolve os totais que a própria API já traz por gerência (`totaisGerencia`)
 * e da empresa (`totalEmpresa`): são todas as rotas com Real, inclusive as de fora do incentivo, e é o que
 * a aba Estratégicos mostra. O mês é o da API (mes_referencia.anomes); devolve null se ele estiver fora do Q4.
 * Mês sem pilares configurados: `meta.semCalculo` traz o aviso e o painel não calcula pontos nem ranking.
 */
function dadosDaApi(index, gerencias, base, cfg, canais, resumo) {
  const ref = index.mes_referencia;
  const ano = Number(ref.anomes.slice(0, 4)), mes = Number(ref.anomes.slice(4));
  if (ano !== cfg.ano || !MESES_Q4.includes(mes)) return null;
  const I = cfg.idx;
  const canal = mapaCanal(base, canais);
  const ids = new Set(index.produtos.map((p) => p.id));
  const faltam = Object.keys(cfg.produtoDaApi).filter((ag) => !ids.has(cfg.produtoDaApi[ag]));
  const rotas = [], semCanal = [], naApi = new Set(), lista = [];
  for (const g of gerencias) for (const r of g.rotas) {
    if (r.tipo === 'eventual') continue; // soma dos clientes em rotas EV*: sem meta, não é um consultor
    naApi.add(r.id);
    const gc = titulo(r.gerencia), c = canal[r.id];
    lista.push({ rota: r.id, gc, sv: r.supervisao ? svNome(r.supervisao) : null });
    if (!c || !c.canal) { semCanal.push({ gc, rota: r.id }); continue; }
    rotas.push({ gc, sv: svNome(r.supervisao), rota: r.id, canal: c.canal, sub: c.sub, origemCanal: c.origem, v: valoresDaApi(r.produtos, cfg, I) });
  }
  // Totais da API: uma linha por gerência do index.json (mesmo que nenhuma rota dela esteja no incentivo)
  const totaisGerencia = index.gerencias.map((g, i) => ({
    gc: titulo(g.id), id: g.id, nome: g.nome, v: valoresDaApi((gerencias[i] || {}).produtos, cfg, I),
  }));
  const temResumo = !!(resumo && resumo.empresa && resumo.empresa.produtos);
  const totalEmpresa = temResumo ? valoresDaApi(resumo.empresa.produtos, cfg, I)
    : Object.fromEntries(Object.keys(cfg.produtoDaApi).map((ag) => [ag, somarLinhas(totaisGerencia.map((g) => g.v[ag]), I)]));
  const [dia, hora] = index.atualizado_em.split('T');
  const corte = dia.split('-').reverse().join('/') + ' ' + hora.slice(0, 5);
  return {
    meta: {
      mes, ano, rotulo: ref.rotulo, corte, corteSeg: base.meta.corteSeg, origem: 'api', fechamento: !!ref.fechamento,
      simulado: !!index.simulado,
      semCalculo: mesConfigurado(cfg, mes) ? null : avisoSemPilares(mes),
      fonte: `API metas-produtos · SAP Datasphere · ${hora.slice(0, 5)}`,
      fonteLonga: `API metas-produtos (SAP Datasphere, atualizada a cada 15 min em dias úteis; dados de ${corte}). ` +
        `Canal Mista/Segmentada da base de segmentação de ${base.meta.corteSeg} (provisório)`,
      medidas: base.meta.medidas, produtos: Object.keys(cfg.produtoDaApi), totalRotasModelo: naApi.size,
      refriCategoria: !faltam.includes(cfg.refri), produtosApi: [...ids],
      totalEmpresaOrigem: temResumo ? 'resumo' : 'gerencias',
      aviso: faltam.length ? `a API ainda não traz ${faltam.join(', ')}` : null,
      acumulado: { meses: MESES_Q4.filter((m) => m <= mes), usados: [], faltando: [] },
    },
    rotas, semCanal, totaisGerencia, totalEmpresa, duplicadas: base.duplicadas, fechados: [],
    segmentacao: linhasSegmentacao(lista, base, canais),
    segSemInfos: base.rotas.map((r) => r.rota).filter((r) => !naApi.has(r)),
  };
}

/*
 * Mês fechado da API (fechado/AAAAMM.json) -> rotas no mesmo formato do mês corrente, com online = 0 e sem meta dia.
 * A mesa (supervisão) é a da rota naquele mês; o canal é o mesmo do mês corrente (base de segmentação + admin).
 */
function fechadoDaApi(f, base, cfg, canais) {
  const I = cfg.idx, canal = mapaCanal(base, canais);
  const col = (n) => f.campos.indexOf(n), cp = (n) => f.campos_produto.indexOf(n);
  const [iRota, iGer, iSv, iProd, iMeta, iReal] = [col('rota'), col('gerencia'), col('supervisao'), col('produtos'), cp('meta'), cp('realizado')];
  if ([iRota, iGer, iSv, iProd, iMeta, iReal].some((x) => x < 0)) throw new Error(`fechado/${f.anomes}: formato inesperado`);
  const rotas = [];
  for (const linha of f.rotas) {
    const id = linha[iRota], c = canal[id];
    if (!c || !c.canal) continue; // fora do incentivo (sem canal, eventual)
    const prod = linha[iProd] || {}, v = {};
    for (const [ag, pid] of Object.entries(cfg.produtoDaApi)) {
      const x = prod[pid], l = [null, null, null, null, null];
      if (x) { l[I.meta] = x[iMeta]; l[I.real] = x[iReal]; l[I.online] = 0; }
      v[ag] = l;
    }
    rotas.push({ gc: titulo(linha[iGer]), sv: svNome(linha[iSv]), rota: id, canal: c.canal, sub: c.sub, v });
  }
  return { mes: Number(f.anomes.slice(4)), anomes: f.anomes, rotulo: f.rotulo, final: f.fechamento_final === true, rotas };
}

/*
 * Lê os meses fechados do trimestre anteriores ao de referência (index.json -> fechados). Mês que falte na lista,
 * falhe ao carregar ou não tenha pilares configurados vai para meta.acumulado.faltando, e o acumulado do SV fica
 * marcado como incompleto (o motor recebe a lista em mesesIncompletos).
 */
async function carregarFechados(d, index, ler, base, cfg, canais) {
  const lista = index.fechados || [];
  for (const mes of MESES_Q4.filter((m) => m < d.meta.mes)) {
    const item = lista.find((x) => x.anomes === anomesDe(d.meta.ano, mes));
    if (!item) { d.meta.acumulado.faltando.push({ mes, motivo: `${NOMES_MES[mes]} não está nos meses fechados da API` }); continue; }
    try {
      const f = fechadoDaApi(await ler(item.arquivo), base, cfg, canais);
      if (f.anomes !== item.anomes) throw new Error(`${item.arquivo} traz o mês ${f.anomes}`);
      d.fechados.push(f);
      d.meta.acumulado.usados.push({ mes, rotulo: f.rotulo, final: f.final });
      if (!mesConfigurado(cfg, mes)) d.meta.acumulado.faltando.push({ mes, motivo: avisoSemPilares(mes) });
    } catch (e) {
      d.meta.acumulado.faltando.push({ mes, motivo: `${NOMES_MES[mes]} não carregou (${e.message})` });
    }
  }
  if (d.meta.acumulado.faltando.length) {
    const txt = 'acumulado do trimestre incompleto: ' + d.meta.acumulado.faltando.map((x) => x.motivo).join('; ');
    d.meta.aviso = [d.meta.aviso, txt].filter(Boolean).join('; ');
  }
}

/** Base embutida: só no mês dela, com o rótulo "base embutida (<mês>)"; em outro mês, nada é calculado. */
function daBase(base, canais, motivo, hoje) {
  const rotuloBase = `base embutida (${NOMES_MES[base.meta.mes]})`;
  const d = Object.assign({}, comCanais(base, canais), { fechados: [] });
  d.segmentacao = linhasSegmentacao(base.rotas.map((r) => ({ rota: r.rota, gc: r.gc, sv: r.sv }))
    .concat(base.semCanal.map((r) => ({ rota: r.rota, gc: r.gc, sv: r.sv || null }))), base, canais);
  d.meta = Object.assign({}, base.meta, { origem: 'base', rotuloBase, fechamento: false, semCalculo: null,
                                          aviso: motivo, fonte: base.meta.fonte + ' · ' + rotuloBase,
                                          acumulado: { meses: [base.meta.mes], usados: [], faltando: [] } });
  const h = hoje || new Date();
  if (h.getFullYear() !== base.meta.ano || h.getMonth() + 1 !== base.meta.mes) {
    d.rotas = []; d.semCanal = [];
    d.meta.semCalculo = `Sem dados de ${NOMES_MES[h.getMonth() + 1]}: ${motivo} e a ${rotuloBase} é de outro mês`;
  }
  return d;
}

/** Base embutida com o canal ajustado pelo admin (rota da base sem canal não tem valores: não entra). */
function comCanais(base, canais) {
  if (!canais || !Object.keys(canais).length) return base;
  const rotas = [], semCanal = base.semCanal.slice();
  for (const r of base.rotas) {
    const c = canais[r.rota];
    if (!c) rotas.push(r);
    else if (c.canal) rotas.push(Object.assign({}, r, { canal: c.canal, sub: c.sub, origemCanal: 'ajuste' }));
    else semCanal.push({ gc: r.gc, rota: r.rota });
  }
  return Object.assign({}, base, { rotas, semCanal });
}

/*
 * Lê a API no mesmo site, com os meses fechados do trimestre. API fora do ar: base embutida, só no mês dela
 * (`hoje` simula a data nos testes). API fora do Q4: aviso, sem cálculo. O motivo vai em meta.aviso.
 */
async function carregarDados(base, cfg, ajustes, hoje) {
  cfg = cfg || CONFIG;
  const canais = ajustes ? ajustes.canais : null, canaisSV = ajustes ? ajustes.canaisSV : null;
  const ler = async (caminho) => {
    const r = await fetch(cfg.api + caminho, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`${caminho}: HTTP ${r.status}`);
    return r.json();
  };
  let index, gerencias, resumo = null, erroResumo = null;
  try {
    index = await ler('index.json');
    gerencias = await Promise.all(index.gerencias.map((g) => ler(g.arquivo)));
  } catch (erro) {
    return aplicarCanalSV(daBase(base, canais, `API indisponível (${erro.message})`, hoje), canaisSV);
  }
  // O resumo.json só traz o total da empresa (aba Estratégicos): se faltar, o painel segue com a soma das gerências
  try { resumo = await ler('resumo.json'); } catch (e) { erroResumo = e.message; }
  const d = dadosDaApi(index, gerencias, base, cfg, canais, resumo);
  if (!d) {
    const fora = daBase(base, canais, `a API está em ${index.mes_referencia.rotulo}, fora do trimestre do painel`, hoje);
    fora.rotas = []; fora.semCanal = [];
    fora.meta.semCalculo = `A API está em ${index.mes_referencia.rotulo}, fora do Desafio Q4 ${cfg.ano}`;
    return aplicarCanalSV(fora, canaisSV);
  }
  if (erroResumo) d.meta.aviso = [d.meta.aviso, `o total da empresa veio da soma das gerências (${erroResumo})`].filter(Boolean).join('; ');
  if (d.meta.semCalculo) d.meta.aviso = [d.meta.semCalculo, d.meta.aviso].filter(Boolean).join('; ');
  else await carregarFechados(d, index, ler, base, cfg, canais);
  return aplicarCanalSV(d, canaisSV);
}

/*
 * Canal do SV (decisão da Karen em 29/10/2026 ⚠️): cada supervisão aparece em UM canal só. Vale o do admin
 * (ajustes.json -> canaisSV: {"Sv. An.1": "Mista"}) ou, sem ajuste, o canal com mais rotas na mesa; empate fica sem
 * canal (SV fora do ranking, com aviso) até o admin escolher. O SV soma TODAS as rotas da mesa, medidas nos pilares
 * do canal dele; cada rota continua no ranking do canal dela e ganha o +5 se o SV vencer o confronto.
 */
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
    const maioria = c.Mista === c.Segmentada ? null : c.Mista > c.Segmentada ? 'Mista' : 'Segmentada';
    out[sv] = { canal: aj || maioria, padrao: maioria, origem: aj ? 'ajuste' : maioria ? 'maioria' : 'empate',
                rotas: c, misto: c.Mista > 0 && c.Segmentada > 0 };
  }
  return out;
}
/** Dados -> cópia com o canal do SV em cada rota (`svCanal`; '' = empate sem escolha) e `canaisSV`. Não altera a entrada.
 *  Nos meses fechados vale o canal do SV do mês corrente; SV que só existe no mês fechado usa a maioria daquele mês. */
function aplicarCanalSV(dados, ajusteSV) {
  const canaisSV = canaisDosSVs(dados.rotas, ajusteSV);
  const comCanal = (rotas, mapa) => rotas.map((r) => Object.assign({}, r, { svCanal: mapa[r.sv] ? mapa[r.sv].canal || '' : r.canal }));
  const fechados = (dados.fechados || []).map((f) => Object.assign({}, f, {
    rotas: comCanal(f.rotas, Object.assign(canaisDosSVs(f.rotas, ajusteSV), canaisSV)) }));
  const empates = Object.keys(canaisSV).filter((sv) => !canaisSV[sv].canal);
  const meta = !empates.length ? dados.meta : Object.assign({}, dados.meta, { aviso: [dados.meta.aviso,
    `mesa com o mesmo número de rotas Mista e Segmentada (${empates.join(', ')}): escolha o canal do SV na Administração; até lá o SV fica fora do ranking`]
    .filter(Boolean).join('; ') });
  return Object.assign({}, dados, { meta, rotas: comCanal(dados.rotas, canaisSV), fechados, canaisSV });
}

/*
 * Ajustes do admin (aba Regras > Administração): regras, pilares coringa do mês e canal das rotas.
 * Publicados em ajustes.json (valem para todos) ou guardados só neste navegador. Precedência (aprovada em 29/10/2026):
 * padrão < ajustes.json publicado < navegador, item a item; o navegador guarda e aplica SÓ o que difere do publicado
 * (ver carregarAjustes). O ajustes.json tem de ser UM único objeto JSON; ilegível, ele é ignorado com aviso.
 * Formato: { atualizado_em, regras: {faixas, gatilhoVolumePct, gatilhoPontos, bonusConfronto, premiadas},
 *            pilares: {Mista: [pilar 4, pilar 5], Segmentada: [...]}, canais: {rota: {canal, sub, segmento}},
            canaisSV: {sv: 'Mista' | 'Segmentada'}  (canal do SV; sem ajuste, a maioria das rotas da mesa),
 *            agrupadores: [{id, nome, agrupador}],
 *            confrontos: [{mes, id_sv_desafiante, id_sv_desafiado, pilar}] }
 * "agrupadores" são os extras: viram o pilar "Volume <nome>" e o gerador da API (scripts/gerar.py) passa a buscá-los.
 * "confrontos" são os desafios entre supervisores do mês; o motor apura o vencedor e dá o bônus.
 */
const AJUSTES_LOCAL = 'q4_ajustes';
const PILARES_CORINGA = ['Volume Sabores', 'Volume Retornáveis', 'Volume Refri Single', 'Volume Powerade', 'Volume Sucos', 'Missões Guiadas'];
const EXTRAS_MAX = 10;
const CONFRONTOS_MAX = 60;
const MESES_Q4 = [10, 11, 12];
const IDS_FIXOS = Object.values(CONFIG.produtoDaApi), AGRUPADORES_FIXOS = Object.keys(CONFIG.produtoDaApi);
/** Mesma chave de comparação do gerador (texto.normalizar): sem acento, espaços simples, maiúsculas. */
const normalizarTexto = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
const textoOk = (s, n) => typeof s === 'string' && s.trim().length > 0 && s.trim().length <= n && !/[\u0000-\u001f\u007f]/.test(s);
const pilarDoExtra = (e) => 'Volume ' + e.nome;

/** Agrupadores extras válidos (mesmas regras do gerador): id a-z0-9_, sem repetir fixos, nomes de pilar ou entre si.
 *  Com `avisos`, cada item ignorado vira um aviso (nunca em silêncio). */
function normalizarExtras(lista, avisos) {
  const out = [], ids = new Set(IDS_FIXOS), ags = new Set(AGRUPADORES_FIXOS.map(normalizarTexto));
  const pilares = new Set(PILARES_CORINGA.map(normalizarTexto));
  const av = (t) => { if (avisos) avisos.push(t); };
  if (lista !== undefined && lista !== null && !Array.isArray(lista)) av('agrupadores: precisa ser uma lista: ignorado');
  for (const x of Array.isArray(lista) ? lista : []) {
    const qual = `agrupador extra ${JSON.stringify(x && typeof x === 'object' ? x.id : x)}`;
    if (out.length >= EXTRAS_MAX) { av(`${qual}: passa do máximo de ${EXTRAS_MAX} agrupadores extras: ignorado`); continue; }
    if (!x || !/^[a-z0-9_]{1,30}$/.test(x.id) || !textoOk(x.nome, 40) || !textoOk(x.agrupador, 80)) { av(`${qual}: id, nome ou agrupador inválido: ignorado`); continue; }
    const e = { id: x.id, nome: x.nome.trim(), agrupador: x.agrupador.trim() };
    if (ids.has(e.id) || ags.has(normalizarTexto(e.agrupador)) || pilares.has(normalizarTexto(pilarDoExtra(e)))) { av(`${qual}: repete um id, agrupador ou pilar que já existe: ignorado`); continue; }
    out.push(e); ids.add(e.id); ags.add(normalizarTexto(e.agrupador)); pilares.add(normalizarTexto(pilarDoExtra(e)));
  }
  return out;
}

/**
 * Confrontos válidos para o motor: mês do Q4, dois SVs diferentes e um pilar com nome.
 * A ordem da lista vira a ordem de registro (o motor usa isso quando um SV recebe mais de um desafio).
 * O que é regra do incentivo (mesmo canal, pilar de volume, um desafio por desafiado) o motor apura e explica.
 * Com `avisos`, cada confronto ignorado vira um aviso.
 */
function normalizarConfrontos(lista, avisos) {
  const out = [], vistos = new Set();
  const av = (t) => { if (avisos) avisos.push(t); };
  if (lista !== undefined && lista !== null && !Array.isArray(lista)) av('confrontos: precisa ser uma lista: ignorado');
  (Array.isArray(lista) ? lista : []).forEach((x, i) => {
    const qual = `confronto ${i + 1} da lista`;
    if (out.length >= CONFRONTOS_MAX) return av(`${qual}: passa do máximo de ${CONFRONTOS_MAX} confrontos: ignorado`);
    if (!x || !MESES_Q4.includes(x.mes)) return av(`${qual}: mês fora do Q4: ignorado`);
    if (!textoOk(x.id_sv_desafiante, 120) || !textoOk(x.id_sv_desafiado, 120) || !textoOk(x.pilar, 60)) return av(`${qual}: SV ou pilar inválido: ignorado`);
    const c = { mes: x.mes, id_sv_desafiante: x.id_sv_desafiante.trim(), id_sv_desafiado: x.id_sv_desafiado.trim(), pilar: x.pilar.trim() };
    if (c.id_sv_desafiante === c.id_sv_desafiado) return av(`${qual}: desafiante e desafiado são o mesmo SV: ignorado`);
    const chave = c.mes + '|' + c.id_sv_desafiante + '|' + c.id_sv_desafiado;
    if (vistos.has(chave)) return av(`${qual}: repetido: ignorado`);
    vistos.add(chave);
    out.push(Object.assign(c, { ordem_registro: out.length + 1 }));
  });
  return out;
}

const CAMPOS_AJUSTES = ['versao', 'atualizado_em', 'regras', 'pilares', 'canais', 'canaisSV', 'agrupadores', 'confrontos'];
const CAMPOS_REGRAS = ['faixas', 'gatilhoVolumePct', 'bonusConfronto', 'gatilhoPontos', 'premiadas'];
const ehObjeto = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

/** Só os campos válidos; o resto é ignorado, e cada valor ignorado vira aviso em `avisos` (nunca em silêncio: um mínimo
 *  de pontos inválido que volta ao padrão sem aviso repete o problema de 29/10/2026). Sem nenhum campo válido, null. */
function normalizarAjustes(aj, avisos) {
  if (!aj || typeof aj !== 'object') return null;
  const av = (t) => { if (avisos) avisos.push(t); };
  const ok = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  Object.keys(aj).filter((k) => !CAMPOS_AJUSTES.includes(k)).forEach((k) => av(`campo ${JSON.stringify(k)} desconhecido: ignorado`));
  if (aj.regras !== undefined && !ehObjeto(aj.regras)) av('regras: precisa ser um objeto: ignorado');
  const r = ehObjeto(aj.regras) ? aj.regras : {}, regras = {}, pilares = {}, canais = {};
  Object.keys(r).filter((k) => !CAMPOS_REGRAS.includes(k)).forEach((k) => av(`regras.${k} desconhecido: ignorado`));
  const agrupadores = normalizarExtras(aj.agrupadores, avisos);
  const confrontos = normalizarConfrontos(aj.confrontos, avisos);
  const coringas = PILARES_CORINGA.concat(agrupadores.map(pilarDoExtra));
  if (Array.isArray(r.faixas) && r.faixas.length === 3 && r.faixas.every((f) => f && ok(f.min) && ok(f.pontos)))
    regras.faixas = r.faixas.map((f) => ({ min: f.min, pontos: f.pontos })).sort((a, b) => b.min - a.min);
  else if (r.faixas !== undefined) av('faixas de pontos: precisa de 3 faixas com min e pontos (números de 0 para cima): ignorado, vale o padrão');
  if (ok(r.gatilhoVolumePct)) regras.gatilhoVolumePct = r.gatilhoVolumePct;
  else if (r.gatilhoVolumePct !== undefined) av(`gatilho de Refrigerantes ${JSON.stringify(r.gatilhoVolumePct)} não é número de 0 para cima: ignorado, vale o padrão`);
  if (ok(r.bonusConfronto)) regras.bonusConfronto = r.bonusConfronto;
  else if (r.bonusConfronto !== undefined) av(`bônus do confronto ${JSON.stringify(r.bonusConfronto)} não é número de 0 para cima: ignorado, vale o padrão`);
  if (r.gatilhoPontos && ok(r.gatilhoPontos.SV) && ok(r.gatilhoPontos.RT)) regras.gatilhoPontos = { SV: r.gatilhoPontos.SV, RT: r.gatilhoPontos.RT };
  else if (r.gatilhoPontos !== undefined) av(`mínimo de pontos ${JSON.stringify(r.gatilhoPontos)}: precisa de SV e RT (números de 0 para cima): ignorado, vale o padrão`);
  const pr = r.premiadas;
  if (pr && ['SV', 'RT'].every((c) => pr[c] && ok(pr[c].Mista) && ok(pr[c].Segmentada)))
    regras.premiadas = { SV: { Mista: pr.SV.Mista, Segmentada: pr.SV.Segmentada }, RT: { Mista: pr.RT.Mista, Segmentada: pr.RT.Segmentada } };
  else if (pr !== undefined) av('posições premiadas: precisa de SV e RT, cada um com Mista e Segmentada (números de 0 para cima): ignorado, vale o padrão');
  if (aj.pilares !== undefined && !ehObjeto(aj.pilares)) av('pilares: precisa ser um objeto: ignorado');
  const pil = ehObjeto(aj.pilares) ? aj.pilares : {};
  Object.keys(pil).filter((c) => c !== 'Mista' && c !== 'Segmentada').forEach((c) => av(`pilares coringa do canal ${JSON.stringify(c)}: canal desconhecido: ignorado`));
  for (const canal of ['Mista', 'Segmentada']) {
    const p = pil[canal];
    if (Array.isArray(p) && p.length === 2 && p[0] !== p[1] && p.every((x) => coringas.includes(x))) pilares[canal] = p.slice();
    else if (p !== undefined) av(`pilares coringa da ${canal} ${JSON.stringify(p)}: precisa de 2 pilares diferentes da lista de coringas: ignorado`);
  }
  if (aj.canais !== undefined && !ehObjeto(aj.canais)) av('canais: precisa ser um objeto: ignorado');
  if (aj.canaisSV !== undefined && !ehObjeto(aj.canaisSV)) av('canaisSV: precisa ser um objeto: ignorado');
  for (const [rota, c] of Object.entries(ehObjeto(aj.canais) ? aj.canais : {})) {
    const v = validarCanalRota(rota, c, avisos);
    if (v) canais[rota] = v;
  }
  const canaisSV = {};
  for (const [sv, c] of Object.entries(ehObjeto(aj.canaisSV) ? aj.canaisSV : {})) {
    if (textoOk(sv, 120) && (c === 'Mista' || c === 'Segmentada')) canaisSV[sv] = c;
    else if (avisos) avisos.push(`SV ${sv}: canal do SV ${JSON.stringify(c)} não é Mista nem Segmentada: ajuste ignorado`);
  }
  if (!Object.keys(regras).length && !Object.keys(pilares).length && !Object.keys(canais).length && !Object.keys(canaisSV).length
      && !agrupadores.length && !confrontos.length) return null;
  return { atualizado_em: typeof aj.atualizado_em === 'string' ? aj.atualizado_em : null, regras, pilares, canais, canaisSV, agrupadores, confrontos };
}

/** Aplica os agrupadores extras (em cfg) e as regras (no REGRAS do motor); com `mes`, também os pilares coringa.
 *  O canal entra em carregarDados. */
function aplicarAjustes(aj, cfg, regras, mes) {
  if (!aj) return;
  for (const e of aj.agrupadores || []) { cfg.produtoDaApi[e.agrupador] = e.id; cfg.fonteDoPilar[pilarDoExtra(e)] = e.agrupador; }
  const r = aj.regras;
  if (r.faixas) regras.faixas = r.faixas.concat([{ min: 0, pontos: 0 }]);
  for (const k of ['gatilhoVolumePct', 'bonusConfronto', 'gatilhoPontos', 'premiadas']) if (r[k] !== undefined) regras[k] = r[k];
  if (mes !== undefined) aplicarCoringas(aj, cfg, mes);
}

/** Pilares coringa do admin (4 e 5): trocam os do mês de referência, e só se ele já tem os 5 pilares na configuração
 *  (o admin nunca completa sozinho um mês que só tem os pilares 1 a 3). */
function aplicarCoringas(aj, cfg, mes) {
  if (!aj) return;
  for (const [canal, nomes] of Object.entries(aj.pilares || {})) {
    const lista = pilaresDoMes(cfg, mes, canal);
    if (!lista || nomes.some((n) => lista.slice(0, 3).some((p) => p.nome === n))) continue; // não repete os pilares 1 a 3
    nomes.forEach((nome, i) => { lista[3 + i] = { nome, tipo: nome === 'Missões Guiadas' ? 'missao' : 'volume' }; });
  }
}

/*
 * Ajustes item a item. Cada ajuste tem uma chave "tipo:id": regras:gatilhoPontos.RT, regras:premiadas.SV.Mista,
 * regras:faixas (as 3 juntas), pilares:Mista, canais:<rota>, canaisSV:<sv>, agrupadores:<id> e
 * confrontos:<mês>|<desafiante>|<desafiado>. Nas regras, item ausente vale o padrão do motor (`padrao` = REGRAS sem
 * ajustes); nos demais, ausente = não existe no arquivo (rota como na base, SV pela maioria, pilar coringa do mês).
 */
const MotorPadrao = JSON.parse(JSON.stringify(MotorRegras())); // REGRAS do motor antes de qualquer ajuste
const CHAVES_REGRAS = ['faixas', 'gatilhoVolumePct', 'bonusConfronto', 'gatilhoPontos.RT', 'gatilhoPontos.SV',
  'premiadas.RT.Mista', 'premiadas.RT.Segmentada', 'premiadas.SV.Mista', 'premiadas.SV.Segmentada'].map((k) => 'regras:' + k);
const ORDEM_TIPOS = ['regras', 'pilares', 'canaisSV', 'canais', 'agrupadores', 'confrontos'];
const ROTULOS_REGRAS = {
  faixas: 'Faixas de pontos', gatilhoVolumePct: 'Gatilho de Refrigerantes (%)', bonusConfronto: 'Bônus do confronto (pontos)',
  'gatilhoPontos.RT': 'Mínimo da Rota (pontos no mês)', 'gatilhoPontos.SV': 'Mínimo do SV (pontos no trimestre)',
  'premiadas.RT.Mista': 'Posições premiadas · Rota · Mista', 'premiadas.RT.Segmentada': 'Posições premiadas · Rota · Segmentada',
  'premiadas.SV.Mista': 'Posições premiadas · SV · Mista', 'premiadas.SV.Segmentada': 'Posições premiadas · SV · Segmentada',
};
const partesChave = (chave) => { const i = chave.indexOf(':'); return [chave.slice(0, i), chave.slice(i + 1)]; };
const mesmoValor = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
const regraPadrao = (id, padrao) => {
  if (id === 'faixas') return padrao.faixas.slice(0, 3).map((f) => ({ min: f.min, pontos: f.pontos }));
  return id.split('.').reduce((o, k) => (o ? o[k] : undefined), padrao);
};

/** Ajustes normalizados -> {chave: valor}, só com o que está no arquivo. */
function itensDosAjustes(aj) {
  const out = {};
  if (!aj) return out;
  const r = aj.regras || {};
  if (r.faixas) out['regras:faixas'] = r.faixas.map((f) => ({ min: f.min, pontos: f.pontos }));
  for (const k of ['gatilhoVolumePct', 'bonusConfronto']) if (r[k] !== undefined) out['regras:' + k] = r[k];
  if (r.gatilhoPontos) for (const c of ['RT', 'SV']) out['regras:gatilhoPontos.' + c] = r.gatilhoPontos[c];
  if (r.premiadas) for (const c of ['RT', 'SV']) for (const n of ['Mista', 'Segmentada']) out[`regras:premiadas.${c}.${n}`] = r.premiadas[c][n];
  for (const [canal, p] of Object.entries(aj.pilares || {})) out['pilares:' + canal] = p.slice();
  for (const [sv, c] of Object.entries(aj.canaisSV || {})) out['canaisSV:' + sv] = c;
  for (const [rota, c] of Object.entries(aj.canais || {})) out['canais:' + rota] = { canal: c.canal, sub: c.sub || null };
  for (const e of aj.agrupadores || []) out['agrupadores:' + e.id] = { id: e.id, nome: e.nome, agrupador: e.agrupador };
  for (const c of aj.confrontos || []) out[`confrontos:${c.mes}|${c.id_sv_desafiante}|${c.id_sv_desafiado}`] =
    { mes: c.mes, id_sv_desafiante: c.id_sv_desafiante, id_sv_desafiado: c.id_sv_desafiado, pilar: c.pilar };
  return out;
}

/** {chave: valor} -> objeto no formato do ajustes.json (mínimo de pontos e premiadas completos com o padrão). */
function objetoDosItens(itens, padrao) {
  padrao = padrao || MotorPadrao;
  const aj = { regras: {}, pilares: {}, canais: {}, canaisSV: {}, agrupadores: [], confrontos: [] }, r = {};
  for (const [chave, v] of Object.entries(itens || {})) {
    if (v === null || v === undefined) continue;
    const [tipo, id] = partesChave(chave);
    if (tipo === 'regras') r[id] = v;
    else if (tipo === 'pilares' || tipo === 'canais' || tipo === 'canaisSV') aj[tipo][id] = v;
    else if (tipo === 'agrupadores' || tipo === 'confrontos') aj[tipo].push(v);
  }
  const de = (id) => (id in r ? r[id] : regraPadrao(id, padrao));
  for (const k of ['faixas', 'gatilhoVolumePct', 'bonusConfronto']) if (k in r) aj.regras[k] = r[k];
  if (['RT', 'SV'].some((c) => 'gatilhoPontos.' + c in r)) aj.regras.gatilhoPontos = { SV: de('gatilhoPontos.SV'), RT: de('gatilhoPontos.RT') };
  if (Object.keys(r).some((k) => k.startsWith('premiadas.')))
    aj.regras.premiadas = Object.fromEntries(['SV', 'RT'].map((c) => [c, { Mista: de(`premiadas.${c}.Mista`), Segmentada: de(`premiadas.${c}.Segmentada`) }]));
  return aj;
}

/** Nome do ajuste para a tela. */
function rotuloItem(chave) {
  const [tipo, id] = partesChave(chave);
  if (tipo === 'regras') return ROTULOS_REGRAS[id] || id;
  if (tipo === 'pilares') return `Pilares coringa · ${id}`;
  if (tipo === 'canais') return `Canal da rota ${id}`;
  if (tipo === 'canaisSV') return `Canal do SV ${id}`;
  if (tipo === 'agrupadores') return `Agrupador extra ${id}`;
  if (tipo === 'confrontos') {
    const [mes, a, b] = id.split('|');
    return `Confronto de ${NOMES_MES[Number(mes)] || mes}: ${String(a).replace('#', ' · ')} × ${String(b).replace('#', ' · ')}`;
  }
  return chave;
}
/** Valor do ajuste para a tela; null = ausente (padrão, ou não existe). */
function textoItem(chave, v) {
  const [tipo, id] = partesChave(chave);
  if (v === null || v === undefined) return ({ canais: 'padrão da base', canaisSV: 'maioria das rotas', pilares: 'padrão do mês' })[tipo] || 'não existe';
  if (tipo === 'regras' && id === 'faixas') return v.map((f) => `${String(f.min).replace('.', ',')}%: ${f.pontos} pts`).join(' · ');
  if (tipo === 'regras') return String(v).replace('.', ',');
  if (tipo === 'pilares') return v.map((n) => n.replace('Volume ', '')).join(', ');
  if (tipo === 'canais') return rotuloSeg(valorSeg(v.canal, v.sub));
  if (tipo === 'agrupadores') return `${v.nome} (${v.agrupador})`;
  if (tipo === 'confrontos') return 'pilar ' + String(v.pilar).replace('Volume ', '');
  return String(v);
}

/** Itens com as regras resolvidas (ausente = padrão do motor), para comparar o que de fato vale. */
function itensResolvidos(aj, padrao) {
  const it = itensDosAjustes(aj), out = {};
  for (const k of CHAVES_REGRAS) out[k] = k in it ? it[k] : regraPadrao(partesChave(k)[1], padrao);
  return Object.assign(out, it);
}
const ordemItens = (a, b) => {
  const [ta, ia] = partesChave(a), [tb, ib] = partesChave(b);
  return ORDEM_TIPOS.indexOf(ta) - ORDEM_TIPOS.indexOf(tb)
    || (ta === 'regras' ? CHAVES_REGRAS.indexOf(a) - CHAVES_REGRAS.indexOf(b) : ia.localeCompare(ib, 'pt-BR', { numeric: true }));
};

/**
 * O que difere entre dois conjuntos de ajustes normalizados (ex.: o publicado e o do navegador, ou o publicado e o
 * formulário): [{chave, rotulo, publicado, novo, textoPublicado, textoNovo}]; valor null = ausente.
 */
function diferencasAjustes(publicado, novo, padrao) {
  padrao = padrao || MotorPadrao;
  const a = itensResolvidos(publicado, padrao), b = itensResolvidos(novo, padrao);
  return [...new Set(Object.keys(a).concat(Object.keys(b)))].sort(ordemItens)
    .filter((k) => !mesmoValor(a[k], b[k]))
    .map((k) => ({ chave: k, rotulo: rotuloItem(k), publicado: k in a ? a[k] : null, novo: k in b ? b[k] : null,
                   textoPublicado: textoItem(k, a[k]), textoNovo: textoItem(k, b[k]) }));
}

/**
 * Publicado + itens do navegador -> ajustes em uso. Cada item do navegador passa pelas mesmas regras do arquivo
 * publicado; o que não passa é ignorado com aviso e, naquele item, vale o publicado.
 */
function mesclarAjustes(publicado, itensNav, padrao, avisos) {
  padrao = padrao || MotorPadrao;
  const base = itensDosAjustes(publicado);
  const montar = (nav) => {
    const it = Object.assign({}, base);
    for (const [k, v] of Object.entries(nav)) { if (v === null) delete it[k]; else it[k] = v; }
    return normalizarAjustes(objetoDosItens(it, padrao));
  };
  const validos = Object.assign({}, itensNav || {});
  let aj = montar(validos);
  const final = itensDosAjustes(aj), invalidos = [];
  for (const [k, v] of Object.entries(validos)) {
    if (v === null ? !(k in final) : mesmoValor(final[k], v)) continue;
    invalidos.push(k); delete validos[k];
    if (avisos) avisos.push(`neste navegador: ${rotuloItem(k)} com valor inválido: ignorado`);
  }
  if (invalidos.length) aj = montar(validos);
  return { ajustes: aj, itens: validos, invalidos };
}

/*
 * O que o navegador guardou -> {itens, atualizado_em}. Formato 2 (desde 29/10/2026): só os itens que diferem do
 * publicado, {formato: 2, atualizado_em, publicado_em, itens: {chave: valor | null}} (null = tirar o item publicado).
 * Formato antigo (uma cópia completa do arquivo, sem registro do que estava publicado): vale só o que a cópia tem e
 * difere do publicado; item publicado que falta na cópia continua valendo (decisão da Karen em 29/10/2026).
 */
function itensDoNavegador(salvo, publicado, padrao, avisos) {
  if (!ehObjeto(salvo)) return null;
  const quando = (v) => (typeof v === 'string' ? v : null);
  if (salvo.formato === 2) {
    return { formato: 2, atualizado_em: quando(salvo.atualizado_em), publicado_em: quando(salvo.publicado_em),
             itens: ehObjeto(salvo.itens) ? Object.assign({}, salvo.itens) : {} };
  }
  const av = [];
  const copia = normalizarAjustes(salvo, av);
  av.forEach((t) => { if (avisos) avisos.push('neste navegador: ' + t); });
  const pub = itensResolvidos(publicado, padrao || MotorPadrao), itens = {};
  for (const [k, v] of Object.entries(itensDosAjustes(copia))) if (!mesmoValor(pub[k], v)) itens[k] = v;
  return { formato: 1, atualizado_em: copia ? copia.atualizado_em : quando(salvo.atualizado_em), publicado_em: null, itens,
           lidos: Object.keys(itensDosAjustes(copia)) };
}

/** O que vai para o localStorage: só as diferenças do publicado (null = nada a guardar). */
function navegadorParaSalvar(diferencas, publicado, atualizadoEm) {
  if (!diferencas.length) return null;
  return { formato: 2, atualizado_em: atualizadoEm, publicado_em: (publicado && publicado.atualizado_em) || null,
           itens: Object.fromEntries(diferencas.map((d) => [d.chave, d.novo])) };
}
/** Tira itens do que o navegador guardou ("descartar este"); devolve null quando não sobra nenhum. */
function semItens(salvo, chaves) {
  if (!ehObjeto(salvo) || salvo.formato !== 2 || !ehObjeto(salvo.itens)) return null;
  const itens = Object.assign({}, salvo.itens);
  chaves.forEach((k) => { delete itens[k]; });
  return Object.keys(itens).length ? Object.assign({}, salvo, { itens }) : null;
}

/** Motivo curto de um ajustes.json que não é JSON válido (dois objetos seguidos é o caso de 29/10/2026). */
function motivoJsonInvalido(e) {
  const m = String((e && e.message) || e);
  return /after JSON|content at end/i.test(m) // Chrome/Edge/Node: "... after JSON at position"; Firefox: "... after JSON data"
    ? 'JSON inválido, com mais de um objeto JSON seguido (texto novo colado depois do antigo?)'
    : `JSON inválido: ${m}`;
}

/*
 * Ajustes publicados (ajustes.json do site, lido sem cache) e os deste navegador (localStorage).
 * Precedência: padrão < publicado < navegador, item a item; do navegador valem só os itens que diferem do publicado.
 * - ajustes.json com HTTP 200 que não é um objeto JSON válido: `erroPublicado` traz o motivo e NENHUM ajuste publicado
 *   vale (nunca cai no padrão em silêncio: a tela mostra a faixa de aviso).
 * - Ao carregar, os itens do navegador iguais ao publicado saem do navegador (`descartados`); se não sobra nenhum, o
 *   localStorage é limpo e o aviso "ajuste neste navegador" some. Só mexe no localStorage quando se sabe o que está
 *   publicado (arquivo lido ou 404); sem rede ou com o arquivo ilegível, o navegador fica como está.
 * - `diferencas` lista exatamente o que o navegador muda (publicado -> navegador); `navegadorAnterior` avisa quando o
 *   ajuste do navegador foi salvo antes do atualizado_em do publicado.
 */
async function carregarAjustes(cfg, padrao) {
  cfg = cfg || CONFIG; padrao = padrao || MotorPadrao;
  let publicado = null, existePublicado = false, erroPublicado = null, conhecido = false, situacaoPublicado = 'sem-acesso';
  const avPub = [], avNav = [];
  try {
    const r = await fetch(cfg.ajustes, { cache: 'no-store' });
    existePublicado = r.ok;
    if (r.ok) {
      let bruto;
      try { bruto = await r.json(); } catch (e) { erroPublicado = motivoJsonInvalido(e); }
      if (!erroPublicado && !ehObjeto(bruto)) erroPublicado = 'o conteúdo não é um objeto JSON';
      if (!erroPublicado) { publicado = normalizarAjustes(bruto, avPub); conhecido = true; }
    } else if (r.status === 404) conhecido = true; // ninguém publicou ajustes
    else erroPublicado = `HTTP ${r.status}`;
    situacaoPublicado = erroPublicado ? 'erro' : publicado ? 'ok' : r.ok ? 'vazio' : 'ausente';
  } catch (e) { /* sem rede, ou HTML aberto direto do computador: não há publicado para ler */ }

  let texto = null, salvo = null;
  try { texto = localStorage.getItem(AJUSTES_LOCAL); } catch (e) { /* sem localStorage */ }
  if (texto) { try { salvo = JSON.parse(texto); } catch (e) { avNav.push('neste navegador: os ajustes salvos estão ilegíveis e foram ignorados'); } }
  const nav = itensDoNavegador(salvo, publicado, padrao, avNav);
  const m = nav ? mesclarAjustes(publicado, nav.itens, padrao, avNav) : null;
  const diferencas = m ? diferencasAjustes(publicado, m.ajustes, padrao) : [];
  const guardar = nav && navegadorParaSalvar(diferencas, publicado, nav.atualizado_em);
  if (guardar) guardar.publicado_em = nav.publicado_em || guardar.publicado_em;
  const mudou = nav && JSON.stringify(guardar) !== texto;
  if (mudou && conhecido) {
    try { if (guardar) localStorage.setItem(AJUSTES_LOCAL, JSON.stringify(guardar)); else localStorage.removeItem(AJUSTES_LOCAL); }
    catch (e) { /* localStorage só de leitura */ }
  }
  const restantes = new Set(diferencas.map((d) => d.chave));
  const descartados = nav ? (nav.lidos || Object.keys(nav.itens)).filter((k) => !restantes.has(k) && !m.invalidos.includes(k)) : [];
  const pubEm = publicado && publicado.atualizado_em;
  const ativo = diferencas.length ? m.ajustes : publicado;
  return {
    publicado, existePublicado, erroPublicado, situacaoPublicado, ativo,
    origem: diferencas.length ? 'local' : publicado ? 'publicado' : null,
    navegador: guardar ? { atualizado_em: guardar.atualizado_em, publicado_em: guardar.publicado_em, itens: guardar.itens } : null,
    diferencas, descartados,
    navegadorAnterior: !!(diferencas.length && nav.atualizado_em && pubEm && nav.atualizado_em < pubEm),
    avisosPublicado: avPub, avisos: avPub.concat(avNav),
  };
}

/** Página do GitHub para publicar o ajustes.json por PR: edição do arquivo (se já existe) ou criação já preenchida. */
function urlPublicacao(cfg, texto, existe) {
  const base = `https://github.com/${cfg.repo}`, i = cfg.arquivoAjustes.lastIndexOf('/');
  if (existe) return `${base}/edit/${cfg.branch}/${cfg.arquivoAjustes}`;
  return `${base}/new/${cfg.branch}/${cfg.arquivoAjustes.slice(0, i)}?filename=${encodeURIComponent(cfg.arquivoAjustes.slice(i + 1))}` +
    `&value=${encodeURIComponent(texto)}`;
}

/*
 * Segmentação da supervisão (decisão de 28/10/2026). O motor só vê o CANAL: Mista, Segmentada ou sem canal (null).
 * O SEGMENTO é só descrição: Segmentada -> Mini ou Mod; sem canal -> Neutraliza, Eventual, Coke Net ou Virtual;
 * Mista não tem. No ajustes.json cada rota vira {canal, sub, segmento}: `sub` é o campo antigo (Mini/Mod, só na
 * Segmentada) e `segmento` o novo, que vale também para sem canal; um arquivo antigo, só com `sub`, continua igual.
 * Dentro do painel o segmento fica em `sub`. Rota sem ajuste fica exatamente como está na base (nada é renomeado).
 * Valor de tela: 'Mista', 'Segmentada|Mini', '|Neutraliza' ('' = sem canal e sem segmento, como vem da base).
 */
const SEGMENTOS = { Mista: [], Segmentada: ['Mini', 'Mod'], '': ['Neutraliza', 'Eventual', 'Coke Net', 'Virtual'] };
const OPCOES_SEGMENTACAO = ['Mista', 'Segmentada|Mini', 'Segmentada|Mod', '|Neutraliza', '|Eventual', '|Coke Net', '|Virtual'];
const SEM_SV = '__sem_sv__'; // opção "Rotas sem SV" do filtro
const valorSeg = (canal, sub) => (canal || '') + (sub ? '|' + sub : '');
function deValorSeg(v) { const [c, s] = String(v).split('|'); return { canal: c || null, sub: s || null }; }
function rotuloSeg(v) {
  const { canal, sub } = deValorSeg(v);
  return (canal || 'Sem canal') + (sub ? ' – ' + sub : '');
}

/** Canal e segmento de uma rota no ajustes.json -> {canal, sub}; inválido é ignorado e vira aviso, nunca em silêncio.
 *  Canal fora de Mista/Segmentada/null: a rota inteira fica de fora. Segmento que não é do canal: só o segmento cai. */
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

/** Todas as rotas que o admin pode segmentar, com o valor em uso, o da base e a origem ("base" ou "ajuste"). */
function linhasSegmentacao(lista, base, canais) {
  const padrao = mapaCanal(base, null), aj = canais || {};
  return lista.map(({ rota, gc, sv }) => {
    const p = padrao[rota] || { canal: null, sub: null };
    const a = Object.prototype.hasOwnProperty.call(aj, rota) ? aj[rota] : null;
    const c = a || p;
    return { rota, gc, sv: sv || null, canal: c.canal || null, sub: c.sub || null, origem: a ? 'ajuste' : 'base',
             atual: valorSeg(c.canal, c.sub), padrao: valorSeg(p.canal, p.sub) };
  });
}

/** SVs do filtro (código exibido no painel), com as gerências e o nº de rotas; "Rotas sem SV" no fim, se houver. */
function svsDaSegmentacao(linhas) {
  const por = {};
  for (const l of linhas) {
    const k = l.sv || SEM_SV;
    const s = (por[k] = por[k] || { sv: k, rotulo: l.sv || 'Rotas sem SV', gcs: [], n: 0 });
    s.n++; if (!s.gcs.includes(l.gc)) s.gcs.push(l.gc);
  }
  return Object.values(por).sort((a, b) => (a.sv === SEM_SV) - (b.sv === SEM_SV) || a.sv.localeCompare(b.sv, 'pt-BR', { numeric: true }));
}
/** Busca por código do SV como o painel mostra ("Sv. An.1") ou como a API traz ("SV.AN.1"), e pela gerência. */
function buscarSVs(svs, texto) {
  const t = normalizarTexto(texto || '').replace(/[\s.]/g, '');
  if (!t) return svs;
  return svs.filter((s) => [s.rotulo, s.sv === SEM_SV ? 'sem sv' : s.sv].concat(s.gcs)
    .some((x) => normalizarTexto(x).replace(/[\s.]/g, '').includes(t)));
}
/** Rotas da mesa de um SV (ou as sem SV), na ordem do código. */
const rotasDoFiltro = (linhas, filtro) => linhas.filter((l) => (l.sv || SEM_SV) === filtro)
  .sort((a, b) => a.rota.localeCompare(b.rota, 'pt-BR', { numeric: true }));

/** Mesa com a edição em curso: canais das rotas, se há Mista e Segmentada juntas, o canal da maioria e o canal do SV
 *  (`escolhido` = canal do SV definido pelo admin; vazio = padrão, a maioria; empate sem escolha = null). */
function canalDaMesa(rotas, edicao, escolhido) {
  const de = rotas.map((l) => deValorSeg(edicao && l.rota in edicao ? edicao[l.rota] : l.atual).canal || 'Sem canal');
  const canais = [...new Set(de)];
  const n = (c) => de.filter((x) => x === c).length;
  const maioria = n('Mista') === n('Segmentada') ? null : n('Mista') > n('Segmentada') ? 'Mista' : 'Segmentada';
  return { canais, mista: n('Mista') > 0 && n('Segmentada') > 0, maioria, canal: escolhido || maioria };
}
/** Canal do SV escolhido (ou que volta ao padrão, a maioria das rotas) em relação ao que está em uso. A tela não usa
 *  mais (desde 29/10/2026 "Alterações para publicar" compara com o publicado: diferencasAjustes). */
function pendenciasCanalSV(emUso, edicao) {
  const out = [];
  for (const sv of [...new Set(Object.keys(emUso || {}).concat(Object.keys(edicao || {})))].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }))) {
    const a = (emUso || {})[sv] || '', n = (edicao || {})[sv] || '';
    if (!a && !n) continue;
    out.push({ sv, novo: n, situacao: n === a ? 'em uso' : n ? 'nova' : 'volta ao padrão' });
  }
  return out;
}

/** "Aplicar a todas as rotas desta mesa" e "restaurar padrão" (por rota ou pela mesa): devolvem uma edição nova. */
function aplicarNaMesa(edicao, rotas, valor) {
  const out = Object.assign({}, edicao);
  rotas.forEach((l) => { out[l.rota] = valor; });
  return out;
}
function restaurarPadrao(edicao, rotas) {
  const out = Object.assign({}, edicao);
  rotas.forEach((l) => { out[l.rota] = l.padrao; });
  return out;
}

/** Rotas fora do padrão da base (ou que voltam a ele), com "base -> novo". A tela não usa mais (desde 29/10/2026
 *  "Alterações para publicar" compara com o publicado: diferencasAjustes). */
function pendenciasSegmentacao(linhas, edicao) {
  const out = [];
  for (const l of linhas) {
    const novo = l.rota in edicao ? edicao[l.rota] : l.atual;
    if (novo === l.padrao && l.atual === l.padrao) continue;
    out.push({ rota: l.rota, sv: l.sv, base: l.padrao, novo,
               situacao: novo === l.atual ? 'em uso' : novo === l.padrao ? 'volta ao padrão' : 'nova' });
  }
  return out.sort((a, b) => a.rota.localeCompare(b.rota, 'pt-BR', { numeric: true }));
}
/** Edição -> `canais` do ajustes.json: só o que difere da base; ajustes de rotas fora da lista são mantidos. */
function canaisDaEdicao(linhas, edicao, anteriores) {
  const canais = {}, naLista = new Set(linhas.map((l) => l.rota));
  const noArquivo = ({ canal, sub }) => ({ canal, sub: canal === 'Segmentada' ? sub : null, segmento: sub });
  for (const [rota, c] of Object.entries(anteriores || {})) if (!naLista.has(rota)) canais[rota] = noArquivo(c);
  for (const l of linhas) {
    const novo = l.rota in edicao ? edicao[l.rota] : l.atual;
    if (novo !== l.padrao) canais[l.rota] = noArquivo(deValorSeg(novo));
  }
  return canais;
}

/** Segmentos das rotas de uma mesa (SV no canal): ex. ['Mini', 'Mod'] na Segmentada; [] na Mista. */
const segmentosDaMesa = (rotas, idSV) => [...new Set(rotas.filter((r) => svKey(r) === idSV && r.sub && idSV.endsWith('#' + r.canal))
  .map((r) => r.sub))].sort();

/*
 * Confronto cadastrado que um ajuste de canal invalidou. O id do SV leva o canal ("Sv. An.1#Mista"); se o ajuste tirou
 * a mesa daquele canal, o motor não acha o SV (SV_NAO_ENCONTRADO). Aqui o motivo vira "canal ajustado", com as rotas,
 * e o cadastro continua no ajustes.json. Devolve null quando o ajuste não explica o motivo.
 */
function confrontoInvalidadoPorAjuste(det, linhas, canaisSV) {
  if (det.valido || !['SV_NAO_ENCONTRADO', 'CANAIS_DIFERENTES'].includes(det.motivo)) return null;
  for (const id of [det.desafiante, det.desafiado]) {
    const i = String(id).lastIndexOf('#');
    if (i < 0) continue;
    const sv = id.slice(0, i), canal = id.slice(i + 1), c = canaisSV && canaisSV[sv];
    const saiu = linhas.filter((l) => l.sv === sv && l.origem === 'ajuste' && deValorSeg(l.padrao).canal === canal && l.canal !== canal);
    if (saiu.length && (!c || c.canal !== canal)) return { motivo: 'CANAL_AJUSTADO', sv, canal, rotas: saiu.map((l) => l.rota),
      texto: `canal ajustado: a mesa de ${sv} saiu da ${canal} (rota${saiu.length > 1 ? 's' : ''} ${saiu.map((l) => l.rota).join(', ')})` };
    if (c && c.canal !== canal) return { motivo: 'CANAL_AJUSTADO', sv, canal, rotas: [],
      texto: !c.canal ? `canal ajustado: ${sv} está sem canal (mesmo número de rotas Mista e Segmentada) até o admin escolher`
        : `canal ajustado: ${sv} agora é da ${c.canal} (${c.origem === 'ajuste' ? 'canal do SV definido pelo admin' : 'maioria das rotas da mesa'})` };
  }
  return null;
}

/*
 * Aba Confrontos (cartões de duelo): funções só de apresentação. Nada aqui apura vencedor, ponto ou %: tudo vem do
 * motor (RES.confrontos); aqui só se distribui na tela, conta linhas e escolhe o estado visual.
 */
const CF_ALTURA_MAX = 84, CF_ALTURA_MIN = 62; // px por linha; abaixo do mínimo as duas colunas rolam juntas

/**
 * Duas colunas, na ordem do motor e numeradas em sequência (1 a k na esquerda, o resto na direita), com k = ceil(n/2):
 * a legenda fica fora do quadro, no rodapé da página. Com `disp` (px para as linhas) e `entre` (px entre linhas),
 * devolve também a altura da linha (o que sobra ÷ k, de 62 a 84 px) e se as colunas rolam.
 */
function distribuirConfrontos(n, disp, entre) {
  n = Math.max(0, Math.floor(Number(n) || 0));
  if (!n) return { linhas: 0, esquerda: 0, direita: 0, altura: null, rola: false };
  const k = Math.ceil(n / 2);
  const out = { linhas: k, esquerda: k, direita: n - k, altura: null, rola: false };
  if (disp !== undefined) {
    const sobra = (disp - (entre || 0) * (k - 1)) / k;
    out.altura = Math.floor(Math.max(CF_ALTURA_MIN, Math.min(CF_ALTURA_MAX, sobra)));
    out.rola = sobra < CF_ALTURA_MIN;
  }
  return out;
}

/**
 * Contagens do cabeçalho e da legenda, sobre os confrontos do mês que o motor já apurou (válidos ou não): cadastrados,
 * válidos, com vencedor, por canal (o do desafiante; SV não encontrado ou sem canal = "Sem canal") e por pilar (sem
 * "Volume "). Ordem: mais confrontos primeiro, empate pelo rótulo. As duas listas somam os cadastrados.
 */
function resumoConfrontos(lista, porId) {
  const l = lista || [], mapa = porId || {};
  const sv = (id) => (Object.prototype.hasOwnProperty.call(mapa, id) ? mapa[id] : null);
  const contar = (rotulo) => l.reduce((m, c) => { const k = rotulo(c); m[k] = (m[k] || 0) + 1; return m; }, {});
  const ordenar = (m) => Object.entries(m).map(([rotulo, n]) => ({ rotulo, n }))
    .sort((a, b) => b.n - a.n || a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
  return {
    cadastrados: l.length,
    validos: l.filter((c) => c.valido).length,
    comVencedor: l.filter((c) => c.vencedor).length,
    porCanal: ordenar(contar((c) => (sv(c.desafiante) && sv(c.desafiante).canal) || 'Sem canal')),
    porPilar: ordenar(contar((c) => String(c.pilar || '').replace(/^Volume /, '') || 'Sem pilar')),
  };
}

/**
 * Estado visual de um confronto apurado pelo motor: caixa S1 (vencedor), S2 (válido sem vencedor: empate sem vencedor
 * ou sem dado) ou S3 (não vale). Cada lado é 'vencedor' ou 'normal' (S1), 'neutro' (S2 e S3) ou 'S4' (SV não encontrado
 * no mês: `encontrado(id)` diz se o SV existe); `estado` é S4 quando algum lado é S4. `vencedor` diz o lado que venceu e
 * `desempate`, se ele venceu pelo % de Refrigerantes.
 */
function estadoConfronto(c, encontrado) {
  const caixa = !c.valido ? 'S3' : c.vencedor ? 'S1' : 'S2';
  const vencedor = caixa !== 'S1' ? null : c.vencedor === c.desafiante ? 'desafiante' : c.vencedor === c.desafiado ? 'desafiado' : null;
  const lado = (id, qual) => (encontrado && !encontrado(id) ? 'S4' : caixa !== 'S1' ? 'neutro' : vencedor === qual ? 'vencedor' : 'normal');
  const out = { caixa, vencedor, desempate: caixa === 'S1' && c.motivo === 'DESEMPATE_REFRI',
                desafiante: lado(c.desafiante, 'desafiante'), desafiado: lado(c.desafiado, 'desafiado') };
  out.estado = out.desafiante === 'S4' || out.desafiado === 'S4' ? 'S4' : caixa;
  return out;
}

/** Largura (%) da barra do SV: 0 sem valor, negativo ou NaN; no máximo 100 (a barra não passa de 100%). Não arredonda. */
const larguraBarra = (pct) => (typeof pct === 'number' && pct > 0 ? Math.min(100, pct) : 0);

/** Etiquetas do SV no cartão (regra fixa, sem medir texto): uma só fica na linha do nome; duas ou mais vão juntas para a
 *  linha do subtexto, à direita do "canal · unidade". */
const lugarEtiquetas = (etiquetas) => {
  const l = (etiquetas || []).slice();
  return l.length === 1 ? { nome: l, sub: [] } : { nome: [], sub: l };
};

/** Agrupadores que formam o Refrigerantes do gatilho: a categoria (API) ou, sem ela, a soma provisória. */
const componentesRefri = (dados, cfg) => (dados.meta.refriCategoria ? [cfg.refri] : cfg.refriProvisorio);

/*
 * Linhas da aba Estratégicos: uma por gerência e o TOTAL da empresa, só volume (não há pontos nem gatilho aqui —
 * quem pontua continua sendo o motor). `itens` são os agrupadores das colunas, na ordem da tela.
 * Com a API, os números são os totais que ela já traz: a gerência inteira, com TODAS as rotas que têm Real
 * (sem canal, Neutraliza, virtuais, eventuais e item sem meta), igual ao Desempenho de Rotas.
 * Sem a API (base embutida), continua a soma das rotas do incentivo, como antes — as duas origens nunca se misturam.
 * `conciliacao` compara o Refrigerantes das rotas do incentivo com o total da empresa (nota abaixo da tabela).
 */
function montarEstrat(dados, itens, cfg) {
  cfg = cfg || CONFIG;
  const I = cfg.idx;
  const compRefri = componentesRefri(dados, cfg);
  const chaves = itens.concat([CHAVE_REFRI]);
  const novo = () => { const o = {}; chaves.forEach((k) => { o[k] = { meta: 0, real: 0, online: 0, mdia: 0, temMdia: false }; }); return o; };
  const soma = (d, k, v) => {
    const a = d[k];
    a.meta += v[I.meta] || 0; a.real += v[I.real] || 0; a.online += v[I.online] || 0;
    if (v[I.metaDia] !== null && v[I.metaDia] !== undefined) { a.mdia += v[I.metaDia]; a.temMdia = true; }
  };
  // Rotas do incentivo (canal Mista/Segmentada): a tabela sem a API e, com a API, a conciliação da nota
  const porRota = {}, totalRotas = novo();
  let nRotas = 0;
  for (const r of dados.rotas) {
    const a = (porRota[r.gc] = porRota[r.gc] || novo());
    nRotas++;
    for (const k of itens) {
      const v = r.v[k] || VAZIO;
      if (!(v[I.meta] > 0) || v[I.real] === null) continue; // sem meta ou sem real fica fora da soma, como no resto do painel
      soma(a, k, v); soma(totalRotas, k, v);
    }
    for (const g of compRefri) {
      const v = r.v[g] || VAZIO;
      if (!(v[I.meta] > 0) || v[I.real] === null) continue;
      soma(a, CHAVE_REFRI, v); soma(totalRotas, CHAVE_REFRI, v);
    }
  }
  const porNome = (a, b) => a.gc.localeCompare(b.gc, 'pt-BR');
  if (!(dados.meta.origem === 'api' && dados.totaisGerencia && dados.totalEmpresa)) {
    return { origem: 'rotas', nRotas, conciliacao: null,
             linhas: Object.keys(porRota).map((gc) => ({ gc, nome: gc, v: porRota[gc] })).sort(porNome),
             total: { gc: 'TOTAL', nome: 'TOTAL', v: totalRotas } };
  }
  const daApi = (vals) => {
    const o = novo();
    for (const k of itens) soma(o, k, vals[k] || VAZIO);
    for (const g of compRefri) soma(o, CHAVE_REFRI, vals[g] || VAZIO);
    return o;
  };
  const total = { gc: 'TOTAL', nome: 'TOTAL', v: daApi(dados.totalEmpresa) };
  const canal = totalRotas[CHAVE_REFRI].real, todas = total.v[CHAVE_REFRI].real;
  return {
    origem: 'api', nRotas,
    linhas: dados.totaisGerencia.map((g) => ({ gc: g.gc, nome: g.nome, v: daApi(g.v) })).sort(porNome),
    total,
    conciliacao: { refriCanal: canal, refriTotal: todas, pct: todas > 0 ? (canal / todas) * 100 : null },
  };
}

/*
 * Dados do painel -> entrada do motor, com todos os meses do trimestre até o de referência: os fechados
 * (dados.fechados, online = 0) e o corrente (dados.rotas). Cada mês usa os pilares daquele mês; a mesa do SV em
 * cada mês é a supervisão da rota naquele mês. Pessoas = rotas e supervisões do mês corrente.
 */
function montarEntrada(dados, cfg, confrontos) {
  if (!dados.canaisSV) dados = aplicarCanalSV(dados, null); // chamada direta (testes): canal do SV pela maioria
  const I = cfg.idx;
  const compRefri = componentesRefri(dados, cfg);
  const mesRef = dados.meta.mes;
  const validada = (mes) => MotorRegras().missaoValidadaMeses.includes(mes);
  const pessoas = [];
  const medidas = [];
  const notasRefri = [];
  const somar = (k, nome, v) => { const a = (k[nome] = k[nome] || { meta: 0, real: 0, online: 0, n: 0 }); a.meta += v.meta; a.real += v.real; a.online += v.online; a.n++; };
  const meses = (dados.fechados || []).filter((f) => f.mes < mesRef).sort((a, b) => a.mes - b.mes)
    .concat([{ mes: mesRef, rotas: dados.rotas }]);
  let svAtual = {};
  for (const { mes, rotas } of meses) {
    const corrente = mes === mesRef;
    const svAgg = {};
    for (const r of rotas) {
      if (corrente) pessoas.push({ id: r.rota, nome: 'Rota ' + r.rota, cargo: 'RT', canal: r.canal, unidade: r.gc, sub: r.sub, id_supervisor: svKey(r) });
      // a mesa soma no SV do canal dele (empate sem escolha: sem SV); o SV mede cada rota nos pilares do canal DELE
      const canalSV = r.svCanal !== undefined ? r.svCanal : r.canal;
      const ag = canalSV ? (svAgg[svKey(r)] = svAgg[svKey(r)] || { sv: r.sv, canal: canalSV, gc: r.gc, p: {} }) : null;
      // Missões Guiadas validada (outubro) não tem dado; sem fonte (nov/dez ainda sem definição) fica "sem dados"
      const comDado = (pl) => pl.tipo === 'volume' || !(validada(mes) || semFonte(cfg, pl.nome));
      for (const pl of (pilaresDoMes(cfg, mes, r.canal) || []).filter(comDado)) {
        const v = r.v[cfg.fonteDoPilar[pl.nome]] || VAZIO;
        medidas.push({ id: r.rota, mes, pilar: pl.nome, meta: v[I.meta], real: v[I.real], online: v[I.online], hoje: v[I.hoje], metaDia: v[I.metaDia] });
      }
      if (ag) for (const pl of (pilaresDoMes(cfg, mes, canalSV) || []).filter(comDado)) {
        const v = r.v[cfg.fonteDoPilar[pl.nome]] || VAZIO;
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
      if (corrente && excluidos.length) notasRefri.push({ rota: r.rota, excluidos, usados });
      medidas.push({ id: r.rota, mes, pilar: 'Refrigerantes', meta: usados ? meta : null, real: realFalta || !usados ? null : real, online });
      if (ag && usados && !realFalta) somar(ag.p, 'Refrigerantes', { meta, real, online });
    }
    // Supervisor (PROVISÓRIO): soma de todas as rotas da mesa nos pilares do canal do SV; rota sem meta ou sem real fica fora
    for (const k of Object.keys(svAgg)) {
      const a = svAgg[k];
      const nomes = (pilaresDoMes(cfg, mes, a.canal) || [])
        .filter((p) => p.tipo === 'volume' || !(validada(mes) || semFonte(cfg, p.nome))).map((p) => p.nome).concat(['Refrigerantes']);
      for (const n of nomes) { const x = a.p[n]; medidas.push({ id: k, mes, pilar: n, meta: x ? x.meta : null, real: x ? x.real : null, online: x ? x.online : 0 }); }
    }
    if (corrente) svAtual = svAgg;
  }
  for (const k of Object.keys(svAtual)) {
    const a = svAtual[k];
    pessoas.push({ id: k, nome: a.sv, cargo: 'SV', canal: a.canal, unidade: a.gc, id_supervisor: null });
  }
  const mesesIncompletos = ((dados.meta.acumulado && dados.meta.acumulado.faltando) || []).map((x) => ({ mes: x.mes, motivo: x.motivo }));
  // fechamento: o mês de referência já fechou (a API mostra o mês anterior fechado); só então o +5 do confronto dele entra
  return { entrada: { mesRef, dataCorte: dados.meta.corte, pessoas, pilaresConfig: cfg.pilaresConfig, medidas,
                      confrontos: confrontos || [], mesesIncompletos, fechamento: !!dados.meta.fechamento }, notasRefri };
}

if (typeof module === 'object' && module.exports) {
  module.exports = { CONFIG, montarEntrada, svKey, dadosDaApi, carregarDados, componentesRefri, comCanais,
                     fechadoDaApi, pilaresDoMes, pilaresDefinidos, PILARES_NO_MES, mesConfigurado, aplicarCoringas, NOMES_MES,
                     montarEstrat, CHAVE_REFRI,
                     AJUSTES_LOCAL, PILARES_CORINGA, EXTRAS_MAX, CONFRONTOS_MAX, MESES_Q4, IDS_FIXOS, AGRUPADORES_FIXOS,
                     normalizarTexto, pilarDoExtra, normalizarExtras, normalizarConfrontos, normalizarAjustes, aplicarAjustes,
                     carregarAjustes, urlPublicacao, MotorPadrao, itensDosAjustes, objetoDosItens, rotuloItem, textoItem,
                     diferencasAjustes, mesclarAjustes, itensDoNavegador, navegadorParaSalvar, semItens, motivoJsonInvalido,
                     SEGMENTOS, OPCOES_SEGMENTACAO, SEM_SV, valorSeg, deValorSeg, rotuloSeg, validarCanalRota, linhasSegmentacao,
                     svsDaSegmentacao, buscarSVs, rotasDoFiltro, canalDaMesa, aplicarNaMesa, restaurarPadrao, pendenciasSegmentacao,
                     canaisDaEdicao, segmentosDaMesa, confrontoInvalidadoPorAjuste,
                     canaisDosSVs, aplicarCanalSV, pendenciasCanalSV,
                     CF_ALTURA_MAX, CF_ALTURA_MIN, distribuirConfrontos, resumoConfrontos,
                     estadoConfronto, larguraBarra, lugarEtiquetas };
}
