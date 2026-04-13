// src/tor/proxy.js
const { SocksProxyAgent } = require('socks-proxy-agent');
const config = require('../../config');

function getTorAgent() {
  const { host, port } = config.tor;
  return new SocksProxyAgent(`socks5://${host}:${port}`);
}

function getPuppeteerTorArgs() {
  const { host, port } = config.tor;
  return [`--proxy-server=socks5://${host}:${port}`];
}

module.exports = { getTorAgent, getPuppeteerTorArgs };
