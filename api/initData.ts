import services from '../JSON/services.json';
import countries from '../JSON/countries.json';
import { getPrices } from './getPrices';
// import { getNumbersStatus } from './getNumbersStatus';

export type Country = {
  id: number;
  en_name: string;
  ru_name: string;
  emoji: string;
  operators: string[];
  services: {
    [serviceId: Service['id']]: Service;
  };
};

export type Service = {
  id: string;
  name: string;
  price: number;
  count: number;
};

type InitDataResult = {
  [countryId: Country['id']]: Country;
};

export async function initData(): Promise<InitDataResult> {
  const start = performance.now();
  const result: InitDataResult = {};

  const prices = await getPrices();

  // Создаем объекты для быстрого поиска стран и услуг
  const countryMap = countries.reduce((map, country) => {
    map[country.id] = { ...country, services: {} };
    return map;
  }, {} as { [id: number]: Country });

  const serviceMap = services.reduce((map, service) => {
    map[service.id] = service.name;
    return map;
  }, {} as { [id: string]: string });

  for (const [countryId, serviceData] of Object.entries(prices)) {
    const countryIdNumber = Number(countryId);
    const country = countryMap[countryIdNumber];
    if (country) {
      for (const [serviceId, priceCounts] of Object.entries(serviceData)) {
        let totalCount = 0;
        let minPrice = Number.MAX_VALUE;
        for (const [price, count] of Object.entries(priceCounts)) {
          const priceNumber = parseFloat(price);
          minPrice = Math.min(minPrice, priceNumber);
          totalCount += count;
        }
        const service: Service = {
          id: serviceId,
          name: serviceMap[serviceId] || serviceId,
          price: minPrice,
          count: totalCount,
        };
        country.services[serviceId] = service;
      }
      result[countryIdNumber] = {
        ...country,
        ru_name: country.ru_name,
        en_name: country.en_name,
      };
    }
  }

  console.log('initData', performance.now() - start);
  return result;
}
