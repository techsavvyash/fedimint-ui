const { createProxyMiddleware } = require('http-proxy-middleware');

const config_path = process.env.REACT_APP_DEV_CONFIG_PATH
  ? process.env.REACT_APP_DEV_CONFIG_PATH
  : 'config.json';

module.exports = function (app) {
  console.log(`serving up ${config_path} for frontend`);
  app.use(
    '/config',
    createProxyMiddleware({
      target: 'http://localhost:5000/dev_config',
      changeOrigin: true,
      pathRewrite: {
        'config/config.json': config_path,
      },
    })
  );
};
