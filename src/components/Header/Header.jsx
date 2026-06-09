import React from 'react';
import { useNavigate } from 'react-router-dom';
import './Header.css';
import logo from '../../assets/logo.png';
import SettingsIcon from '@mui/icons-material/Settings';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button } from '@mui/material';
import ScoreBadge from '../ScoreBadge';
import { classifyAssessment } from '../../utils/classification';
import { useApp } from '../../contexts/AppContext';

	const Header = ({ assignments = [], selectedFacility, onSelectFacility, scoringResults, isAssignedAssessment, isScoringPending }) => {
		    const navigate = useNavigate();
		    const { user, logout } = useApp();
	    const [showSettings, setShowSettings] = React.useState(false);

    const handleLogout = async () => {
        const confirmed = window.confirm('Are you sure you want to log out?');
        if (!confirmed) return;
        try {
            await logout();
            navigate('/login');
        } catch (e) {
            console.error('Error during logout:', e);
        }
    };

    return (
        <header className="app-header">
	            <div className="header-left">
	                <img src={logo} alt="Ministry of Health" className="header-logo" />
	                <div className="header-dropdown">
	                    {isAssignedAssessment && selectedFacility ? (
	                        <span className="facility-label">
	                            {selectedFacility.orgUnitName || 'Unknown Facility'}
	                        </span>
	                    ) : assignments.length > 0 ? (
	                        <select
	                            className="facility-select"
	                            value={selectedFacility?.trackedEntityInstance || ''}
	                            onChange={(e) => {
	                                const selected = assignments.find(a => a.trackedEntityInstance === e.target.value);
	                                onSelectFacility(selected);
	                            }}
	                        >
	                            {assignments.map(a => (
	                                <option key={a.trackedEntityInstance} value={a.trackedEntityInstance}>
	                                    {a.orgUnitName || 'Unknown Facility'}
	                                </option>
	                            ))}
	                        </select>
	                    ) : (
	                        <span className="no-facilities">No Assigned Facilities</span>
	                    )}
	                </div>
	            </div>

	            {scoringResults?.overall && (
                <div className="header-center">
	                    <div className="header-scoring" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', padding: '4px 12px', borderRadius: '8px', minWidth: '120px', position: 'relative' }}>
                        <ScoreBadge
                            percent={scoringResults.overall.percent}
                            criticalFail={scoringResults.overall.criticalFail}
                        />
	                        {isScoringPending && (
	                            <div style={{ marginTop: 2 }}>
	                                <span className="score-spinner" aria-label="Recalculating scores" />
	                            </div>
	                        )}
                        <div className="overall-classification" style={{
                            fontSize: '10px',
                            color: 'rgba(255,255,255,0.9)',
                            marginTop: '2px',
                            textAlign: 'center',
                            fontWeight: '600',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em'
                        }}>
                            {classifyAssessment(scoringResults.overall).statusLabel}
                        </div>
                    </div>
                </div>
            )}

	            <div className="header-right">
	                {user && (
	                    <div className="user-info">
	                        {user.displayName || user.username || 'User'}
	                    </div>
	                )}
	                <nav className="header-nav">
	                    <button className="nav-link-btn" onClick={() => navigate('/')}>Dashboard</button>
	                    <button className="action-btn sync-btn">↻ Sync</button>
	                    <Tooltip title="App Settings">
	                        <IconButton onClick={() => setShowSettings(true)} size="small" style={{ color: 'white', margin: '0 10px' }}>
	                            <SettingsIcon fontSize="small" />
	                        </IconButton>
	                    </Tooltip>
	                    <button className="action-btn logout-btn" onClick={handleLogout}>Logout</button>
	                </nav>
	            </div>

            {/* Simple Settings Modal for Header */}
            <Dialog open={showSettings} onClose={() => setShowSettings(false)}>
                <DialogTitle>Quick Settings</DialogTitle>
                <DialogContent>
                    <div style={{ minWidth: '300px', padding: '10px 0' }}>
                        <p><strong>EMS Configuration:</strong> v2.0 (SE 1-10)</p>
                        <p>Current Facility: {selectedFacility?.orgUnitName || 'None'}</p>
                    </div>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setShowSettings(false)}>Close</Button>
                </DialogActions>
            </Dialog>
        </header >
    );
};

export default Header;
