// tests/connectors/yandex.test.js
jest.mock('puppeteer');
const puppeteer = require('puppeteer');

const mockEvaluate = jest.fn().mockResolvedValue([
  { url: 'https://result.com/page', title: 'Result Page', thumbnail: 'https://result.com/thumb.jpg' },
]);
const mockPage = {
  setUserAgent: jest.fn().mockResolvedValue(),
  goto: jest.fn().mockResolvedValue(),
  click: jest.fn().mockResolvedValue(),
  waitForSelector: jest.fn().mockResolvedValue(),
  waitForNavigation: jest.fn().mockResolvedValue(),
  $: jest.fn().mockResolvedValue({ uploadFile: jest.fn().mockResolvedValue() }),
  evaluate: mockEvaluate,
};
const mockBrowser = {
  newPage: jest.fn().mockResolvedValue(mockPage),
  close: jest.fn().mockResolvedValue(),
};
puppeteer.launch.mockResolvedValue(mockBrowser);

describe('Yandex Puppeteer Connector', () => {
  it('returns normalized results from Yandex', async () => {
    const { search } = require('../../src/connectors/yandex');
    const results = await search({ imagePath: '/fake/img.jpg', sourceFile: 'img.jpg', frameIndex: null, useTor: false });
    expect(puppeteer.launch).toHaveBeenCalledWith(expect.objectContaining({ headless: 'new' }));
    expect(results[0]).toMatchObject({ engine: 'yandex', url: 'https://result.com/page', score: null });
  });

  it('closes browser even on navigation error', async () => {
    jest.clearAllMocks();
    mockPage.goto.mockRejectedValueOnce(new Error('navigation failed'));
    const { search } = require('../../src/connectors/yandex');
    await expect(
      search({ imagePath: '/fake/img.jpg', sourceFile: 'img.jpg', frameIndex: null, useTor: false })
    ).rejects.toThrow('navigation failed');
    expect(mockBrowser.close).toHaveBeenCalled();
  });
});
