// Docs: https://www.smshub.org/ru/info#getNumbersStatus

import { apiUrl } from './const/apiUrl';

export type ApiResponse = {
  [key: string]: number;
};

export async function getNumbersStatus(countryId: number): Promise<ApiResponse> {
  const query = new URLSearchParams({
    action: 'getNumbersStatus',
    country: String(countryId),
  });

  const response = await fetch(`${apiUrl}&${query.toString()}`);

  if (!response.ok) {
    throw new Error(`Error fetching: ${response.statusText}`);
  }

  return response.json() as Promise<ApiResponse>;
}
