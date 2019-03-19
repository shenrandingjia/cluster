const os = require('os');
const path = require('path');
const Processer = require('./processer');
const gatewayRuntimeFile = path.resolve(__dirname, './gateway.js');

module.exports = class MasterService extends Processer {
  constructor({ cwd, max, worker }) {
    super();
    this.cwd = cwd;
    this.max = max || os.cpus().length;
    this.worker = worker;
  }

  async create() {
    const { timeStart, timeEnd, port } = await this.createGeteWay();
    console.log(timeStart, timeEnd, port);
    const data = await this.CREATE_WORKER(this.cwd, this.max, this.worker);
    console.log(data);
  }

  async destroy() {
    
  }

  async createGeteWay() {
    return await this.CREATE_AGENT(this.cwd, 'GATEWAY', gatewayRuntimeFile);
  }
}