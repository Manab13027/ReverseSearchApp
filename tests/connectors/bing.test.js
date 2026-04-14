// tests/connectors/bing.test.js
const mockResponse = {
  data: {
    tags: [{
      actions: [{
        actionType: 'PagesIncluding',
        data: {
          value: [
            { hostPageUrl: 'https://page.com', name: 'Page Title', thumbnailUrl: 'https://page.com/thumb.jpg' },
          ],
        },
      }],
    }],
  },
};

describe('Bing Visual Search Connector', () => {
  it('returns normalized results', async () => {
    jest.resetModules();
    jest.mock('axios', () => ({ post: jest.fn().mockResolvedValue(mockResponse) }));
    jest.mock('fs', () => ({ createReadStream: jest.fn().mockReturnValue('stream') }));
    jest.mock('../../config', () => ({ bing: { apiKey: 'test-key' } }));
    const { search } = require('../../src/connectors/bing');
    const results = await search({ imagePath: '/fake/img.jpg', sourceFile: 'img.jpg', frameIndex: null, useTor: false });
    expect(results[0]).toMatchObject({ engine: 'bing', url: 'https://page.com', title: 'Page Title' });
  });

  it('returns disabled when no API key', async () => {
    jest.resetModules();
    jest.mock('../../config', () => ({ bing: { apiKey: '' } }));
    const { search } = require('../../src/connectors/bing');
    const result = await search({ imagePath: '/fake/img.jpg', sourceFile: 'img.jpg', frameIndex: null, useTor: false });
    expect(result).toMatchObject({ disabled: true });
  });
});
