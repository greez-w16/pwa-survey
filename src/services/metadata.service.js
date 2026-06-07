import { api } from './api';

export const getMetadata = async () => {
    // Fast path: getMetadata is not used in scheduling/assignment domain logic.
    // Return empty object immediately to prevent slow startup blocking.
    return {};
};
