/**
 * IndexedDB Service for Incremental Form Data Saving
 * Provides real-time field-by-field persistence for inspection forms
 */
class IndexedDBService {
    constructor() {
        this.dbName = 'InspectionFormDB';
        this.version = 7; // BUMP TO 7 FOR CONFIG FALLBACK STORE
        this.storeName = 'formData';
        this.configStoreName = 'surveyConfigs';
        this.db = null;
        this.initPromise = null;
    }

    /**
     * Initialize IndexedDB connection
     */
    async init() {
        if (this.db) return this.db;
        if (this.initPromise) return this.initPromise;

        this.initPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => {
                console.error('❌ IndexedDB failed to open:', request.error);
                this.initPromise = null;
                reject(request.error);
            };

            request.onblocked = () => {
                console.warn('⚠️ IndexedDB open blocked. Please close other tabs of this app.');
                this.initPromise = null;
                reject(new Error('IndexedDB open blocked'));
            };

            request.onsuccess = () => {
                this.db = request.result;
                console.log(`✅ IndexedDB initialized successfully (Version ${this.db.version})`);
                // Opportunistic cleanup of old synced records to keep storage
                // usage under control. This runs in the background and does
                // not block the caller.
                this.cleanupSyncedRecords().catch((err) => {
                    console.warn('⚠️ IndexedDB cleanup failed (non-fatal):', err);
                });
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                console.log(`🔄 IndexedDB Upgrade Needed: ${event.oldVersion} -> ${event.newVersion}`);
                const db = event.target.result;

                // Create object store if it doesn't exist
                if (!db.objectStoreNames.contains(this.storeName)) {
                    const store = db.createObjectStore(this.storeName, { keyPath: 'eventId' });

                    // Create indexes for efficient querying
                    store.createIndex('lastUpdated', 'lastUpdated', { unique: false });
                    store.createIndex('isDraft', 'metadata.isDraft', { unique: false });
                    store.createIndex('facilityId', 'formData.orgUnit', { unique: false });
                    store.createIndex('userId', 'userId', { unique: false });
                    store.createIndex('userIdAndDraft', ['userId', 'metadata.isDraft'], { unique: false });

                    console.log('📦 Created IndexedDB object store:', this.storeName);
                } else {
                    // Upgrade existing store
                    const transaction = event.target.transaction;
                    const store = transaction.objectStore(this.storeName);

                    // Add new indexes if they don't exist
                    if (!store.indexNames.contains('userId')) {
                        store.createIndex('userId', 'userId', { unique: false });
                        console.log('📦 Added userId index to existing store');
                    }
                    if (!store.indexNames.contains('userIdAndDraft')) {
                        store.createIndex('userIdAndDraft', ['userId', 'metadata.isDraft'], { unique: false });
                        console.log('📦 Added userIdAndDraft compound index to existing store');
                    }
                }

                // Create config store if it doesn't exist
                if (!db.objectStoreNames.contains(this.configStoreName)) {
                    db.createObjectStore(this.configStoreName, { keyPath: 'key' });
                    console.log('📦 Created IndexedDB object store:', this.configStoreName);
                }
            };
        });

        return this.initPromise;
    }

    /**
     * Get current user information from storage
     */
    async getCurrentUser() {
        try {
            const request = indexedDB.open('DHIS2PWA');

            return new Promise((resolve) => {
                request.onsuccess = () => {
                    const db = request.result;
                    if (!db.objectStoreNames.contains('auth')) {
                        db.close();
                        resolve(null);
                        return;
                    }

                    const transaction = db.transaction(['auth'], 'readonly');
                    const store = transaction.objectStore('auth');
                    const authRequest = store.get('current');

                    authRequest.onsuccess = () => {
                        const authData = authRequest.result;
                        db.close();
                        resolve(authData?.user || null);
                    };

                    authRequest.onerror = () => {
                        console.warn('⚠️ Could not get auth data');
                        db.close();
                        resolve(null);
                    };
                };

                request.onerror = () => {
                    resolve(null);
                };

                request.onblocked = () => {
                    resolve(null);
                }
            });
        } catch (error) {
            console.warn('⚠️ Error getting current user:', error);
            return null;
        }
    }

    /**
     * Save form data incrementally (field by field)
     */
    async saveFormData(eventId, fieldKey, fieldValue, metadata = {}, user = null) {
        if (!this.db) {
            await this.init();
        }

        // Use passed user or fetch from storage if not provided
        let currentUser = user;
        if (!currentUser) {
            currentUser = await this.getCurrentUser();
        }

	        const userId = currentUser?.username || currentUser?.id || 'anonymous';

	        // First, check if a record already exists for this event so we can
	        // decide whether to enforce the per-user draft limit. This uses a
	        // separate read transaction to avoid keeping a write transaction
	        // open across async work, which can cause TransactionInactiveError.
	        let existingData = null;
	        try {
	            existingData = await this.getFormData(eventId);
	        } catch (readErr) {
	            console.warn('⚠️ saveFormData: failed to read existing draft, treating as new.', readErr);
	        }

	        const isExistingDraft = Boolean(existingData);

	        // When creating a brand new draft, enforce a per-user limit so we
	        // don't accumulate unbounded offline data. Existing drafts can always
	        // be updated.
	        if (!isExistingDraft) {
	            await this.enforceDraftLimitForUser(currentUser, 5);
	        }

	        const baseData = existingData || {
	            eventId: eventId,
	            userId: userId,
	            userDisplayName: currentUser?.displayName || userId,
	            formData: {},
	            syncStatus: 'pending',   // 'pending' | 'synced' | 'error'
	            syncError: null,
	            syncedAt: null,
	            metadata: {
	                isDraft: true,
	                completedSections: [],
	                currentSection: null,
	                ...metadata
	            },
	            createdAt: new Date().toISOString(),
	            lastUpdated: new Date().toISOString()
	        };

	        // ALWAYS update ownership if we have a valid user (claims anonymous drafts)
	        if (userId !== 'anonymous') {
	            baseData.userId = userId;
	            baseData.userDisplayName = currentUser?.displayName || userId;
	        }

	        baseData.formData[fieldKey] = fieldValue;
	        baseData.lastUpdated = new Date().toISOString();

	        if (metadata) {
	            baseData.metadata = { ...baseData.metadata, ...metadata };
	        }

	        return new Promise((resolve, reject) => {
	            const transaction = this.db.transaction([this.storeName], 'readwrite');
	            const store = transaction.objectStore(this.storeName);

	            console.log(`IndexedDBService: Saving object for ${eventId}:`, baseData);
	            const putRequest = store.put(baseData);

	            putRequest.onsuccess = () => {
	                console.log(`💾 Saved field ${fieldKey} to IndexedDB for event ${eventId}`);
	                resolve(baseData);
	            };

	            putRequest.onerror = () => {
	                const err = putRequest.error;
	                console.error('❌ Failed to save field:', err);
	                // Surface quota issues with a clearer, typed error so the
	                // UI can guide the user to sync/clear local data.
	                if (err && (err.name === 'QuotaExceededError' || /quota/i.test(err.message || ''))) {
	                    const friendly = new Error('LOCAL_QUOTA_EXCEEDED');
	                    friendly.code = 'LOCAL_QUOTA_EXCEEDED';
	                    friendly.originalError = err;
	                    reject(friendly);
	                } else {
	                    reject(err);
	                }
	            };
	        });
    }

    /**
     * Save multiple form data fields at once in a single transaction
     */
    async saveFormDataMultiple(eventId, fieldsMap, metadata = {}, user = null) {
        if (!this.db) {
            await this.init();
        }

        let currentUser = user;
        if (!currentUser) {
            currentUser = await this.getCurrentUser();
        }

        const userId = currentUser?.username || currentUser?.id || 'anonymous';

        let existingData = null;
        try {
            existingData = await this.getFormData(eventId);
        } catch (readErr) {
            console.warn('⚠️ saveFormDataMultiple: failed to read existing draft, treating as new.', readErr);
        }

        const isExistingDraft = Boolean(existingData);

        if (!isExistingDraft) {
            await this.enforceDraftLimitForUser(currentUser, 5);
        }

        const baseData = existingData || {
            eventId: eventId,
            userId: userId,
            userDisplayName: currentUser?.displayName || userId,
            formData: {},
            syncStatus: 'pending',
            syncError: null,
            syncedAt: null,
            metadata: {
                isDraft: true,
                completedSections: [],
                currentSection: null,
                ...metadata
            },
            createdAt: new Date().toISOString(),
            lastUpdated: new Date().toISOString()
        };

        if (userId !== 'anonymous') {
            baseData.userId = userId;
            baseData.userDisplayName = currentUser?.displayName || userId;
        }

        // Apply all field updates at once
        Object.entries(fieldsMap).forEach(([fieldKey, fieldValue]) => {
            baseData.formData[fieldKey] = fieldValue;
        });
        baseData.lastUpdated = new Date().toISOString();

        if (metadata) {
            baseData.metadata = { ...baseData.metadata, ...metadata };
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);

            const putRequest = store.put(baseData);

            putRequest.onsuccess = () => {
                console.log(`💾 Saved ${Object.keys(fieldsMap).length} fields to IndexedDB for event ${eventId}`);
                resolve(baseData);
            };

            putRequest.onerror = () => {
                const err = putRequest.error;
                console.error('❌ Failed to save fields:', err);
                if (err && (err.name === 'QuotaExceededError' || /quota/i.test(err.message || ''))) {
                    const friendly = new Error('LOCAL_QUOTA_EXCEEDED');
                    friendly.code = 'LOCAL_QUOTA_EXCEEDED';
                    friendly.originalError = err;
                    reject(friendly);
                } else {
                    reject(err);
                }
            };
        });
    }

    /**
     * Save complete form data
     */
    async saveCompleteFormData(eventId, formData, metadata = {}) {
        if (!this.db) {
            await this.init();
        }

        const currentUser = await this.getCurrentUser();
        const userId = currentUser?.username || currentUser?.id || 'anonymous';

	        return new Promise((resolve, reject) => {
	            const transaction = this.db.transaction([this.storeName], 'readwrite');
	            const store = transaction.objectStore(this.storeName);

	            const data = {
	                eventId: eventId,
	                userId: userId,
	                userDisplayName: currentUser?.displayName || userId,
	                formData: formData,
	                metadata: {
	                    isDraft: true,
	                    completedSections: [],
	                    currentSection: null,
	                    ...metadata
	                },
	                createdAt: new Date().toISOString(),
	                lastUpdated: new Date().toISOString()
	            };

	            const request = store.put(data);

	            request.onsuccess = () => {
	                console.log(`💾 Saved complete form data to IndexedDB for event ${eventId}`);
	                resolve(data);
	            };

	            request.onerror = () => {
	                const err = request.error;
	                console.error('❌ Failed to save complete form data:', err);
	                if (err && (err.name === 'QuotaExceededError' || /quota/i.test(err.message || ''))) {
	                    const friendly = new Error('LOCAL_QUOTA_EXCEEDED');
	                    friendly.code = 'LOCAL_QUOTA_EXCEEDED';
	                    friendly.originalError = err;
	                    reject(friendly);
	                } else {
	                    reject(err);
	                }
	            };
	        });
    }

    /**
     * Get form data by event ID
     */
    async getFormData(eventId) {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);
            const request = store.get(eventId);

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Get all draft forms for the current user
     */
    async getAllDrafts(user = null) {
        if (!this.db) {
            await this.init();
        }

        let currentUser = user;
        if (!currentUser) {
            currentUser = await this.getCurrentUser();
        }

        let userId = currentUser?.username || currentUser?.id || 'anonymous';

        if (typeof userId !== 'string') {
            userId = String(userId);
        }

        console.log(`IndexedDBService: Getting drafts for user: "${userId}" (type: ${typeof userId})`);

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readonly');
            const store = transaction.objectStore(this.storeName);

            // DEBUG: FETCH EVERYTHING to verify data existence
            const request = store.getAll();

            request.onsuccess = () => {
                const allItems = request.result;
                console.log("IndexedDBService: ALL ITEMS IN STORE (DEBUG DUMP):", allItems);

                const drafts = allItems.filter(draft =>
                    draft.userId === userId && draft.metadata?.isDraft === true
                );

                console.log(`📋 Retrieved ${drafts.length} draft forms for user ${userId} (Filtered in memory)`);
                resolve(drafts);
            };

	            request.onerror = () => {
	                console.error('❌ Failed to get all drafts:', request.error);
	                reject(request.error);
	            };
	        });
	    }

	    /**
	     * Enforce a maximum number of *draft* records per user.
	     *
	     * This does not delete any active drafts; instead, if the user already
	     * has maxDrafts or more drafts, it throws a typed error so the caller
	     * can prompt them to sync or clear old data.
	     */
	    async enforceDraftLimitForUser(user = null, maxDrafts = 5) {
	        const drafts = await this.getAllDrafts(user);
	        if (!Array.isArray(drafts)) return;
	        if (drafts.length < maxDrafts) return;

	        const err = new Error('DRAFT_LIMIT_EXCEEDED');
	        err.code = 'DRAFT_LIMIT_EXCEEDED';
	        err.currentDrafts = drafts.length;
	        err.maxDrafts = maxDrafts;
	        throw err;
	    }

	    /**
	     * Clean up old, already-synced records (non-drafts) to reduce long-term
	     * storage growth. We keep up to `maxPerUser` synced records per user and
	     * optionally drop any that are older than `maxAgeDays`.
	     */
	    async cleanupSyncedRecords(maxPerUser = 20, maxAgeDays = 365) {
	        if (!this.db) {
	            await this.init();
	        }

	        const cutoff = maxAgeDays ? Date.now() - maxAgeDays * 24 * 60 * 60 * 1000 : null;

	        // Step 1: read all records
	        const allItems = await new Promise((resolve, reject) => {
	            const tx = this.db.transaction([this.storeName], 'readonly');
	            const store = tx.objectStore(this.storeName);
	            const request = store.getAll();
	            request.onsuccess = () => resolve(request.result || []);
	            request.onerror = () => reject(request.error);
	        });

	        const byUser = new Map();
	        for (const rec of allItems) {
	            const isDraft = rec?.metadata?.isDraft === true;
	            const isSynced = rec?.syncStatus === 'synced' || rec?.metadata?.isDraft === false;
	            if (!isSynced || isDraft) continue;

	            const uid = rec.userId || 'anonymous';
	            if (!byUser.has(uid)) byUser.set(uid, []);
	            byUser.get(uid).push(rec);
	        }

	        const toDeleteIds = [];
	        byUser.forEach((list) => {
	            list.sort((a, b) => {
	                const ta = Date.parse(a.syncedAt || a.lastUpdated || a.createdAt || 0) || 0;
	                const tb = Date.parse(b.syncedAt || b.lastUpdated || b.createdAt || 0) || 0;
	                return tb - ta; // newest first
	            });

	            list.forEach((rec, index) => {
	                const ts = Date.parse(rec.syncedAt || rec.lastUpdated || rec.createdAt || 0) || 0;
	                const tooOld = cutoff && ts && ts < cutoff;
	                const overLimit = index >= maxPerUser;
	                if (tooOld || overLimit) {
	                    toDeleteIds.push(rec.eventId);
	                }
	            });
	        });

	        if (toDeleteIds.length === 0) {
	            return 0;
	        }

	        // Step 2: delete selected records in a write transaction
	        await new Promise((resolve, reject) => {
	            const tx = this.db.transaction([this.storeName], 'readwrite');
	            const store = tx.objectStore(this.storeName);
	            toDeleteIds.forEach((id) => store.delete(id));
	            tx.oncomplete = () => resolve();
	            tx.onerror = () => reject(tx.error);
	        });

	        console.log(`🧹 cleanupSyncedRecords: removed ${toDeleteIds.length} synced records from IndexedDB`);
	        return toDeleteIds.length;
	    }

    /**
     * Delete a form draft
     */
    async deleteDraft(eventId) {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.delete(eventId);

            request.onsuccess = () => {
                console.log(`🗑️ Deleted draft ${eventId} from IndexedDB`);
                resolve();
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Clear all data from the store
     */
    async clearStore() {
        if (!this.db) {
            await this.init();
        }

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.storeName], 'readwrite');
            const store = transaction.objectStore(this.storeName);
            const request = store.clear();

            request.onsuccess = () => {
                console.log('🧹 Cleared all data from IndexedDB store');
                resolve();
            };

            request.onerror = () => {
                reject(request.error);
            };
        });
    }

    /**
     * Mark a draft as successfully synced to DHIS2
     */
    async markAsSynced(eventId, dhis2EventId = null) {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([this.storeName], 'readwrite');
            const store = tx.objectStore(this.storeName);
            const getReq = store.get(eventId);
            getReq.onsuccess = () => {
                const record = getReq.result;
                if (!record) { resolve(); return; }
                const updated = {
                    ...record,
                    syncStatus: 'synced',
                    syncError: null,
                    syncedAt: new Date().toISOString(),
                    dhis2EventId: dhis2EventId || record.dhis2EventId,
                    metadata: { ...record.metadata, isDraft: false }
                };
                const putReq = store.put(updated);
                putReq.onsuccess = () => {
                    console.log(`✅ Marked ${eventId} as synced`);
                    resolve(updated);
                };
                putReq.onerror = () => reject(putReq.error);
            };
            getReq.onerror = () => reject(getReq.error);
        });
    }

    /**
     * Mark a draft as failed to sync, storing the error message
     */
    async markAsFailed(eventId, errorMessage) {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction([this.storeName], 'readwrite');
            const store = tx.objectStore(this.storeName);
            const getReq = store.get(eventId);
            getReq.onsuccess = () => {
                const record = getReq.result;
                if (!record) { resolve(); return; }
                const updated = {
                    ...record,
                    syncStatus: 'error',
                    syncError: errorMessage,
                };
                const putReq = store.put(updated);
                putReq.onsuccess = () => {
                    console.warn(`⚠️ Marked ${eventId} as failed: ${errorMessage}`);
                    resolve(updated);
                };
                putReq.onerror = () => reject(putReq.error);
            };
            getReq.onerror = () => reject(getReq.error);
        });
    }

    /**
     * Save a configuration item (e.g. hospital_full_configuration)
     */
    async saveConfig(key, value) {
        if (!this.db) {
            await this.init();
        }
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([this.configStoreName], 'readwrite');
            const store = transaction.objectStore(this.configStoreName);
            const data = { key, value, lastUpdated: new Date().toISOString() };
            const request = store.put(data);
            request.onsuccess = () => {
                console.log(`💾 Cached configuration key ${key} in IndexedDB`);
                resolve(data);
            };
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get a configuration item by key
     */
    async getConfig(key) {
        if (!this.db) {
            await this.init();
        }
        return new Promise((resolve, reject) => {
            if (!this.db.objectStoreNames.contains(this.configStoreName)) {
                resolve(null);
                return;
            }
            const transaction = this.db.transaction([this.configStoreName], 'readonly');
            const store = transaction.objectStore(this.configStoreName);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result?.value || null);
            request.onerror = () => reject(request.error);
        });
    }
}


// Create singleton instance
const indexedDBService = new IndexedDBService();
export default indexedDBService;
