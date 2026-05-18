import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { useStorage } from '../../hooks/useStorage';
import { useApp } from '../../contexts/AppContext';
import './Login.css';

const Login = ({ onLogin }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const navigate = useNavigate();
    const storage = useStorage();
    const { configSource, setConfigSource } = useApp();

    const handleSubmit = async (e) => {
        e.preventDefault();
        console.log('[Login] Submit clicked');
        setError(null);

        if (!username || !password) {
            setError('Please enter username and password');
            return;
        }

        try {
            setIsSubmitting(true);
            console.log('[Login] Calling api.login for', username);
            const user = await api.login(username, password);
            console.log('[Login] api.login success for', user?.username || username);

            // Persist user to storage for indexedDBService access
            await storage.setAuth({ user: user });

            if (onLogin) {
                onLogin(user);
            }
            navigate('/');
        } catch (err) {
            console.error('[Login] Login error:', err);
            setError('Login failed. Please check credentials or network.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-box">
                <h2>Survey Tool Login</h2>
                {error && <div className="error-message">{error}</div>}
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Username</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="Enter username"
                        />
                    </div>
                    <div className="form-group">
                        <label>Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter password"
                        />
                    </div>
                    <div className="form-group">
                        <label>Configuration Source</label>
                        <select 
                            value={configSource} 
                            onChange={(e) => setConfigSource(e.target.value)}
                            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                        >
                            <option value="datastore">Remote (DHIS2 DataStore)</option>
                            <option value="local">Local (Offline Cache / Build)</option>
                        </select>
                    </div>
                        <button type="submit" className="login-btn" disabled={isSubmitting}>
                            {isSubmitting ? 'Logging in…' : 'Login'}
                        </button>
                </form>
                <div style={{ marginTop: '8px', fontSize: '0.75rem', color: '#666' }}>
                    <strong>Debug:</strong> When you press Login, check the browser console for
                    messages starting with <code>[Login]</code> and the Network tab for a request
                    to <code>/qims/api/me</code>.
                </div>
            </div>
        </div>
    );
};

export default Login;
