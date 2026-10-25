import type {
  BroadcastResponse,
  CreateGroupRequest,
  GroupResponse,
  ListGroupMembersResponse,
  ListInboundMessagesResponse,
  ListGroupsResponse,
  ListMessagesResponse,
  MeResponse,
  UpdateGroupRequest,
  UpdateScheduledBroadcastRequest,
  VersionResponse,
} from '@text-them/shared';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080';

export type TokenGetter = () => Promise<string | null>;

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function createApiClient(getToken: TokenGetter) {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await getToken();
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        // Only with a body: Fastify rejects an empty body sent as JSON.
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });

    if (!res.ok) {
      let message = res.statusText;
      try {
        const body = await res.json();
        message = body.message ?? message;
      } catch {
        // non-JSON error body; keep statusText
      }
      throw new ApiError(res.status, message);
    }

    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  return {
    listGroups: () => request<ListGroupsResponse>('/api/groups'),
    getGroup: (id: string) => request<GroupResponse>(`/api/groups/${id}`),
    createGroup: (body: CreateGroupRequest) =>
      request<GroupResponse>('/api/groups', { method: 'POST', body: JSON.stringify(body) }),
    updateGroup: (id: string, body: UpdateGroupRequest) =>
      request<GroupResponse>(`/api/groups/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    deleteGroup: (id: string) => request<void>(`/api/groups/${id}`, { method: 'DELETE' }),
    listGroupMembers: (id: string) =>
      request<ListGroupMembersResponse>(`/api/groups/${id}/members`),
    /** Sends now, or schedules when `sendAt` (ISO) is given. */
    broadcast: (id: string, body: string, sendAt?: string) =>
      request<BroadcastResponse>(`/api/groups/${id}/broadcast`, {
        method: 'POST',
        body: JSON.stringify({ body, sendAt }),
      }),
    listMessages: () => request<ListMessagesResponse>('/api/messages'),
    updateScheduledBroadcast: (id: string, body: UpdateScheduledBroadcastRequest) =>
      request<BroadcastResponse>(`/api/messages/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    cancelScheduledBroadcast: (id: string) =>
      request<BroadcastResponse>(`/api/messages/${id}/cancel`, { method: 'POST' }),
    listInboundMessages: () => request<ListInboundMessagesResponse>('/api/inbound-messages'),
    getVersion: () => request<VersionResponse>('/api/version'),
    getMe: () => request<MeResponse>('/api/me'),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
export { ApiError };
