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
  payment_method: Record<string, any>;
  captured_at: string;
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

export async function getPaymentStatus(paymentId: string): Promise<Payment> {
  const url = 'https://api.yookassa.ru/v3/payments';
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secretKey = process.env.YOOKASSA_SECRET_KEY;

  const headers = {
    Authorization: 'Basic ' + Buffer.from(`${shopId}:${secretKey}`).toString('base64'),
    'Content-Type': 'application/json',
  };

  const response = await fetch(`${url}/${paymentId}`, {
    headers: headers,
  });

  if (!response.ok) {
    throw new Error(`Error fetching: ${response.statusText}`);
  }

  return response.json();
}
