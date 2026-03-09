import React, { useState } from 'react';

interface ExpandableDescriptionProps {
  text: string;
  maxLength?: number;
  className?: string;
  textClassName?: string;
}

export function ExpandableDescription({ 
  text, 
  maxLength = 250, 
  className = "",
  textClassName = ""
}: ExpandableDescriptionProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!text) return null;

  const shouldTruncate = text.length > maxLength;
  
  // Try to truncate at a natural break (space) rather than middle of a word
  let truncatedText = text;
  if (shouldTruncate && !isExpanded) {
    const lastSpace = text.lastIndexOf(' ', maxLength);
    truncatedText = text.slice(0, lastSpace > 0 ? lastSpace : maxLength) + '...';
  }

  const displayText = isExpanded || !shouldTruncate ? text : truncatedText;

  return (
    <div className={className}>
      <div className={`whitespace-pre-wrap ${textClassName}`}>
        {displayText}
      </div>
      {shouldTruncate && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
          className="text-primary hover:opacity-80 mt-2 text-sm font-medium transition-opacity inline-flex items-center"
        >
          {isExpanded ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  );
}
