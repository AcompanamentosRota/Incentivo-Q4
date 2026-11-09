/*
 * Motor de cálculo — Campari Club 2026 (Coca-Cola Bandeirantes) — regras v1.1 (docs/regras.md)
 * Roda em Node (testes) e no navegador (painel HTML): window.MotorCampari.
 *
 * Etapa 1 (esqueleto): ainda NÃO há regra de cálculo. Nada de %, trava, gatilho, posição nem meta dia.
 * Quando as regras entrarem (etapas seguintes), elas ficam só aqui: nenhuma fórmula no adaptador nem na tela.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MotorCampari = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  return { versaoRegras: '1.1' };
});
