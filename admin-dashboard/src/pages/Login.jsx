import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../services/api';

const Login = () => {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [domain, setDomain] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const from = location.state?.from?.pathname
    ? `${location.state.from.pathname}${location.state.from.search || ''}`
    : null;

  const isSignup = mode === 'signup';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = isSignup
        ? await api.post('/auth/signup', { companyName, name, email, password, domain })
        : await api.post('/auth/login', { email, password });

      if (response.data.success) {
        // Save token and user info
        localStorage.setItem('chaty_admin_token', response.data.token);
        localStorage.setItem('chaty_admin_user', JSON.stringify(response.data.agent));

        // Redirect based on previous destination or role
        const defaultDest = response.data.agent.role === 'super_admin' ? '/dashboard' : '/chats';
        navigate(from || defaultDest, { replace: true });
      }
    } catch (err) {
      setError(err.response?.data?.error || (isSignup
        ? 'Failed to create account.'
        : 'Failed to login. Please check your credentials.'));
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setMode(isSignup ? 'login' : 'signup');
    setError('');
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <div className="logo-icon">C</div>
          <h1>Chaty Support</h1>
          <p>{isSignup ? 'Create an account for your website' : 'Sign in to your staff account'}</p>
        </div>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          {isSignup && (
            <>
              <div className="form-group">
                <label htmlFor="companyName">Company Name</label>
                <input
                  type="text"
                  id="companyName"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Acme Inc."
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="domain">Website Domain <span className="optional">(optional)</span></label>
                <input
                  type="text"
                  id="domain"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="acme.com"
                />
                <small>Where the chat widget will run. You can change it later in Settings.</small>
              </div>

              <div className="form-group">
                <label htmlFor="name">Your Name</label>
                <input
                  type="text"
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe"
                  required
                />
              </div>
            </>
          )}

          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              minLength={isSignup ? 6 : undefined}
              required
            />
          </div>

          <button type="submit" className="login-button" disabled={loading}>
            {loading
              ? (isSignup ? 'Creating account...' : 'Signing in...')
              : (isSignup ? 'Create Account' : 'Sign In')}
          </button>
        </form>

        <button type="button" className="login-switch" onClick={switchMode}>
          {isSignup ? 'Already have an account? Sign in' : "New here? Create an account"}
        </button>

        <div className="login-footer">
          <p>&copy; 2026 Chaty Support Panel</p>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .login-container {
          min-height: 100vh;
          padding: 24px 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f8fafc;
          font-family: 'Inter', -apple-system, sans-serif;
        }
        .login-card {
          width: 100%;
          max-width: 400px;
          padding: 40px;
          background: white;
          border-radius: 16px;
          box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
        }
        .login-header {
          text-align: center;
          margin-bottom: 32px;
        }
        .logo-icon {
          width: 48px;
          height: 48px;
          background: #6366f1;
          color: white;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          font-weight: bold;
          margin: 0 auto 16px;
        }
        .login-header h1 {
          font-size: 24px;
          font-weight: 700;
          color: #1e293b;
          margin-bottom: 8px;
        }
        .login-header p {
          color: #64748b;
          font-size: 14px;
        }
        .login-error {
          padding: 12px;
          background: #fef2f2;
          color: #dc2626;
          border-radius: 8px;
          font-size: 14px;
          margin-bottom: 20px;
          border: 1px solid #fee2e2;
        }
        .form-group {
          margin-bottom: 20px;
        }
        .form-group label {
          display: block;
          font-size: 14px;
          font-weight: 500;
          color: #475569;
          margin-bottom: 6px;
        }
        .form-group input {
          width: 100%;
          padding: 10px 14px;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          font-size: 14px;
          transition: border-color 0.2s;
        }
        .form-group input:focus {
          outline: none;
          border-color: #6366f1;
          ring: 2px solid #e0e7ff;
        }
        .login-button {
          width: 100%;
          padding: 12px;
          background: #6366f1;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.2s;
        }
        .login-button:hover {
          background: #4f46e5;
        }
        .login-button:disabled {
          background: #94a3b8;
          cursor: not-allowed;
        }
        .form-group small {
          display: block;
          margin-top: 6px;
          font-size: 12px;
          color: #94a3b8;
        }
        .form-group .optional {
          font-weight: 400;
          color: #94a3b8;
        }
        .login-switch {
          display: block;
          width: 100%;
          margin-top: 16px;
          background: none;
          border: none;
          color: #6366f1;
          font-size: 14px;
          cursor: pointer;
        }
        .login-switch:hover {
          text-decoration: underline;
        }
        .login-footer {
          margin-top: 32px;
          text-align: center;
          font-size: 12px;
          color: #94a3b8;
        }
      `}} />
    </div>
  );
};

export default Login;
