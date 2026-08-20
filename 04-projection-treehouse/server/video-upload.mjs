import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Transform } from 'node:stream';
import { finished } from 'node:stream/promises';
import Busboy from 'busboy';

const VIDEO_SIGNATURES = [
  { mime: 'video/mp4', matches: (bytes) => bytes.length >= 12 && bytes.subarray(4, 8).toString('ascii') === 'ftyp' },
  { mime: 'video/webm', matches: (bytes) => bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) },
  { mime: 'video/x-msvideo', matches: (bytes) => bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'AVI ' },
  { mime: 'video/ogg', matches: (bytes) => bytes.length >= 4 && bytes.subarray(0, 4).toString('ascii') === 'OggS' },
  { mime: 'video/mpeg', matches: (bytes) => bytes.length >= 4 && bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && (bytes[3] === 0xba || bytes[3] === 0xb3) },
];

function uploadError(code, status, publicMessage) {
  return Object.assign(new Error(code), { status, publicMessage });
}

function contentTypeHeader(headers) {
  return String(headers?.['content-type'] || headers?.get?.('content-type') || '');
}

function contentLengthHeader(headers) {
  return Number(headers?.['content-length'] || headers?.get?.('content-length') || 0);
}

class ByteLimitTransform extends Transform {
  constructor(limit) {
    super();
    this.limit = limit;
    this.size = 0;
  }

  _transform(chunk, encoding, callback) {
    this.size += chunk.length;
    if (this.size > this.limit) return callback(uploadError('payload-too-large', 413, '上传请求超过允许大小。'));
    callback(null, chunk);
  }
}

async function detectVideoMime(filePath) {
  const handle = await fs.open(filePath, 'r');
  try {
    const bytes = Buffer.alloc(32);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    const header = bytes.subarray(0, bytesRead);
    return VIDEO_SIGNATURES.find((signature) => signature.matches(header))?.mime || '';
  } finally {
    await handle.close();
  }
}

export async function receiveVideoMultipart(request, {
  maxVideoBytes,
  tempDir = path.join(os.tmpdir(), 'zhere-video-uploads'),
  envelopeBytes = 1024 * 1024,
} = {}) {
  const maxBytes = Number(maxVideoBytes);
  if (!Number.isFinite(maxBytes) || maxBytes < 1) throw new TypeError('maxVideoBytes must be positive.');
  const declaredSize = contentLengthHeader(request.headers);
  const requestLimit = maxBytes + envelopeBytes;
  if (Number.isFinite(declaredSize) && declaredSize > requestLimit) {
    throw uploadError('payload-too-large', 413, `视频不能超过 ${Math.floor(maxBytes / 1024 / 1024)}MB。`);
  }

  await fs.mkdir(tempDir, { recursive: true });
  const fields = new Map();
  let tempPath = '';
  let fileName = '';
  let declaredMime = '';
  let fileSize = 0;
  let fileSeen = false;
  let fileCompletion = Promise.resolve();
  let settled = false;

  const cleanup = async () => {
    if (tempPath) await fs.rm(tempPath, { force: true }).catch(() => {});
  };

  try {
    const result = await new Promise((resolve, reject) => {
      const fail = (error) => {
        if (settled) return;
        settled = true;
        reject(error?.status ? error : uploadError('invalid-multipart', 400, '视频上传格式无效。'));
      };
      let parser;
      try {
        parser = Busboy({
          headers: { 'content-type': contentTypeHeader(request.headers) },
          limits: { fileSize: maxBytes, files: 1, fields: 24, fieldSize: 16 * 1024, parts: 25 },
        });
      } catch (error) {
        fail(error);
        return;
      }

      const limiter = new ByteLimitTransform(requestLimit);
      request.once('aborted', () => fail(uploadError('upload-aborted', 400, '视频上传已中断。')));
      request.once('error', fail);
      limiter.once('error', fail);
      parser.once('error', fail);

      parser.on('field', (name, value, info) => {
        if (info?.valueTruncated) return fail(uploadError('field-too-large', 400, '上传信息字段过长。'));
        fields.set(String(name), String(value));
      });
      parser.on('file', (name, stream, info = {}) => {
        if (name !== 'file' || fileSeen) {
          stream.resume();
          return fail(uploadError('invalid-media', 400, '每次只能上传一个视频文件。'));
        }
        fileSeen = true;
        fileName = path.basename(String(info.filename || 'video')).slice(0, 180);
        declaredMime = String(info.mimeType || '').toLowerCase();
        tempPath = path.join(tempDir, `${Date.now()}-${randomUUID()}.upload`);
        const output = createWriteStream(tempPath, { flags: 'wx', mode: 0o600 });
        stream.on('data', (chunk) => { fileSize += chunk.length; });
        stream.once('limit', () => fail(uploadError('media-too-large', 413, `视频不能超过 ${Math.floor(maxBytes / 1024 / 1024)}MB。`)));
        stream.once('error', fail);
        output.once('error', fail);
        stream.pipe(output);
        fileCompletion = finished(output);
      });
      parser.once('filesLimit', () => fail(uploadError('invalid-media', 400, '每次只能上传一个视频文件。')));
      parser.once('fieldsLimit', () => fail(uploadError('invalid-multipart', 400, '上传信息字段数量过多。')));
      parser.once('partsLimit', () => fail(uploadError('invalid-multipart', 400, '上传内容分段数量过多。')));
      parser.once('close', async () => {
        if (settled) return;
        try {
          await fileCompletion;
          if (!fileSeen || !tempPath || fileSize < 1) throw uploadError('invalid-media', 400, '请选择有效视频文件。');
          if (fileSize > maxBytes) throw uploadError('media-too-large', 413, `视频不能超过 ${Math.floor(maxBytes / 1024 / 1024)}MB。`);
          const detectedMime = await detectVideoMime(tempPath);
          if (!detectedMime) throw uploadError('invalid-media-signature', 400, '文件内容不是支持的视频格式。');
          settled = true;
          resolve({
            fields,
            file: { fileName, declaredMime, mime: detectedMime, size: fileSize, path: tempPath },
          });
        } catch (error) { fail(error); }
      });

      request.pipe(limiter).pipe(parser);
    });
    return { ...result, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

