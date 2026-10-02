import React from "react";

type LookupOption = {
  id: number | string;
  category_name?: string;
  country_name?: string;
  name?: string;
};

interface LookupSelectProps {
  value: string | number;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: LookupOption[];
  placeholder?: string;
  className?: string;
}

const LookupSelect: React.FC<LookupSelectProps> = ({
  value,
  onChange,
  options = [],
  placeholder = "Select",
  className = "form-select",
}) => {
  return (
    <select
      className={className}
      value={value ?? ""}
      onChange={onChange}
    >
      <option value="">{placeholder}</option>

      {options.map((item) => (
        <option key={item.id} value={item.id}>
          {item.category_name ??
            item.country_name ??
            item.name ??
            ""}
        </option>
      ))}
    </select>
  );
};

export default LookupSelect;