const path = require('path');
const cluster = require('cluster');
const childProcess = require('child_process');
const agentFile = path.resolve(__dirname, './agent.js');
const CUSTOM_TIME = 33.33;

/**
 * 自定义进程守护类
 * 主要用于守护进程的启动与关闭
 * @life create {async function} 进程创建生命周期
 * @life destroy {async function} 进程销毁生命周期
 * @method INIT {function} 创建初始化
 * @constructor {isAgent?: boolean} 是否是agent类型
 */
module.exports = class Processor {
  constructor(isAgent) {
    // 系统workers启动守护列表
    this.SYS_WORKERS = [];
    // 系统agents启动守护列表
    this.SYS_AGENTS = {};
    // 关闭过程状态码
    this.SYS_CLOSING = 0;
    // 错误列表
    this.SYS_ERRORS = [];
    // 只有master和agent进程才为true
    this.SYS_IS_MASTER = cluster.isMaster;
    // 强制退出，主要用户worker进程
    this.FORCE_KILL = false;
    /**
     * agent: 辅助进程
     * worker: 子进程
     * false: 主进程
     */
    this.SYS_CHILD = cluster.isWorker ? 'worker' : (isAgent ? 'agent' : false);

    if (this.SYS_IS_MASTER && this.SYS_CHILD === 'worker') {
      throw new Error('you can not set ismaster=true and child=worker');
    }

    this.SYS_TIMER = setInterval(() => {}, 24 * 60 * 60 * 1000);

    process.on('SIGTERM', () => this.kill());
    process.on('SIGINT', () => this.kill());
    process.on('SIGQUIT', () => this.kill());

    process.on('message', (message, socket) => {
      const Method = 'ipc:' + message.event;
      if (this[Method]) {
        this[Method]({
          data: message.data,
          error: message.error,
        }, socket);
      }
    });
  }

  // 当前进程是否为真正的agent进程
  get IS_AGENT() {
    return this.SYS_IS_MASTER && this.SYS_CHILD === 'agent';
  }

  ['ipc:teardown'](data = {}) {
    this.CLOSE(data.error);
    if (!(this.SYS_IS_MASTER && !this.SYS_CHILD)) {
      process.send({
        event: 'teardown',
        error: data.error
      });
    }
  }

  ['ipc:close']() {
    this.SYS_CLOSING++;
  }

  kill(data) {
    this.FORCE_KILL = true;
    this['ipc:teardown'](data);
  }

  INIT() {
    const callback = this.create;
    if (!callback) callback = async () => {};
    if (this.SYS_IS_MASTER) {
      if (this.IS_AGENT) {
        this.create()
          .then(data => process.send({ event: 'ready', data }))
          .catch(e => this.kill({ error: e.message }));
      } else {
        this.create().catch(e => this.kill({ error: e.message }));;
      }
    } else {
      this.create()
        .then(data => process.send({ event: 'ready', data }))
        .catch(e => this.kill({ error: e.message }));
    }
  }

  registerAgent(name, target) {
    const component = {};
    component.status = 0;
    component.process = target;
    target.on('close', () => component.status = 2);
    const teardownListener = ({ event, error }) => {
      if (event === 'teardown') {
        this.kill({ error });
        target.off('message', teardownListener);
      }
    }
    target.on('message', teardownListener);
    this.SYS_AGENTS[name] = component;
    return this;
  }

  registerWorker(target) {
    const component = {};
    component.status = 0;
    component.process = target;
    target.component = component;
    this.SYS_WORKERS.push(component);
  }

  CLOSE(error) {
    if (error && this.SYS_ERRORS.indexOf(error) === -1) {
      this.SYS_ERRORS.push(error);
    }
    if (this.SYS_CLOSING !== 0) return;
    this.SYS_CLOSING++; // 1
    const timer = setInterval(() => {
      if (this.SYS_IS_MASTER) {
        // console.log(this.IS_AGENT ? 'agent' : 'master', this.SYS_CLOSING);
        switch (this.SYS_CLOSING) {
          case 1: this.CLOSE_WORKERS(); break;
          case 3: this.CLOSE_AGENTS(); break;
          case 5: 
            if (!this.IS_AGENT) { 
              this.CLOSING(timer); 
            } 
            break;
          case 6: 
            if (this.IS_AGENT) { 
              this.CLOSING(timer); 
            } 
            break;
        }
      } else if (this.SYS_CLOSING === 2) {
        this.CLOSING(timer);
      }
    }, CUSTOM_TIME);
  }

  CLOSE_TIMER(...args) {
    args.forEach(arg => clearInterval(arg));
  }

  CLOSE_AGENTS() {
    this.SYS_CLOSING++; // 4
    if (!Object.keys(this.SYS_AGENTS).length) return this.SYS_CLOSING++;
    const timer = setInterval(() => {
      for (const agent in this.SYS_AGENTS) {
        if (this.SYS_AGENTS[agent].status !== 2) return;
        clearInterval(timer);
        this.SYS_CLOSING++; // 5
      }
    }, CUSTOM_TIME);
    for (const agent in this.SYS_AGENTS) {
      this.SYS_AGENTS[agent].status = 1;
      this.SYS_AGENTS[agent].process.send({ event: 'close' });
    }
  }

  CLOSE_WORKERS() {
    this.SYS_CLOSING++; // 2
    if (!this.SYS_WORKERS.length) return this.SYS_CLOSING++;
    const timer = setInterval(() => {
      for (let i = 0; i < this.SYS_WORKERS.length; i++) {
        const worker = this.SYS_WORKERS[i];
        if (worker.status !== 2) return;
      }
      clearInterval(timer);
      this.SYS_CLOSING++; // 3
    }, CUSTOM_TIME);
    for (let j = 0; j < this.SYS_WORKERS.length; j++) {
      const worker = this.SYS_WORKERS[j];
      worker.status = 1;
      worker.process.send({ event: 'close' });
    }
  }

  CLOSING(...timer) {
    if (!this.destroy) {
      this.CLOSE_TIMER(this.SYS_TIMER, ...timer);
      process.exit(0);
    }
    this.destroy()
    .then(() => this.CLOSE_TIMER(this.SYS_TIMER, ...timer))
    .then(() => {
      if (this.SYS_ERRORS.length) {
        this.SYS_ERRORS.forEach(console.error);
      }
    })
    .then(() => process.exit(0))
    .catch(e => process.exit(0));
  }

  CREATE_AGENT(cwd, name, exec_file, _args = []) {
    const opts = {
      cwd: cwd || process.cwd(),
      env: Object.create(process.env),
      stdio: 'inherit',
      execArgv: process.execArgv.slice(0)
    };
    const args = [
      '--cwd=' + opts.cwd,
      '--env=' + (opts.env.NODE_ENV || 'production'),
      '--script=' + exec_file,
      ..._args
    ];
    const agent = childProcess.fork(agentFile, args, opts);
    this.registerAgent(name, agent);
    const listener = ({ event, data, error }) => {
      if (event === 'ready') {
        agent.off('message', listener);
        if (error) return agent.reject(new Error(error));
        agent.resolve(data);
      }
    }
    agent.on('message', listener);
    return new Promise((resolve, reject) => {
      agent.resolve = resolve;
      agent.reject = reject;
    });
  }

  CREATE_WORKER(cwd, n, exec_file, _args = []) {
    let x = 0, y = 0;
    const datas = [];
    const errors = [];
    const opts = {
      cwd: cwd || process.cwd(),
      exec: agentFile,
      stdio: 'inherit',
      env: Object.create(process.env),
      execArgv: process.execArgv.slice(0)
    };
    opts.args = [
      '--cwd=' + cwd,
      '--env=' + (opts.env.NODE_ENV || 'production'),
      '--script=' + exec_file,
      ..._args
    ];
    cluster.setupMaster(opts);

    for (let i = 0; i < n; i++) cluster.fork();

    const listener = (worker, message, socket) => {
      if (message.event === 'ready') {
        if (!message.error) x++;
        if (message.data) datas.push(message.data);
        if (message.error) errors.push(message.error);
        y++;
      }
    }

    cluster
      .on('fork', worker => this.registerWorker(worker))
      .on('message', listener)
      .on('exit', worker => {
        if (!this.FORCE_KILL) {
          const index = this.SYS_WORKERS.indexOf(worker.component);
          if (index > -1) {
            this.SYS_WORKERS.splice(index, 1);
          }
          this.CREATE_WORKER(cwd, 1, exec_file, _args);
        } else {
          worker.component.status = 2;
        }
      });

    return new Promise((resolve, reject) => {
      const timer = setInterval(() => {
        if (y === n) {
          clearInterval(timer);
          cluster.off('message', listener);
          if (x < y) return reject(errors);
          resolve(datas);
        }
      }, CUSTOM_TIME);
    })
  }
}