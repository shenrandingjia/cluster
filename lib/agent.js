const ArgvFormatter = require('./utils/argv');
const Processer = require('./processer');
const _Proxy = Symbol('Agent:Proxy');

class Agent extends Processer {
  constructor(argv) {
    const argvs = ArgvFormatter(argv);
    const target = require(argvs.script);
    super(true);
    this.$server = this[_Proxy](new target({
      cwd: argvs.cwd,
      env: argvs.env
    }));
  }

  [_Proxy](obj) {
    return new Proxy(obj, {
      get: (target, property) => {
        if (target[property] === undefined) return Reflect.get(this, property);
        return Reflect.get(target, property);
      },
      set: (target, property, value) => {
        if (target[property] === undefined) return Reflect.set(this, property, value);
        return Reflect.set(target, property, value);
      }
    });
  }

  async create() {
    return await this.$server.create();
  }

  async destroy() {
    return await this.$server.destroy();
  }
}

new Agent(process.argv.slice(2)).INIT();