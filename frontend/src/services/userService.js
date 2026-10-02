import API from "./api";

const BASE = () => `${window.location.origin}/api/users/`;


export const getUsers = async () => {
  const response = await API.get(BASE());
  return Array.isArray(response.data) ? response.data : response.data?.results || [];
};

export const createUser = async (data) => {
  const response = await API.post(BASE(), data);
  return response.data;
};

export const updateUser = async (id, data) => {
  const response = await API.patch(`${BASE()}${id}/`, data);
  return response.data;
};

export const deleteUser = async (id) => {
  await API.delete(`${BASE()}${id}/`);
};

export const resetUserPassword = async (id, password = null) => {
  const response = await API.post(`${BASE()}${id}/reset_password/`, password ? { password } : {});
  return response.data;
};

export const toggleUserStatus = async (id) => {
  const response = await API.post(`${BASE()}${id}/toggle_status/`);
  return response.data;
};

export const getUserFormData = async () => {
  const response = await API.get(`${BASE()}form_data/`);
  return response.data;
};

export const getAuthenticatedUser = async () => {
  const response = await API.get(`${BASE()}me/`);
  return response.data;
};
