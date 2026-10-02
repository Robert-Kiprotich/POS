// services/caseService.ts
import API from "./api";

/**
 * Fetches cases from the /inbox/cases/ endpoint
 * (Uses the default /inbox/ base URL prefix)
 */
export const getInboxCases = async () => {
  const response = await API.get("cases/");
  return Array.isArray(response.data) ? response.data : response.data?.results || [];
};

/**
 * Fetches cases from the independent /api/cases/ endpoint
 * (Bypasses the /inbox/ prefix using the window origin trick)
 */
export const getRootApiCases = async () => {
  const response = await API.get(`${window.location.origin}/api/cases/`);
  return Array.isArray(response.data) ? response.data : response.data?.results || [];
};

// Export the getCategories function
export const getCategories = async (categoryType) => {
  try {
    // Use the full URL with the correct base
    const response = await API.get(`${window.location.origin}/api/categories/`, {
      params: categoryType ? { category_type: categoryType } : {},
    });
    console.log('Raw API response:', response.data);
    
    // Check if response has results (paginated response)
    if (response.data?.results && Array.isArray(response.data.results)) {
      console.log('Using results array from paginated response:', response.data.results.length);
      return response.data.results;
    }
    
    // Check if response is directly an array
    if (Array.isArray(response.data)) {
      console.log('Response is direct array:', response.data.length);
      return response.data;
    }
    
    // Check if response has data property that is an array
    if (response.data?.data && Array.isArray(response.data.data)) {
      console.log('Using data array:', response.data.data.length);
      return response.data.data;
    }
    
    // Check if response has categories property that is an array
    if (response.data?.categories && Array.isArray(response.data.categories)) {
      console.log('Using categories array:', response.data.categories.length);
      return response.data.categories;
    }
    
    // If we get here, try to extract any array from the response
    const values = Object.values(response.data);
    for (const value of values) {
      if (Array.isArray(value) && value.length > 0) {
        console.log('Found array in response:', value.length);
        return value;
      }
    }
    
    console.warn('No categories array found in response:', response.data);
    return [];
  } catch (error) {
    console.error('Error fetching categories:', error);
    throw error;
  }
};



export const getCalls = async () => {
  const response = await API.get(`${window.location.origin}/api/calls/calls/`);
  return Array.isArray(response.data) ? response.data : response.data?.results || [];
};