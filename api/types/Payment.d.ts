export interface Payment {
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
}
