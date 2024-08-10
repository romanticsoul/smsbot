// Docs: https://www.smshub.org/ru/info#getNumber

import { apiUrl } from './const/apiUrl';
import type { Country, Service } from './initData';

export type ApiResponse =
  | 'NO_NUMBERS'
  | 'NO_BALANCE'
  | 'API_KEY_NOT_VALID'
  | 'WRONG_SERVICE'
  | `ACCESS_NUMBER:${string}:${string}`;

export async function getNumber(
  countryId: Country['id'],
  serviceId: Service['id']
): Promise<ApiResponse> {
  const query = new URLSearchParams({
    action: 'getNumber',
    country: countryId.toString(),
    service: serviceId,
  });

  const response = await fetch(`${apiUrl}&${query.toString()}`);

  if (!response.ok) {
    if (response.statusText === 'Too Many Requests') {
      return getNumber(countryId, serviceId);
    }
    throw new Error(`Error fetching: ${response}`);
  }

  return response.text() as Promise<ApiResponse>;
}
