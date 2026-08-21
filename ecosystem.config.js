module.exports = {
  apps: [
    {
      name: 'appcreditorres',
      script: './apps/api/dist/server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
      },
      // Configuración para evitar downtime durante deploys
      wait_ready: true,
      listen_timeout: 10000,
      kill_timeout: 5000,
      // Reload en lugar de restart para zero-downtime
      restart_delay: 1000,
    },
  ],
};
