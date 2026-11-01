import { useAuth } from '@clerk/clerk-react';
import { useEffect, useMemo, useRef } from 'react';
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
  type UseMutationResult,
} from '@tanstack/react-query';
import type {
  ChangeTopic,
  CreateGroupRequest,
  SubscriptionStatus,
  UpdateGroupRequest,
  UpdateScheduledBroadcastRequest,
} from '@text-them/shared';
import { createApiClient, type ApiClient } from './api';
import { runLiveUpdates } from './live';

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

/**
 * A group's current members (`subscribed`) or the people who left it
 * (`unsubscribed`), fetched a page at a time and optionally filtered by `q`.
 */
export function useGroupMembers(id: string, status: SubscriptionStatus, q: string) {
  const api = useApiClient();
  return useInfiniteQuery({
    queryKey: ['groups', id, 'members', status, q],
    queryFn: ({ pageParam }) =>
      api.listGroupMembers(id, { status, q, offset: pageParam, limit: PAGE_SIZE }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.members.length, 0);
      return loaded < last.matched ? loaded : undefined;
    },
    // Keep the current rows on screen while a new filter loads.
    placeholderData: keepPreviousData,
  });
}

/** How many rows each request fetches as a list scrolls. */
export const PAGE_SIZE = 15;

/**
 * Scheduled broadcasts (soonest first) or the rest (most recent first),
 * fetched a page at a time.
 */
export function useMessageList(list: 'scheduled' | 'history') {
  const api = useApiClient();
  return useInfiniteQuery({
    queryKey: ['messages', list],
    queryFn: ({ pageParam }) => api.listMessages({ list, offset: pageParam, limit: PAGE_SIZE }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.messages.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
  });
}

/** One group's scheduled broadcasts, soonest first (up to 100). */
export function useGroupScheduled(groupId: string) {
  const api = useApiClient();
  return useQuery({
    queryKey: ['messages', 'scheduled', groupId],
    queryFn: () =>
      api.listMessages({ list: 'scheduled', groupId, limit: 100 }).then((r) => r.messages),
  });
}

/** Texts people sent to the org's number, most recent first. */
export function useInboundMessages() {
  const api = useApiClient();
  return useQuery({
    queryKey: ['inbound'],
    queryFn: () => api.listInboundMessages().then((r) => r.messages),
  });
}

/** The signed-in organizer. A 403 means this account isn't an organizer. */
export function useMe() {
  const api = useApiClient();
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api.getMe(),
    retry: false,
  });
}

/** The running API's build; always refetched so a fresh deploy shows up. */
export function useApiVersion() {
  const api = useApiClient();
  return useQuery({
    queryKey: ['version'],
    queryFn: () => api.getVersion().then((r) => r.api),
    staleTime: 0,
  });
}

/** The cached queries each change topic covers (matched by key prefix, so a group's members too). */
const TOPIC_QUERY_KEYS: Record<ChangeTopic, QueryKey> = {
  groups: ['groups'],
  messages: ['messages'],
  inbound: ['inbound'],
};

/**
 * Keeps the dashboard current without a refresh: refetches whatever the API's
 * change stream says changed, and everything after a reconnect. Mount it once,
 * in the signed-in layout.
 */
export function useLiveUpdates(): void {
  const { getToken } = useAuth();
  const qc = useQueryClient();
  // Read through a ref so a new getToken identity doesn't reopen the stream.
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  useEffect(() => {
    const controller = new AbortController();
    void runLiveUpdates(
      () => getTokenRef.current(),
      {
        onChange: (topic) => qc.invalidateQueries({ queryKey: TOPIC_QUERY_KEYS[topic] }),
        onReconnect: () => qc.invalidateQueries(),
      },
      controller.signal,
    );
    return () => controller.abort();
  }, [qc]);
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

/** Names a member (an empty name clears it); the name shows in all their groups. */
export function useUpdateMemberName() {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.updateMember(id, name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['groups'] }),
  });
}

/** Sends now, or schedules when `sendAt` (ISO) is given. */
export function useBroadcast(groupId: string) {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ body, sendAt }: { body: string; sendAt?: string }) =>
      api.broadcast(groupId, body, sendAt),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['messages'] }),
  });
}

export function useUpdateScheduledBroadcast() {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateScheduledBroadcastRequest }) =>
      api.updateScheduledBroadcast(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['messages'] }),
  });
}

export function useCancelScheduledBroadcast() {
  const api = useApiClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.cancelScheduledBroadcast(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['messages'] }),
  });
}
