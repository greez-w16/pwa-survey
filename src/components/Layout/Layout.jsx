import React from 'react';
import Sidebar from '../Sidebar/Sidebar';
import Header from '../Header/Header';
import './Layout.css';

const Layout = ({
    groups,
    activeGroup,
    onSelectGroup,
    activeSection,
    onSelectSection,
    isADComplete,
    children,
    assignments,
    selectedFacility,
    onSelectFacility,
    scoringResults,
    isAssignedAssessment,
    isScoringPending
		}) => {
		    // Start with the sidebar expanded by default; user can collapse it if needed.
		    const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(false);

    return (
        <div className="layout-container">
            <Header
                assignments={assignments}
                selectedFacility={selectedFacility}
                onSelectFacility={onSelectFacility}
                scoringResults={scoringResults}
                isAssignedAssessment={isAssignedAssessment}
                isScoringPending={isScoringPending}
            />
            <div className="layout-body">
                <Sidebar
                    groups={groups}
                    activeGroup={activeGroup}
                    onSelectGroup={onSelectGroup}
                    activeSection={activeSection}
                    onSelectSection={onSelectSection}
                    isADComplete={isADComplete}
                    collapsed={isSidebarCollapsed}
                    onToggleCollapsed={() => setIsSidebarCollapsed(prev => !prev)}
                    scoringResults={scoringResults}
                />
                <main className="main-content">
                    {children}
                </main>
            </div>
        </div>
    );
};

export default Layout;
