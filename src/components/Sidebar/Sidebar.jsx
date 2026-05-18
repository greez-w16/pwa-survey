			import React from 'react';
			import './Sidebar.css';
			
			const Sidebar = ({ groups, activeGroup, onSelectGroup, activeSection, onSelectSection, isADComplete, collapsed, onToggleCollapsed, scoringResults }) => {
			  return (
			    <div className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`}>
			      <div className="sidebar-header">
			        <h3>Group</h3>
			        <button
			          type="button"
			          className="sidebar-toggle"
			          onClick={onToggleCollapsed}
			          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
			        >
			          {collapsed ? '«' : '»'}
			        </button>
			      </div>
			      {!collapsed && (
			        <>
			          <div className="sidebar-header-controls">
			            <select
			              className="category-select"
			              value={activeGroup?.id || ''}
			              onChange={(e) => {
			                const selected = groups.find(g => g.id === e.target.value);
			                onSelectGroup(selected);
			              }}
			            >
			              {groups.map(group => (
			                <option key={group.id} value={group.id}>{group.name}</option>
			              ))}
			            </select>
			          </div>
		      <div className="sidebar-subheader">
		        <h4>Sections</h4>
		      </div>
			      <ul className="section-list">
			        {activeGroup?.sections?.map((sec, index) => {
		          const nameLower = (sec.name || '').toLowerCase().trim();
		          const isADSection = nameLower === "assessment details" || nameLower === "assessment_details";
		          // When Assessment Details is incomplete, all other sections are
		          // visually locked and cannot be selected.
		          const isSectionLocked = !isADSection && !isADComplete;
		  
			          const label = (() => {
	            const raw = sec.name || '';
	            if (!raw) return '';
	            const upper = raw.toUpperCase();
	            // If already starts with SE, just use it
	            if (upper.trim().startsWith('SE')) return raw.trim();
	            // Try to derive SE code from HOSP patterns
	            const hospMatch = upper.match(/HOSP[_\s-]*(SE)?(\d+(?:\.\d+)*)/);
	            if (hospMatch) {
	              const numPart = hospMatch[2];
	              const seToken = `SE${numPart}`;
	              const rest = raw
	                .slice(hospMatch.index + hospMatch[0].length)
	                .replace(/^[\s\-_:]+/, '');
	              return rest ? `${seToken} ${rest}` : seToken;
	            }
	            return raw.trim();
	          })();

		          return (
		            <li
		              key={sec.id}
		              className={`section-item ${activeSection?.id === sec.id ? 'active' : ''} ${isSectionLocked ? 'locked' : ''}`}
		              onClick={() => {
		                if (isSectionLocked) return;
		                onSelectSection(sec);
		              }}
		              aria-disabled={isSectionLocked}
		              title={isSectionLocked ? 'Complete "Assessment Details" before accessing this section.' : ''}
		            >
		              <div className="section-info">
			                <span>{label}</span>
		              </div>
		              <span className="status">
                        {(() => {
                          const sectionScoring = (scoringResults?.sections || []).find(s => s.id === sec.id);
                          const nameLower = (sec.name || '').toLowerCase().trim();
                          const isADSection = nameLower === "assessment details" || nameLower === "assessment_details";
                          
                          if (isADSection) {
                            return scoringResults?.overall ? `${Math.round(scoringResults.overall.percent)}%` : '-';
                          }
                          return sectionScoring ? `${Math.round(sectionScoring.percent)}%` : '-';
                        })()}
                      </span>
		            </li>
		          );
        })}
		      </ul>
		        </>
		      )}
		    </div>
		  );
		};

export default Sidebar;
