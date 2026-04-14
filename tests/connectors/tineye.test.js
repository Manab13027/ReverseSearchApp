// tests/connectors/tineye.test.js
const mockResponse = {
  data: {
    results: {
      matches: [
        { image_url: 'https://site.com/img.jpg', domain: 'site.com', score: 0.95, thumbnail_url: 'https://site.com/thumb.jpg' },
      ],
    },
  },
};

it('returns normalized results', async () => {
  jest.resetModules();
  jest.mock('axios', () => ({ post: jest.fn().mockResolvedValue(mockResponse) }));
  jest.mock('fs', () => ({ createReadStream: jest.fn().mockReturnValue('stream') }));
  jest.mock('../../config', () => ({ tineye: { apiKey: 'test-key' } }));
  const { search } = require('../../src/connectors/tineye');
  const results = await search({ imagePath: '/fake/img.jpg', sourceFile: 'img.jpg', frameIndex: null, useTor: false });
  expect(results[0]).toMatchObject({ engine: 'tineye', url: 'https://site.com/img.jpg', score: 0.95 });
});

it('returns disabled when no API key', async () => {
  jest.resetModules();
  jest.mock('../../config', () => ({ tineye: { apiKey: '' } }));
  const { search } = require('../../src/connectors/tineye');
  const result = await search({ imagePath: '/fake/img.jpg', sourceFile: 'img.jpg', frameIndex: null, useTor: false });
  expect(result).toMatchObject({ disabled: true });
});
