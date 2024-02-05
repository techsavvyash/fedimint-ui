const { createProxyMiddleware } = require('http-proxy-middleware');

const config_path = process.env.REACT_APP_FM_CONFIG_PATH
  ? process.env.REACT_APP_FM_CONFIG_PATH
  : 'ws://127.0.0.1';

module.exports = function (app) {
  app.use(
    '/config',
    createProxyMiddleware({
      target: 'http://localhost:5000',
      changeOrigin: true,
      pathRewrite: {
        '^/config.json': config_path,
      },
    })
  );
};
