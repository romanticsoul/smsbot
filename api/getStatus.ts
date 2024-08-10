// Docs: https://www.smshub.org/ru/info#getStatus

import { apiUrl } from './const/apiUrl';

export type ApiResponse =
  | 'STATUS_WAIT_CODE'
  | `STATUS_WAIT_RETRY:${string}`
  | 'STATUS_CANCEL'
  | `STATUS_OK:${string}`;

export async function getStatus(id: number): Promise<ApiResponse> {
  const query = new URLSearchParams({
    action: 'getStatus',
    id: String(id),
  });

  const response = await fetch(`${apiUrl}&${query.toString()}`);

  if (!response.ok) {
    if (response.statusText === 'Too Many Requests') {
      return getStatus(id);
    }
    throw new Error(`Error fetching: ${response.statusText}`);
  }

  return response.text() as Promise<ApiResponse>;
}
