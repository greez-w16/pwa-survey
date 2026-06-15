import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { api } from '../services/api';
import indexedDBService from '../services/indexedDBService';
import { useStorage } from '../hooks/useStorage';
import emsConfig from '../assets/ems/ems_config.json';
import mortuaryConfig from '../assets/mortuary/mortuary_config.json';
import clinicsConfig from '../assets/clinics/clinics_config.json';
import hospitalConfig from '../assets/hospital/hospital_config.json';
import emsLinks from '../assets/ems/ems_links.json';
import mortuaryLinks from '../assets/mortuary/mortuary_links.json';
import clinicsLinks from '../assets/clinics/clinics_links.json';
import hospitalLinks from '../assets/hospital/hospital_links.json';
import hospitalComputeCriteria from '../assets/hospital/hospital_compute_criteria.json';

import obstericsGynoMatrix from '../assets/obsterics-gyno/obsterics_gyno_matrix.json';
import physiotheraphyMatrix from '../assets/physiotheraphy/physiotheraphy_matrix.json';
import radiologyMatrix from '../assets/radiology/radiology_matrix.json';
import generalPracticeMatrix from '../assets/general-practice/general_practice_matrix.json';
import privateDiabeticMatrix from '../assets/private-diabetic/private_diabetic_matrix.json';
import oralMatrix from '../assets/oral/oral_matrix.json';
import privateOncologyMatrix from '../assets/private-oncology/private_oncology_matrix.json';
import paediatricMatrix from '../assets/paediatric/paediatric_matrix.json';

// Import 8 remaining facility matrices and matrixConfig parser
import { buildConfigFromMatrix } from '../utils/matrixConfig';
import privateMedicalLabMatrix from '../assets/private-medical-lab/private_medical_lab_matrix.json';
import mentalHealthMatrix from '../assets/mental-health/mental_health_matrix.json';
import eyeMatrix from '../assets/eye/eye_matrix.json';
import hospiceMatrix from '../assets/hospice/hospice_matrix.json';
import occupationalHealthMatrix from '../assets/occupational-health/occupational_health_matrix.json';
import urologyMatrix from '../assets/urology/urology_matrix.json';
import childhoodIllnessMatrix from '../assets/childhood-illness/childhood_illness_matrix.json';
import emergencyManagementMatrix from '../assets/emergency-management/emergency_management_matrix.json';

// Parse baseline configs from matrices
const privateMedicalLabConfig = buildConfigFromMatrix('private_medical_lab', privateMedicalLabMatrix.private_medical_lab);
const mentalHealthConfig = buildConfigFromMatrix('mental_health', mentalHealthMatrix.mental_health);
const eyeConfig = buildConfigFromMatrix('eye', eyeMatrix.eye);
const hospiceConfig = buildConfigFromMatrix('hospice', hospiceMatrix.hospice);
const occupationalHealthConfig = buildConfigFromMatrix('occupational_health', occupationalHealthMatrix.occupational_health);
const urologyConfig = buildConfigFromMatrix('urology', urologyMatrix.urology);
const childhoodIllnessConfig = buildConfigFromMatrix('childhood_illness', childhoodIllnessMatrix.childhood_illness);
const emergencyManagementConfig = buildConfigFromMatrix('emergency_management', emergencyManagementMatrix.emergency_management);
const radiologyConfig = buildConfigFromMatrix('radiology', radiologyMatrix.radiology);
const obstericsGynoConfig = buildConfigFromMatrix('obsterics_gyno', obstericsGynoMatrix.obsterics_gyno);
const physiotheraphyConfig = buildConfigFromMatrix('physiotheraphy', physiotheraphyMatrix.physiotheraphy);
const generalPracticeConfig = buildConfigFromMatrix('general_practice', generalPracticeMatrix.general_practice);
const privateDiabeticConfig = buildConfigFromMatrix('private_diabetic', privateDiabeticMatrix.private_diabetic);
const oralConfig = buildConfigFromMatrix('oral', oralMatrix.oral);
const privateOncologyConfig = buildConfigFromMatrix('private_oncology', privateOncologyMatrix.private_oncology);
const paediatricConfig = buildConfigFromMatrix('paediatric', paediatricMatrix.paediatric);

