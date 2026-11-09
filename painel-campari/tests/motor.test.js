const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

test('motor carrega no Node e exporta versaoRegras 1.1', () => {
  const M = require('../src/motor.js');
  assert.equal(M.versaoRegras, '1.1');
});

test('etapa 1: motor sem regra de cálculo (só versaoRegras)', () => {
  const M = require('../src/motor.js');
  assert.deepEqual(Object.keys(M), ['versaoRegras']);
});

test('no navegador o motor fica em window.MotorCampari', () => {
  const codigo = fs.readFileSync(path.join(__dirname, '..', 'src', 'motor.js'), 'utf8');
  const janela = {};
  janela.self = janela;
  vm.runInNewContext(codigo, janela);
  assert.equal(janela.MotorCampari.versaoRegras, '1.1');
});
