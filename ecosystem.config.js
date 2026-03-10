module.exports = {
  apps: [{
    name: 'stanford-mgym',
    script: 'server.js',
    cwd: '/home/mansona/workspace/stanford-mgym-2026',
    watch: false,
    restart_delay: 2000,
    max_restarts: 10,
    env: { NODE_ENV: 'production', PORT: 8889 }
  }]
};