import { cleanStandardStatement } from '../utils/normalization';
import { Alert, Snackbar } from '@mui/material';

const sanitizeConfig = (config) => {
    if (!config) return config;
    const sanitized = JSON.parse(JSON.stringify(config));
    const facilityKeys = [
        'hospital_full_configuration',
        'clinics_full_configuration',
        'ems_full_configuration',
        'mortuary_full_configuration',
        'obsterics_gyno_full_configuration',
        'obgyn_full_configuration',
        'physiotheraphy_full_configuration',
        'physiotherapy_full_configuration',
        'radiology_full_configuration',
        'general_practice_full_configuration',
        'private_diabetic_full_configuration',
        'private_dietetic_full_configuration',
        'oral_full_configuration',
        'private_oncology_full_configuration',
        'oncology_full_configuration',
        'paediatric_full_configuration',
        'private_medical_lab_full_configuration',
        'mental_health_full_configuration',
        'eye_full_configuration',
        'hospice_full_configuration',
        'occupational_health_full_configuration',
        'urology_full_configuration',
        'childhood_illness_full_configuration',
        'emergency_management_full_configuration'
    ];
    facilityKeys.forEach(key => {
        if (Array.isArray(sanitized[key])) {
            sanitized[key].forEach(se => {
                if (Array.isArray(se.sections)) {
                    se.sections.forEach(sec => {
                        if (Array.isArray(sec.standards)) {
                            sec.standards.forEach(std => {
                                std.statement = cleanStandardStatement(std.statement);
                            });
                        }
                    });
                }
            });
        }
    });
    return sanitized;
};


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

    const [otpSecret, setOtpSecret] = useState('QIMS_OFFLINE_SECRET_2026_FALLBACK');

    useEffect(() => {
        const loadOtpSecret = async () => {
            try {
                const secret = await indexedDBService.getConfig('otp_secret');
                if (secret) {
                    setOtpSecret(secret);
                }
            } catch (err) {
                console.warn('AppContext: Failed to load cached otp_secret', err);
            }
        };
        loadOtpSecret();
    }, []);

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
        const [configSource, setConfigSource] = useState('datastore'); // 'datastore' | 'local'
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

		        const baseConfig = sanitizeConfig({
		            ...emsConfig,
		            ...mortuaryConfig,
		            ...clinicsConfig,
		            ...hospitalConfig,
		            obsterics_gyno_full_configuration: obstericsGynoConfig.service_elements,
		            obgyn_full_configuration: obstericsGynoConfig.service_elements,
		            physiotheraphy_full_configuration: physiotheraphyConfig.service_elements,
		            physiotherapy_full_configuration: physiotheraphyConfig.service_elements,
		            radiology_full_configuration: radiologyConfig.service_elements,
		            general_practice_full_configuration: generalPracticeConfig.service_elements,
		            private_diabetic_full_configuration: privateDiabeticConfig.service_elements,
		            private_dietetic_full_configuration: privateDiabeticConfig.service_elements,
		            oral_full_configuration: oralConfig.service_elements,
		            private_oncology_full_configuration: privateOncologyConfig.service_elements,
		            oncology_full_configuration: privateOncologyConfig.service_elements,
		            paediatric_full_configuration: paediatricConfig.service_elements,
		            private_medical_lab_full_configuration: privateMedicalLabConfig.service_elements,
		            mental_health_full_configuration: mentalHealthConfig.service_elements,
		            eye_full_configuration: eyeConfig.service_elements,
		            hospice_full_configuration: hospiceConfig.service_elements,
		            occupational_health_full_configuration: occupationalHealthConfig.service_elements,
		            urology_full_configuration: urologyConfig.service_elements,
		            childhood_illness_full_configuration: childhoodIllnessConfig.service_elements,
		            emergency_management_full_configuration: emergencyManagementConfig.service_elements,
		        });
		        const baseLinks = {
		            ems: emsLinks,
		            mortuary: mortuaryLinks,
		            clinics: clinicsLinks,
		            hospital: hospitalLinks,
		            obgyn: obstericsGynoMatrix.obsterics_gyno,
		            obsterics_gyno: obstericsGynoMatrix.obsterics_gyno,
		            physiotherapy: physiotheraphyMatrix.physiotheraphy,
		            physiotheraphy: physiotheraphyMatrix.physiotheraphy,
		            radiology: radiologyMatrix.radiology,
		            general_practice: generalPracticeMatrix.general_practice,
		            private_diabetic: privateDiabeticMatrix.private_diabetic,
		            private_dietetic: privateDiabeticMatrix.private_diabetic,
		            oral: oralMatrix.oral,
		            oncology: privateOncologyMatrix.private_oncology,
		            private_oncology: privateOncologyMatrix.private_oncology,
		            paediatric: paediatricMatrix.paediatric,
		            private_medical_lab: privateMedicalLabMatrix.private_medical_lab,
		            mental_health: mentalHealthMatrix.mental_health,
		            eye: eyeMatrix.eye,
		            hospice: hospiceMatrix.hospice,
		            occupational_health: occupationalHealthMatrix.occupational_health,
		            urology: urologyMatrix.urology,
		            childhood_illness: childhoodIllnessMatrix.childhood_illness,
		            emergency_management: emergencyManagementMatrix.emergency_management,
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
                    obgyn: [
                        { key: 'obsterics_gyno_full_configuration' },
                        { key: 'obgyn_full_configuration' },
                        { key: 'obgyn_links' },
                    ],
                    physiotherapy: [
                        { key: 'physiotheraphy_full_configuration' },
                        { key: 'physiotherapy_full_configuration' },
                        { key: 'physiotherapy_links' },
                    ],
                    radiology: [
                        { key: 'radiology_full_configuration' },
                        { key: 'radiology_links' },
                    ],
                    general_practice: [
                        { key: 'general_practice_full_configuration' },
                        { key: 'general_practice_links' },
                    ],
                    private_diabetic: [
                        { key: 'private_diabetic_full_configuration' },
                        { key: 'private_dietetic_full_configuration' },
                        { key: 'private_diabetic_links' },
                        { key: 'private_dietetic_links' },
                    ],
                    oral: [
                        { key: 'oral_full_configuration' },
                        { key: 'oral_links' },
                    ],
                    oncology: [
                        { key: 'private_oncology_full_configuration' },
                        { key: 'oncology_full_configuration' },
                        { key: 'private_oncology_links' },
                        { key: 'oncology_links' },
                    ],
                    paediatric: [
                        { key: 'paediatric_full_configuration' },
                        { key: 'paediatric_links' },
                    ],
                    private_medical_lab: [
                        { key: 'private_medical_lab_full_configuration' },
                        { key: 'private_medical_lab_links' },
                    ],
                    private_lab: [
                        { key: 'private_medical_lab_full_configuration' },
                        { key: 'private_medical_lab_links' },
                    ],
                    mental_health: [
                        { key: 'mental_health_full_configuration' },
                        { key: 'mental_health_links' },
                    ],
                    eye: [
                        { key: 'eye_full_configuration' },
                        { key: 'eye_links' },
                    ],
                    hospice: [
                        { key: 'hospice_full_configuration' },
                        { key: 'hospice_links' },
                    ],
                    hospice_palliative: [
                        { key: 'hospice_full_configuration' },
                        { key: 'hospice_links' },
                    ],
                    occupational_health: [
                        { key: 'occupational_health_full_configuration' },
                        { key: 'occupational_health_links' },
                    ],
                    urology: [
                        { key: 'urology_full_configuration' },
                        { key: 'urology_links' },
                    ],
                    urology_nephrology: [
                        { key: 'urology_full_configuration' },
                        { key: 'urology_links' },
                    ],
                    childhood_illness: [
                        { key: 'childhood_illness_full_configuration' },
                        { key: 'childhood_illness_links' },
                    ],
                    imci: [
                        { key: 'childhood_illness_full_configuration' },
                        { key: 'childhood_illness_links' },
                    ],
                    emergency_management: [
                        { key: 'emergency_management_full_configuration' },
                        { key: 'emergency_management_links' },
                    ],
                    emonc: [
                        { key: 'emergency_management_full_configuration' },
                        { key: 'emergency_management_links' },
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
                    let loadedFromCache = false;
                    for (const { key } of keys) {
                        try {
                            const val = await api.getDataStoreItem(NAMESPACE, key);
                            if (val) {
                                fetchedData[key] = val;
                                // Save to IndexedDB configuration cache
                                await indexedDBService.saveConfig(key, val).catch(err => {
                                    console.warn(`[AppContext] Failed to cache key ${key} in IndexedDB`, err);
                                });
                            }
                        } catch (e) {
                            console.warn(`[AppContext] Failed to fetch key ${key} from DataStore, trying local IndexedDB cache`, e);
                            try {
                                const cachedVal = await indexedDBService.getConfig(key);
                                if (cachedVal) {
                                    fetchedData[key] = cachedVal;
                                    loadedFromCache = true;
                                    console.info(`[AppContext] Loaded key ${key} from local IndexedDB cache`);
                                }
                            } catch (cacheErr) {
                                console.warn(`[AppContext] Failed to read key ${key} from local IndexedDB cache`, cacheErr);
                            }
                        }
                    }

                    // Fetch otp_secret from DataStore as well
                    try {
                        const secretVal = await api.getDataStoreItem(NAMESPACE, 'otp_secret');
                        if (secretVal) {
                            const cleanSecret = typeof secretVal === 'object' ? (secretVal.value || secretVal.secret || secretVal) : secretVal;
                            if (cleanSecret && typeof cleanSecret === 'string') {
                                setOtpSecret(cleanSecret);
                                await indexedDBService.saveConfig('otp_secret', cleanSecret);
                            }
                        }
                    } catch (e) {
                        console.warn('[AppContext] Failed to fetch otp_secret from DataStore, falling back to local', e);
                    }

                    // Only update if we successfully fetched at least some configuration
                    if (Object.keys(fetchedData).length > 0) {
                        setConfigBundles(prev => {
                            const next = { ...prev };
                            const activeId = activeConfigVersionId || 'v1';
                            const currentBundle = next[activeId] || {};

                             const remoteConfig = sanitizeConfig({
                                ...currentBundle.config,
                                ...(unwrapDataStoreArray(fetchedData.hospital_full_configuration, 'hospital_full_configuration') ? { hospital_full_configuration: unwrapDataStoreArray(fetchedData.hospital_full_configuration, 'hospital_full_configuration') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.clinics_full_configuration, 'clinics_full_configuration') ? { clinics_full_configuration: unwrapDataStoreArray(fetchedData.clinics_full_configuration, 'clinics_full_configuration') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.ems_full_configuration, 'ems_full_configuration') ? { ems_full_configuration: unwrapDataStoreArray(fetchedData.ems_full_configuration, 'ems_full_configuration') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.mortuary_full_configuration, 'mortuary_full_configuration') ? { mortuary_full_configuration: unwrapDataStoreArray(fetchedData.mortuary_full_configuration, 'mortuary_full_configuration') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.obsterics_gyno_full_configuration, 'obsterics_gyno_full_configuration') ? { obsterics_gyno_full_configuration: unwrapDataStoreArray(fetchedData.obsterics_gyno_full_configuration, 'obsterics_gyno_full_configuration') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.obgyn_full_configuration, 'obgyn_full_configuration') ? { obgyn_full_configuration: unwrapDataStoreArray(fetchedData.obgyn_full_configuration, 'obgyn_full_configuration') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.physiotheraphy_full_configuration, 'physiotheraphy_full_configuration') ? { physiotheraphy_full_configuration: unwrapDataStoreArray(fetchedData.physiotheraphy_full_configuration, 'physiotheraphy_full_configuration') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.physiotherapy_full_configuration, 'physiotherapy_full_configuration') ? { physiotherapy_full_configuration: unwrapDataStoreArray(fetchedData.physiotherapy_full_configuration, 'physiotherapy_full_configuration') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.radiology_full_configuration, 'radiology_full_configuration') ? { radiology_full_configuration: unwrapDataStoreArray(fetchedData.radiology_full_configuration, 'radiology_full_configuration') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.general_practice_full_configuration, 'general_practice_full_configuration') ? { general_practice_full_configuration: unwrapDataStoreArray(fetchedData.general_practice_full_configuration, 'general_practice_full_configuration') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.private_diabetic_full_configuration, 'private_diabetic_full_configuration') ? { private_diabetic_full_configuration: unwrapDataStoreArray(fetchedData.private_diabetic_full_configuration, 'private_diabetic_full_configuration') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.private_dietetic_full_configuration, 'private_dietetic_full_configuration') ? { private_dietetic_full_configuration: unwrapDataStoreArray(fetchedData.private_dietetic_full_configuration, 'private_dietetic_full_configuration') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.oral_full_configuration, 'oral_full_configuration') ? { oral_full_configuration: unwrapDataStoreArray(fetchedData.oral_full_configuration, 'oral_full_configuration') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.private_oncology_full_configuration, 'private_oncology_full_configuration') ? { private_oncology_full_configuration: unwrapDataStoreArray(fetchedData.private_oncology_full_configuration, 'private_oncology_full_configuration') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.oncology_full_configuration, 'oncology_full_configuration') ? { oncology_full_configuration: unwrapDataStoreArray(fetchedData.oncology_full_configuration, 'oncology_full_configuration') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.paediatric_full_configuration, 'paediatric_full_configuration') ? { paediatric_full_configuration: unwrapDataStoreArray(fetchedData.paediatric_full_configuration, 'paediatric_full_configuration') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.private_medical_lab_full_configuration, 'private_medical_lab_full_configuration') ? { private_medical_lab_full_configuration: unwrapDataStoreArray(fetchedData.private_medical_lab_full_configuration, 'private_medical_lab_full_configuration') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.mental_health_full_configuration, 'mental_health_full_configuration') ? { mental_health_full_configuration: unwrapDataStoreArray(fetchedData.mental_health_full_configuration, 'mental_health_full_configuration') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.eye_full_configuration, 'eye_full_configuration') ? { eye_full_configuration: unwrapDataStoreArray(fetchedData.eye_full_configuration, 'eye_full_configuration') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.hospice_full_configuration, 'hospice_full_configuration') ? { hospice_full_configuration: unwrapDataStoreArray(fetchedData.hospice_full_configuration, 'hospice_full_configuration') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.occupational_health_full_configuration, 'occupational_health_full_configuration') ? { occupational_health_full_configuration: unwrapDataStoreArray(fetchedData.occupational_health_full_configuration, 'occupational_health_full_configuration') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.urology_full_configuration, 'urology_full_configuration') ? { urology_full_configuration: unwrapDataStoreArray(fetchedData.urology_full_configuration, 'urology_full_configuration') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.childhood_illness_full_configuration, 'childhood_illness_full_configuration') ? { childhood_illness_full_configuration: unwrapDataStoreArray(fetchedData.childhood_illness_full_configuration, 'childhood_illness_full_configuration') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.emergency_management_full_configuration, 'emergency_management_full_configuration') ? { emergency_management_full_configuration: unwrapDataStoreArray(fetchedData.emergency_management_full_configuration, 'emergency_management_full_configuration') } : {}),
                            });

                            const remoteLinks = {
                                ...currentBundle.links,
                                ...(unwrapDataStoreArray(fetchedData.ems_links, 'ems_links') ? { ems: unwrapDataStoreArray(fetchedData.ems_links, 'ems_links') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.hospital_links, 'hospital_links') ? { hospital: unwrapDataStoreArray(fetchedData.hospital_links, 'hospital_links') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.clinics_links, 'clinics_links') ? { clinics: unwrapDataStoreArray(fetchedData.clinics_links, 'clinics_links') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.mortuary_links, 'mortuary_links') ? { mortuary: unwrapDataStoreArray(fetchedData.mortuary_links, 'mortuary_links') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.obgyn_links, 'obgyn_links') ? { obgyn: unwrapDataStoreArray(fetchedData.obgyn_links, 'obgyn_links'), obsterics_gyno: unwrapDataStoreArray(fetchedData.obgyn_links, 'obgyn_links') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.physiotherapy_links, 'physiotherapy_links') ? { physiotherapy: unwrapDataStoreArray(fetchedData.physiotherapy_links, 'physiotherapy_links'), physiotheraphy: unwrapDataStoreArray(fetchedData.physiotherapy_links, 'physiotherapy_links') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.radiology_links, 'radiology_links') ? { radiology: unwrapDataStoreArray(fetchedData.radiology_links, 'radiology_links') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.general_practice_links, 'general_practice_links') ? { general_practice: unwrapDataStoreArray(fetchedData.general_practice_links, 'general_practice_links') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.private_diabetic_links, 'private_diabetic_links') ? { private_diabetic: unwrapDataStoreArray(fetchedData.private_diabetic_links, 'private_diabetic_links'), private_dietetic: unwrapDataStoreArray(fetchedData.private_diabetic_links, 'private_diabetic_links') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.private_dietetic_links, 'private_dietetic_links') ? { private_dietetic: unwrapDataStoreArray(fetchedData.private_dietetic_links, 'private_dietetic_links'), private_diabetic: unwrapDataStoreArray(fetchedData.private_dietetic_links, 'private_dietetic_links') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.oral_links, 'oral_links') ? { oral: unwrapDataStoreArray(fetchedData.oral_links, 'oral_links') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.private_oncology_links, 'private_oncology_links') ? { private_oncology: unwrapDataStoreArray(fetchedData.private_oncology_links, 'private_oncology_links'), oncology: unwrapDataStoreArray(fetchedData.private_oncology_links, 'private_oncology_links') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.oncology_links, 'oncology_links') ? { oncology: unwrapDataStoreArray(fetchedData.oncology_links, 'oncology_links'), private_oncology: unwrapDataStoreArray(fetchedData.oncology_links, 'oncology_links') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.paediatric_links, 'paediatric_links') ? { paediatric: unwrapDataStoreArray(fetchedData.paediatric_links, 'paediatric_links') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.private_medical_lab_links, 'private_medical_lab_links') ? { private_medical_lab: unwrapDataStoreArray(fetchedData.private_medical_lab_links, 'private_medical_lab_links') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.mental_health_links, 'mental_health_links') ? { mental_health: unwrapDataStoreArray(fetchedData.mental_health_links, 'mental_health_links') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.eye_links, 'eye_links') ? { eye: unwrapDataStoreArray(fetchedData.eye_links, 'eye_links') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.hospice_links, 'hospice_links') ? { hospice: unwrapDataStoreArray(fetchedData.hospice_links, 'hospice_links') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.occupational_health_links, 'occupational_health_links') ? { occupational_health: unwrapDataStoreArray(fetchedData.occupational_health_links, 'occupational_health_links') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.urology_links, 'urology_links') ? { urology: unwrapDataStoreArray(fetchedData.urology_links, 'urology_links') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.childhood_illness_links, 'childhood_illness_links') ? { childhood_illness: unwrapDataStoreArray(fetchedData.childhood_illness_links, 'childhood_illness_links') } : {}),
                                ...(unwrapDataStoreArray(fetchedData.emergency_management_links, 'emergency_management_links') ? { emergency_management: unwrapDataStoreArray(fetchedData.emergency_management_links, 'emergency_management_links') } : {}),
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
                        console.info('[AppContext] Configuration bundle loaded successfully.');
                        if (loadedFromCache) {
                            showToast?.('Configuration loaded from local offline cache.', 'info');
                        } else {
                            showToast?.('Remote configuration loaded from DataStore successfully.', 'success');
                        }
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
                try {
                    const currentUser = await Promise.race([api.getCurrentUser(), timeoutPromise]);
                    setUser(currentUser);
                    localStorage.setItem('dhis2_user', JSON.stringify(currentUser));
                } catch (error) {
	                console.warn('[AppContext] Session validation failed / user is offline:', error);
	                // If we don't have a cached user session, reset to null
	                if (!localStorage.getItem('dhis2_user')) {
	                    setUser(null);
	                }
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
            otpSecret,
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
                loadRemoteConfig,
                otpSecret
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
