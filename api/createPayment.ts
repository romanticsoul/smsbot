import { nanoid } from 'nanoid';

type Payment = {
  id: string;
  status: 'pending' | 'succeeded' | 'canceled' | 'waiting_for_capture';
  amount: {
    value: string;
    currency: string;
  };
  description?: string;
  recipient: {
    account_id: string;
    gateway_id: string;
  };
  created_at: string;
  confirmation: {
    type: 'redirect';
    confirmation_url: string;
    enforce?: boolean;
    return_url?: string;
  };
  test: boolean;
  paid: boolean;
  refundable: boolean;
  metadata?: Record<string, any>;
};

export async function createPayment(value: number): Promise<Payment> {
  const url = 'https://api.yookassa.ru/v3/payments';
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secretKey = process.env.YOOKASSA_SECRET_KEY;
  const idempotenceKey = nanoid();

  const headers = {
    Authorization: 'Basic ' + Buffer.from(`${shopId}:${secretKey}`).toString('base64'),
    'Idempotence-Key': idempotenceKey,
    'Content-Type': 'application/json',
  };

  const body = JSON.stringify({
    amount: {
      value: `${Math.ceil(value)}.00`,
      currency: 'RUB',
    },
    capture: true,
    confirmation: {
      type: 'redirect',
      return_url: 'https://t.me/dvdvdvleobot',
    },
    description: 'Заказ №' + idempotenceKey,
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: headers,
    body: body,
  });

  if (!response.ok) {
    throw new Error(`Error fetching: ${response.statusText}`);
  }

  return response.json();
}
