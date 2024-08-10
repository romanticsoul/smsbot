import { getStatus } from '../api/getStatus';

type WaitingCodeReturn = string | null;

export async function waitingCode(id: number): Promise<WaitingCodeReturn> {
  const status = await getStatus(Number(id));

  if (status === 'STATUS_WAIT_CODE' || /^STATUS_WAIT_RETRY:(.+)$/.test(status)) {
    console.log('Ожидает кода');
    return waitingCode(id);
  }

  if (status === 'STATUS_CANCEL') {
    return null;
  }

  const match = status.match(/^STATUS_OK:(.*)$/);
  if (match) return match[1];

  return null;
}
