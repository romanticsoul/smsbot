// Docs: https://www.smshub.org/ru/info#setStatus

/**
Сразу после получения номера доступны следующие действия:
8 - Отменить активацию
1 - Сообщить, что SMS отправлена (необязательно)
Для активации со статусом 1:
8 - Отменить активацию
Сразу после получения кода:
3 - Запросить еще одну смс
6 - Подтвердить SMS-код и завершить активацию
Для активации со статусом 3:
6 - Подтвердить SMS-код и завершить активацию
 */

import { apiUrl } from './const/apiUrl';

export type ApiResponse =
  | 'ACCESS_READY'
  | 'ACCESS_RETRY_GET'
  | 'ACCESS_ACTIVATION'
  | 'ACCESS_CANCEL';

type SetStatusProps = {
  id: number;
  status: 8 | 1 | 3 | 6;
};

export async function setStatus({ id, status }: SetStatusProps): Promise<ApiResponse> {
  const query = new URLSearchParams({
    action: 'setStatus',
    id: String(id),
    status: String(status),
  });

  const response = await fetch(`${apiUrl}&${query.toString()}`);

  if (!response.ok) {
    if (response.statusText === 'Too Many Requests') {
      return setStatus({ id, status });
    }
    throw new Error(`Error fetching: ${response.statusText}`);
  }

  return response.text() as Promise<ApiResponse>;
}
