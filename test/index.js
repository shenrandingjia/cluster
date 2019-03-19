const master = require('../index');
const path = require('path');
new master({
  // max: 3,
  worker: path.resolve(__dirname, './worker.js')
}).INIT();