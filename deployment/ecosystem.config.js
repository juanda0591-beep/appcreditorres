module.exports = {
  apps: [
    {
      name: 'appcreditorres',
      script: 'apps/api/dist/index.js',
      cwd: '/var/www/appcreditorres',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      error_file: '/var/log/pm2/appcreditorres-error.log',
      out_file: '/var/log/pm2/appcreditorres-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_memory_restart: '500M',
      restart_delay: 4000,
      min_uptime: '10s',
      max_restarts: 10,
      kill_timeout: 5000
    }
  ]
};
