// tests/video/extractor.test.js
jest.mock('fluent-ffmpeg');

let extractFrames;

beforeEach(() => {
  jest.resetModules();
  jest.mock('fluent-ffmpeg');
  extractFrames = require('../../src/video/extractor').extractFrames;
});

const path = require('path');
const os = require('os');
const fs = require('fs');

it('calls ffmpeg with fps filter and resolves frame list', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frames-'));
  fs.writeFileSync(path.join(tmpDir, 'frame-0001.jpg'), '');

  const runMock = jest.fn();
  let endCallback;
  
  const onMock = jest.fn((event, cb) => {
    if (event === 'end') {
      endCallback = cb;
    }
    return { on: onMock, run: runMock };
  });
  
  const outputMock = jest.fn(() => ({ on: onMock }));
  const outputOptionsMock = jest.fn(() => ({ output: outputMock }));

  require('fluent-ffmpeg').mockReturnValue({ outputOptions: outputOptionsMock });

  const promise = extractFrames('/fake/video.mp4', tmpDir);
  
  // Trigger the end callback to resolve the promise
  if (endCallback) {
    setImmediate(endCallback);
  }
  
  const frames = await promise;

  expect(outputOptionsMock).toHaveBeenCalledWith(
    expect.arrayContaining([expect.stringContaining('fps=1/')])
  );
  expect(frames).toHaveLength(1);
  expect(frames[0]).toMatchObject({ index: 0 });

  fs.rmSync(tmpDir, { recursive: true });
});
