'use client';

import { Card } from '@/components/ui/card';
import { Message } from '@/lib/types';
import { format } from 'date-fns';

interface ChatMessageProps {
  message: Message;
  isCurrentUser: boolean;
  attachmentUrls: Map<string, string>;
}

type MediaType = 'image' | 'audio';

interface MediaAttachment {
  fileName: string;
  mediaType: MediaType;
  url: string;
}

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp']);
const AUDIO_EXTENSIONS = new Set(['opus', 'ogg', 'mp3', 'm4a', 'aac', 'wav']);

function getFileExtension(fileName: string): string {
  const extension = fileName.split('.').pop();
  return extension ? extension.toLowerCase() : '';
}

function getAttachmentFileName(messageContent: string): string | null {
  const trimmedContent = messageContent.trim();
  if (!trimmedContent) {
    return null;
  }

  const legacyAttachedMatch = trimmedContent.match(/^<attached:\s*(.+?)>$/i);
  if (legacyAttachedMatch) {
    return legacyAttachedMatch[1].trim();
  }

  const directFileMatch = trimmedContent.match(
    /^(.+?\.[A-Za-z0-9]{2,5})(?:\s+\((?:file attached|arquivo anexado)\))?$/i
  );

  return directFileMatch?.[1]?.trim() || null;
}

function resolveMediaAttachment(
  messageContent: string,
  attachmentUrls: Map<string, string>
): MediaAttachment | null {
  const fileName = getAttachmentFileName(messageContent);
  if (!fileName) {
    return null;
  }

  const extension = getFileExtension(fileName);
  let mediaType: MediaType | null = null;

  if (IMAGE_EXTENSIONS.has(extension)) {
    mediaType = 'image';
  } else if (AUDIO_EXTENSIONS.has(extension)) {
    mediaType = 'audio';
  }

  if (!mediaType) {
    return null;
  }

  const normalizedFileName = fileName.toLowerCase();
  const attachmentUrl = attachmentUrls.get(normalizedFileName);
  if (!attachmentUrl) {
    return null;
  }

  return {
    fileName,
    mediaType,
    url: attachmentUrl,
  };
}

export function ChatMessage({ message, isCurrentUser, attachmentUrls }: ChatMessageProps) {
  const formattedTime = (() => {
    try {
      const date = new Date(message.timestamp);
      if (isNaN(date.getTime())) {
        throw new Error('Invalid date');
      }
      return format(date, 'h:mm a');
    } catch (error) {
      return '(unknown time)';
    }
  })();

  const mediaAttachment = resolveMediaAttachment(message.content, attachmentUrls);

  return (
    <div className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <Card className={`max-w-[70%] p-3 ${isCurrentUser ? 'bg-[#005C4B] text-white' : 'bg-[#202C33] text-white'
        }`}>
        <div className="text-xs text-gray-400 mb-1">{message.sender}</div>
        {mediaAttachment ? (
          <div className="space-y-2">
            {mediaAttachment.mediaType === 'image' ? (
              <a href={mediaAttachment.url} target="_blank" rel="noreferrer">
                {/* Blob preview URLs are generated locally at runtime and intentionally rendered with img. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={mediaAttachment.url}
                  alt={mediaAttachment.fileName}
                  className="rounded-md max-h-80 w-auto object-contain"
                />
              </a>
            ) : (
              <audio controls preload="metadata" className="w-full min-w-[240px]">
                <source src={mediaAttachment.url} />
                Your browser does not support audio playback.
              </audio>
            )}
            <div className="text-xs text-gray-300 break-all">{mediaAttachment.fileName}</div>
          </div>
        ) : (
          <div className="text-sm whitespace-pre-wrap break-words">{message.content}</div>
        )}
        <div className="text-xs text-gray-400 text-right mt-1">
          {formattedTime}
        </div>
      </Card>
    </div>
  );
}