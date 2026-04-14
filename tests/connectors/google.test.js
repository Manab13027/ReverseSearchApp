// tests/connectors/google.test.js
const mockVisionResponse = {
  data: {
    responses: [{
      webDetection: {
        pagesWithMatchingImages: [
          {
            url: 'https://example.com/page',
            pageTitle: 'Example',
            score: 0.98,
            fullMatchingImages: [{ url: 'https://example.com/thumb.jpg' }],
          },
        ],
        webEntities: [{ description: 'Test entity' }],
      },
    }],
  },
};

it('returns normalized results from Vision API', async () => {
  jest.resetModules();
  jest.mock('axios', () => ({ post: jest.fn().mockResolvedValue(mockVisionResponse) }));
  jest.mock('fs', () => ({ readFileSync: jest.fn().mockReturnValue(Buffer.from('img')) }));
  jest.mock('../../config', () => ({ google: { apiKey: 'k', cx: 'cx' } }));
  const { search } = require('../../src/connectors/google');
  const results = await search({ imagePath: '/fake/img.jpg', sourceFile: 'img.jpg', frameIndex: null, useTor: false });
  expect(Array.isArray(results)).toBe(true);
  expect(results[0]).toMatchObject({
    engine: 'google',
    url: 'https://example.com/page',
    title: 'Example',
    score: 0.98,
    sourceFile: 'img.jpg',
    frameIndex: null,
  });
});

it('returns disabled object when API key missing', async () => {
  jest.resetModules();
  jest.mock('../../config', () => ({ google: { apiKey: '', cx: '' } }));
  const { search } = require('../../src/connectors/google');
  const result = await search({ imagePath: '/fake/img.jpg', sourceFile: 'img.jpg', frameIndex: null, useTor: false });
  expect(result).toMatchObject({ engine: 'google', disabled: true });
});
