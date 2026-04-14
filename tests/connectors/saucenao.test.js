// tests/connectors/saucenao.test.js
const mockResponse = {
  data: {
    results: [
      {
        header: { similarity: '92.50', thumbnail: 'https://saucenao.com/thumb.jpg', index_name: 'Pixiv' },
        data: { ext_urls: ['https://pixiv.net/artworks/123'] },
      },
    ],
  },
};

describe('SauceNAO Connector', () => {
  it('returns results with score as 0-1 float', async () => {
    jest.resetModules();
    jest.mock('axios', () => ({ post: jest.fn().mockResolvedValue(mockResponse) }));
    jest.mock('fs', () => ({ createReadStream: jest.fn().mockReturnValue('stream') }));
    jest.mock('../../config', () => ({ saucenao: { apiKey: 'test-key' } }));
    const { search } = require('../../src/connectors/saucenao');
    const results = await search({ imagePath: '/fake/img.jpg', sourceFile: 'img.jpg', frameIndex: null, useTor: false });
    expect(results[0]).toMatchObject({
      engine: 'saucenao',
      url: 'https://pixiv.net/artworks/123',
      score: 0.925,
      title: 'Pixiv',
    });
  });

  it('returns disabled when no API key', async () => {
    jest.resetModules();
    jest.mock('../../config', () => ({ saucenao: { apiKey: '' } }));
    const { search } = require('../../src/connectors/saucenao');
    const result = await search({ imagePath: '/fake/img.jpg', sourceFile: 'img.jpg', frameIndex: null, useTor: false });
    expect(result).toMatchObject({ disabled: true });
  });
});
