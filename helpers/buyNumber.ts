import { getNumber } from '../api/getNumber';
import type { Country, Service } from '../api/initData';

type BuyNumberReturn = {
  id: number;
  phone: number;
} | null;

export async function buyNumber(
  countryId: Country['id'],
  serviceId: Service['id'],
  signal: AbortSignal
): Promise<BuyNumberReturn> {
  const data = await getNumber(countryId, serviceId);
  const matches = data.match(/ACCESS_NUMBER:(\d+):(\d+)/);
  if (matches) {
    return {
      id: Number(matches[1]),
      phone: Number(matches[2]),
    };
  } else if (data === 'NO_NUMBERS') {
    console.log('Нет номера');
    if (signal.aborted) return null;

    // await new Promise((resolve) => setTimeout(resolve, 1000));
    return buyNumber(countryId, serviceId, signal);
  } else {
    console.error('Ошибка:', data);
    return null;
  }
}
