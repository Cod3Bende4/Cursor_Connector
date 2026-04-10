module.exports = {
  apps: [{
    name: 'cursor-bridge',
    script: 'src/index.js',
    cwd: __dirname,
    watch: false,
    autorestart: true,
    restart_delay: 3000,
    max_restarts: 10,
    env: {
      NODE_ENV: 'production',
    },
    error_file: 'logs/error.log',
    out_file: 'logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true,
  }]
};
