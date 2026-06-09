				import React from 'react';
			import './Sidebar.css';
			
					const Sidebar = ({ groups, activeGroup, onSelectGroup, activeSection, onSelectSection, isADComplete, collapsed, onToggleCollapsed, scoringResults, selectedFacility, formData, scoringEventIdMap }) => {
					  const isAssessmentDetailsSection = React.useCallback((sec) => {
					    const name = String(sec?.name || sec?.code || sec?.id || '').toLowerCase().trim();
					    return name === 'ad' || name === 'assessment_details' || name === 'assessment-details' || name.includes('assessment details');
					  }, []);

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
				  const assessmentProgramStageId = selectedFacility?.programStageId
				    || selectedFacility?.programStage?.id
				    || null;
					  const assessmentDetailsAveragePercent = React.useMemo(() => {
					    const visibleSectionIds = new Set(
					      (activeGroup?.sections || [])
					        .filter(sec => !isAssessmentDetailsSection(sec))
					        .map(sec => sec.id)
					        .filter(Boolean)
					    );

					    const sectionScores = (scoringResults?.sections || [])
					      .filter(section => visibleSectionIds.has(section?.id));

					    if (!sectionScores.length) return null;

					    const total = sectionScores.reduce((sum, section) => {
					      const percent = Number(section?.percent);
					      return sum + (Number.isFinite(percent) ? percent : 0);
					    }, 0);

					    return total / sectionScores.length;
					  }, [activeGroup?.sections, isAssessmentDetailsSection, scoringResults?.sections]);
					  const effectiveEventIdMap = scoringEventIdMap || {};
					  const getSectionSysTag = (sec) => {
						    if (isAssessmentDetailsSection(sec)) {
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

						      match = candidate.match(/(?:HOSP(?:ITAL)?|CLINICS?|MORTUARY|SURV)[_\s-]+(?:SE[_\s-]*)?([0-9]+)(?=$|[_.\s:-])/i);
					      if (match) return match[1];
					    }

					    const fieldCandidates = (sec?.fields || [])
					      .flatMap(f => [f?.code, f?.label])
					      .filter(Boolean)
					      .map(v => String(v));

					    for (const candidate of fieldCandidates) {
					      let match = candidate.match(/(?:SE|SEC|SECTION|EMS)\s*([0-9]+)/i);
					      if (match) return match[1];

						      match = candidate.match(/(?:HOSP(?:ITAL)?|CLINICS?|MORTUARY|SURV)[_\s-]+(?:SE[_\s-]*)?([0-9]+)(?=$|[_.\s:-])/i);
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
			          const isADSection = isAssessmentDetailsSection(sec);
		          // When Assessment Details is incomplete, all other sections are
		          // visually locked and cannot be selected.
		          const isSectionLocked = !isADSection && !isADComplete;
			          const expectedSysTag = getSectionSysTag(sec);
			          const isMappedToEvent = Boolean(expectedSysTag && effectiveEventIdMap?.[expectedSysTag]);
		  
			          const label = (() => {
	            const raw = String(sec.name || '').trim();
	            if (!raw) return '';
	            const upper = raw.toUpperCase();
	            const seId = sec?.se_id ?? sec?.seId ?? sec?.sectionNumber ?? null;
	            const escapeRegExp = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	            // If already starts with SE, normalise spacing and keep it.
	            const sePrefixMatch = raw.match(/^\s*SE\s*([0-9]+(?:\.[0-9]+)*)\s*(.*)$/i);
	            if (sePrefixMatch) {
	              const num = sePrefixMatch[1];
	              const rest = sePrefixMatch[2].trim();
	              const seToken = `SE ${num}`;
	              return rest ? `${seToken} ${rest}` : seToken;
	            }
	            // Try to derive SE code from HOSP patterns.
	            const hospMatch = upper.match(/HOSP[_\s-]*(SE)?(\d+(?:\.\d+)*)/);
	            if (hospMatch) {
	              const numPart = hospMatch[2];
	              const seToken = `SE ${numPart}`;
	              const rest = raw
	                .slice(hospMatch.index + hospMatch[0].length)
	                .replace(/^[\s\-_:]+/, '');
	              return rest ? `${seToken} ${rest}` : seToken;
	            }
	            if (seId && !isADSection) {
	              const leadingSePattern = new RegExp(`^\\s*(?:SE\\s*)?${escapeRegExp(seId)}(?:[\\s\\-_:]+)?`, 'i');
	              const rest = raw.replace(leadingSePattern, '').trim();
	              const seToken = `SE ${seId}`;
	              return rest ? `${seToken} ${rest}` : seToken;
	            }
	            return raw;
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

			              </div>
		              <span className="status">
                        {(() => {
                          const sectionScoring = (scoringResults?.sections || []).find(s => s.id === sec.id);
	                          const isADSection = isAssessmentDetailsSection(sec);
                          
                          if (isADSection) {
	                            return assessmentDetailsAveragePercent !== null
	                              ? `${Math.round(assessmentDetailsAveragePercent)}%`
	                              : (scoringResults?.overall ? `${Math.round(scoringResults.overall.percent)}%` : '-');
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
