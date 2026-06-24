/**
 * Custom hook for incremental field-by-field saving to IndexedDB
 * Provides debounced saving to avoid excessive writes
 */
import { useCallback, useRef, useEffect, useState } from 'react';
import indexedDBService from '../services/indexedDBService';

export const useIncrementalSave = (eventId, options = {}) => {
    const {
        debounceMs = 300,
        onSaveSuccess,
        onSaveError,
        enableLogging = true,
        user = null // Accept user object to avoid async lookup failures
    } = options;
    // Use refs for callbacks to keep internal functions stable
    const onSaveSuccessRef = useRef(onSaveSuccess);
    // Keep track of latest user to avoid stale closures in timeouts
    const userRef = useRef(user);
    useEffect(() => {
        userRef.current = user;
        if (enableLogging && user) console.log("🔧 useIncrementalSave: User updated in ref:", user.username);
    }, [user, enableLogging]);

    // Use refs for callbacks to keep internal functions stable
    const onSaveErrorRef = useRef(onSaveError);
    useEffect(() => {
        onSaveSuccessRef.current = onSaveSuccess;
        onSaveErrorRef.current = onSaveError;
    }, [onSaveSuccess, onSaveError]);

    // Form data state
    const [formData, setFormData] = useState({});
    const [pendingFields, setPendingFields] = useState(new Set());
    const [syncedFields, setSyncedFields] = useState(new Set());
    const [syncStatus, setSyncStatus] = useState('pending'); // 'pending' | 'synced' | 'error'

    // Store pending saves to batch them
    const pendingSaves = useRef(new Map());
    const saveTimeoutRef = useRef(null);
    const isInitialized = useRef(false);

    // Initialize IndexedDB on first use
    useEffect(() => {
        const initDB = async () => {
            if (!isInitialized.current) {
                try {
                    await indexedDBService.init();
                    isInitialized.current = true;
                    if (enableLogging) console.log('🔧 useIncrementalSave: IndexedDB initialized');
                } catch (error) {
                    console.error('❌ useIncrementalSave: Failed to initialize IndexedDB:', error);
                    if (onSaveError) onSaveError(error);
                }
            }
        };
        initDB();
    }, [onSaveError, enableLogging]);

    // Clear state immediately when eventId changes to prevent data leak between forms
    useEffect(() => {
        if (enableLogging) console.log(`🔄 useIncrementalSave: eventId changed to ${eventId}, clearing local state.`);
        setFormData({});
        setPendingFields(new Set());
        setSyncedFields(new Set());
        setSyncStatus('pending');
        setLastSaved(null);
        // Clear pending saves to prevent old data from being written to new ID
        pendingSaves.current.clear();
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    }, [eventId, enableLogging]);

    // Save status state
    const [isSaving, setIsSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState(null);

    // Debounced save function
    const debouncedSave = useCallback(async () => {
        if (pendingSaves.current.size === 0) return;

        setIsSaving(true);
        try {
            const updates = Array.from(pendingSaves.current.entries());

            // Get latest user from ref
            const currentUser = userRef.current;

            if (enableLogging) {
                console.log(`💾 Saving ${updates.length} field(s) to IndexedDB. User:`, currentUser?.username || 'anonymous');
            }

            // Save all fields at once in a single transaction
            const fieldsMap = Object.fromEntries(updates);
            await indexedDBService.saveFormDataMultiple(eventId, fieldsMap, {}, currentUser);
            
            // Clear from pending fields
            setPendingFields(prev => {
                const next = new Set(prev);
                updates.forEach(([k]) => next.delete(k));
                return next;
            });

            // Clear pending saves
            pendingSaves.current.clear();

            const timestamp = new Date();
            setLastSaved(timestamp);
            setIsSaving(false);

            // Notify success
            if (onSaveSuccessRef.current) {
                onSaveSuccessRef.current({
                    eventId,
                    savedFields: updates.length,
                    timestamp: timestamp.toISOString()
                });
            }
        } catch (error) {
            console.error('❌ Failed to save fields to IndexedDB:', error);
            setIsSaving(false);
            if (onSaveErrorRef.current) onSaveErrorRef.current(error);
        }
    }, [eventId, enableLogging, user]); // Added user to dependencies

    // Save field function
    const saveField = useCallback((fieldKey, fieldValue) => {
        if (!eventId) {
            console.warn('⚠️ useIncrementalSave: No eventId provided, skipping save');
            return;
        }

        // Update local state immediately
        setFormData(prev => ({
            ...prev,
            [fieldKey]: fieldValue
        }));

        // Track as pending save and unsynced
        setPendingFields(prev => {
            const next = new Set(prev);
            next.add(fieldKey);
            return next;
        });
        setSyncedFields(prev => {
            const next = new Set(prev);
            next.delete(fieldKey);
            return next;
        });
        setSyncStatus('pending');

        // Add to pending saves
        pendingSaves.current.set(fieldKey, fieldValue);
        setIsSaving(true); // Indicate pending save

        // Clear existing timeout
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }
        // Set new debounced save
        saveTimeoutRef.current = setTimeout(() => {
            debouncedSave();
        }, debounceMs);
    }, [eventId, debounceMs, debouncedSave]);

    // Load existing form data
    const loadFormData = useCallback(async () => {
        if (!eventId) {
            setFormData({});
            setSyncStatus('pending');
            setLastSaved(null);
            return null;
        }
        try {
            const data = await indexedDBService.getFormData(eventId);
            if (data && data.formData) {
                if (enableLogging) console.log(`📂 useIncrementalSave: Loaded existing draft for ${eventId}`);
                setFormData(data.formData);
                setSyncStatus(data.syncStatus || 'pending');
                if (data.syncStatus === 'synced') {
                    setSyncedFields(new Set(Object.keys(data.formData)));
                } else {
                    setSyncedFields(new Set());
                }
                if (data.lastUpdated) {
                    setLastSaved(new Date(data.lastUpdated));
                }
                return data;
            } else {
                if (enableLogging) console.log(`📂 useIncrementalSave: No draft found for ${eventId}, starting fresh.`);
                setFormData({});
                setSyncedFields(new Set());
                setSyncStatus('pending');
                setLastSaved(null);
            }
            return null;
        } catch (error) {
            console.error('❌ Failed to load form data:', error);
            setFormData({});
            setSyncedFields(new Set());
            setSyncStatus('pending');
            setLastSaved(null);
            return null;
        }
    }, [eventId, enableLogging]);

    // Automatically mark all current form fields as synced when syncStatus is 'synced'
    useEffect(() => {
        if (syncStatus === 'synced' && formData) {
            setSyncedFields(new Set(Object.keys(formData)));
        }
    }, [syncStatus, formData]);

    return {
        formData,
        setFormData,
        saveField,
        loadFormData,
        isSaving,
        lastSaved,
        syncStatus,
        setSyncStatus,
        pendingFields,
        syncedFields
    };
};

