import React from 'react';
import ChatWidget from './components/ChatWidget';
import './App.css';

function App() {
  // Dummy user data for testing
  const dummyUser = {
    id: 'test-user-123',
    name: 'Test Student',
    email: 'test@student.com'
  };

  return (
    <div className="App" style={{ 
      minHeight: '100vh', 
      background: '#f0f0f0',
      padding: '20px'
    }}>
      <h1>KnowBridge CRM Test Page</h1>
      <p>This is a test page to verify the chat widget works</p>
      
      {/* Chat Widget */}
      <ChatWidget
        userId={dummyUser.id}
        userName={dummyUser.name}
        userEmail={dummyUser.email}
        apiUrl="http://localhost:5000"
        laravelUrl="http://localhost:8000"
        theme="purple"
      />
    </div>
  );
}

export default App;
