/**
 * Isobront Message Component
 * Renders individual user and AI messages in the Isobront chat interface.
 */

import { IsobrontChart } from './IsobrontChart';
import type { AnalysisResult } from '../../services/lightningAI';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  result?: AnalysisResult;
  loading?: boolean;
  timestamp: Date;
};

interface Props {
  message: ChatMessage;
}

/** Render simple markdown-like formatting (bold, line breaks, indented lists). */
function renderBody(line: string, index: number): React.ReactNode {
  if (line === '') return <br key={index} />;

  // Bold (**text**)
  const parts = line.split(/(\*\*[^*]+\*\*)/g);
  const rendered = parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });

  const isIndented = line.startsWith('  •') || line.startsWith('  ');
  return (
    <p key={index} className={`isobront-line${isIndented ? ' isobront-line--indent' : ''}`}>
      {rendered}
    </p>
  );
}

const LoadingDots = () => (
  <span className="isobront-dots" aria-label="Analysing">
    <span />
    <span />
    <span />
  </span>
);

export const IsobrontMessage = ({ message }: Props) => {
  const { role, text, result, loading } = message;

  if (role === 'user') {
    return (
      <div className="isobront-msg isobront-msg--user">
        <div className="isobront-bubble isobront-bubble--user">
          <p>{text}</p>
        </div>
      </div>
    );
  }

  // Assistant message
  if (loading) {
    return (
      <div className="isobront-msg isobront-msg--assistant">
        <div className="isobront-avatar">⚡</div>
        <div className="isobront-bubble isobront-bubble--assistant">
          <p className="isobront-loading-text">{text || 'Analysing…'}</p>
          <LoadingDots />
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="isobront-msg isobront-msg--assistant">
        <div className="isobront-avatar">⚡</div>
        <div className="isobront-bubble isobront-bubble--assistant">
          <p>{text}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="isobront-msg isobront-msg--assistant">
      <div className="isobront-avatar">⚡</div>
      <div className="isobront-bubble isobront-bubble--assistant isobront-bubble--result">
        <div className="isobront-result-header">
          <h4>{result.title}</h4>
          {result.subtitle && <span className="isobront-period-badge">{result.subtitle}</span>}
        </div>

        {result.error ? (
          <p className="isobront-error">{result.bodyLines.join('\n')}</p>
        ) : (
          <div className="isobront-result-body">
            {result.bodyLines.map((line, i) => renderBody(line, i))}
          </div>
        )}

        {result.chart && !result.error && (
          <div className="isobront-chart-section">
            <IsobrontChart chart={result.chart} />
          </div>
        )}
      </div>
    </div>
  );
};
