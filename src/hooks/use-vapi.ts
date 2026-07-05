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
  speak?: boolean;
};

export function useVapi() {
  const vapiRef = useRef<Vapi | null>(null);
  const lastAgentMessageRef = useRef<{ content: string; at: number } | null>(null);
  const appSpokenMessagesRef = useRef<Array<{ content: string; at: number }>>([]);
  const callActiveRef = useRef(false);
  const startInFlightRef = useRef(false);
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
      callActiveRef.current = true;
      startInFlightRef.current = false;
      setIsSessionActive(true);
    });

    vapiInstance.on('call-end', () => {
      callActiveRef.current = false;
      startInFlightRef.current = false;
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
        if (message.role === 'assistant') return;

        setMessages((prev) => {
          const transcript = normalizeDisplayTranscript(message.transcript);
          if (!transcript) return prev;
          const timestamp = new Date().toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit' 
          });
          const normalizedTranscript = normalizeMessageContent(transcript);

          if (
            message.role === 'assistant' &&
            appSpokenMessagesRef.current.some(
              (item) => Date.now() - item.at < 20_000 && messagesAreSimilar(item.content, normalizedTranscript),
            )
          ) {
            return prev;
          }

          const recentDuplicate = prev
            .slice(-5)
            .some((item) => item.role === message.role && messagesAreSimilar(normalizeMessageContent(item.content), normalizedTranscript));
          if (recentDuplicate) return prev;

          const lastMessage = prev[prev.length - 1];
          const isRecentMessage = lastMessage && 
            lastMessage.role === message.role && 
            lastMessage.timestamp === timestamp &&
            message.role === 'user';
          
          if (isRecentMessage) {
            const existing = lastMessage.content ?? "";
            if (messagesAreSimilar(normalizeMessageContent(existing), normalizedTranscript)) return prev;
            const updated = [...prev];
            updated[updated.length - 1] = {
              ...lastMessage,
              content: `${existing} ${transcript}`.trim(),
            };
            return updated;
          } else {
            return [
              ...prev,
              {
                type: 'transcript',
                role: message.role,
                content: transcript,
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
      if (isBenignVapiError(error)) {
        callActiveRef.current = false;
        startInFlightRef.current = false;
        setIsSessionActive(false);
        setIsSpeaking(false);
        return;
      }

      console.warn('VAPI error:', error);
      // Don't treat VAPI errors as critical - they're often just connection issues
    });

    return () => {
      if (callActiveRef.current || startInFlightRef.current) {
        try {
          vapiInstance.stop();
        } catch {
          // Vapi can throw if a hot reload tears down an already-ended meeting.
        }
      }
      callActiveRef.current = false;
      startInFlightRef.current = false;
      vapiRef.current = null;
    };
  }, []);

  const start = useCallback(async () => {
    if (!vapiRef.current) return;
    if (callActiveRef.current || startInFlightRef.current) return;

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
      startInFlightRef.current = true;
      const assistantId = process.env.NEXT_PUBLIC_VAPI_ASSISTANT_ID;
      if (!assistantId) {
        startInFlightRef.current = false;
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
      startInFlightRef.current = false;
      if (isBenignVapiError(error)) return;
      console.error('Failed to start VAPI:', error);
    }
  }, []);

  const stop = useCallback(() => {
    if (!vapiRef.current) return;
    if (!callActiveRef.current && !startInFlightRef.current) return;
    try {
      vapiRef.current.stop();
    } catch (error) {
      if (!isBenignVapiError(error)) {
        console.warn('Failed to stop VAPI:', error);
      }
    } finally {
      callActiveRef.current = false;
      startInFlightRef.current = false;
      setIsSessionActive(false);
      setIsSpeaking(false);
    }
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
    const message = agentData.message.trim();
    if (!message) return;

    const normalized = normalizeMessageContent(message);
    const now = Date.now();
    if (
      lastAgentMessageRef.current?.content === normalized &&
      now - lastAgentMessageRef.current.at < 12_000
    ) {
      return;
    }
    lastAgentMessageRef.current = { content: normalized, at: now };
    appSpokenMessagesRef.current = [
      ...appSpokenMessagesRef.current.filter((item) => now - item.at < 20_000),
      { content: normalized, at: now },
    ].slice(-8);

    // Speak Evacua results only during an active voice session. When idle, keep updates in the UI.
    if (agentData.speak !== false && vapiRef.current && isSessionActive) {
      try {
        vapiRef.current.say(message, false);
      } catch {
        // Voice playback is best-effort; the dashboard still shows the result.
      }
    }
    
    // Always add to local messages for UI display regardless of VAPI state
    setMessages(prev => {
      const timestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const lastMessage = prev[prev.length - 1];
      if (
        prev.slice(-8).some((item) => item.role === 'assistant' && messagesAreSimilar(normalizeMessageContent(item.content), normalized)) ||
        (lastMessage?.role === 'assistant' &&
          messagesAreSimilar(normalizeMessageContent(lastMessage.content), normalized) &&
          lastMessage.timestamp === timestamp)
      ) {
        return prev;
      }

      return [...prev, {
        type: 'agent-alert',
        role: 'assistant',
        content: message,
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

function normalizeMessageContent(value?: string) {
  return (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDisplayTranscript(value?: string) {
  return (value ?? "")
    .replace(/\bPinebridge\b/gi, "Pine Ridge")
    .replace(/\bPioneer(?=\s+(?:autonomous\s+)?(?:fire\s+)?mission\b|\s+fire\b)/gi, "Pine Ridge")
    .replace(/\s+/g, " ")
    .trim();
}

function messagesAreSimilar(a: string, b: string) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;

  const aTokens = meaningfulTokens(a);
  const bTokens = meaningfulTokens(b);
  if (aTokens.length < 4 || bTokens.length < 4) return false;

  const smaller = aTokens.length <= bTokens.length ? aTokens : bTokens;
  const larger = new Set(aTokens.length > bTokens.length ? aTokens : bTokens);
  const overlap = smaller.filter((token) => larger.has(token) || larger.has(stripPlural(token))).length;
  return overlap / smaller.length >= 0.72;
}

function meaningfulTokens(value: string) {
  return value
    .split(" ")
    .map(stripPlural)
    .filter((token) => token.length > 2 && !["the", "and", "for", "with", "that", "this", "are", "will"].includes(token));
}

function stripPlural(token: string) {
  return token.endsWith("s") && token.length > 4 ? token.slice(0, -1) : token;
}

function isBenignVapiError(error: unknown) {
  const text =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : JSON.stringify(error ?? "");

  return /meeting ended|meeting has ended|ejection/i.test(text);
}
