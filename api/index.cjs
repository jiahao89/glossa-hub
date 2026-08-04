const app = require('../server.cjs');

module.exports = (req, res) => {
  return app(req, res);
};
