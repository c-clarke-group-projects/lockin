import React, { useState, useEffect, useRef } from 'react';

export default function HostLobby({ sessionId, joinCode }) {
  const [participants, setParticipants] = useState([]);
  const [quizState, setQuizState] = useState('lobby'); // 'lobby' | 'in_progress'
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const ws = useRef(null);

  useEffect(() => {
    // Establish WebSocket connection for the Host
    const wsUrl = `ws://${window.location.host}/ws/quiz/${sessionId}?role=host`;
    ws.current = new WebSocket(wsUrl);

    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.event) {
        case 'lobby_state':
        case 'participant_list_updated':
          // Criteria 1: Host sees names appear live
          setParticipants(data.participants);
          break;

        case 'quiz_started':
          setQuizState('in_progress');
          setCurrentQuestionIndex(0);
          break;

        case 'question_advanced':
          setCurrentQuestionIndex(data.current_question_index);
          break;

        default:
          break;
      }
    };

    return () => {
      ws.current?.close();
    };
  }, [sessionId]);

  // Criteria 2: Host can remove a participant
  const handleRemoveParticipant = (participantId) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        event: 'kick_participant',
        participant_id: participantId
      }));
    }
  };

  // Criteria 3: Host starts the quiz from the lobby
  const handleStartQuiz = () => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        event: 'start_quiz'
      }));
    }
  };

  // Criteria 4: Host presses next to continue
  const handleNextQuestion = () => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        event: 'next_question',
        next_index: currentQuestionIndex + 1
      }));
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '800px', margin: '0 auto' }}>
      {quizState === 'lobby' ? (
        <div>
          <h2>Room Join Code: {joinCode}</h2>
          <h3>Joined Participants ({participants.length}):</h3>
          
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {participants.map((p) => (
              <li 
                key={p.id} 
                style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  padding: '8px 12px', 
                  border: '1px solid #ccc', 
                  marginBottom: '8px', 
                  borderRadius: '4px' 
                }}
              >
                <span>{p.name}</span>
                <button 
                  onClick={() => handleRemoveParticipant(p.id)}
                  style={{ backgroundColor: '#ff4d4f', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>

          <button 
            onClick={handleStartQuiz} 
            disabled={participants.length === 0}
            style={{ padding: '12px 24px', fontSize: '16px', backgroundColor: '#4CAF50', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
          >
            Start Quiz
          </button>
        </div>
      ) : (
        <div>
          <h2>Question #{currentQuestionIndex + 1}</h2>
          {/* Question card content goes here */}
          
          <div style={{ marginTop: '20px' }}>
            <button 
              onClick={handleNextQuestion}
              style={{ padding: '12px 24px', fontSize: '16px', backgroundColor: '#2196F3', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
            >
              Next Question
            </button>
          </div>
        </div>
      )}
    </div>
  );
}