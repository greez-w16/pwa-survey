			import React from 'react';
			import './Sidebar.css';
			
					const Sidebar = ({ groups, activeGroup, onSelectGroup, activeSection, onSelectSection, isADComplete, collapsed, onToggleCollapsed, scoringResults, selectedFacility, formData, scoringEventIdMap }) => {
				  const assessmentTeiId = formData?.teiId_internal
				    || selectedFacility?.preloadDataValues?.teiId_internal
				    || selectedFacility?.trackedEntityInstance
				    || selectedFacility?.scheduleTeiId
				    || null;
				  const assessmentEnrollmentId = formData?.enrollmentId_internal
				    || selectedFacility?.preloadDataValues?.enrollmentId_internal
				    || selectedFacility?.enrollment
				    || selectedFacility?.enrollmentId
				    || null;
					  const effectiveEventIdMap = scoringEventIdMap || {};
					  const getSectionSysTag = (sec) => {
					    const nameLower = (sec?.name || '').toLowerCase().trim();
					    if (nameLower === 'assessment details' || nameLower === 'assessment_details') {
					      return 'FINAL';
					    }

					    const direct = sec?.se_id ?? sec?.seId ?? sec?.sectionNumber ?? null;
					    if (direct !== null && direct !== undefined && String(direct).trim() !== '') {
					      return String(direct).trim();
					    }

					    const candidates = [sec?._originalName, sec?.name, sec?.code, sec?.id]
					      .filter(Boolean)
					      .map(v => String(v));

					    for (const candidate of candidates) {
					      let match = candidate.match(/(?:^|[_\s-])(SE|SEC|SECTION|EMS)\s*([0-9]+)(?=$|[_\s:-])/i);
					      if (match) return match[2];

					      match = candidate.match(/(?:HOSP(?:ITAL)?|CLINICS?|MORTUARY|SURV)[_\s-]+(?:SE[_\s-]*)?([0-9]+)(?=$|[_\s:-])/i);
					      if (match) return match[1];
					    }

					    const fieldCandidates = (sec?.fields || [])
					      .flatMap(f => [f?.code, f?.label])
					      .filter(Boolean)
					      .map(v => String(v));

					    for (const candidate of fieldCandidates) {
					      let match = candidate.match(/(?:SE|SEC|SECTION|EMS)\s*([0-9]+)/i);
					      if (match) return match[1];

					      match = candidate.match(/(?:^|[^0-9])([0-9]+)\.[0-9]+\.[0-9]+\.[0-9]+/);
					      if (match) return match[1];
					    }

					    return null;
					  };
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
			          const expectedSysTag = getSectionSysTag(sec);
			          const isMappedToEvent = Boolean(expectedSysTag && effectiveEventIdMap?.[expectedSysTag]);
		  
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
			              className={`section-item ${activeSection?.id === sec.id ? 'active' : ''} ${isSectionLocked ? 'locked' : ''} ${isMappedToEvent ? 'mapped' : ''}`}
		              onClick={() => {
		                if (isSectionLocked) return;
		                onSelectSection(sec);
		              }}
		              aria-disabled={isSectionLocked}
			              title={isSectionLocked ? 'Complete "Assessment Details" before accessing this section.' : (isMappedToEvent ? `Mapped to event ${effectiveEventIdMap[expectedSysTag]}` : '')}
		            >
			              <div className="section-info">
					                <span className="section-label">{label}</span>
				                {isADSection && (assessmentTeiId || assessmentEnrollmentId) && (
				                  <span className="assessment-identity">
				                    {assessmentTeiId && <>TEI: <code>{assessmentTeiId}</code></>}
				                    {assessmentTeiId && assessmentEnrollmentId && <span className="identity-separator"> | </span>}
				                    {assessmentEnrollmentId && <>Enrollment: <code>{assessmentEnrollmentId}</code></>}
				                  </span>
				                )}
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
