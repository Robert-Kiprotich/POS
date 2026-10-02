// DynamicCategorySelector.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getCategories } from '../../../../../../services/Services.js';

interface Category {
  id: number;
  category_token: string;
  category_name: string;
  category_type?: string;
  category_parent: number | null;
  category_order: number;
  category_status: string;
  date_created?: string;
  last_updated_on?: string;
  created_by?: number | null;
  last_updated_by?: number | null;
}

interface Level {
  level: number;
  categories: Category[];
  selectedId: number | null;
}

interface DynamicCategorySelectorProps {
  value?: number | null;
  onChange: (categoryId: number | null, categoryData?: Category | null, path?: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  label?: string;
  required?: boolean;
  error?: string;
  categoryType?: string;
  /** Name of the fixed root category whose children populate the first dropdown. */
  rootCategoryName?: string;
}

const DynamicCategorySelector: React.FC<DynamicCategorySelectorProps> = ({
  value,
  onChange,
  placeholder = 'Select category...',
  className = '',
  disabled = false,
  label,
  required = false,
  error,
  categoryType = 'case_category',
  rootCategoryName = 'Main Case Categories',
}) => {
  const [anchorCategory, setAnchorCategory] = useState<Category | null>(null);
  const [selectedPath, setSelectedPath] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [levels, setLevels] = useState<Level[]>([{ level: 0, categories: [], selectedId: null }]);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchChildren = async (parentId: number): Promise<Category[]> => {
    const API = (await import('../../../../../../services/api')).default;
    const res = await API.get(`categories/${parentId}/children/`);
    return (res.data?.children ?? []).filter((c: Category) => c.category_status === 'Active');
  };

  const fetchOne = async (id: number): Promise<Category> => {
    const API = (await import('../../../../../../services/api')).default;
    const res = await API.get(`categories/${id}/`);
    return res.data;
  };

  // Initialize: find the anchor root, load its children as level 0,
  // and (if `value` is set) walk up the parent chain to rebuild the path.
  useEffect(() => {
    let active = true;
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const init = async () => {
      setLoading(true);
      try {
        const roots = await getCategories(categoryType);
        if (!active) return;

        const anchor = Array.isArray(roots)
          ? roots.find(
              (c: Category) =>
                String(c.category_name || '').trim().toLowerCase() ===
                rootCategoryName.trim().toLowerCase()
            )
          : null;

        if (!anchor) {
          console.warn(`Root category "${rootCategoryName}" not found`);
          setAnchorCategory(null);
          setLevels([{ level: 0, categories: [], selectedId: null }]);
          return;
        }

        setAnchorCategory(anchor);
        const level0 = await fetchChildren(anchor.id);
        if (!active) return;

        if (!value) {
          setSelectedPath([]);
          setLevels([{ level: 0, categories: level0, selectedId: null }]);
          return;
        }

        // Walk up from `value` to the anchor to rebuild the selected path
        const path: Category[] = [];
        let currentId: number | null = value;
        while (currentId !== null && currentId !== anchor.id) {
          const cat = await fetchOne(currentId);
          if (!active) return;
          path.unshift(cat);
          currentId = cat.category_parent;
        }

        const newLevels: Level[] = [];
        let parentCategories = level0;

        for (let i = 0; i < path.length; i++) {
          newLevels.push({ level: i, categories: parentCategories, selectedId: path[i].id });
          parentCategories = await fetchChildren(path[i].id);
          if (!active) return;
        }

        if (parentCategories.length > 0) {
          newLevels.push({ level: path.length, categories: parentCategories, selectedId: null });
        }

        setSelectedPath(path);
        setLevels(newLevels.length > 0 ? newLevels : [{ level: 0, categories: level0, selectedId: null }]);
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error('Error initializing category selector:', err);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    init();

    return () => {
      active = false;
      controller.abort();
    };
    // Intentionally excludes `value` from deps beyond initial mount behavior —
    // external resets are handled by the `handleClear` / `onChange(null, ...)` flow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryType, rootCategoryName]);

  // Handle selection at a specific level: fetch that node's children live.
  const handleLevelSelect = useCallback(
    async (levelIndex: number, categoryId: number) => {
      const currentLevel = levels[levelIndex];
      const selected = currentLevel?.categories.find((cat) => cat.id === categoryId);
      if (!selected) {
        console.warn('Category not found in current level:', categoryId);
        return;
      }

      const newPath = selectedPath.slice(0, levelIndex);
      newPath.push(selected);

      const newLevels = [...levels];
      newLevels[levelIndex] = { ...newLevels[levelIndex], selectedId: selected.id };
      newLevels.splice(levelIndex + 1);

      try {
        const children = await fetchChildren(selected.id);

        if (children.length > 0) {
          newLevels.push({ level: levelIndex + 1, categories: children, selectedId: null });
          onChange(null, null, '');
        } else {
          const pathString = newPath.map((cat) => cat.category_name).join(' > ');
          onChange(selected.id, selected, pathString);
        }

        setSelectedPath(newPath);
        setLevels(newLevels);
      } catch (err) {
        console.error('Error fetching children for', selected.category_name, err);
      }
    },
    [selectedPath, levels, onChange]
  );

  const handleClear = useCallback(async () => {
    setSelectedPath([]);
    if (!anchorCategory) {
      setLevels([{ level: 0, categories: [], selectedId: null }]);
      onChange(null, null, '');
      return;
    }
    try {
      const level0 = await fetchChildren(anchorCategory.id);
      setLevels([{ level: 0, categories: level0, selectedId: null }]);
      onChange(null, null, '');
    } catch (err) {
      console.error('Error clearing category selection:', err);
    }
  }, [anchorCategory, onChange]);

  const renderLevelDropdown = (level: Level, index: number) => {
    if (level.categories.length === 0) return null;

    return (
      <div key={index} className="d-flex align-items-center gap-2">
        {index > 0 && <i className="ti ti-chevron-right text-muted" style={{ fontSize: '0.8rem' }} />}
        <select
          className="form-select"
          value={level.selectedId || ''}
          onChange={(e) => {
            const val = e.target.value;
            if (val) handleLevelSelect(index, Number(val));
          }}
          disabled={disabled || loading}
          style={{ minWidth: '180px', maxWidth: '250px', display: 'inline-block', width: 'auto' }}
        >
          <option value="">{index === 0 ? placeholder : 'Select sub-category...'}</option>
          {level.categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.category_name}
            </option>
          ))}
        </select>
      </div>
    );
  };

  return (
    <div className={`form-group ${className}`}>
      {label && (
        <label className="form-label fs-13">
          {label}
          {required && <span className="text-danger ms-1">*</span>}
        </label>
      )}

      <div className="d-flex align-items-center gap-2 flex-wrap">
        {levels.map((level, index) => renderLevelDropdown(level, index))}

        {!loading && levels[0]?.categories.length === 0 && (
          <div className="text-muted fs-13 py-2">
            <i className="ti ti-info-circle me-1" />
            No categories available
          </div>
        )}

        {selectedPath.length > 0 && (
          <button type="button" className="btn btn-sm btn-outline-danger" onClick={handleClear} disabled={disabled}>
            <i className="ti ti-x" /> Clear
          </button>
        )}
      </div>

      {loading && (
        <div className="mt-2 text-muted">
          <span className="spinner-border spinner-border-sm me-2" />
          Loading categories...
        </div>
      )}

      {error && <div className="invalid-feedback d-block fs-12">{error}</div>}
    </div>
  );
};

export default DynamicCategorySelector;