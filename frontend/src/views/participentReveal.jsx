import React from 'react';

export default function ParticipantReveal({ questionData, selectedOption }) {
  const { options, correct_index, source_page, source_snippet } = questionData;
  const isCorrect = selectedOption === correct_index;

  return (
    <div style={{ padding: '20px', textAlign: 'center', fontFamily: 'sans-serif' }}>
      <h2 style={{ color: isCorrect ? '#4CAF50' : '#F44336' }}>
        {isCorrect ? 'Correct! 🎉' : 'Incorrect ❌'}
      </h2>

      <div style={{ margin: '20px 0' }}>
        {options.map((option, index) => {
          let backgroundColor = '#f0f0f0';
          if (index === correct_index) {
            backgroundColor = '#4CAF50'; // Highlight correct option green
          } else if (index === selectedOption) {
            backgroundColor = '#F44336'; // Highlight user's wrong choice red
          }

          return (
            <div
              key={index}
              style={{
                padding: '12px',
                margin: '8px 0',
                borderRadius: '8px',
                backgroundColor,
                color: index === correct_index || index === selectedOption ? '#fff' : '#000',
                fontWeight: 'bold'
              }}
            >
              {option}
            </div>
          );
        })}
      </div>

      {/* Source snippet box - Core Differentiator */}
      <div style={{ marginTop: '30px', padding: '15px', backgroundColor: '#eef2f7', borderRadius: '8px', textAlign: 'left' }}>
        <h4>📖 Source (Page {source_page})</h4>
        <p style={{ fontStyle: 'italic', color: '#333' }}>"{source_snippet}"</p>
      </div>
    </div>
  );
}