module.exports = class {
  constructor({ cwd, env }) {
    this.cwd = cwd;
    this.env = env;
  }

  async create() {
    return {a:1, b: process.pid}
  }

  async destroy() {
    console.log('in des')
  }
}