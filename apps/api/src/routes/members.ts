import { ObjectId } from 'mongodb';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { MemberResponse } from '@text-them/shared';
import { badRequest, notFound } from '../errors.js';
import { serializeMember } from '../serializers.js';

const updateMemberSchema = z.object({
  name: z.string().trim().max(80),
});

export async function memberRoutes(fastify: FastifyInstance): Promise<void> {
  const { members } = fastify.mongo.collections;

  fastify.addHook('preHandler', fastify.requireAuth);

  /** Names a member; an empty name clears it. The name shows in every group they're in. */
  fastify.patch<{ Params: { id: string } }>(
    '/api/members/:id',
    async (request): Promise<MemberResponse> => {
      if (!ObjectId.isValid(request.params.id)) throw badRequest('Invalid id');
      const id = new ObjectId(request.params.id);
      const { name } = updateMemberSchema.parse(request.body);

      const updated = await members.findOneAndUpdate(
        { _id: id },
        name ? { $set: { name } } : { $unset: { name: '' } },
        { returnDocument: 'after' },
      );
      if (!updated) throw notFound('Member not found');
      // Members show under groups, so dashboards refetch the groups topic.
      fastify.events.notify('groups');
      return { member: serializeMember(updated) };
    },
  );
}
