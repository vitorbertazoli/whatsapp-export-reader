'use client';

import { ChatHeader } from '@/components/chat-header';
import { ChatMessage } from '@/components/chat-message';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { parseWhatsAppChat } from '@/lib/chat-parser';
import { ChatData } from '@/lib/types';
import JSZip from 'jszip';
import { Upload } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

const MEDIA_MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  bmp: 'image/bmp',
  opus: 'audio/ogg; codecs=opus',
  ogg: 'audio/ogg',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
};

function getFileExtension(fileName: string): string {
  const extension = fileName.split('.').pop();
  return extension ? extension.toLowerCase() : '';
}

function revokeAttachmentUrls(attachmentUrls: Map<string, string>): void {
  const uniqueUrls = new Set(attachmentUrls.values());
  uniqueUrls.forEach((url) => URL.revokeObjectURL(url));
}

async function buildMediaAttachmentUrls(zipFiles: JSZip.JSZipObject[]): Promise<Map<string, string>> {
  const attachmentUrlEntries = await Promise.all(
    zipFiles.map(async (zipFile) => {
      const extension = getFileExtension(zipFile.name);
      if (!MEDIA_MIME_TYPES[extension]) {
        return null;
      }

      const fileData = await zipFile.async('arraybuffer');
      const blob = new Blob([fileData], { type: MEDIA_MIME_TYPES[extension] });
      const fileUrl = URL.createObjectURL(blob);

      const fullPathKey = zipFile.name.toLowerCase();
      const baseNameKey = (zipFile.name.split('/').pop() || zipFile.name).toLowerCase();
      return [
        [fullPathKey, fileUrl],
        [baseNameKey, fileUrl],
      ] as const;
    })
  );

  const attachmentUrls = new Map<string, string>();
  attachmentUrlEntries
    .filter((entry): entry is readonly [readonly [string, string], readonly [string, string]] => Boolean(entry))
    .forEach(([fullPathEntry, baseNameEntry]) => {
      attachmentUrls.set(fullPathEntry[0], fullPathEntry[1]);
      attachmentUrls.set(baseNameEntry[0], baseNameEntry[1]);
    });

  return attachmentUrls;
}

export default function Home() {
  const [chatData, setChatData] = useState<ChatData | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [attachmentUrls, setAttachmentUrls] = useState<Map<string, string>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentUrlsRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    attachmentUrlsRef.current = attachmentUrls;
  }, [attachmentUrls]);

  useEffect(() => {
    return () => {
      revokeAttachmentUrls(attachmentUrlsRef.current);
    };
  }, []);
  
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const zip = new JSZip();
      const zipContent = await zip.loadAsync(file);
      
      console.log('Files in zip:', Object.keys(zipContent.files));

      const zipFiles = Object.values(zipContent.files).filter((zipEntry) => !zipEntry.dir);

      const chatFile = zipContent.file('_chat.txt')
        || zipFiles.find(
          (zipEntry) => zipEntry.name.toLowerCase().endsWith('.txt')
            && zipEntry.name.toLowerCase().includes('whatsapp chat')
        )
        || zipFiles.find((zipEntry) => zipEntry.name.toLowerCase().endsWith('.txt'));

      if (!chatFile) {
        console.error('No chat transcript .txt file found in the zip');
        return;
      }

      const [text, extractedAttachmentUrls] = await Promise.all([
        chatFile.async('string'),
        buildMediaAttachmentUrls(zipFiles),
      ]);

      const chatFileName = chatFile.name.split('/').pop() || chatFile.name;
      const parsedChat = parseWhatsAppChat(text, chatFileName);

      setAttachmentUrls((currentUrls) => {
        revokeAttachmentUrls(currentUrls);
        return extractedAttachmentUrls;
      });

      setChatData(parsedChat);
    } catch (error) {
      console.error("Error processing zip file:", error);
    }
  };

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query.toLowerCase());
  }, []);

  const handleDateSelect = useCallback((date: Date) => {
    const element = document.querySelector(`[data-date="${date.toISOString().split('T')[0]}"]`);
    element?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const filteredMessages = chatData?.messages.filter(message =>
    message.content.toLowerCase().includes(searchQuery)
  );

  return (
    <div className="min-h-screen bg-[#111B21]">
      {!chatData ? (
        <div className="h-screen flex flex-col">
          <div className="flex-grow flex items-center justify-center">
            <div className="text-center">
              <Input
                type="file"
                accept=".zip"
                className="hidden"
                ref={fileInputRef}
                onChange={handleFileUpload}
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                className="bg-[#00A884] hover:bg-[#00806A] text-white"
              >
                <Upload className="mr-2 h-4 w-4" />
                Upload WhatsApp Chat
              </Button>
            </div>
          </div>
          <div className="text-center text-gray-400 text-sm pb-4">
            This app functions offline and the data is parsed locally.
          </div>
        </div>
      ) : (
        <>
          <ChatHeader onSearch={handleSearch} onDateSelect={handleDateSelect} />
          <div className="container mx-auto max-w-4xl p-4">
            <div className="space-y-4">
              {filteredMessages?.map((message, index) => {
                let messageDate;
                try {
                  messageDate = message.timestamp.toISOString().split('T')[0];
                } catch (error) {
                  console.error('Invalid date:', message.timestamp);
                  messageDate = 'Invalid Date';
                }
                
                const prevMessage = index > 0 ? filteredMessages[index - 1] : null;
                let prevMessageDate;
                try {
                  prevMessageDate = prevMessage?.timestamp.toISOString().split('T')[0];
                } catch (error) {
                  prevMessageDate = 'Invalid Date';
                }
                
                return (
                  <div key={index}>
                    {(!prevMessage || messageDate !== prevMessageDate) && (
                      <div
                        data-date={messageDate}
                        className="text-center text-sm text-gray-400 my-4"
                      >
                        {messageDate !== 'Invalid Date' 
                          ? new Date(messageDate).toLocaleDateString()
                          : 'Unknown Date'}
                      </div>
                    )}
                    <ChatMessage
                      message={message}
                      isCurrentUser={message.sender === chatData.currentUser}
                      attachmentUrls={attachmentUrls}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}