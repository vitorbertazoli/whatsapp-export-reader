import { ChatData, Message } from './types';

type DateOrder = 'DMY' | 'MDY';

interface RawMessage {
  timestampRaw: string;
  sender: string;
  content: string;
}

const SYSTEM_SENDER = 'System';

export function parseWhatsAppChat(chatContent: string, chatFileName?: string): ChatData {
  const normalizedContent = normalizeChatContent(chatContent);
  const lines = normalizedContent.split('\n');
  const rawMessages: RawMessage[] = [];
  let currentRawMessage: RawMessage | null = null;

  for (const line of lines) {
    const parsedLine = parseMessageStart(line);

    if (parsedLine) {
      if (currentRawMessage) {
        rawMessages.push(currentRawMessage);
      }

      currentRawMessage = parsedLine;
      continue;
    }

    if (currentRawMessage) {
      currentRawMessage.content = currentRawMessage.content
        ? `${currentRawMessage.content}\n${line}`
        : line;
    }
  }

  if (currentRawMessage) {
    rawMessages.push(currentRawMessage);
  }

  const preferredDateOrder = detectDateOrder(rawMessages.map((message) => message.timestampRaw));
  const messages: Message[] = rawMessages.map((message) => ({
    timestamp: parseWhatsAppTimestamp(message.timestampRaw, preferredDateOrder),
    sender: message.sender,
    content: message.content,
  }));

  const senders = Array.from(
    new Set(rawMessages.map((message) => message.sender).filter((sender) => sender !== SYSTEM_SENDER))
  );

  const participant = inferParticipantFromFileName(chatFileName) || senders[0] || '';
  const currentUser = senders.find((sender) => sender !== participant) || senders[0] || '';

  return { messages, currentUser, participant };
}

function normalizeChatContent(content: string): string {
  return content
    .replace(/\r\n/g, '\n')
    .replace(/\u200e/g, '')
    .replace(/\u202f/g, ' ')
    .replace(/\u00a0/g, ' ');
}

function parseMessageStart(line: string): RawMessage | null {
  const normalizedLine = line.trimEnd();
  if (!normalizedLine) {
    return null;
  }

  const bracketFormatMatch = normalizedLine.match(/^\[(.+?)\]\s+(?:-\s+)?(?:(.+?):\s)?(.*)$/);
  if (bracketFormatMatch) {
    return {
      timestampRaw: bracketFormatMatch[1].trim(),
      sender: bracketFormatMatch[2]?.trim() || SYSTEM_SENDER,
      content: bracketFormatMatch[3] || '',
    };
  }

  const modernFormatMatch = normalizedLine.match(
    /^(\d{1,2}\/\d{1,2}\/\d{2,4}),\s+(\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AaPp][Mm])?)\s+-\s+(?:(.+?):\s)?(.*)$/
  );

  if (modernFormatMatch) {
    return {
      timestampRaw: `${modernFormatMatch[1].trim()}, ${modernFormatMatch[2].trim()}`,
      sender: modernFormatMatch[3]?.trim() || SYSTEM_SENDER,
      content: modernFormatMatch[4] || '',
    };
  }

  return null;
}

function detectDateOrder(timestamps: string[]): DateOrder {
  let dmyVotes = 0;
  let mdyVotes = 0;

  for (const timestamp of timestamps) {
    const dateParts = getDateParts(timestamp);
    if (!dateParts) {
      continue;
    }

    const [firstPart, secondPart] = dateParts;

    if (firstPart > 12 && secondPart <= 12) {
      dmyVotes += 1;
      continue;
    }

    if (secondPart > 12 && firstPart <= 12) {
      mdyVotes += 1;
    }
  }

  return mdyVotes > dmyVotes ? 'MDY' : 'DMY';
}

function getDateParts(timestamp: string): [number, number, number] | null {
  const [datePart] = timestamp.split(',');
  if (!datePart) {
    return null;
  }

  const parts = datePart
    .trim()
    .split('/')
    .map((part) => parseInt(part, 10));

  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
    return null;
  }

  return [parts[0], parts[1], parts[2]];
}

function parseWhatsAppTimestamp(timestamp: string, preferredDateOrder: DateOrder): Date {
  try {
    const dateParts = getDateParts(timestamp);
    if (!dateParts) {
      return new Date(NaN);
    }

    const [firstPart, secondPart, rawYear] = dateParts;
    const { day, month } = resolveDateParts(firstPart, secondPart, preferredDateOrder);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;

    const timePart = timestamp.split(',').slice(1).join(',').trim();
    const timeMatch = timePart.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?$/);

    if (!timeMatch) {
      return new Date(NaN);
    }

    let hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);
    const seconds = parseInt(timeMatch[3] || '0', 10);
    const meridiem = timeMatch[4]?.toUpperCase();

    if (meridiem) {
      if (meridiem === 'PM' && hours !== 12) {
        hours += 12;
      }
      if (meridiem === 'AM' && hours === 12) {
        hours = 0;
      }
    }

    const parsedDate = new Date(year, month - 1, day, hours, minutes, seconds);
    if (Number.isNaN(parsedDate.getTime())) {
      return new Date(NaN);
    }

    // Guard against impossible dates such as 31/02.
    if (
      parsedDate.getFullYear() !== year
      || parsedDate.getMonth() !== month - 1
      || parsedDate.getDate() !== day
    ) {
      return new Date(NaN);
    }

    return parsedDate;
  } catch (error) {
    console.error('Error parsing timestamp:', timestamp, error);
    return new Date(NaN);
  }
}

function resolveDateParts(
  firstPart: number,
  secondPart: number,
  preferredDateOrder: DateOrder
): { day: number; month: number } {
  if (firstPart > 12 && secondPart <= 12) {
    return { day: firstPart, month: secondPart };
  }

  if (secondPart > 12 && firstPart <= 12) {
    return { day: secondPart, month: firstPart };
  }

  if (preferredDateOrder === 'MDY') {
    return { day: secondPart, month: firstPart };
  }

  return { day: firstPart, month: secondPart };
}

function inferParticipantFromFileName(chatFileName?: string): string {
  if (!chatFileName) {
    return '';
  }

  const baseFileName = chatFileName.split('/').pop() || chatFileName;
  const match = baseFileName.match(/^(?:WhatsApp Chat with|Conversa do WhatsApp com)\s+(.+)\.txt$/i);

  return match?.[1]?.trim() || '';
}
