import type {
  BroadcastResponse,
  CreateGroupRequest,
  GroupResponse,
  ListGroupMembersResponse,
  ListGroupsResponse,
  ListMessagesResponse,
  UpdateGroupRequest,
} from '@text-them/shared';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080';

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
        'Content-Type': 'application/json',
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
    broadcast: (id: string, body: string) =>
      request<BroadcastResponse>(`/api/groups/${id}/broadcast`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      }),
    listMessages: () => request<ListMessagesResponse>('/api/messages'),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
export { ApiError };
