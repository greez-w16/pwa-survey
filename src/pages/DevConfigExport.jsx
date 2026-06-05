import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Button, Typography, Paper, Box, Alert, CircularProgress } from '@mui/material';

const CONFIG_KEYS = [
    { key: 'hospital_full_configuration', label: 'Hospital Full Configuration', filename: 'hospital_config_utf8.json', wrapWithKey: true, expectedType: 'array' },
    { key: 'clinics_full_configuration', label: 'Clinics Full Configuration', filename: 'clinics_config_utf8.json', wrapWithKey: true, expectedType: 'array' },
    { key: 'ems_full_configuration', label: 'EMS Full Configuration', filename: 'ems_config_utf8.json', wrapWithKey: true, expectedType: 'array' },
    { key: 'mortuary_full_configuration', label: 'Mortuary Full Configuration', filename: 'mortuary_config_utf8.json', wrapWithKey: true, expectedType: 'array' },
    { key: 'hospital_compute_criteria', label: 'Hospital Compute Criteria', filename: 'hospital_compute_criteria.json', expectedType: 'object' },
    { key: 'hospital_links', label: 'Hospital Links', filename: 'hospital_links.json', expectedType: 'array' },
    { key: 'clinics_links', label: 'Clinics Links', filename: 'clinics_links.json', expectedType: 'array' },
    { key: 'ems_links', label: 'EMS Links', filename: 'ems_links.json', expectedType: 'array' },
    { key: 'mortuary_links', label: 'Mortuary Links', filename: 'mortuary_links.json', expectedType: 'array' },
];

const NAMESPACE = 'qims-survey-configs';

const unwrapDataStoreValue = (value, key) => {
    if (value === null || value === undefined) return null;
    if (value?.configurations?.[key] !== undefined) {
        return unwrapDataStoreValue(value.configurations[key], key);
    }
    if (value?.[key] !== undefined) {
        return unwrapDataStoreValue(value[key], key);
    }
    return value;
};

const buildExportValue = (key, storedValue, wrapWithKey) => {
    const value = unwrapDataStoreValue(storedValue, key);
    return wrapWithKey ? { [key]: value } : value;
};

const hasExpectedType = (value, expectedType) => {
    if (expectedType === 'array') return Array.isArray(value);
    if (expectedType === 'object') {
        return value !== null && typeof value === 'object' && !Array.isArray(value);
    }
    return true;
};

export default function DevConfigExport() {
    const [configs, setConfigs] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const load = async () => {
            try {
                const results = {};
                for (const { key } of CONFIG_KEYS) {
                    try {
                        const data = await api.getDataStoreItem(NAMESPACE, key);
                        results[key] = data;
                    } catch {
                        results[key] = null;
                    }
                }
                setConfigs(results);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const downloadFile = (key, data, filename) => {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || `${key}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    if (loading) {
        return (
            <Box display="flex" alignItems="center" justifyContent="center" minHeight="100vh">
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box p={4} maxWidth={1200} mx="auto">
            <Typography variant="h4" gutterBottom>Developer Config Export</Typography>
            <Typography variant="body1" color="text.secondary" gutterBottom>
                DataStore namespace: <code>{NAMESPACE}</code>. This page is hidden and only accessible by developers who know the route.
            </Typography>

            {error && (
                <Alert severity="error" sx={{ mb: 3 }}>
                    {error}
                </Alert>
            )}

            {CONFIG_KEYS.map(({ key, label, filename, wrapWithKey, expectedType }) => {
                const storedValue = configs[key];
                const normalizedValue = unwrapDataStoreValue(storedValue, key);
                const exportValue = buildExportValue(key, storedValue, wrapWithKey);
                const found = storedValue !== null && storedValue !== undefined;
                const valid = found && hasExpectedType(normalizedValue, expectedType);

                return (
                    <Paper key={key} sx={{ p: 3, mb: 3 }}>
                        <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                            <Typography variant="h6">{label}</Typography>
                            <Typography variant="caption" color="text.secondary">
                                Key: <code>{key}</code>
                            </Typography>
                        </Box>
                        {valid ? (
                            <>
                                <Alert severity="success" sx={{ mb: 2 }}>
                                    Found in DataStore. The preview below is the exact downloaded JSON.
                                </Alert>
                                <Button
                                    variant="contained"
                                    size="small"
                                    onClick={() => downloadFile(key, exportValue, filename)}
                                >
                                    Download {filename}
                                </Button>
                                <Box
                                    component="pre"
                                    sx={{
                                        mt: 2,
                                        p: 2,
                                        bgcolor: '#f5f5f5',
                                        borderRadius: 1,
                                        overflow: 'auto',
                                        maxHeight: 300,
                                        fontSize: '0.75rem',
                                        border: '1px solid #e0e0e0',
                                    }}
                                >
                                    {JSON.stringify(exportValue, null, 2)}
                                </Box>
                            </>
                        ) : found ? (
                            <Alert severity="error">
                                DataStore value has the wrong structure. Expected {expectedType}; export is disabled.
                            </Alert>
                        ) : (
                            <Alert severity="warning">
                                Not found in DataStore. Ask the team to click <strong>&ldquo;Save Config to DataStore&rdquo;</strong> in Settings first.
                            </Alert>
                        )}
                    </Paper>
                );
            })}
        </Box>
    );
}
