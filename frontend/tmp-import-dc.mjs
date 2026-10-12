import('./src/pages/DisciplinaryCase.jsx')
  .then((m) => console.log('ok', typeof m.default))
  .catch((e) => { console.error('FAIL', e); console.error(e.stack); });
