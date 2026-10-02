import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';

interface DateFilterState {
  dateFrom: string;
  dateTo: string;
  rangeType: 'today' | 'week' | 'month' | 'quarter' | 'year' | 'all' | 'custom';
}

const getTodayString = () => new Date().toISOString().split('T')[0];

const initialState: DateFilterState = {
  dateFrom: getTodayString(),
  dateTo: getTodayString(),
  rangeType: 'today',
};

const dateFilterSlice = createSlice({
  name: 'dateFilter',
  initialState,
  reducers: {
    setDateRange: (state, action: PayloadAction<{ dateFrom: string; dateTo: string; rangeType: string }>) => {
      state.dateFrom = action.payload.dateFrom;
      state.dateTo = action.payload.dateTo;
      state.rangeType = action.payload.rangeType as any;
    },
    setRangeType: (state, action: PayloadAction<'today' | 'week' | 'month' | 'quarter' | 'year' | 'all' | 'custom'>) => {
      const today = new Date();
      
      switch (action.payload) {
        case 'today':
          state.dateFrom = getTodayString();
          state.dateTo = getTodayString();
          state.rangeType = 'today';
          break;
        
        case 'week':
          const weekStart = new Date(today);
          weekStart.setDate(today.getDate() - today.getDay());
          state.dateFrom = weekStart.toISOString().split('T')[0];
          state.dateTo = getTodayString();
          state.rangeType = 'week';
          break;
        
        case 'month':
          state.dateFrom = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
          state.dateTo = getTodayString();
          state.rangeType = 'month';
          break;
        
        case 'quarter':
          const quarter = Math.floor(today.getMonth() / 3);
          const quarterStart = new Date(today.getFullYear(), quarter * 3, 1);
          state.dateFrom = quarterStart.toISOString().split('T')[0];
          state.dateTo = getTodayString();
          state.rangeType = 'quarter';
          break;
        
        case 'year':
          state.dateFrom = `${today.getFullYear()}-01-01`;
          state.dateTo = getTodayString();
          state.rangeType = 'year';
          break;
        
        case 'all':
          state.dateFrom = '';
          state.dateTo = '';
          state.rangeType = 'all';
          break;
      }
    },
    setCustomDateRange: (state, action: PayloadAction<{ dateFrom: string; dateTo: string }>) => {
      state.dateFrom = action.payload.dateFrom;
      state.dateTo = action.payload.dateTo;
      state.rangeType = 'custom';
    },
    resetDateFilter: (state) => {
      state.dateFrom = getTodayString();
      state.dateTo = getTodayString();
      state.rangeType = 'today';
    },
  },
});

export const { setDateRange, setRangeType, setCustomDateRange, resetDateFilter } = dateFilterSlice.actions;
export default dateFilterSlice.reducer;
