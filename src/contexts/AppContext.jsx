import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { api } from '../services/api';
import indexedDBService from '../services/indexedDBService';
import { useStorage } from '../hooks/useStorage';
import emsConfig from '../assets/ems_config.json';
import mortuaryConfig from '../assets/mortuary_config.json';
import clinicsConfig from '../assets/clinics_config.json';
import hospitalConfig from '../assets/hospital_config.json';
import emsLinks from '../assets/ems_links.json';
import mortuaryLinks from '../assets/mortuary_links.json';
import clinicsLinks from '../assets/clinics_links.json';
import hospitalLinks from '../assets/hospital_links.json';
import hospitalComputeCriteria from '../assets/hospital_compute_criteria.json';
import { Alert, Snackbar } from '@mui/material';

const APP_CONTEXT_KEY = '__QIMS_APP_CONTEXT__';
const AppContext = globalThis[APP_CONTEXT_KEY] || createContext();

if (!globalThis[APP_CONTEXT_KEY]) {
    globalThis[APP_CONTEXT_KEY] = AppContext;
}

export const AppProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [userAssignments, setUserAssignments] = useState([]);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
	    // Track whether we are still checking for an existing session on load.
	    const [authInitializing, setAuthInitializing] = useState(true);
        const [toast, setToast] = useState({
            open: false,
            message: '',
            type: 'info',
        });

    const showToast = useCallback((message, type = 'info') => {
        console.log(`[TOAST] ${type.toUpperCase()}: ${message}`);
        setToast({
            open: true,
            message: String(message || ''),
            type: ['success', 'warning', 'error', 'info'].includes(type) ? type : 'info',
        });
    }, []);

    const closeToast = useCallback((event, reason) => {
        if (reason === 'clickaway') return;
        setToast(prev => ({ ...prev, open: false }));
    }, []);
    const storage = useStorage();

    // Stats
    const [stats, setStats] = useState({
        totalEvents: 0,
        pendingEvents: 0,
        syncedEvents: 0,
        errorEvents: 0
    });

    const [pendingEvents, setPendingEvents] = useState([]);

	    // Versioned configuration state: metadata (V1, V2, etc.) and the
	    // actual per-version config bundles used by scoring and helpers.
	    const [configVersions, setConfigVersions] = useState([]);
	    const [activeConfigVersionId, setActiveConfigVersionId] = useState(null);
	    const [configBundles, setConfigBundles] = useState({});
        const [configSource, setConfigSource] = useState('datastore'); // 'datastore'
        const [remoteConfigLoading, setRemoteConfigLoading] = useState(false);
        const [appMetadata, setAppMetadata] = useState(null);
        const remoteLoadKeyRef = useRef(null);
        const loadedRemoteFacilitiesRef = useRef(new Set());

	    useEffect(() => {
            localStorage.setItem('qims_config_source', configSource);
        }, [configSource]);

	    useEffect(() => {
	        const handleOnline = () => setIsOnline(true);
	        const handleOffline = () => setIsOnline(false);
	        window.addEventListener('online', handleOnline);
	        window.addEventListener('offline', handleOffline);
	        return () => {
	            window.removeEventListener('online', handleOnline);
	            window.removeEventListener('offline', handleOffline);
	        };
	    }, []);

		    // Initialise configuration versions metadata and in-memory bundles.
		    // Large config/link bundles are intentionally not loaded from or saved to
		    // browser storage to avoid localStorage quota errors on the login page.
		    useEffect(() => {
		        try {
		            localStorage.removeItem('qims_config_bundles');
		            localStorage.removeItem('custom_ems_config');
		            localStorage.removeItem('custom_ems_links');
		        } catch (e) {
		            console.warn('AppContext: Failed to clear legacy large config cache', e);
		        }

		        // --- Load or initialise versions metadata ---
		        let versionsPayload = null;
		        const savedVersionsRaw = localStorage.getItem('qims_config_versions');
		        if (savedVersionsRaw) {
		            try {
		                const parsed = JSON.parse(savedVersionsRaw);
		                if (parsed && Array.isArray(parsed.versions) && parsed.versions.length > 0) {
		                    versionsPayload = parsed;
		                }
		            } catch (e) {
		                console.error('AppContext: Failed to parse saved configuration versions', e);
		            }
		        }

		        if (!versionsPayload) {
		            const defaultVersion = {
		                id: 'v1',
		                name: 'V1 \u2013 Baseline configuration',
		                description: 'Initial configuration combining Service Elements, Criteria Linkages and Computation rules.',
		                status: 'ACTIVE',
		                createdAt: new Date().toISOString(),
		            };
		            versionsPayload = {
		                activeVersionId: defaultVersion.id,
		                versions: [defaultVersion],
		            };
		            try {
		                localStorage.setItem('qims_config_versions', JSON.stringify(versionsPayload));
		            } catch (e) {
		                console.error('AppContext: Failed to persist default configuration version', e);
		            }
		        }

		        setConfigVersions(versionsPayload.versions);
		        setActiveConfigVersionId(versionsPayload.activeVersionId);

		        // --- Build per-version bundles in memory only ---
		        const baseConfig = { ...emsConfig, ...mortuaryConfig, ...clinicsConfig, ...hospitalConfig };
		        const baseLinks = {
		            ems: emsLinks,
		            mortuary: mortuaryLinks,
		            clinics: clinicsLinks,
		            hospital: hospitalLinks,
		        };

		        const baselineBundle = {
		            config: baseConfig,
		            links: baseLinks,
		            compute: hospitalComputeCriteria,
		        };

		        const initialBundles = {};
		        versionsPayload.versions.forEach(v => {
		            initialBundles[v.id] = JSON.parse(JSON.stringify(baselineBundle));
		        });

		        setConfigBundles(initialBundles);
		    }, []);

            const unwrapDataStoreValue = (value, key) => {
                if (!value) return undefined;
                if (value?.configurations && value.configurations[key] !== undefined) {
                    return unwrapDataStoreValue(value.configurations[key], key);
                }
                if (value[key] !== undefined) {
                    return unwrapDataStoreValue(value[key], key);
                }
                return value;
            };

            const unwrapDataStoreArray = (value, key) => {
                const unwrapped = unwrapDataStoreValue(value, key);
                return Array.isArray(unwrapped) ? unwrapped : undefined;
            };

            const unwrapDataStoreObject = (value, key) => {
                const unwrapped = unwrapDataStoreValue(value, key);
                return unwrapped && typeof unwrapped === 'object' && !Array.isArray(unwrapped)
                    ? unwrapped
                    : undefined;
            };

            const loadRemoteConfig = useCallback(async (facilityType) => {
                const NAMESPACE = 'qims-survey-configs';
                const normalizedFacility = String(facilityType || '').trim().toLowerCase();
                const facilityKeys = {
                    hospital: [
                        { key: 'hospital_full_configuration' },
                        { key: 'hospital_compute_criteria' },
                        { key: 'hospital_links' },
                    ],
                    clinics: [
                        { key: 'clinics_full_configuration' },
                        { key: 'clinics_links' },
                    ],
                    ems: [
                        { key: 'ems_full_configuration' },
                        { key: 'ems_links' },
                    ],
                    mortuary: [
                        { key: 'mortuary_full_configuration' },
                        { key: 'mortuary_links' },
                    ],
                };
                const keys = facilityKeys[normalizedFacility] || Object.values(facilityKeys).flat();
                const loadScope = normalizedFacility || 'all';
                const loadKey = `${activeConfigVersionId || 'v1'}:${loadScope}`;
                if (loadedRemoteFacilitiesRef.current.has(loadKey)) {
                    return { loaded: true, cached: true, count: 0 };
                }

                try {
                    setRemoteConfigLoading(true);
                    console.info(`[AppContext] Fetching ${loadScope} configuration from DataStore...`);
                    const fetchedData = {};
                    for (const { key } of keys) {
                        try {
                            const val = await api.getDataStoreItem(NAMESPACE, key);
                            if (val) {
                                fetchedData[key] = val;
                            }
                        } catch (e) {
                            console.warn(`[AppContext] Failed to fetch key ${key} from DataStore`, e);
                        }
                    }

                    // Only update if we successfully fetched at least some remote configuration
                    if (Object.keys(fetchedData).length > 0) {
                        setConfigBundles(prev => {
                            const next = { ...prev };
                            const activeId = activeConfigVersionId || 'v1';
                            const currentBundle = next[activeId] || {};

                            const remoteConfig = {
                                ...currentBundle.config,
                                ...(unwrapDataStoreArray(fetchedData.hospital_full_configuration, 'hospital_full_configuration') ? { hospital_full_configuration: unwrapDataStoreArray(fetchedData.hospital_full_configuration, 'hospital_full_configuration') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.clinics_full_configuration, 'clinics_full_configuration') ? { clinics_full_configuration: unwrapDataStoreArray(fetchedData.clinics_full_configuration, 'clinics_full_configuration') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.ems_full_configuration, 'ems_full_configuration') ? { ems_full_configuration: unwrapDataStoreArray(fetchedData.ems_full_configuration, 'ems_full_configuration') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.mortuary_full_configuration, 'mortuary_full_configuration') ? { mortuary_full_configuration: unwrapDataStoreArray(fetchedData.mortuary_full_configuration, 'mortuary_full_configuration') } : {}),
                            };

                            const remoteLinks = {
                                ...currentBundle.links,
                                ...(unwrapDataStoreArray(fetchedData.ems_links, 'ems_links') ? { ems: unwrapDataStoreArray(fetchedData.ems_links, 'ems_links') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.hospital_links, 'hospital_links') ? { hospital: unwrapDataStoreArray(fetchedData.hospital_links, 'hospital_links') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.clinics_links, 'clinics_links') ? { clinics: unwrapDataStoreArray(fetchedData.clinics_links, 'clinics_links') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.mortuary_links, 'mortuary_links') ? { mortuary: unwrapDataStoreArray(fetchedData.mortuary_links, 'mortuary_links') } : {}),
                            };
                            const remoteCompute = unwrapDataStoreObject(fetchedData.hospital_compute_criteria, 'hospital_compute_criteria');

                            next[activeId] = {
                                ...currentBundle,
                                config: remoteConfig,
                                links: remoteLinks,
                                ...(remoteCompute ? { compute: remoteCompute } : {}),
                            };
                            return next;
                        });
                        loadedRemoteFacilitiesRef.current.add(loadKey);
                        console.info('[AppContext] Remote configuration bundle loaded successfully.');
                        return { loaded: true, count: Object.keys(fetchedData).length };
                    } else {
                        console.info('[AppContext] No remote configuration found in DataStore. Using built-in baseline.');
                        showToast?.('No remote configuration found in DHIS2 DataStore.', 'info');
                        return { loaded: false, count: 0 };
                    }
                } catch (err) {
                    console.error('[AppContext] Failed to load remote configuration', err);
                    showToast?.('Failed to load remote configuration from DataStore.', 'error');
                    return { loaded: false, count: 0, error: err };
                } finally {
                    setRemoteConfigLoading(false);
                }
            }, [activeConfigVersionId, showToast]);

            // Remote facility bundles are loaded when a facility is selected or
            // opened in App Settings. The local baseline remains immediately
            // available while avoiding a large all-facility login request.
            useEffect(() => {
                const loadKey = `${user?.id || user?.username || 'anonymous'}:${activeConfigVersionId || 'v1'}`;
                if (remoteLoadKeyRef.current === loadKey) return;
                remoteLoadKeyRef.current = loadKey;
                loadedRemoteFacilitiesRef.current.clear();
            }, [user, activeConfigVersionId]);

	    // Load initial user session and their facility assignments.
	    // To avoid unnecessary network traffic on the login page, we only
	    // call /api/me when a Basic auth header is already stored
	    // (i.e. after a previous successful login).
	    useEffect(() => {
	        const checkAuth = async () => {
	            try {
	                const storedAuth = localStorage.getItem('dhis2_auth');
	                if (!storedAuth) {
	                    // No credentials persisted yet; skip the /api/me call.
	                    console.log('[AppContext] No stored auth, skipping initial /api/me check');
	                    setAuthInitializing(false);
	                    return;
	                }

	                // Optimize startup: try to restore from localStorage first for instant boot & offline support
	                const cachedUserRaw = localStorage.getItem('dhis2_user');
	                if (cachedUserRaw) {
	                    try {
	                        const cachedUser = JSON.parse(cachedUserRaw);
	                        if (cachedUser && cachedUser.id) {
	                            console.log('[AppContext] Restored cached user session instantly:', cachedUser.username);
	                            setUser(cachedUser);
	                            setAuthInitializing(false);
	                        }
	                    } catch (e) {
	                        console.warn('[AppContext] Failed to parse cached user', e);
	                    }
	                }

	                // Fetch/validate session in the background
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Auth timeout')), 5000));
                const currentUser = await Promise.race([api.getCurrentUser(), timeoutPromise]);
                setUser(currentUser);
                localStorage.setItem('dhis2_user', JSON.stringify(currentUser));
	                console.warn('[AppContext] Session validation failed / user is offline:', error);
	                // If we don't have a cached user session, reset to null
	                if (!localStorage.getItem('dhis2_user')) {
	                    setUser(null);
	                }
	            } finally {
	                setAuthInitializing(false);
	            }
	        };
	        checkAuth();
	    }, []);

    const logout = async () => {
        // Clear any persisted auth in IndexedDB and localStorage so subsequent
        // requests won't carry Authorization headers and the app re-renders to login.
        try {
            await storage.clearAuth();
        } catch (e) {
            console.warn('AppContext.logout: clearAuth failed (non-fatal)', e);
        }
        try {
            localStorage.removeItem('dhis2_auth');
            localStorage.removeItem('dhis2_user');
        } catch (e) {
            console.warn('AppContext.logout: localStorage cleanup failed (non-fatal)', e);
        }

        // Also clear any IndexedDB data related to saved form drafts and cached app data
        try {
            // Clear InspectionFormDB/formData via our service
            await indexedDBService.clearStore();
        } catch (e) {
            console.warn('AppContext.logout: clearing InspectionFormDB failed (non-fatal)', e);
        }

        try {
            // Best-effort clear of other app stores in DHIS2PWA (events, metadata, configuration, stats)
            await new Promise((resolve) => {
                const request = indexedDB.open('DHIS2PWA');
                request.onsuccess = () => {
                    const db = request.result;
                    const stores = ['events', 'metadata', 'configuration', 'stats'].filter((name) =>
                        db.objectStoreNames && db.objectStoreNames.contains(name)
                    );
                    if (stores.length === 0) {
                        db.close();
                        resolve();
                        return;
                    }
                    const tx = db.transaction(stores, 'readwrite');
                    stores.forEach((name) => {
                        try { tx.objectStore(name).clear(); } catch (_) { /* ignore */ }
                    });
                    tx.oncomplete = () => { db.close(); resolve(); };
                    tx.onerror = () => { db.close(); resolve(); };
                };
                request.onerror = () => resolve();
                request.onblocked = () => resolve();
            });
        } catch (e) {
            console.warn('AppContext.logout: clearing DHIS2PWA stores failed (non-fatal)', e);
        }

        // Clear Service Worker caches to remove any offline data/assets
        try {
            if ('caches' in window) {
                const keys = await caches.keys();
                await Promise.all(keys.map((k) => caches.delete(k)));
            }
        } catch (e) {
            console.warn('AppContext.logout: clearing SW caches failed (non-fatal)', e);
        }

        // Nudge service workers to update after cache clear
        try {
            if ('serviceWorker' in navigator) {
                const regs = await navigator.serviceWorker.getRegistrations();
                await Promise.all(regs.map((r) => r.update()));
            }
        } catch (e) {
            console.warn('AppContext.logout: updating service worker failed (non-fatal)', e);
        }

        setUser(null);
        setUserAssignments([]);
    };


    const refreshStats = useCallback(async () => {
        try {
            const drafts = await indexedDBService.getAllDrafts(user);
            const all = await indexedDBService.getAllDrafts(user);
            // getAllDrafts only returns isDraft=true; get synced count separately
            setStats({
                totalEvents: drafts.length,
                pendingEvents: drafts.filter(d => d.syncStatus !== 'synced').length,
                syncedEvents: drafts.filter(d => d.syncStatus === 'synced').length,
                errorEvents: drafts.filter(d => d.syncStatus === 'error').length,
            });
            setPendingEvents(drafts.filter(d => d.syncStatus !== 'synced'));
        } catch (err) {
            console.warn('Could not refresh stats:', err);
        }
    }, [user]);

    // Refresh stats whenever user changes
    useEffect(() => {
        if (user) refreshStats();
    }, [user, refreshStats]);

    const syncEvents = async () => {
        if (!isOnline) {
            showToast('You are offline. Cannot sync.', 'warning');
            return { synced: 0, failed: 0 };
        }
        if (!configuration) {
            showToast('Configuration not loaded yet.', 'warning');
            return { synced: 0, failed: 0 };
        }

        let synced = 0, failed = 0;
        try {
            const drafts = await indexedDBService.getAllDrafts(user);
            const pending = drafts.filter(d => d.syncStatus !== 'synced');
            console.log(`🔄 Syncing ${pending.length} pending draft(s) to DHIS2...`);

            for (const draft of pending) {
                try {
                    const programId = configuration?.program?.id || 'G2gULe4jsfs';
                    const stageId = configuration?.programStage?.id || 'HpHD6u6MV37';
                    const orgUnit = draft.formData?.orgUnit || draft.orgUnit;
                    const teiId = draft.formData?.teiId_internal;

                    if (!orgUnit) throw new Error('Missing orgUnit in draft for sync');
                    if (!teiId) throw new Error('Missing TEI ID in draft for sync');

                    // Resolve latest survey event id first (server truth), with fallback to local stored id
                    let latestEventId = null;
                    try {
                        latestEventId = await api.getLatestSurveyEventId({ programId, stageId, teiId, orgUnitId: orgUnit });
                    } catch (e) {
                        console.warn(`⚠️ Could not fetch latest event id for ${draft.eventId}; falling back to local`, e);
                    }
                    // Prefer an explicitly stored event id if present; otherwise, use latest from server
                    const eventIdForPut = draft.formData?.eventId_internal || latestEventId;
                    if (!eventIdForPut) throw new Error('No survey Event ID available for PUT');

                    // Persist the event id into the draft so subsequent retries are consistent
                    const withEvent = { ...draft.formData, eventId_internal: eventIdForPut };
                    await indexedDBService.saveFormData(draft.eventId, withEvent);

                    // Submit via the same PUT flow as the in-form Save
                    await api.submitEventPut(withEvent, configuration, orgUnit);

                    await indexedDBService.markAsSynced(draft.eventId, eventIdForPut);
                    synced++;
                } catch (err) {
                    console.error(`❌ Failed to sync draft ${draft.eventId}:`, err);
                    await indexedDBService.markAsFailed(draft.eventId, err.message);
                    failed++;
                }
            }

            showToast(`Sync complete: ${synced} synced, ${failed} failed.`, synced > 0 ? 'success' : 'warning');
            await refreshStats();
        } catch (err) {
            console.error('❌ syncEvents error:', err);
            showToast('Sync failed: ' + err.message, 'error');
        }
        return { synced, failed };
    };

    const retryEvent = async (eventId) => {
        if (!isOnline) { showToast('You are offline.', 'warning'); return false; }
        if (!configuration) { showToast('Configuration not loaded.', 'warning'); return false; }
        try {
            const draft = await indexedDBService.getFormData(eventId);
            if (!draft) throw new Error('Draft not found');
            const orgUnit = draft.formData?.orgUnit || draft.orgUnit;
            const programId = configuration?.program?.id || 'G2gULe4jsfs';
            const stageId = configuration?.programStage?.id || 'HpHD6u6MV37';
            const teiId = draft.formData?.teiId_internal;

            if (!orgUnit) throw new Error('Missing orgUnit in draft');
            if (!teiId) throw new Error('Missing TEI ID in draft');

            console.log(`🔄 AppContext: Retrying sync for ${eventId} via Events PUT flow...`);

            let latestEventId = null;
            try {
                latestEventId = await api.getLatestSurveyEventId({ programId, stageId, teiId, orgUnitId: orgUnit });
            } catch (e) {
                console.warn('⚠️ Could not resolve latest survey event id; falling back to local eventId_internal', e);
            }
            const eventIdForPut = draft.formData?.eventId_internal || latestEventId;
            if (!eventIdForPut) throw new Error('No survey Event ID available for PUT');

            const withEvent = { ...draft.formData, eventId_internal: eventIdForPut };
            await indexedDBService.saveFormData(eventId, withEvent);

            await api.submitEventPut(withEvent, configuration, orgUnit);

            await indexedDBService.markAsSynced(eventId, eventIdForPut);
            await refreshStats();
            showToast('Event synced successfully.', 'success');
            return true;
        } catch (err) {
            await indexedDBService.markAsFailed(eventId, err.message);
            showToast('Retry failed: ' + err.message, 'error');
            return false;
        }
    };

    const deleteEvent = async (eventId) => {
        try {
            await indexedDBService.deleteDraft(eventId);
            await refreshStats();
        } catch (err) {
            console.error('Failed to delete draft:', err);
        }
    };

	    const clearAllInspections = async () => {
        try {
            await indexedDBService.clearStore();
            await refreshStats();
            return true;
        } catch (err) {
            console.error('Failed to clear inspections:', err);
            return false;
        }
    };

	    
	    // Derives the final active configuration object from the versioned bundles and DHIS2 metadata.
        const configuration = useMemo(() => {
            if (!activeConfigVersionId || !configBundles[activeConfigVersionId]) {
                return appMetadata || null;
            }
            const bundle = configBundles[activeConfigVersionId];
            return {
                ...bundle.config,
                links: bundle.links,
                compute: bundle.compute,
                ...(appMetadata || {})
            };
        }, [activeConfigVersionId, configBundles, appMetadata]);

        const setConfiguration = useCallback((meta) => {
            setAppMetadata(meta);
        }, []);

	    		    const value = useMemo(() => ({
	        user,
	        setUser,
	        configuration,
	        setConfiguration, // Note: kept for compat, but usually managed via setConfigBundles
	        userAssignments,
	        setUserAssignments,
	        isOnline,
	        stats,
	        pendingEvents,
	        syncEvents,
	        retryEvent,
		        deleteEvent,
		        clearAllInspections,
		        // Backwards-compatible alias for Dashboard "Reset Local Data" button
		        clearAllSurveys: clearAllInspections,
		        configVersions,
		        setConfigVersions,
		        activeConfigVersionId,
		        setActiveConfigVersionId,
		        configBundles,
		        setConfigBundles,
                configSource,
                remoteConfigLoading,
                setConfigSource,
                loadRemoteConfig,
	        showToast,
	        logout,
	        authInitializing,
		    }), [
		        user,
		        configuration,
		        userAssignments,
		        isOnline,
		        stats,
		        pendingEvents,
		        authInitializing,
		        configVersions,
		        activeConfigVersionId,
		        configBundles,
                configSource,
                remoteConfigLoading,
                loadRemoteConfig
		    ]);

    return (
        <AppContext.Provider value={value}>
            {children}
            <Snackbar
                open={toast.open}
                autoHideDuration={5000}
                onClose={closeToast}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            >
                <Alert
                    onClose={closeToast}
                    severity={toast.type}
                    variant="filled"
                    sx={{ width: '100%' }}
                >
                    {toast.message}
                </Alert>
            </Snackbar>
        </AppContext.Provider>
    );
};

export const useApp = () => {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error('useApp must be used within an AppProvider');
    }
    return context;
};
