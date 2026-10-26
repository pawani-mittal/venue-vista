/**
 * Vercel Serverless Function Entry Point for Venue Vista API
 */

const server = require('../server');

module.exports = (req, res) => {
  server.emit('request', req, res);
};
