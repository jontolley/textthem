import type { FastifyInstance } from 'fastify';
import type { UploadMediaResponse } from '@text-them/shared';
import { HttpError, badRequest, notFound } from '../errors.js';
import {
  MAX_MEDIA_BYTES,
  MEDIA_TYPES,
  type LocalMediaStore,
  type MediaStore,
  type MediaType,
} from '../services/media.js';

/** Each type's first bytes, so a file can't claim to be an image it isn't. */
const SIGNATURES: Record<MediaType, number[]> = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'image/gif': [0x47, 0x49, 0x46, 0x38],
};

function matchesType(bytes: Buffer, type: MediaType): boolean {
  return SIGNATURES[type].every((b, i) => bytes[i] === b);
}

export interface MediaRoutesOptions {
  /** Absent when there's nowhere to keep images; uploads then answer 503. */
  media?: MediaStore;
}

/** `POST /api/media`: stores a broadcast image (the raw bytes are the body) and returns its URL. */
export async function mediaRoutes(
  fastify: FastifyInstance,
  { media }: MediaRoutesOptions,
): Promise<void> {
  fastify.addHook('preHandler', fastify.requireAuth);

  fastify.addContentTypeParser(
    Object.keys(MEDIA_TYPES),
    { parseAs: 'buffer', bodyLimit: MAX_MEDIA_BYTES },
    (_request, body, done) => done(null, body),
  );

  fastify.post('/api/media', async (request, reply): Promise<UploadMediaResponse> => {
    if (!media) {
      throw new HttpError(503, 'media_unavailable', "Images aren't set up on this server");
    }
    const type = request.headers['content-type']?.split(';')[0].trim() as MediaType;
    const bytes = request.body;
    if (!Buffer.isBuffer(bytes) || bytes.length === 0)
      throw badRequest('Send the image as the body');
    if (!matchesType(bytes, type)) throw badRequest("That file isn't the image type it says it is");

    const mediaUrl = await media.put(bytes, type);
    reply.code(201);
    return { mediaUrl };
  });
}

/** Local dev only: serves the images a local store keeps, so the dashboard can show them. */
export async function localMediaRoutes(
  fastify: FastifyInstance,
  { store }: { store: LocalMediaStore },
): Promise<void> {
  fastify.get<{ Params: { name: string } }>('/media/:name', async (request, reply) => {
    const file = await store.read(request.params.name);
    if (!file) throw notFound('Image not found');
    return reply.type(file.contentType).send(file.bytes);
  });
}
