/**
 * IsobrontChat
 * Main Isobront.v1 AI Lightning Intelligence chat component.
 * Renders beneath the UKWX Home dashboard cards.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { analyseQuery, SUGGESTED_QUERIES } from '../../services/lightningAI';
import { IsobrontMessage, type ChatMessage } from './IsobrontMessage';

let msgCounter = 0;
const nextId = () => String(++msgCounter);

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  text: '',
  result: {
    title: '⚡ Isobront.v1 — AI Lightning Intelligence',
    subtitle: 'UKWX Archive · 29 March 2026 onwards',
    bodyLines: [
      'Welcome to **Isobront.v1**, your professional lightning analysis assistant.',
      '',
      'Ask me anything about lightning activity in the UK or Europe:',
      '  • Location analysis: "Lightning around Leeds last week"',
      '  • Comparisons: "Compare Manchester and Sheffield"',
      '  • Rankings: "Which UK city had most lightning this month?"',
      '  • Time series: "Show lightning trend since March"',
      '  • Custom radius: "Strikes within 50km of Edinburgh"',
      '',
      `Based on UKWX lightning observations from 29 March 2026 onwards.`,
    ],
  },
  timestamp: new Date(),
};

export const IsobrontChat = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const submitQuery = useCallback(
    async (query: string) => {
      if (!query.trim() || busy) return;

      const userMsg: ChatMessage = {
        id: nextId(),
        role: 'user',
        text: query.trim(),
        timestamp: new Date(),
      };

      const loadingId = nextId();
      const loadingMsg: ChatMessage = {
        id: loadingId,
        role: 'assistant',
        text: 'Analysing…',
        loading: true,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMsg, loadingMsg]);
      setBusy(true);
      setInput('');

      try {
        const result = await analyseQuery(query.trim(), (label) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === loadingId ? { ...m, text: label } : m
            )
          );
        });

        setMessages((prev) =>
          prev.map((m) =>
            m.id === loadingId
              ? {
                  ...m,
                  loading: false,
                  text: result.title,
                  result,
                }
              : m
          )
        );
      } catch (err) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === loadingId
              ? {
                  ...m,
                  loading: false,
                  text: 'Analysis failed',
                  result: {
                    title: '⚡ Isobront.v1',
                    subtitle: 'Error',
                    bodyLines: [
                      `Unable to complete analysis: ${err instanceof Error ? err.message : 'Unknown error'}`,
                      '',
                      'Please try again or rephrase your question.',
                    ],
                    error: 'analysis_failed',
                  },
                }
              : m
          )
        );
      } finally {
        setBusy(false);
        inputRef.current?.focus();
      }
    },
    [busy]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void submitQuery(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submitQuery(input);
    }
  };

  const handleSuggestion = (suggestion: string) => {
    void submitQuery(suggestion);
  };

  return (
    <section className="isobront-panel">
      {/* Header */}
      <header className="isobront-header">
        <div className="isobront-header-brand">
          <span className="isobront-header-icon">⚡</span>
          <div>
            <h3>Isobront.v1</h3>
            <p>AI Lightning Intelligence Assistant</p>
          </div>
        </div>
        <span className="panel-badge">UKWX Archive</span>
      </header>

      {/* Suggestions (shown only when no user messages yet) */}
      {messages.filter((m) => m.role === 'user').length === 0 && (
        <div className="isobront-suggestions">
          {SUGGESTED_QUERIES.slice(0, 4).map((q) => (
            <button
              key={q}
              type="button"
              className="isobront-suggestion-chip"
              onClick={() => handleSuggestion(q)}
              disabled={busy}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Message list */}
      <div className="isobront-messages" role="log" aria-live="polite">
        {messages.map((msg) => (
          <IsobrontMessage key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form className="isobront-input-row" onSubmit={handleSubmit}>
        <textarea
          ref={inputRef}
          className="isobront-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about lightning activity…"
          rows={1}
          disabled={busy}
          aria-label="Lightning query"
        />
        <button
          type="submit"
          className="isobront-send-btn"
          disabled={busy || !input.trim()}
          aria-label="Send"
        >
          {busy ? '…' : '↑'}
        </button>
      </form>
    </section>
  );
};
