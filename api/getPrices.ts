// Docs: https://www.smshub.org/ru/info#getPrices

import { apiUrl } from './const/apiUrl';

export type ApiResponse = {
  [countryId: string]: {
    [serviceId: string]: {
      [price: number]: number;
    };
  };
};

export async function getPrices(
  countryId?: number,
  serviceId?: string
): Promise<ApiResponse> {
  const query = new URLSearchParams({
    action: 'getPrices',
  });

  if (countryId) query.set('country', String(countryId));
  if (serviceId) query.set('service', serviceId);

  const response = await fetch(`${apiUrl}&${query.toString()}`);

  if (!response.ok) {
    throw new Error(`Error fetching: ${response.statusText}`);
  }

  return response.json() as Promise<ApiResponse>;
}
