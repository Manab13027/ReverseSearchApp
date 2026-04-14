// tests/tor/proxy.test.js
const { getTorAgent, getPuppeteerTorArgs } = require('../../src/tor/proxy');

describe('getTorAgent', () => {
  it('returns an agent with correct proxy hostname', () => {
    const agent = getTorAgent();
    expect(agent).toBeDefined();
    expect(agent.proxy.host).toBe('127.0.0.1');
    expect(Number(agent.proxy.port)).toBe(9050);
  });
});

describe('getPuppeteerTorArgs', () => {
  it('returns socks5 proxy server arg', () => {
    const args = getPuppeteerTorArgs();
    expect(args).toContain('--proxy-server=socks5://127.0.0.1:9050');
  });
});
