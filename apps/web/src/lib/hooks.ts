import { useAuth } from '@clerk/clerk-react';
import { useMemo } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import type { CreateGroupRequest, UpdateGroupRequest } from '@text-them/shared';
import { createApiClient, type ApiClient } from './api';

/** Builds an API client bound to the current Clerk session token. */
export function useApiClient(): ApiClient {
  const { getToken } = useAuth();
  return useMemo(() => createApiClient(() => getToken()), [getToken]);
}

export function useGroups() {
  const api = useApiClient();
  return useQuery({
    queryKey: ['groups'],
    queryFn: () => api.listGroups().then((r) => r.groups),
  });
}

export function useGroup(id: string) {
  const api = useApiClient();
  return useQuery({
    queryKey: ['groups', id],
    queryFn: () => api.getGroup(id).then((r) => r.group),
  });
}

export function useGroupMembers(id: string) {
  const api = useApiClient();
  return useQuery({
    queryKey: ['groups', id, 'members'],
    queryFn: () => api.listGroupMembers(id).then((r) => r.members),
  });
}

export function useMessages() {
  const api = useApiClient();
  return useQuery({
    queryKey: ['messages'],
    queryFn: () => api.listMessages().then((r) => r.messages),
  });
}

export function useCreateGroup() {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateGroupRequest) => api.createGroup(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groups'] }),
  });
}

export function useUpdateGroup(): UseMutationResult<
  unknown,
  Error,
  { id: string; body: UpdateGroupRequest }
> {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }) => api.updateGroup(id, body),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['groups'] });
      qc.invalidateQueries({ queryKey: ['groups', id] });
    },
  });
}

export function useDeleteGroup() {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteGroup(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groups'] }),
  });
}

export function useBroadcast(groupId: string) {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => api.broadcast(groupId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['messages'] }),
  });
}
