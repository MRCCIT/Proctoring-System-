import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config/index.js';

let s3 = null;

function getS3() {
  if (!s3) {
    const opts = {
      region: config.s3Region,
      credentials: {
        accessKeyId: config.s3AccessKeyId,
        secretAccessKey: config.s3SecretAccessKey,
      },
    };
    if (config.s3Endpoint) {
      opts.endpoint = config.s3Endpoint;
      opts.forcePathStyle = config.s3ForcePathStyle;
    }
    s3 = new S3Client(opts);
  }
  return s3;
}

export async function s3PutBuffer(key, buf, contentType) {
  await getS3().send(
    new PutObjectCommand({
      Bucket: config.s3Bucket,
      Key: key,
      Body: buf,
      ContentType: contentType || 'application/octet-stream',
    })
  );
  return { key, bytes: buf.length };
}

export async function s3ReadBuffer(key) {
  const out = await getS3().send(
    new GetObjectCommand({
      Bucket: config.s3Bucket,
      Key: key,
    })
  );
  const chunks = [];
  for await (const chunk of out.Body) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function s3Exists(key) {
  try {
    await getS3().send(
      new HeadObjectCommand({
        Bucket: config.s3Bucket,
        Key: key,
      })
    );
    return true;
  } catch {
    return false;
  }
}

export async function s3Stat(key) {
  try {
    const head = await getS3().send(
      new HeadObjectCommand({
        Bucket: config.s3Bucket,
        Key: key,
      })
    );
    return { size: head.ContentLength || 0, mtime: head.LastModified };
  } catch {
    return null;
  }
}

export async function createPresignedPutUrl(key, contentType, expiresIn = config.presignTtlSeconds) {
  const command = new PutObjectCommand({
    Bucket: config.s3Bucket,
    Key: key,
    ContentType: contentType || 'application/octet-stream',
  });
  const upload_url = await getSignedUrl(getS3(), command, { expiresIn });
  return { upload_url, object_key: key, expires_in: expiresIn };
}

export async function createPresignedGetUrl(key, expiresIn = config.presignTtlSeconds) {
  const command = new GetObjectCommand({
    Bucket: config.s3Bucket,
    Key: key,
  });
  const download_url = await getSignedUrl(getS3(), command, { expiresIn });
  return { download_url, object_key: key, expires_in: expiresIn };
}
