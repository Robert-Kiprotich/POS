import { configureStore } from '@reduxjs/toolkit';
import sidebarSlice from './sidebarSlice';
import themeReducer from './themeSlice';
import dateFilterReducer from './dateFilterSlice';




const store = configureStore({
  reducer: {
    sidebarSlice: sidebarSlice,
    theme: themeReducer,
    dateFilter: dateFilterReducer,
  },
});


export default store;





