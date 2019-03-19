module.exports = argv => {
  const result = {};
  argv.forEach(arg => {
    let exec = /^\-\-([^\=]+)(\=(.+))?$/.exec(arg);
    if (exec) {
      if (exec[3]) {
        result[exec[1]] = exec[3];
      } else {
        result[exec[1]] = true;
      }
    }
    exec = /^\-([a-zA-Z]+)$/.exec(arg);
    if (exec) {
      result[exec[1]] = true;
    }
  });
  return result;
}