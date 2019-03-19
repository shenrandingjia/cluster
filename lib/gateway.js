const net = require('net');
const Port = require('./utils/port');

module.exports = class GateWay {
  constructor({ cwd, env }) {
    this.cwd = cwd;
    this.env = env;
  }

  async create() {
    const timeStart = Date.now();
    this.server = await this.createTCPServer();
    return {
      timeStart,
      timeEnd: Date.now(),
      port: this.server.port
    }
  }

  async destroy() {
    if (this.server) {
      this.server.close();
    }
  }

  async createTCPServer() {
    const port = await Port();
    const server = net.createServer(socket => {
      socket.on('data', data => {
        console.log('receive', data);
      });
    });
    return await new Promise((resolve, reject) => {
      server.listen(port, err => {
        if (err) return reject(err);
        server.port = port;
        resolve(server);
      });
    });
  }
}