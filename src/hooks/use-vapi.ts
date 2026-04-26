'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Vapi from '@vapi-ai/web';

export interface VapiMessage {
  type: string;
  transcript?: string;
  role?: 'user' | 'assistant';
  content?: string;
  timestamp?: string;
}

type VapiTranscriptMessage = {
  type: string;
  transcript?: string;
  transcriptType?: string;
  role?: 'user' | 'assistant';
};

type AgentMessage = {
  action: string;
  message: string;
  data?: unknown;
};

export function useVapi() {
  const vapiRef = useRef<Vapi | null>(null);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [messages, setMessages] = useState<VapiMessage[]>([]);
  const [volumeLevel, setVolumeLevel] = useState(0);

  useEffect(() => {
    const publicKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
    if (!publicKey) {
      console.warn('NEXT_PUBLIC_VAPI_PUBLIC_KEY is not defined in your environment variables.');
    }
    
    const vapiInstance = new Vapi(publicKey || '');
    vapiRef.current = vapiInstance;

    // Event listeners
    vapiInstance.on('call-start', () => {
      setIsSessionActive(true);
    });

    vapiInstance.on('call-end', () => {
      setIsSessionActive(false);
      setIsSpeaking(false);
    });

    vapiInstance.on('speech-start', () => {
      setIsSpeaking(true);
    });

    vapiInstance.on('speech-end', () => {
      setIsSpeaking(false);
    });

    vapiInstance.on('message', (message: VapiTranscriptMessage) => {
      // Only process final transcripts, not partial ones
      if (message.type === 'transcript' && message.transcript && message.transcriptType === 'final') {
        setMessages((prev) => {
          const timestamp = new Date().toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit' 
          });
          
          // Check if the last message is from the same role and recent (within 5 seconds)
          const lastMessage = prev[prev.length - 1];
          const isRecentMessage = lastMessage && 
            lastMessage.role === message.role && 
            lastMessage.timestamp === timestamp;
          
          if (isRecentMessage) {
            // Append to the existing message
            const updated = [...prev];
            updated[updated.length - 1] = {
              ...lastMessage,
              content: lastMessage.content + ' ' + message.transcript,
            };
            return updated;
          } else {
            // Add as a new message
            return [
              ...prev,
              {
                type: 'transcript',
                role: message.role,
                content: message.transcript,
                timestamp,
              },
            ];
          }
        });
      }
    });

    vapiInstance.on('volume-level', (level: number) => {
      setVolumeLevel(level);
    });

    vapiInstance.on('error', (error: unknown) => {
      console.warn('VAPI error:', error);
      // Don't treat VAPI errors as critical - they're often just connection issues
    });

    return () => {
      vapiInstance.stop();
      vapiRef.current = null;
    };
  }, []);

  const start = useCallback(async () => {
    if (!vapiRef.current) return;

    if (!process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY) {
      const errorMsg = 'VAPI Public Key is missing. Please add NEXT_PUBLIC_VAPI_PUBLIC_KEY to your .env.local file.';
      console.error(errorMsg);
      setMessages(prev => [...prev, {
        type: 'error',
        role: 'assistant',
        content: errorMsg,
        timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
      }]);
      return;
    }

    try {
      const assistantId = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID;
      if (!assistantId) {
        const errorMsg = 'VAPI Assistant ID is missing. Please add NEXT_PUBLIC_VAPI_ASSISTANT_ID to your .env.local file.';
        console.error(errorMsg);
        setMessages(prev => [...prev, {
          type: 'error',
          role: 'assistant',
          content: errorMsg,
          timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
        }]);
        return;
      }
      await vapiRef.current.start(assistantId);
    } catch (error) {
      console.error('Failed to start VAPI:', error);
    }
  }, []);

  const stop = useCallback(() => {
    if (!vapiRef.current) return;
    vapiRef.current.stop();
  }, []);

  const send = useCallback((message: string) => {
    if (!vapiRef.current) return;
    vapiRef.current.send({
      type: 'add-message',
      message: {
        role: 'system',
        content: message,
      },
    });
  }, []);

  const receiveOperatorMessage = useCallback((message: string) => {
    const trimmed = message.trim();
    if (!trimmed) return;

    setMessages(prev => [...prev, {
      type: 'typed-command',
      role: 'user',
      content: trimmed,
      timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    }]);
  }, []);

  const receiveAgentMessage = useCallback((agentData: AgentMessage) => {
    // Speak Evacua results only during an active voice session. When idle, keep updates in the UI.
    if (vapiRef.current && isSessionActive) {
      try {
        vapiRef.current.say(agentData.message, false);
      } catch {
        // Voice playback is best-effort; the dashboard still shows the result.
      }
    }
    
    // Always add to local messages for UI display regardless of VAPI state
    setMessages(prev => {
      const timestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const lastMessage = prev[prev.length - 1];
      if (
        lastMessage?.role === 'assistant' &&
        lastMessage.content === agentData.message &&
        lastMessage.timestamp === timestamp
      ) {
        return prev;
      }

      return [...prev, {
        type: 'agent-alert',
        role: 'assistant',
        content: agentData.message,
        timestamp
      }];
    });
  }, [isSessionActive]);

  return {
    isSessionActive,
    isSpeaking,
    messages,
    volumeLevel,
    start,
    stop,
    send,
    receiveOperatorMessage,
    receiveAgentMessage,
  };
}
