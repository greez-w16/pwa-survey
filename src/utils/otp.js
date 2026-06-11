/**
 * Utility to generate and verify dynamic OTPs offline for assignment takeover.
 */

// Generate a local date string in YYYY-MM-DD format (local time)
export const getLocalDateString = () => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// Cryptographic hash function using Web Crypto subtle API with local fallback
export const calculateTakeoverOtp = async (secret, leadUsername, assessorUsername, facilityId, dateStr) => {
    try {
        const cleanLead = String(leadUsername || '').trim().toLowerCase();
        const cleanAssessor = String(assessorUsername || '').trim().toLowerCase();
        const cleanFacility = String(facilityId || '').trim();
        const cleanDate = String(dateStr || getLocalDateString()).trim();

        const message = `${cleanLead}:${cleanAssessor}:${cleanFacility}:${cleanDate}`;
        const encoder = new TextEncoder();
        const dataBytes = encoder.encode(message);
        const secretBytes = encoder.encode(secret || 'QIMS_OFFLINE_SECRET_2026_FALLBACK');

        // Import secret key for HMAC-SHA-256
        const key = await window.crypto.subtle.importKey(
            'raw',
            secretBytes,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );

        // Sign the message
        const signatureBuffer = await window.crypto.subtle.sign(
            'HMAC',
            key,
            dataBytes
        );

        // Truncate to a 6-digit OTP code (HOTP RFC 4226 dynamic truncation)
        const hashArray = new Uint8Array(signatureBuffer);
        const offset = hashArray[hashArray.length - 1] & 0xf;
        const binary =
            ((hashArray[offset] & 0x7f) << 24) |
            ((hashArray[offset + 1] & 0xff) << 16) |
            ((hashArray[offset + 2] & 0xff) << 8) |
            (hashArray[offset + 3] & 0xff);

        const otp = (binary % 1000000).toString().padStart(6, '0');
        return otp;
    } catch (e) {
        console.error('Failed to calculate dynamic OTP offline:', e);
        // Soft fallback calculation in case Web Crypto fails
        let hash = 0;
        const str = `${leadUsername}:${assessorUsername}:${facilityId}:${dateStr}:${secret}`;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash % 1000000).toString().padStart(6, '0');
    }
};
