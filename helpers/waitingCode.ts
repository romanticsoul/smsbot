import { getStatus } from '../api/getStatus';

type WaitingCodeReturn = string | null;

function getCurrentTime(): string {
  const now = new Date();

  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  return `${hours}:${minutes}:${seconds}`;
}

export async function waitingCode(id: number): Promise<WaitingCodeReturn> {
  const status = await getStatus(Number(id));
  console.log(status);

  if (status === 'STATUS_WAIT_CODE' || /^STATUS_WAIT_RETRY:(.+)$/.test(status)) {
    console.log(getCurrentTime(), 'Ожидает кода');

    await new Promise((resolve) => setTimeout(resolve, 2000));
    return waitingCode(id);
  }

  if (status === 'STATUS_CANCEL') {
    return null;
  }

  const match = status.match(/^STATUS_OK:(.*)$/);
  if (match) return match[1];

  return null;
}
