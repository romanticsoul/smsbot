export async function getUsdToRubRate(): Promise<number> {
  const response = await fetch('https://www.cbr-xml-daily.ru/daily_json.js');
  const data = await response.json();

  const usdRate = data.Valute.USD.Value;
  return usdRate;
}
