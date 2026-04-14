// tests/orchestrator.test.js
jest.mock('./src/connectors/google', () => ({
  ENGINE: 'google',
  search: jest.fn().mockResolvedValue([
    { engine: 'google', url: 'https://g.com', title: 'G', thumbnail: null, score: 0.9, sourceFile: 'img.jpg', frameIndex: null },
  ]),
}));
jest.mock('./src/connectors/tineye', () => ({ ENGINE: 'tineye', search: jest.fn().mockResolvedValue([]) }));
jest.mock('./src/connectors/bing', () => ({ ENGINE: 'bing', search: jest.fn().mockResolvedValue([]) }));
jest.mock('./src/connectors/saucenao', () => ({ ENGINE: 'saucenao', search: jest.fn().mockResolvedValue([]) }));
jest.mock('./src/connectors/yandex', () => ({ ENGINE: 'yandex', search: jest.fn().mockResolvedValue([]) }));
jest.mock('./src/connectors/baidu', () => ({ ENGINE: 'baidu', search: jest.fn().mockResolvedValue([]) }));
jest.mock('./src/video/extractor', () => ({ extractFrames: jest.fn().mockResolvedValue([]) }));

const { runSearch } = require('./src/orchestrator');

it('yields engine results for image files', async () => {
  const files = [{ path: '/fake/img.jpg', originalname: 'img.jpg' }];
  const yielded = [];
  for await (const chunk of runSearch({ files, engines: ['google'], useTor: false, jobDir: '/tmp/job' })) {
    yielded.push(chunk);
  }
  expect(yielded.length).toBeGreaterThan(0);
  expect(yielded[0]).toMatchObject({ engine: 'google' });
});

it('calls extractFrames for video files', async () => {
  const { extractFrames } = require('./src/video/extractor');
  const files = [{ path: '/fake/clip.mp4', originalname: 'clip.mp4' }];
  for await (const _ of runSearch({ files, engines: ['google'], useTor: false, jobDir: '/tmp/job' })) {}
  expect(extractFrames).toHaveBeenCalledWith('/fake/clip.mp4', expect.stringContaining('frames'));
});
