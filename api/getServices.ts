import { apiUrl } from './const/apiUrl';
import services from '../JSON/services.json';

type Service = (typeof services)[number] & { count: number };
type ApiResponse = { [key: string]: string };

const cache: Map<number, Service[]> = new Map();

export const getServices = async (countryId: number): Promise<Service[]> => {
  if (cache.has(countryId)) return cache.get(countryId)!;

  try {
    const response = await fetch(
      `${apiUrl}&action=getNumbersStatus&country=${countryId}`
    );

    if (!response.ok) return [];

    const data: ApiResponse = await response.json();
    const result: Service[] = services.reduce((acc, item) => {
      const key = `${item.id}_0`;
      if (data[key]) {
        acc.push({
          id: item.id,
          name: item.name,
          count: Number(data[key]),
        });
      }
      return acc;
    }, [] as Service[]);

    cache.set(countryId, result);
    return result;
  } catch (error) {
    console.error(`Failed to fetch services for country ${countryId}:`, error);
    return [];
  }
};
