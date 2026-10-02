import React, { useState, useEffect, useCallback, useRef,useMemo } from "react";
import { ChatWindow } from "../ChatWindow";
import type { MessageItem } from "../Chat";
import DynamicCategorySelector from "./dynamicSelector";
import { showSuccess, showError, showWarning } from "./AlertsModal";
import countiesData from "../../../../../../data/counties.json";
import subcountiesData from "../../../../../../data/sub-counties.json";
import wardsData from "../../../../../../data/wards.json";
import { getCategories } from '../../../../../../services/Services.js';



// ── Field Name Label Mapping for User-Friendly Alert Messages ───────────────
const FIELD_LABELS: Record<string, string> = {
  firstname: "First Name",
  lastname: "Last Name",
  name: "Full Name",
  phone: "Phone Number",
  altPhone: "Alternative Phone",
  age: "Age",
  gender: "Gender",
  nationality: "Nationality",
  //relationToChild: "Reporter's Relation to Child",
  attendingSchool: "Attending School Status",
  schoolLevel: "School Level",
  schoolType: "School Type",
  relationship: "Relationship to Client",
  selectedCategory: "Case Category",
  caseNumber: "Case Number",
  caseSource: "Case Source",
  caseNarrative: "Case Narrative",
  caseDescription: "Case Description",
  status: "Case Status",
  priority: "Case Priority",
};

// ── Constants ──────────────────────────────────────────────────────────────
const NEEDS = ["Food", "Shelter", "Medical", "Legal", "Education", "Economic Support", "Psychosocial", "Protection"];

type PersonType = "reporter" | "client" | "perpetrator";

const POPUP_TITLES: Record<PersonType, string> = {
  reporter: "Reporter",
  client: "Client",
  perpetrator: "Perpetrator",
};

// ── Interfaces ─────────────────────────────────────────────────────────────
interface CaseModalProps {
  showChat?: boolean;
  activeThread?: { id: string; name: string; avatar: string; channel: string } | null;
  chatContextMessages?: MessageItem[];
  onSendMessage?: (text: string) => void;
  onSendFile?: (file: File) => void;
  idPrefix?: string;
  staticBackdrop?: boolean;
}

interface PersonOptionLists {
  ageGroups: any[];
  genders: any[];
  nationalities: any[];
  relationships: any[];
  healthStatuses: any[];
  hivStatuses: any[];
  maritalStatuses: any[];
  schoolLevels: any[];
  schoolTypes: any[];
  knownSchools: any[];
  locations: any[];
}

interface PersonSlidePanelProps {
  personType: PersonType;
  initialData?: any;
  onConfirm: (data: any) => void;
  editIndex?: number;
  panelId: string;
  options: PersonOptionLists;
}

// ── Shared Helpers ────────────────────────────────────────────────────────
const formatLocation = (loc: any): string => {
  if (!loc) return "";
  if (typeof loc !== "object") return String(loc);

  const parts = [
    loc.villages,
    loc.cells,
    loc.sectors,
    loc.districts || loc.county,
    loc.provinces,
  ].filter((part) => part && part.trim() !== "");

  return parts.join(", ");
};

const extractString = (item: any): string => {
  if (item === null || item === undefined) return "";
  if (typeof item === "object") {
    if (item.sectors || item.villages || item.provinces) {
      return formatLocation(item);
    }
    return (
      item.country_name ||
      item.name ||
      item.label ||
      item.title ||
      item.category_name ||
      String(item.id || "")
    );
  }
  return String(item);
};

const toArray = (data: any): any[] => {
  if (!data) return [];
  return Array.isArray(data) ? data : [];
};

const renderSafe = (val: any): string => {
  if (val === null || val === undefined) return "";
  if (typeof val === "object") {
    return val.name || val.label || val.title || val.category_name || String(val.id || "");
  }
  return String(val);
};

const splitName = (fullName: string = "") => {
  const parts = fullName.trim().split(/\s+/);
  const firstname = parts[0] || "";
  const secondname = parts.slice(1).join(" ");
  return { firstname, secondname };
};

const joinName = (firstname?: string, lastname?: string): string =>
  [firstname, lastname].filter((part) => part && part.trim() !== "").join(" ").trim();

// ── Age helpers: derive age from DOB, and age group from age ───────────────
const calculateAgeFromDob = (dobStr?: string | null): number | null => {
  if (!dobStr) return null;
  const dob = new Date(dobStr);
  if (isNaN(dob.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age >= 0 ? age : null;
};

const findAgeGroupId = (age: number | string | null | undefined, ageGroups: any[]): string | number | null => {
  if (age === null || age === undefined || age === "" || !Array.isArray(ageGroups) || ageGroups.length === 0) {
    return null;
  }
  const numericAge = Number(age);
  if (isNaN(numericAge)) return null;

  // Try explicit min/max style fields first
  for (const group of ageGroups) {
    if (!group || typeof group !== "object") continue;
    const min = group.min_age ?? group.minAge ?? group.min ?? group.age_from ?? group.from;
    const max = group.max_age ?? group.maxAge ?? group.max ?? group.age_to ?? group.to;
    if (min !== undefined && min !== null && min !== "") {
      const minNum = Number(min);
      const maxNum = max !== undefined && max !== null && max !== "" ? Number(max) : Infinity;
      if (!isNaN(minNum) && numericAge >= minNum && numericAge <= maxNum) {
        return group.id;
      }
    }
  }

  // Fallback: parse a range or "18+" style pattern out of the display label
  for (const group of ageGroups) {
    if (!group) continue;
    const label = extractString(group);
    const plusMatch = label.match(/(\d+)\s*\+/);
    if (plusMatch) {
      if (numericAge >= Number(plusMatch[1])) return group.id;
      continue;
    }
    const rangeMatch = label.match(/(\d+)\s*(?:-|–|to)\s*(\d+)/i);
    if (rangeMatch) {
      const minNum = Number(rangeMatch[1]);
      const maxNum = Number(rangeMatch[2]);
      if (numericAge >= minNum && numericAge <= maxNum) return group.id;
    }
  }

  return null;
};

// ── PersonSlidePanel (Supports Reporter, Client, and Perpetrator) ─────────
const PersonSlidePanel: React.FC<PersonSlidePanelProps> = ({
  personType,
  initialData,
  onConfirm,
  editIndex,
  panelId,
  options,
}) => {
  const [form, setForm] = useState<any>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
 

  useEffect(() => {
    setForm(initialData ?? {});
  }, [initialData]);

  const f = (field: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm((prev: any) => ({ ...prev, [field]: e.target.value }));

  // DOB → auto-derive age + age group. Age (typed manually) → auto-derive age group.
  const handleDobChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const dob = e.target.value;
    const derivedAge = calculateAgeFromDob(dob);
    setForm((prev: any) => {
      const next: any = { ...prev, dob };
      if (derivedAge !== null) {
        next.age = String(derivedAge);
        const groupId = findAgeGroupId(derivedAge, options.ageGroups);
        if (groupId !== null) next.ageGroup = String(groupId);
      }
      return next;
    });
  };

  const handleAgeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const age = e.target.value;
    setForm((prev: any) => {
      const next: any = { ...prev, age };
      const groupId = findAgeGroupId(age, options.ageGroups);
      if (groupId !== null) next.ageGroup = String(groupId);
      return next;
    });
  };

  const label = POPUP_TITLES[personType];
  const title = editIndex != null ? `Edit ${label} #${editIndex}` : `Add ${label}`;

  const isPerp = personType === "perpetrator";
  const isReporter = personType === "reporter";

  const closePanel = () => {
    const el = document.getElementById(panelId);
    if (el) {
      const bootstrap = (window as any).bootstrap;
      if (bootstrap?.Offcanvas) {
        const bsInstance = bootstrap.Offcanvas.getInstance(el) || new bootstrap.Offcanvas(el);
        bsInstance?.hide();
      } else {
        el.classList.remove("show");
        el.style.visibility = "hidden";
      }
    }
  };
  const filteredSubcounties = useMemo(() => {
    if (!form.county) return [];
    return subcountiesData.filter((sc: any) => sc.county === form.county);
  }, [form.county]);

  const filteredWards = useMemo(() => {
    if (!form.subcounty) return [];
    return wardsData.filter((w: any) => w.constituency === form.subcounty);
  }, [form.subcounty]);

  // Cascading location handlers — clear dependent selections when a parent changes
  const handleCountyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setForm((prev: any) => ({ ...prev, county: value, subcounty: "", ward: "" }));
  };

  const handleSubcountyChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setForm((prev: any) => ({ ...prev, subcounty: value, ward: "" }));
  };
  const handleConfirm = () => {
    setIsSubmitting(true);
    const errors: string[] = [];

    const rawName = form.name || `${form.firstname || ''} ${form.lastname || ''}`.trim();
    if (!rawName.trim()) {
      errors.push(FIELD_LABELS.name);
    }
    if (!form.nationality) {
      errors.push(FIELD_LABELS.nationality);
    }
    if (!form.phone || !form.phone.trim()) {
      errors.push(FIELD_LABELS.phone);
    }
    if (!form.gender) {
      errors.push(FIELD_LABELS.gender);
    }
    if (form.age === undefined || form.age === null || form.age === "") {
      errors.push(FIELD_LABELS.age);
    }

    

    // Reporter-specific validation
    

   

    if (errors.length > 0) {
      const errorMessage = `Please fill in the following required fields:\n• ${errors.join('\n• ')}`;
      showWarning(errorMessage, "Validation Error");
      setIsSubmitting(false);
      return;
    }

    const { firstname, secondname } = splitName(rawName);

    const payload: any = {
      name: rawName,
      firstname: form.firstname || firstname,
      lastname: form.lastname || secondname,
      fullname: rawName,
      phone: form.phone,
      altPhone: form.altPhone || null,
      dob: form.dob || null,
      age: form.age ? Number(form.age) : null,
      agegroup: form.ageGroup || null,
      gender: form.gender ? Number(form.gender) : null,
      nationality: Number(form.nationality),
      location: form.location ? Number(form.location) || form.location : null,
      landmark: form.landmark || null,
      email: form.email || null,
      persontype: personType,
      maritalstatus: form.maritalStatus ? Number(form.maritalStatus) : null,
      healthstatus: form.healthStatus ? Number(form.healthStatus) : null,
      hivstatus: form.hivStatus ? Number(form.hivStatus) : null,
    };

    if (personType === "reporter") {
      payload.relationToChild = form.relationToChild ? Number(form.relationToChild) : null;
      payload.relationComment = form.relationComment || null;
      payload.school = form.school || null;
      payload.grade = form.grade || null;
    }

  if (personType === "client") {
  const { firstname, secondname } = splitName(rawName);
  payload.firstname = form.firstname || firstname;
  payload.lastname = form.lastname || secondname;
   
  // Identity & Location Details
  payload.nationalid = form.nationalId || null;
  payload.nationality = form.nationality ? Number(form.nationality) : null;
  payload.tribe = form.tribe || null;
  payload.language = form.language || null;
  payload.nearest_landmark = form.landmark || null;
  
 
  payload.village = form.village || null;
 payload.county = form.county || null;
  payload.subcounty = form.subcounty || null;
  payload.ward = form.ward || null;
  // Reporter Relationship & Comments
  payload.reporter_relationship_to_client = form.relationToChild ? Number(form.relationToChild) : null;
  payload.relationship_comment = form.relationComment || null;

  // Disability & Special Services
  payload.client_isdisabled = form.isDisabled === "Yes";
  payload.client_disability = form.isDisabled === "Yes" && form.disability ? Number(form.disability) : null;
  payload.client_isspecialservices = form.registeredSpecialServices === "Yes";

  // Education Details
  payload.client_inschool = form.attendingSchool === "Yes";
  payload.client_school_type = form.schoolType ? Number(form.schoolType) : null;
  payload.client_school_level = form.schoolLevel ? Number(form.schoolLevel) : null;
  payload.client_school_attendance = form.attendance || null;
  payload.client_school_name = form.school || null;
  payload.client_school_address = form.schoolAddress || null;
  payload.client_outofschool_reason = form.attendingSchool === "No" ? form.notInSchoolReason || null : null;

  // Marital & Spouse Details
  payload.client_ismarried = form.isMarried === "Yes";
  payload.client_maritalstatus = form.maritalStatus ? Number(form.maritalStatus) : null;
  payload.client_spouse_fullname = form.isMarried === "Yes" ? form.spouseFullName || null : null;
  payload.client_spouse_profession = form.isMarried === "Yes" && form.spouseProfession ? Number(form.spouseProfession) : null;

  // Guardian Details
  payload.client_isguardian_known = form.isGuardianKnown === "Yes";
  payload.client_guardian_name = form.isGuardianKnown === "Yes" ? form.parentName || null : null;
  payload.client_guardian_nationalid = form.isGuardianKnown === "Yes" ? form.guardianNationalId || null : null;
  payload.client_guardian_maritalstatus = form.isGuardianKnown === "Yes" && form.guardianMaritalStatus ? Number(form.guardianMaritalStatus) : null;

  // Household Details
  payload.client_household_type = form.householdType || null;
  payload.client_number_of_adults_in_household = form.adultsInHousehold ? Number(form.adultsInHousehold) : null;
  payload.client_occupation_of_household_head = form.headOccupation || null;

  // Health & HIV Status
  payload.client_healthstatus = form.healthStatus ? Number(form.healthStatus) : null;
  payload.client_hivstatus = form.hivStatus ? Number(form.hivStatus) : null;
}

   if (personType === "perpetrator") {
  const { firstname, secondname } = splitName(rawName);
  payload.firstname = form.firstname || firstname;
  payload.lastname = form.lastname || secondname;
   
  // Contact & Demographics
  payload.phone = form.phone || null;
  payload.alt_phone = form.altPhone || null;
  payload.dob = form.dob || null;
  payload.age = form.age ? Number(form.age) : null;
  payload.age_group = form.ageGroup ? Number(form.ageGroup) : null;
  payload.gender = form.gender ? Number(form.gender) : null;
  payload.nationalid = form.nationalId || null;
  payload.nationality = form.nationality ? Number(form.nationality) : null;
payload.county = form.county || null;
  payload.subcounty = form.subcounty || null;
  payload.village = form.village || null;
  // Location & Cultural Attributes
  payload.tribe = form.tribe || null;
  payload.language = form.language || null;
  payload.nearest_landmark = form.landmark || null;
  payload.county = form.county || null;
  payload.subcounty = form.subcounty || null;
  payload.village = form.village || null;

  // Relationship & Home Sharing
  payload.perp_relationship_to_client = form.relationToChild ? Number(form.relationToChild) : null;
  payload.perp_shares_home = form.sharesHome === "Yes";

  // Statuses, Guardian & Details
  payload.perp_maritalstatus = form.maritalStatus ? Number(form.maritalStatus) : null;
  payload.perp_healthstatus = form.healthStatus ? Number(form.healthStatus) : null;
  payload.perp_employmentstatus = form.employmentStatus ? Number(form.employmentStatus) : null;
  payload.perp_guardian_name = form.parentName || null;
  payload.perp_additional_details = form.additionalDetails || null;
}

    onConfirm(payload);
    closePanel();
    setIsSubmitting(false);
  };

  return (
    <div
      className="offcanvas offcanvas-end"
      tabIndex={-1}
      id={panelId}
      style={{
        width: "450px",
        zIndex: 1080,
        boxShadow: "-5px 0 25px rgba(0,0,0,0.15)"
      }}
      data-bs-backdrop="false"
    >
      <div className="offcanvas-header border-bottom py-3 px-4 bg-white">
        <h5 className="offcanvas-title fw-bold fs-15">{title}</h5>
        <button type="button" className="btn-close" onClick={closePanel} aria-label="Close" />
      </div>
      <div className="offcanvas-body p-4 bg-white">
        <div className="row g-3">
          <div className="col-12">
            <label className="form-label fs-13">Full Name <span className="text-danger">*</span></label>
            <input className="form-control" value={form.name || form.firstname || ""} onChange={f("name")} placeholder="Full Name" />
          </div>
          <div className="col-6">
            <label className="form-label fs-13">Phone <span className="text-danger">*</span></label>
            <input className="form-control" value={form.phone || ""} onChange={f("phone")} placeholder="Phone Number" />
          </div>
          <div className="col-6">
            <label className="form-label fs-13">Alt Phone</label>
            <input className="form-control" value={form.altPhone || ""} onChange={f("altPhone")} placeholder="Alt Phone" />
          </div>
          <div className="col-6">
            <label className="form-label fs-13">Age <span className="text-danger">*</span></label>
            <input className="form-control" type="number" value={form.age || ""} onChange={handleAgeChange} placeholder="Age" />
          </div>
          <div className="col-6">
            <label className="form-label fs-13">Gender <span className="text-danger">*</span></label>
            <select className="form-select" value={form.gender || ""} onChange={f("gender")}>
              <option value="">Select Gender</option>
              {options.genders.map((g, idx) => (
                <option key={idx} value={g.id}>{extractString(g)}</option>
              ))}
            </select>
          </div>
          <div className="col-12">
            <label className="form-label fs-13">Nationality <span className="text-danger">*</span></label>
            <select className="form-select" value={form.nationality || ""} onChange={f("nationality")}>
              <option value="">Select Nationality</option>
              {options.nationalities.map((n, idx) => (
                <option key={idx} value={n.id}>{extractString(n)}</option>
              ))}
            </select>
          </div>

          {/* ── Additional identity / contact fields ─────────────────────── */}
          <div className="col-6">
            <label className="form-label fs-13">Date of Birth</label>
            <input className="form-control" type="date" value={form.dob || ""} onChange={handleDobChange} />
          </div>
          <div className="col-6">
            <label className="form-label fs-13">Age Group</label>
            <select className="form-select" value={form.ageGroup || ""} onChange={f("ageGroup")}>
              <option value="">Select Age Group</option>
              {options.ageGroups.map((a, idx) => (
                <option key={idx} value={a.id}>{extractString(a)}</option>
              ))}
            </select>
          </div>
          <div className="col-6">
            <label className="form-label fs-13">Location</label>
            <input
              className="form-control"
              list={`${panelId}-locations-list`}
              placeholder="Type to search location..."
              value={
                form.location && !isNaN(Number(form.location))
                  ? formatLocation(options.locations.find((l: any) => l.id === Number(form.location))) || form.location
                  : form.location || ""
              }
              onChange={(e) => {
                const typedValue = e.target.value;
                const matchedLoc = options.locations.find(
                  (loc: any) => formatLocation(loc).toLowerCase() === typedValue.toLowerCase()
                );
                setForm((prev: any) => ({
                  ...prev,
                  location: matchedLoc ? matchedLoc.id : typedValue,
                }));
              }}
            />
            <datalist id={`${panelId}-locations-list`}>
              {options.locations.map((loc: any, idx: number) => (
                <option key={idx} value={formatLocation(loc)} />
              ))}
            </datalist>
          </div>
          <div className="col-6">
            <label className="form-label fs-13"><span className="text-danger">*</span>Nearest Landmark</label>
            <input className="form-control" value={form.landmark || ""} onChange={f("landmark")} placeholder="E.g. near KCB Bank" />
          </div>
          <div className="col-12">
            <label className="form-label fs-13">Email</label>
            <input className="form-control" type="email" value={form.email || ""} onChange={f("email")} placeholder="Email Address" />
          </div>

          {isReporter && (
            <>
              <div className="col-12">
                <label className="form-label fs-13">Relation to Child <span className="text-danger">*</span></label>
                <select className="form-select" value={form.relationToChild || ""} onChange={f("relationToChild")}>
                  <option value="">Select Relationship</option>
                  {options.relationships.map((r, idx) => (
                    <option key={idx} value={r.id}>{extractString(r)}</option>
                  ))}
                </select>
              </div>
              <div className="col-12">
                <label className="form-label fs-13">Relationship Comments</label>
                <textarea className="form-control" rows={2} value={form.relationComment || ""} onChange={f("relationComment")} placeholder="Comments..." />
              </div>
              <div className="col-6">
                <label className="form-label fs-13"> <span className="text-muted">(Optional)</span></label>
                <input className="form-control" list={`${panelId}-school-list-reporter`} value={form.school || ""} onChange={f("school")} placeholder="Type or select school name..." />
                <datalist id={`${panelId}-school-list-reporter`}>
                  {options.knownSchools.map((s, idx) => (
                    <option key={idx} value={extractString(s)} />
                  ))}
                </datalist>
              </div>
              <div className="col-6">
                <label className="form-label fs-13">Grade / Class</label>
                <input className="form-control" value={form.grade || ""} onChange={f("grade")} placeholder="e.g. Grade 6 / Form 2" />
              </div>

            </>
          )}

        {!isPerp && !isReporter && (
  <>
    {/* Identity & Location Fields */}
    <div className="col-6">
      <label className="form-label fs-13">National ID</label>
      <input className="form-control" value={form.nationalId || ""} onChange={f("nationalId")} placeholder="National ID Number" />
    </div>
    <div className="col-6">
      <label className="form-label fs-13">Tribe</label>
      <input className="form-control" value={form.tribe || ""} onChange={f("tribe")} placeholder="e.g. Kikuyu, Luo" />
    </div>
    <div className="col-6">
      <label className="form-label fs-13">Language</label>
      <input className="form-control" value={form.language || ""} onChange={f("language")} placeholder="Primary language spoken" />
    </div>
       <div className="col-6">
      <label className="form-label fs-13">County</label>
      <select className="form-select" value={form.county || ""} onChange={handleCountyChange}>
        <option value="">Select County</option>
        {countiesData.map((c: any) => (
          <option key={c.code} value={c.name}>{c.name}</option>
        ))}
      </select>
    </div>
    <div className="col-6">
      <label className="form-label fs-13">Sub-County</label>
      <select
        className="form-select"
        value={form.subcounty || ""}
        onChange={handleSubcountyChange}
        disabled={!form.county}
      >
        <option value="">Select Sub-County</option>
        {filteredSubcounties.map((sc: any) => (
          <option key={sc.code} value={sc.name}>{sc.name}</option>
        ))}
      </select>
    </div>
    <div className="col-6">
      <label className="form-label fs-13">Ward</label>
      <select
        className="form-select"
        value={form.ward || ""}
        onChange={f("ward")}
        disabled={!form.subcounty}
      >
        <option value="">Select Ward</option>
        {filteredWards.map((w: any) => (
          <option key={w.code} value={w.name}>{w.name}</option>
        ))}
      </select>
    </div>
    <div className="col-6">
      <label className="form-label fs-13">Village</label>
      <input className="form-control" value={form.village || ""} onChange={f("village")} placeholder="Village name" />
    </div>

    {/* Relationship & Special Serfiltevices */}
    <div className="col-6">
      <label className="form-label fs-13">Reporter Relationship to Client</label>
      <select className="form-select" value={form.relationToChild || ""} onChange={f("relationToChild")}>
        <option value="">Select Relationship</option>
        {options.relationships.map((r, idx) => (
          <option key={idx} value={r.id}>{extractString(r)}</option>
        ))}
      </select>
    </div>
    <div className="col-6">
      <label className="form-label fs-13">Registered for Special Services?</label>
      <select className="form-select" value={form.registeredSpecialServices || ""} onChange={f("registeredSpecialServices")}>
        <option value="">Select</option>
        <option value="Yes">Yes</option>
        <option value="No">No</option>
      </select>
    </div>
    <div className="col-12">
      <label className="form-label fs-13">Relationship Comments / Remarks</label>
      <textarea className="form-control" rows={2} value={form.relationComment || ""} onChange={f("relationComment")} placeholder="Relationship details..." />
    </div>

    {/* Disability Fields */}
    <div className="col-6">
      <label className="form-label fs-13">Is Client Disabled?</label>
      <select className="form-select" value={form.isDisabled || ""} onChange={f("isDisabled")}>
        <option value="">Select</option>
        <option value="Yes">Yes</option>
        <option value="No">No</option>
      </select>
    </div>
   {form.isDisabled === "Yes" && (
  <div className="col-6">
    <label className="form-label fs-13">Client Disability Type</label>
    <select className="form-select" value={form.disability || ""} onChange={f("disability")}>
      <option value="">Select Disability Category</option>
      {options.disabilities?.map((d: any, idx: number) => (
        <option key={idx} value={d.id}>{extractString(d)}</option>
      ))}
    </select>
  </div>
)}

    {/* Education Fields */}
    <div className="col-6">
      <label className="form-label fs-13">Client in School? <span className="text-danger">*</span></label>
      <select className="form-select" value={form.attendingSchool || ""} onChange={f("attendingSchool")}>
        <option value="">Select</option>
        <option value="Yes">Yes</option>
        <option value="No">No</option>
      </select>
    </div>

    {form.attendingSchool === "Yes" ? (
      <>
        <div className="col-6">
          <label className="form-label fs-13">School Level <span className="text-danger">*</span></label>
          <select className="form-select" value={form.schoolLevel || ""} onChange={f("schoolLevel")}>
            <option value="">Select Level</option>
            {options.schoolLevels.map((l, idx) => (
              <option key={idx} value={l.id}>{extractString(l)}</option>
            ))}
          </select>
        </div>
        <div className="col-6">
          <label className="form-label fs-13">School Type <span className="text-danger">*</span></label>
          <select className="form-select" value={form.schoolType || ""} onChange={f("schoolType")}>
            <option value="">Select Type</option>
            {options.schoolTypes.map((t, idx) => (
              <option key={idx} value={t.id}>{extractString(t)}</option>
            ))}
          </select>
        </div>
        <div className="col-6">
          <label className="form-label fs-13">Attendance</label>
          <select className="form-select" value={form.attendance || ""} onChange={f("attendance")}>
            <option value="">Select</option>
            <option value="Regular">Regular</option>
            <option value="Irregular">Irregular</option>
            <option value="Dropped Out">Dropped Out</option>
          </select>
        </div>
        <div className="col-6">
          <label className="form-label fs-13">School Name</label>
          <input className="form-control" list={`${panelId}-school-list-client`} value={form.school || ""} onChange={f("school")} placeholder="Type or select school name..." />
          <datalist id={`${panelId}-school-list-client`}>
            {options.knownSchools.map((s, idx) => (
              <option key={idx} value={extractString(s)} />
            ))}
          </datalist>
        </div>
        <div className="col-12">
          <label className="form-label fs-13">School Address</label>
          <input className="form-control" value={form.schoolAddress || ""} onChange={f("schoolAddress")} placeholder="School Address" />
        </div>
      </>
    ) : form.attendingSchool === "No" ? (
      <div className="col-6">
        <label className="form-label fs-13">Reason for Not Attending School</label>
        <input className="form-control" value={form.notInSchoolReason || ""} onChange={f("notInSchoolReason")} placeholder="Specify reason" />
      </div>
    ) : null}

    {/* Marital & Spouse Details */}
    {form.isMarried === "Yes" && (
  <div className="col-6">
    <label className="form-label fs-13">Spouse Profession</label>
    <select className="form-select" value={form.spouseProfession || ""} onChange={f("spouseProfession")}>
      <option value="">Select Profession</option>
      {options.professions?.map((p: any, idx: number) => (
        <option key={idx} value={p.id}>{extractString(p)}</option>
      ))}
    </select>
  </div>
)}
    <div className="col-6">
      <label className="form-label fs-13">Marital Status</label>
      <select className="form-select" value={form.maritalStatus || ""} onChange={f("maritalStatus")}>
        <option value="">Select</option>
        {options.maritalStatuses.map((m, idx) => (
          <option key={idx} value={m.id}>{extractString(m)}</option>
        ))}
      </select>
    </div>
    {form.isMarried === "Yes" && (
      <>
        <div className="col-6">
          <label className="form-label fs-13">Spouse Full Name</label>
          <input className="form-control" value={form.spouseFullName || ""} onChange={f("spouseFullName")} placeholder="Spouse Full Name" />
        </div>
        <div className="col-6">
          <label className="form-label fs-13">Spouse Profession</label>
          <input className="form-control" value={form.spouseProfession || ""} onChange={f("spouseProfession")} placeholder="Spouse Profession" />
        </div>
      </>
    )}

    {/* Guardian Information */}
    <div className="col-6">
      <label className="form-label fs-13">Is Guardian Known?</label>
      <select className="form-select" value={form.isGuardianKnown || ""} onChange={f("isGuardianKnown")}>
        <option value="">Select</option>
        <option value="Yes">Yes</option>
        <option value="No">No</option>
      </select>
    </div>
    {form.isGuardianKnown === "Yes" && (
      <>
        <div className="col-6">
          <label className="form-label fs-13">Guardian Name</label>
          <input className="form-control" value={form.parentName || ""} onChange={f("parentName")} placeholder="Guardian Name" />
        </div>
        <div className="col-6">
          <label className="form-label fs-13">Guardian National ID</label>
          <input className="form-control" value={form.guardianNationalId || ""} onChange={f("guardianNationalId")} placeholder="Guardian National ID" />
        </div>
        <div className="col-6">
          <label className="form-label fs-13">Guardian Marital Status</label>
          <select className="form-select" value={form.guardianMaritalStatus || ""} onChange={f("guardianMaritalStatus")}>
            <option value="">Select</option>
            {options.maritalStatuses.map((m, idx) => (
              <option key={idx} value={m.id}>{extractString(m)}</option>
            ))}
          </select>
        </div>
      </>
    )}

    {/* Household Information */}
    <div className="col-6">
      <label className="form-label fs-13">Household Type</label>
      <input className="form-control" value={form.householdType || ""} onChange={f("householdType")} placeholder="e.g. Single Parent, Child-Headed" />
    </div>
    <div className="col-6">
      <label className="form-label fs-13">No. of Adults in Household</label>
      <input className="form-control" type="number" value={form.adultsInHousehold || ""} onChange={f("adultsInHousehold")} />
    </div>
    <div className="col-6">
      <label className="form-label fs-13">Occupation of Household Head</label>
      <input className="form-control" value={form.headOccupation || ""} onChange={f("headOccupation")} placeholder="Occupation" />
    </div>

    {/* Health Status & Referrals */}
    <div className="col-6">
      <label className="form-label fs-13">Health Status</label>
      <select className="form-select" value={form.healthStatus || ""} onChange={f("healthStatus")}>
        <option value="">Select</option>
        {options.healthStatuses.map((h, idx) => (
          <option key={idx} value={h.id}>{extractString(h)}</option>
        ))}
      </select>
    </div>
    <div className="col-6">
      <label className="form-label fs-13">HIV Status</label>
      <select className="form-select" value={form.hivStatus || ""} onChange={f("hivStatus")}>
        <option value="">Select</option>
        {options.hivStatuses.map((h, idx) => (
          <option key={idx} value={h.id}>{extractString(h)}</option>
        ))}
      </select>
    </div>
    <div className="col-6">
      <label className="form-label fs-13">Referred for Special Services?</label>
      <select className="form-select" value={form.referredSpecialServices || ""} onChange={f("referredSpecialServices")}>
        <option value="">Select</option>
        <option value="Yes">Yes</option>
        <option value="No">No</option>
      </select>
    </div>
  </>
)}

        {isPerp && (
  <>
    {/* Contact & Identity Fields */}
    <div className="col-6">
      <label className="form-label fs-13">Phone</label>
      <input className="form-control" value={form.phone || ""} onChange={f("phone")} placeholder="Phone Number" />
    </div>
    <div className="col-6">
      <label className="form-label fs-13">Alternative Contact</label>
      <input className="form-control" value={form.altPhone || ""} onChange={f("altPhone")} placeholder="Alt Phone Number" />
    </div>
    <div className="col-6">
      <label className="form-label fs-13">National ID</label>
      <input className="form-control" value={form.nationalId || ""} onChange={f("nationalId")} placeholder="National ID" />
    </div>
    <div className="col-6">
      <label className="form-label fs-13">Nationality</label>
      <select className="form-select" value={form.nationality || ""} onChange={f("nationality")}>
        <option value="">Select Nationality</option>
        {options.nationalities.map((n, idx) => (
          <option key={idx} value={n.id}>{extractString(n)}</option>
        ))}
      </select>
    </div>

    {/* Cultural & Location Details */}
    <div className="col-6">
      <label className="form-label fs-13">Tribe</label>
      <input className="form-control" value={form.tribe || ""} onChange={f("tribe")} placeholder="e.g. Kikuyu, Luo" />
    </div>
    <div className="col-6">
      <label className="form-label fs-13">Language</label>
      <input className="form-control" value={form.language || ""} onChange={f("language")} placeholder="Primary language" />
    </div>
    <div className="col-6">
      <label className="form-label fs-13">Nearest Landmark</label>
      <input className="form-control" value={form.landmark || ""} onChange={f("landmark")} placeholder="Landmark" />
    </div>
        <div className="col-6">
      <label className="form-label fs-13">County</label>
      <select className="form-select" value={form.county || ""} onChange={handleCountyChange}>
        <option value="">Select County</option>
        {countiesData.map((c: any) => (
          <option key={c.code} value={c.name}>{c.name}</option>
        ))}
      </select>
    </div>
    <div className="col-6">
      <label className="form-label fs-13">Sub-County</label>
      <select
        className="form-select"
        value={form.subcounty || ""}
        onChange={handleSubcountyChange}
        disabled={!form.county}
      >
        <option value="">Select Sub-County</option>
        {filteredSubcounties.map((sc: any) => (
          <option key={sc.code} value={sc.name}>{sc.name}</option>
        ))}
      </select>
    </div>
    <div className="col-6">
      <label className="form-label fs-13">Ward</label>
      <select
        className="form-select"
        value={form.ward || ""}
        onChange={f("ward")}
        disabled={!form.subcounty}
      >
        <option value="">Select Ward</option>
        {filteredWards.map((w: any) => (
          <option key={w.code} value={w.name}>{w.name}</option>
        ))}
      </select>
    </div>
    <div className="col-6">
      <label className="form-label fs-13">Village</label>
      <input className="form-control" value={form.village || ""} onChange={f("village")} placeholder="Village name" />
    </div>

    {/* Relationship & Living Arrangement */}
    <div className="col-6">
      <label className="form-label fs-13">Relationship with Client</label>
      <select className="form-select" value={form.relationToChild || ""} onChange={f("relationToChild")}>
        <option value="">Select Relationship</option>
        {options.relationships.map((r, idx) => (
          <option key={idx} value={r.id}>{extractString(r)}</option>
        ))}
      </select>
    </div>
    <div className="col-6">
      <label className="form-label fs-13">Shares Home with Client?</label>
      <select className="form-select" value={form.sharesHome || ""} onChange={f("sharesHome")}>
        <option value="">Select</option>
        <option value="Yes">Yes</option>
        <option value="No">No</option>
      </select>
    </div>

    {/* Status & Guardian Info */}
    <div className="col-6">
      <label className="form-label fs-13">Marital Status</label>
      <select className="form-select" value={form.maritalStatus || ""} onChange={f("maritalStatus")}>
        <option value="">Select Status</option>
        {options.maritalStatuses.map((m, idx) => (
          <option key={idx} value={m.id}>{extractString(m)}</option>
        ))}
      </select>
    </div>
    <div className="col-6">
      <label className="form-label fs-13">Health Status</label>
      <select className="form-select" value={form.healthStatus || ""} onChange={f("healthStatus")}>
        <option value="">Select Status</option>
        {options.healthStatuses.map((h, idx) => (
          <option key={idx} value={h.id}>{extractString(h)}</option>
        ))}
      </select>
    </div>
    <div className="col-6">
      <label className="form-label fs-13">Employment Status</label>
      <input className="form-control" value={form.employmentStatus || ""} onChange={f("employmentStatus")} placeholder="e.g. Employed, Unemployed" />
    </div>
    <div className="col-6">
      <label className="form-label fs-13">Guardian Name</label>
      <input className="form-control" value={form.parentName || ""} onChange={f("parentName")} placeholder="Guardian Name" />
    </div>

    {/* Additional Details */}
    <div className="col-12">
      <label className="form-label fs-13">Additional Details</label>
      <textarea className="form-control" rows={3} value={form.additionalDetails || ""} onChange={f("additionalDetails")} placeholder="Any additional notes on perpetrator..." />
    </div>
  </>
)}

          <div className="col-12">
            <label className="form-label fs-13">Additional Details</label>
            <textarea className="form-control" rows={2} value={form.additionalDetails || ""} onChange={f("additionalDetails")} />
          </div>
        </div>
      </div>
      <div className="offcanvas-footer border-top py-3 px-4 d-flex justify-content-end gap-2 bg-light">
        <button type="button" className="btn btn-light fs-13" onClick={closePanel}>Cancel</button>
        <button type="button" className="btn btn-primary fs-13" onClick={handleConfirm} disabled={isSubmitting}>
          <i className="ti ti-check me-1" />
          {isSubmitting ? "Saving..." : (editIndex != null ? "Save Changes" : "Confirm")}
        </button>
      </div>
    </div>
  );
};

// ── PersonCard ──────────────────────────────────────────────────────────────
const PersonCard: React.FC<{
  data: any;
  index: number;
  label: string;
  onEdit: () => void;
  onRemove: () => void;
  removable?: boolean;
}> = ({ data, index, label, onEdit, onRemove, removable = true }) => {
  const displayName = data.name || [data.firstname, data.lastname || data.secondname].filter(Boolean).join(" ") || "?";
  const initials = displayName
    .split(" ").map((w: string) => w[0] || "").join("").slice(0, 2).toUpperCase();

  return (
    <div className="card border shadow-sm mb-3">
      <div className="card-header bg-light d-flex justify-content-between align-items-center py-2 px-3">
        <div className="d-flex align-items-center gap-2">
          <div style={{
            width: 34, height: 34, borderRadius: "50%",
            background: "#dbeafe", display: "flex", alignItems: "center",
            justifyContent: "center", fontWeight: 600, fontSize: 12, color: "#1e40af",
            flexShrink: 0,
          }}>{initials}</div>
          <div>
            <div className="fw-semibold fs-13">{displayName}</div>
            <div className="text-muted fs-11">{label} #{index + 1}</div>
          </div>
        </div>
        <div className="d-flex gap-2">
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary fs-12"
            onClick={onEdit}
          >
            <i className="ti ti-edit me-1" />Edit
          </button>
          {removable && (
            <button type="button" className="btn btn-sm btn-link text-danger p-0 fs-12" onClick={onRemove}>
              <i className="ti ti-trash me-1" />Remove
            </button>
          )}
        </div>
      </div>
      <div className="card-body p-3">
        <div className="d-flex flex-wrap gap-3">
          {data.gender && <span className="badge bg-primary-transparent text-primary fs-11">{renderSafe(data.gender)}</span>}
          {data.nationality && <span className="badge bg-success-transparent text-success fs-11">{renderSafe(data.nationality)}</span>}
          {data.age && <span className="badge bg-warning-transparent text-warning fs-11">Age: {data.age}</span>}
        </div>
        <div className="mt-2 d-flex flex-wrap gap-3">
          {data.phone && <span className="fs-12 text-muted"><i className="ti ti-phone me-1" />{data.phone}</span>}
          {data.email && <span className="fs-12 text-muted"><i className="ti ti-mail me-1" />{data.email}</span>}
        </div>
      </div>
    </div>
  );
};

// ── Main CaseModal ─────────────────────────────────────────────────────────
const CaseModal: React.FC<CaseModalProps> = ({
  showChat = true,
  activeThread = null,
  chatContextMessages = [],
  onSendMessage = () => { },
  onSendFile,
  idPrefix = "offcanvas_add",
  staticBackdrop = false,
}) => {
  const offcanvasId = idPrefix;
  const personPanelId = `${idPrefix}_person_panel`;

  const abortControllerRef = useRef<AbortController | null>(null);

  const [saving, setSaving] = useState(false);
  
  const [activeTab, setActiveTab] = useState("reporter");
  const [lookups, setLookups] = useState<any>({});

  // ── Derived Lookups ─────────────────────────────────────────────────────
  const AGE_GROUPS = toArray(lookups.age_groups);
  const GENDERS = toArray(lookups.genders);
  const NATIONALITIES = toArray(lookups.countries || lookups.nationalities);
  const SERVICES = toArray(lookups.services).map(extractString);
  const PRIORITIES = toArray(lookups.priorities).map(extractString);
  const STATUSES = toArray(lookups.statuses).map(extractString);
  const HIV_STATUSES = toArray(lookups.hiv_statuses);
  const MARITAL_STATUSES = toArray(lookups.marital_statuses);
  const SCHOOL_LEVELS = toArray(lookups.school_levels);
  const SCHOOL_TYPES = toArray(lookups.school_types);
  const KNOWN_SCHOOLS = toArray(lookups.known_schools);
  const HOW_KNEW_CLK = toArray(lookups.how_knew_clk).map(extractString);
  const RELATIONSHIPS = toArray(lookups.relationships);
  const HEALTH_STATUSES = toArray(lookups.health_statuses);
  const LOCATIONS = toArray(lookups.locations);
  
  const personOptions: PersonOptionLists = {
    ageGroups: AGE_GROUPS,
    genders: GENDERS,
    nationalities: NATIONALITIES,
    relationships: RELATIONSHIPS,
    healthStatuses: HEALTH_STATUSES,
    hivStatuses: HIV_STATUSES,
    maritalStatuses: MARITAL_STATUSES,
    schoolLevels: SCHOOL_LEVELS,
    schoolTypes: SCHOOL_TYPES,
    knownSchools: KNOWN_SCHOOLS,
    locations: LOCATIONS,
  };
 const clearForm = useCallback(() => {
  // Reset Category & Case Details
  setSelectedCategory(null);
  setSelectedCategoryData(null);
  setCategoryPath("");
  setCaseNumber("");
  setCaseSource("");
  setCaseDescription("");
  setCaseNarrative("");
  setCasePlan("");
  setCasePlanExtra("");
  setIsGBV("");
  setMedExam("");
  setPriority("Medium");
  setStatus("Open");
  setStatusReasonClosure("");
  setDateClosure("");
  setEscalated("");
  setEscalatedTo("");
  setWasEscalated(false);
  setHowKnewCLK("");
  setSecondLevel("");
  setNeedsAssessment([]);
  setServicesOffered([]);
  setReferralWhere("");
  setObData("");
  setCaseNotes("");

  // Reset Flags & Identifiers
  setSourceAddress("");
  setPoliceRef("");
  setIncidentDate("");
  setReportedPlace("");
  setHivTestResult("");
  setCounsellingOrg("");
  setJusticeSystem("");
  setAssessment("");
  setKnowAbout("");
  setReferrals([]);
  setClientRelationshipComment("");

  // Clear Booleans
  setIsClient("");
  setIsIncidentReported("");
  setIsHivTested("");
  setIsPepGiven("");
  setIsArtGiven("");
  setIsEcpGiven("");
  setIsCounsellingGiven("");
  setIsReferred("");

  // Reset Person Entities
  setReporter({});
  setClients([]);
  setPerpetrators([]);

  // Reset Navigation & Panels
  setActiveTab("reporter");
  setPanelType("client");
  setPanelInitialData({});
  setPanelEditIndex(undefined);
}, []);

  // ── Panel State (For Reporter, Client & Perpetrator) ───────────────────
  const [panelType, setPanelType] = useState<PersonType>("client");
  const [panelInitialData, setPanelInitialData] = useState<any>({});
  const [panelEditIndex, setPanelEditIndex] = useState<number | undefined>(undefined);

  // ── Form State ──────────────────────────────────────────────────────────
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [selectedCategoryData, setSelectedCategoryData] = useState<any>(null);
  const [categoryPath, setCategoryPath] = useState<string>("");

  const [caseNumber, setCaseNumber] = useState("");
  const [caseSource, setCaseSource] = useState("");
  const [caseDescription, setCaseDescription] = useState("");
  const [caseNarrative, setCaseNarrative] = useState("");
  const [casePlan, setCasePlan] = useState("");
  const [casePlanExtra, setCasePlanExtra] = useState("");
  const [isGBV, setIsGBV] = useState("");
  const [medExam, setMedExam] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [status, setStatus] = useState("Open");
  const [statusReasonClosure, setStatusReasonClosure] = useState("");
  const [dateClosure, setDateClosure] = useState("");
  const [escalated, setEscalated] = useState("");
  const [escalatedTo, setEscalatedTo] = useState("");
  const [wasEscalated, setWasEscalated] = useState(false);
  const [supervisors, setSupervisors] = useState<{ id: number; name: string }[]>([]);
  const [howKnewCLK, setHowKnewCLK] = useState("");
  const [secondLevel, setSecondLevel] = useState("");
  const [needsAssessment, setNeedsAssessment] = useState<string[]>([]);
  const [servicesOffered, setServicesOffered] = useState<string[]>([]);
  const [referralWhere, setReferralWhere] = useState("");
  const [obData, setObData] = useState("");
  const [caseNotes, setCaseNotes] = useState("");

  const [sourceAddress, setSourceAddress] = useState("");
  const [policeRef, setPoliceRef] = useState("");
  const [incidentDate, setIncidentDate] = useState("");
  const [reportedPlace, setReportedPlace] = useState("");
  const [hivTestResult, setHivTestResult] = useState("");
  const [counsellingOrg, setCounsellingOrg] = useState("");
  const [justiceSystem, setJusticeSystem] = useState("");
  const [assessment, setAssessment] = useState("");
  const [knowAbout, setKnowAbout] = useState("");
  const [referrals, setReferrals] = useState<string[]>([]);
  const [clientRelationshipComment, setClientRelationshipComment] = useState("");

  const [isClient, setIsClient] = useState("");
  const [isIncidentReported, setIsIncidentReported] = useState("");
  const [isHivTested, setIsHivTested] = useState("");
  const [isPepGiven, setIsPepGiven] = useState("");
  const [isArtGiven, setIsArtGiven] = useState("");
  const [isEcpGiven, setIsEcpGiven] = useState("");
  const [isCounsellingGiven, setIsCounsellingGiven] = useState("");
  const [isReferred, setIsReferred] = useState("");

  // Reporter Form State
  const [reporter, setReporter] = useState<any>({});
  const [clients, setClients] = useState<any[]>([]);
  const [perpetrators, setPerpetrators] = useState<any[]>([]);

  const handleReporterChange = (field: string, value: any) => {
    setReporter((prev: any) => ({ ...prev, [field]: value }));
  };

  // DOB → auto-derive age + age group. Age (typed manually) → auto-derive age group.
  const handleReporterDobChange = useCallback((dob: string) => {
    const derivedAge = calculateAgeFromDob(dob);
    setReporter((prev: any) => {
      const next: any = { ...prev, dob };
      if (derivedAge !== null) {
        next.age = String(derivedAge);
        const groupId = findAgeGroupId(derivedAge, AGE_GROUPS);
        if (groupId !== null) next.ageGroup = String(groupId);
      }
      return next;
    });
  }, [AGE_GROUPS]);

  const handleReporterAgeChange = useCallback((age: string) => {
    setReporter((prev: any) => {
      const next: any = { ...prev, age };
      const groupId = findAgeGroupId(age, AGE_GROUPS);
      if (groupId !== null) next.ageGroup = String(groupId);
      return next;
    });
  }, [AGE_GROUPS]);

  // ── Slide Panel Control Helper (Guaranteed Trigger) ─────────────────────
  const showSlidePanel = useCallback(() => {
    const el = document.getElementById(personPanelId);
    if (el) {
      const bootstrap = (window as any).bootstrap;
      if (bootstrap?.Offcanvas) {
        const bsInstance = bootstrap.Offcanvas.getOrCreateInstance(el);
        bsInstance?.show();
      } else {
        el.classList.add("show");
        el.style.visibility = "visible";
        el.style.display = "block";
      }
    }
  }, [personPanelId]);

  const openAddPanel = useCallback((type: PersonType) => {
    setPanelType(type);
    setPanelInitialData({});
    setPanelEditIndex(undefined);
    setTimeout(showSlidePanel, 50);
  }, [showSlidePanel]);

  const openEditPanel = useCallback((type: PersonType, index: number, data: any) => {
    setPanelType(type);
    setPanelInitialData(data);
    setPanelEditIndex(index);
    setTimeout(showSlidePanel, 50);
  }, [showSlidePanel]);

  const handlePanelConfirm = useCallback((data: any) => {
    if (panelType === "reporter") {
      setReporter(data);
    } else if (panelType === "client") {
      if (panelEditIndex != null) {
        setClients(prev => prev.map((c, i) => i === panelEditIndex ? data : c));
      } else {
        setClients(prev => [...prev, data]);
      }
    } else if (panelType === "perpetrator") {
      if (panelEditIndex != null) {
        setPerpetrators(prev => prev.map((p, i) => i === panelEditIndex ? data : p));
      } else {
        setPerpetrators(prev => [...prev, data]);
      }
    }
  }, [panelType, panelEditIndex]);

  // ── "Is this a client?" toggle → prefill client record from reporter ────
 const handleIsClientToggle = useCallback((checked: boolean) => {
    setIsClient(checked ? "true" : "false");

    if (checked) {
      // Prefill only if no client exists yet, and only if reporter has a name
      if (clients.length === 0 && (reporter.name || reporter.firstname)) {
        const fullName = joinName(reporter.firstname, reporter.lastname) || reporter.name || "";
        setClients([{
          firstname: reporter.firstname || "",
          lastname: reporter.lastname || "",
          name: fullName,
          fullname: fullName,
          phone: reporter.phone || "",
          altPhone: reporter.altPhone || "",
          dob: reporter.dob || "",
          age: reporter.age || "",
          ageGroup: reporter.ageGroup || "",
          gender: reporter.gender || "",
          nationality: reporter.nationality || "",
          landmark: reporter.landmark || "",
          location: reporter.location || "",
          county: reporter.county || "",
          subcounty: reporter.subcounty || "",
          ward: reporter.ward || "",
          tribe: reporter.tribe || "",
          language: reporter.language || "",
          relationToChild: reporter.relationToChild || "",
          relationComment: reporter.relationComment || "",
          persontype: "client",
        }]);
      }
    } else {
      // Turning off clears the client list
      setClients([]);
    }
  }, [reporter, clients.length]);

  const fetchCaseNumber = useCallback(
    async (categoryId?: number | null) => {
      try {
        const API = (await import('../../../../../../services/api')).default;
        const params = categoryId ? `?category_id=${categoryId}` : "";
        const response = await API.get(`cases/generate-case-number/${params}`);

        if (res.data?.case_number) {
          setCaseNumber(res.data.case_number);
        }
      } catch (err) {
        console.warn("Could not fetch case number:", err);
        setCaseNumber("KE-CHL:GEN0000");
      }
    },
    []
  );

useEffect(() => {
  if (activeThread) {
    fetchCaseNumber(selectedCategory);

    const { firstname, secondname } = splitName(activeThread.name);

    setReporter((prev: any) => ({
      ...prev,
      name: activeThread.name,
      firstname: prev.firstname || firstname,
      lastname: prev.lastname || secondname,
    }));

 
const derivedSource = (activeThread as any).platform || activeThread.channel || "Chat";
setCaseSource(derivedSource);

    setActiveTab("reporter");
  }
  // Removed setCaseSource("") from else block to allow triggerModalOpen to set "walk-in"
}, [activeThread, fetchCaseNumber]);

  useEffect(() => {
    if (selectedCategory) {
      fetchCaseNumber(selectedCategory);
    }
  }, [selectedCategory, fetchCaseNumber]);


  const handleCategoryChange = useCallback((categoryId: number | null, categoryData?: any | null, path?: string) => {
    setSelectedCategory(categoryId);
    setSelectedCategoryData(categoryData);

    if (categoryData && path) {
      setCategoryPath(path);
    } else if (categoryData) {
      setCategoryPath(categoryData.category_name || '');
    } else {
      setCategoryPath('');
    }

    fetchCaseNumber(categoryId);
  }, [fetchCaseNumber]);

  const toggleService = useCallback((s: string) =>
    setServicesOffered(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]), []);

  const toggleNeed = useCallback((n: string) =>
    setNeedsAssessment(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n]), []);

  // ── Save & Validation Handler ───────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setSaving(true);
    
    // Validate mandatory fields and output human-readable labels in warning modal
    const errors: string[] = [];

    if (!reporter.firstname?.trim()) errors.push(FIELD_LABELS.firstname);
    if (!reporter.phone?.trim()) errors.push(FIELD_LABELS.phone);
    if (!reporter.age) errors.push(FIELD_LABELS.age);
    if (!reporter.gender) errors.push(FIELD_LABELS.gender);
    if (!reporter.nationality) errors.push(FIELD_LABELS.nationality);
    //if (!reporter.relationToChild) errors.push(FIELD_LABELS.relationToChild);
    //if (!selectedCategory) errors.push(FIELD_LABELS.selectedCategory);
    if (!status) errors.push(FIELD_LABELS.status);

    if (errors.length > 0) {
      const errorMessage = `Please fill in the following required fields before submitting:\n• ${errors.join('\n• ')}`;
      showWarning(errorMessage, "Required Fields Missing");
      setSaving(false);
      return;
    }

    try {
      const API = (await import('../../../../../../services/api')).default;

     
      const formattedClients = clients.map((client: any) => ({
        ...client,
        persontype: "client",
      }));

      const formattedPerpetrators = perpetrators.map((perp: any) => ({
        ...perp,
        persontype: "perpetrator",
      }));

      const rawName = reporter.name || `${reporter.firstname || ""} ${reporter.lastname || ""}`.trim();
      const formattedReporter = {
        ...reporter,
        name: rawName,
        fullname: rawName,
        persontype: "reporter",
        gender: reporter.gender ? Number(reporter.gender) : null,
        nationality: reporter.nationality ? Number(reporter.nationality) : null,
        age: reporter.age ? Number(reporter.age) : null,
        ageGroup: reporter.ageGroup || null,
        dob: reporter.dob || null,
        landmark: reporter.landmark || null,
        location: reporter.location ? Number(reporter.location) || reporter.location : null,
        school: reporter.school || null,
        grade: reporter.grade || null,
        reporter_relationship_to_child: reporter.relationToChild ? Number(reporter.relationToChild) : null,
      };

      const payload = {
        conversation_id: activeThread?.id ? parseInt(activeThread.id, 10) : null,
        case_number: caseNumber,
        case_source: caseSource,
        case_source_address: sourceAddress,
        category_id: selectedCategory,
        category_name: selectedCategoryData?.category_name || null,
        category_path: categoryPath || null,
        category_data: selectedCategoryData || null,
        case_description: caseDescription,
        case_narrative: caseNarrative,
        case_plan: casePlan,
        case_plan_extra: casePlanExtra,
        case_isgbv: isGBV === "Yes",
        case_isclient: isClient === "true",
        case_isincidentreported: isIncidentReported === "true",
        case_ishivtested: isHivTested === "true",
        case_ispepgiven: isPepGiven === "true",
        case_isartgiven: isArtGiven === "true",
        case_isecpgiven: isEcpGiven === "true",
        case_iscounsellinggiven: isCounsellingGiven === "true",
        case_isreferred: isReferred === "true",
        case_ismedicalexam: medExam === "Yes",
        case_policeref: policeRef,
        case_incidentdate: incidentDate,
        case_reportedplace: reportedPlace,
        case_hivtestresult: hivTestResult,
        case_counsellingorg: counsellingOrg,
        case_justicesystem: justiceSystem,
        case_assessment: assessment,
        case_knowabout: knowAbout,
        case_referrals: referrals,
        case_clientrelationshipcomment: clientRelationshipComment,
        case_med_exam: medExam,
        priority,
        status,
        status_reason_closure: statusReasonClosure,
        date_closure: dateClosure,
        escalated,
        escalated_to: escalatedTo,
        how_knew_clk: howKnewCLK,
        second_level: secondLevel,
        needs_assessment: needsAssessment,
        services_offered: servicesOffered,
        referral_where: referralWhere,
        ob_data: obData,
        case_notes: caseNotes,
        case_reporter: formattedReporter,
        case_clients: formattedClients,
        case_perpetrators: formattedPerpetrators,
      };

      const res = await API.post(`cases/`, payload);

      const isSuccess = res.data?.status === 'success' || res.status === 201 || res.status === 200;
      const savedCaseNumber = res.data?.case_number || res.data?.data?.case_number || caseNumber;

      if (isSuccess) {
         clearForm();
        const el = document.getElementById(offcanvasId);
        if (el) {
          const bs = (window as any).bootstrap;
          if (bs?.Offcanvas) {
            const instance = bs.Offcanvas.getInstance(el) || new bs.Offcanvas(el);
            instance.hide();
          }
        }

        showSuccess(`Case ${savedCaseNumber} saved successfully!`, 'Case Saved');
        
      } else {
        showError(res.data?.message || 'Save failed. Please check your inputs.', 'Submission Failed');
      }
    } catch (error: any) {
      console.error('Save error:', error);
      const responseData = error.response?.data;
      let errorMessage = 'Failed to save case. Please check required fields.';

      if (!error.response && error.message) {
        // Errors thrown manually (e.g. from createPersonRecord) won't have a response object
        errorMessage = error.message;
      } else if (responseData) {
        if (typeof responseData.message === 'string') {
          errorMessage = responseData.message;
        } else if (responseData.errors) {
          errorMessage = Object.entries(responseData.errors)
            .map(([field, errs]) => `${FIELD_LABELS[field] || field}: ${Array.isArray(errs) ? errs.join(', ') : errs}`)
            .join('\n');
        } else if (typeof responseData === 'object') {
          errorMessage = Object.entries(responseData)
            .map(([field, errs]) => `${FIELD_LABELS[field] || field}: ${Array.isArray(errs) ? errs.join(', ') : errs}`)
            .join('\n');
        }
      }

      showError(errorMessage, 'Error Saving Case');
    } finally {
      setSaving(false);
    }
  }, [
    activeThread, caseNumber, caseSource, sourceAddress, selectedCategory,
    selectedCategoryData, categoryPath, caseDescription, caseNarrative,
    casePlan, casePlanExtra, isGBV, isClient, isIncidentReported,
    isHivTested, isPepGiven, isArtGiven, isEcpGiven, isCounsellingGiven,
    isReferred, medExam, policeRef, incidentDate, reportedPlace,
    hivTestResult, counsellingOrg, justiceSystem, assessment, knowAbout,
    referrals, clientRelationshipComment, priority, status,
    statusReasonClosure, dateClosure, escalated, escalatedTo,
    howKnewCLK, secondLevel, needsAssessment, servicesOffered,
    referralWhere, obData, caseNotes, reporter, clients, perpetrators,
    offcanvasId
  ]);

// ── Listen for global "walk-in" trigger (fired from Header) ─────────────
useEffect(() => {
  const handleWalkIn = () => {
    clearForm();
    setCaseSource("walk-in");

    setTimeout(() => {
      const el = document.getElementById(offcanvasId);
      if (el) {
        const bootstrap = (window as any).bootstrap;
        const bsOffcanvas = bootstrap?.Offcanvas?.getOrCreateInstance(el);
        bsOffcanvas?.show();
      }
    }, 50);
  };

  window.addEventListener("trigger-create-case-flow", handleWalkIn);
  return () => window.removeEventListener("trigger-create-case-flow", handleWalkIn);
}, [clearForm, offcanvasId]);

  // ── Effects ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const loadLookups = async () => {
      try {
        const API = (await import('../../../../../../services/api')).default;
        const res = await API.get(`cases/lookups/`);
        setLookups(res.data ?? {});
      } catch (err) {
        console.error('Could not fetch case lookups', err);
      }
    };
    loadLookups();
  }, []);

  useEffect(() => {
    const fetchSupervisors = async () => {
      try {
        const API = (await import('../../../../../../services/api')).default;
        const res = await API.get('supervisors/');
        if (res.data?.supervisors) setSupervisors(res.data.supervisors);
      } catch {
        console.warn('Could not fetch supervisors');
      }
    };
    fetchSupervisors();
  }, []);

  useEffect(() => {
    const el = document.getElementById(offcanvasId);
    if (!el) return;

    const handleShow = () => fetchCaseNumber(selectedCategory);
    el.addEventListener("show.bs.offcanvas", handleShow);

    return () => el.removeEventListener("show.bs.offcanvas", handleShow);
  }, [offcanvasId, fetchCaseNumber, selectedCategory]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // ── Render Functions ────────────────────────────────────────────────────
  const renderReporter = useCallback(() => (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h5 className="fw-bold text-dark mb-0">Reporter Details</h5>
        {/* <button
          type="button"
          className="btn btn-sm btn-outline-primary fs-12"
          onClick={() => openEditPanel("reporter", 0, reporter)}
        >
          <i className="ti ti-edit me-1" />Edit in Panel
        </button> */}
      </div>

      <div className="row g-3">
        <div className="col-md-6">
          <label className="form-label fs-13">First Name <span className="text-danger">*</span></label>
          <input
            className="form-control"
            value={reporter.firstname || ""}
            onChange={(e) => handleReporterChange("firstname", e.target.value)}
            placeholder="First Name"
          />
        </div>
        <div className="col-md-6">
          <label className="form-label fs-13">Last Name</label>
          <input
            className="form-control"
            value={reporter.lastname || ""}
            onChange={(e) => handleReporterChange("lastname", e.target.value)}
            placeholder="Last Name"
          />
        </div>
        <div className="col-md-6">
          <label className="form-label fs-13">Phone Number <span className="text-danger">*</span></label>
          <input
            className="form-control"
            value={reporter.phone || ""}
            onChange={(e) => handleReporterChange("phone", e.target.value)}
            placeholder="Phone Number"
          />
        </div>
        <div className="col-md-6">
          <label className="form-label fs-13">Alternative Phone</label>
          <input
            className="form-control"
            value={reporter.altPhone || ""}
            onChange={(e) => handleReporterChange("altPhone", e.target.value)}
            placeholder="Alternative Phone"
          />
        </div>


           <div className="col-md-4">
          <label className="form-label fs-13">Date of Birth</label>
          <input
            className="form-control"
            type="date"
            value={reporter.dob || ""}
            onChange={(e) => handleReporterDobChange(e.target.value)}
          />
        </div>

        <div className="col-md-4">
          <label className="form-label fs-13">Age <span className="text-danger">*</span></label>
          <input
            className="form-control"
            type="number"
            value={reporter.age || ""}
            onChange={(e) => handleReporterAgeChange(e.target.value)}
            placeholder="Age"
          />
        </div>
        <div className="col-md-4">
          <label className="form-label fs-13">Age Group</label>
          <select
            className="form-select"
            value={reporter.ageGroup || ""}
            onChange={(e) => handleReporterChange("ageGroup", e.target.value)}
          >
            <option value="">Select Age Group</option>
            {AGE_GROUPS.map((a, idx) => (
              <option key={idx} value={a.id}>{extractString(a)}</option>
            ))}
          </select>
        </div>
        <div className="col-md-4">
          <label className="form-label fs-13">Gender <span className="text-danger">*</span></label>
          <select
            className="form-select"
            value={reporter.gender || ""}
            onChange={(e) => handleReporterChange("gender", e.target.value)}
          >
            <option value="">Select Gender</option>
            {GENDERS.map((g, idx) => (
              <option key={idx} value={g.id}>{extractString(g)}</option>
            ))}
          </select>
        </div>
        <div className="col-md-4">
          <label className="form-label fs-13">Nationality <span className="text-danger">*</span></label>
          <select
            className="form-select"
            value={reporter.nationality || ""}
            onChange={(e) => handleReporterChange("nationality", e.target.value)}
          >
            <option value="">Select Nationality</option>
            {NATIONALITIES.map((n, idx) => (
              <option key={idx} value={n.id}>{extractString(n)}</option>
            ))}
          </select>
        </div>
       {/* 1. County Dropdown */}
<div className="col-md-4">
  <label className="form-label fs-13">County <span className="text-danger">*</span></label>
  <select
    className="form-select"
    value={reporter.county || ""}
    onChange={(e) => {
      const value = e.target.value;
      handleReporterChange("county", value);
      handleReporterChange("subcounty", "");
      handleReporterChange("ward", "");
    }}
  >
    <option value="">Select County</option>
    {countiesData.map((c: any) => (
      <option key={c.code} value={c.name}>{c.name}</option>
    ))}
  </select>
</div>

{/* 2. Sub-County Dropdown */}
<div className="col-md-4">
  <label className="form-label fs-13">Sub County <span className="text-danger">*</span></label>
  <select
    className="form-select"
    value={reporter.subcounty || ""}
    onChange={(e) => {
      const value = e.target.value;
      handleReporterChange("subcounty", value);
      handleReporterChange("ward", "");
    }}
    disabled={!reporter.county}
  >
    <option value="">Select Sub County</option>
    {subcountiesData
      .filter((sc: any) => sc.county === reporter.county)
      .map((sc: any) => (
        <option key={sc.code} value={sc.name}>{sc.name}</option>
      ))}
  </select>
</div>

{/* 3. Ward Dropdown */}
<div className="col-md-4">
  <label className="form-label fs-13">Ward <span className="text-danger">*</span></label>
  <select
    className="form-select"
    value={reporter.ward || ""}
    onChange={(e) => handleReporterChange("ward", e.target.value)}
    disabled={!reporter.subcounty}
  >
    <option value="">Select Ward</option>
    {wardsData
      .filter((w: any) => w.constituency === reporter.subcounty)
      .map((w: any) => (
        <option key={w.code} value={w.name}>{w.name}</option>
      ))}
  </select>
</div>
        {/* <div className="col-md-6">
          <label className="form-label fs-13">Location</label>
          <input
            className="form-control"
            list="reporter-locations-list"
            placeholder="Type to search location..."
            value={
              reporter.location && !isNaN(Number(reporter.location))
                ? formatLocation(LOCATIONS.find((l: any) => l.id === Number(reporter.location))) || reporter.location
                : reporter.location || ""
            }
            onChange={(e) => {
              const typedValue = e.target.value;
              const matchedLoc = LOCATIONS.find(
                (loc: any) => formatLocation(loc).toLowerCase() === typedValue.toLowerCase()
              );
              handleReporterChange("location", matchedLoc ? matchedLoc.id : typedValue);
            }}
          />
          <datalist id="reporter-locations-list">
            {LOCATIONS.map((loc: any, idx: number) => (
              <option key={idx} value={formatLocation(loc)} />
            ))}
          </datalist>
        </div> */}
         <div className="col-md-4">
          <label className="form-label fs-13"><span className="text-danger">*</span>Nearest Landmark</label>
          <input
            className="form-control"
            value={reporter.landmark || ""}
            onChange={(e) => handleReporterChange("landmark", e.target.value)}
            placeholder="E.g. near KCB Bank"
          />
        </div>
        
        <div className="col-md-6">
          <label className="form-label fs-13">Email Address</label>
          <input
            className="form-control"
            type="email"
            value={reporter.email || ""}
            onChange={(e) => handleReporterChange("email", e.target.value)}
            placeholder="Email Address"
          />
        </div>
       
        
       
        
        {/* <div className="col-md-6">
          <label className="form-label fs-13">Reporter's Relation to Child <span className="text-danger">*</span></label>
          <select
            className="form-select"
            value={reporter.relationToChild || ""}
            onChange={(e) => handleReporterChange("relationToChild", e.target.value)}
          >
            <option value="">Select Relationship</option>
            {RELATIONSHIPS.map((r, idx) => (
              <option key={idx} value={r.id}>{extractString(r)}</option>
            ))}
          </select>
        </div> */}
        {/* <div className="col-12">
          <label className="form-label fs-13">Relationship Comments / Remarks</label>
          <textarea
            className="form-control"
            rows={2}
            value={reporter.relationComment || ""}
            onChange={(e) => handleReporterChange("relationComment", e.target.value)}
            placeholder="Provide additional details..."
          />
        </div> */}
       
        <div className="col-md-6">
          <label className="form-label fs-13">Reporter Tribe</label>
          <input
            className="form-control"
            value={reporter.tribe || ""}
            onChange={(e) => handleReporterChange("tribe", e.target.value)}
            placeholder="e.g. Kikuyu, Luo"
          />
        </div>
        <div className="col-md-6">
          <label className="form-label fs-13">Reporter Language </label>
          <input
            className="form-control"
            value={reporter.language || ""}
            onChange={(e) => handleReporterChange("language", e.target.value)}
            placeholder="e.g. English, Kiswahili"
          />
        </div>
        
         <div className="col-md-4">
  <label className="form-label fs-13">Is this a client?</label>

  <div className="form-check form-switch">
    <input
      className="form-check-input"
      type="checkbox"
      role="switch"
      id="isClient"
      style={{
    width: "3rem",
    height: "1.5rem",
   
  }}
      checked={isClient === "true"}
      onChange={e => handleIsClientToggle(e.target.checked)}
    />
    <label className="form-check-label" htmlFor="isClient">
      {isClient === "" ? "Select" : isClient === "true" ? "Yes" : "No"}
    </label>
  </div>
</div>
      </div>
    </div>
  ), [reporter, GENDERS, NATIONALITIES, RELATIONSHIPS, AGE_GROUPS, LOCATIONS, KNOWN_SCHOOLS, openEditPanel,isClient,handleIsClientToggle, handleReporterAgeChange, handleReporterDobChange]);


const YES_NO_PARENT_NAME = "Yes/No";
type YesNoOption = { id: number; label: string };
const YES_NO_FALLBACK: YesNoOption[] = [{ id: -1, label: "Yes" }, { id: -2, label: "No" }];

const FORM_FIELDS_ROOT_NAME = "Form Fields";

const useYesNoOptions = (): YesNoOption[] => {
  const [options, setOptions] = useState<YesNoOption[]>(YES_NO_FALLBACK);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const API = (await import('../../../../../../services/api')).default;

        // 1. Find the "Form Fields" root
        const roots = await getCategories("form_field");
        if (!active || !Array.isArray(roots)) return;

        const fieldsRoot = roots.find((c: any) =>
          String(c.category_name || "").trim().toLowerCase() === FORM_FIELDS_ROOT_NAME.toLowerCase()
        );
        if (!fieldsRoot) return;

        // 2. Find "Yes/No" among its children
        const fieldsRes = await API.get(`categories/${fieldsRoot.id}/children/`);
        const fieldGroups = fieldsRes.data?.children ?? [];
        const yesNoGroup = fieldGroups.find((c: any) =>
          String(c.category_name || "").trim().toLowerCase() === YES_NO_PARENT_NAME.toLowerCase()
        );
        if (!yesNoGroup) return;

        // 3. Fetch "Yes/No"'s children as the actual options
        const optionsRes = await API.get(`categories/${yesNoGroup.id}/children/`);
        const children = (optionsRes.data?.children ?? [])
          .filter((c: any) => c.category_status === "Active")
          .sort((a: any, b: any) => (a.category_order ?? 0) - (b.category_order ?? 0));

        if (active && children.length > 0) {
          setOptions(children.map((c: any) => ({ id: c.id, label: c.category_name })));
        }
      } catch { /* keep fallback */ }
    })();
    return () => { active = false; };
  }, []);
  return options;
};

const renderYesNoOptions = (options: YesNoOption[], boolMode = false) =>
  options.map(o => (
    <option key={o.id} value={boolMode ? String(o.label.trim().toLowerCase() === "yes") : o.label}>
      {o.label}
    </option>
  ));


 const yesNoOptions = useYesNoOptions();

const renderGeneral = useCallback(() => {
  
  return (
  <div>
    <h5 className="mb-4 fw-bold text-dark">Case Record</h5>
    <div className="row g-3">
      <div className="col-md-4">
        <input className="form-control bg-light" value={caseNumber} readOnly title="Auto-generated" hidden />
      </div>
      <div className="col-md-4">
        <input
          className="form-control bg-light"
          value={caseSource}
          readOnly
          placeholder="Auto-detected from thread"
          hidden
        />
      </div>

      <div className="col-12">
               <DynamicCategorySelector
          value={selectedCategory}
          onChange={handleCategoryChange}
          placeholder="Select category..."
          label="Case Category"
          required={true}
          categoryType="case_category"
          rootCategoryName="Main Case Categories"
        />
      </div>

      <div className="col-md-6">
        <label className="form-label fs-13">Police Reference Number<span className="text-danger">*</span></label>
        <input
          className="form-control"
          value={policeRef}
          onChange={e => setPoliceRef(e.target.value)}
          placeholder="OB Number..."
        />
      </div>

      <div className="col-md-6">
        <label className="form-label fs-13">Date of Incident<span className="text-danger">*</span></label>
        <input
          className="form-control"
          type="date"
          value={incidentDate}
          onChange={e => setIncidentDate(e.target.value)}
        />
      </div>

      <div className="col-md-6">
        <label className="form-label fs-13">Place of Report<span className="text-danger">*</span></label>
        <input
          className="form-control"
          value={reportedPlace}
          onChange={e => setReportedPlace(e.target.value)}
          placeholder="Where was the incident reported?"
        />
      </div>

      <div className="col-md-6">
        <label className="form-label fs-13">Assessment</label>
        <select className="form-select" value={assessment} onChange={e => setAssessment(e.target.value)}>
          <option value="">Select Assessment</option>
          {toArray(lookups.assessments).map((item: any, idx: number) => (
            <option key={idx} value={item.id}>{extractString(item)}</option>
          ))}
        </select>
      </div>

      <div className="col-md-6">
        <label className="form-label fs-13">How did you know about this service?</label>
        <select className="form-select" value={knowAbout} onChange={e => setKnowAbout(e.target.value)}>
          <option value="">Select</option>
          {toArray(lookups.know_about).map((item: any, idx: number) => (
            <option key={idx} value={item.id}>{extractString(item)}</option>
          ))}
        </select>
      </div>

      <div className="col-md-6">
        <label className="form-label fs-13">HIV Test Result<span className="text-danger">*</span></label>
        <select className="form-select" value={hivTestResult} onChange={e => setHivTestResult(e.target.value)}>
          <option value="">Select Result</option>
          <option value="Positive">Positive</option>
          <option value="Negative">Negative</option>
          <option value="Unknown">Unknown</option>
        </select>
      </div>

      <div className="col-md-6">
        <label className="form-label fs-13">Counselling Organization<span className="text-danger">*</span></label>
        <input
          className="form-control"
          value={counsellingOrg}
          onChange={e => setCounsellingOrg(e.target.value)}
          placeholder="Organization providing counselling..."
        />
      </div>

      <div className="col-md-6">
        <label className="form-label fs-13">Justice System<span className="text-danger">*</span></label>
        <select className="form-select" value={justiceSystem} onChange={e => setJusticeSystem(e.target.value)}>
          <option value="">Select Justice System</option>
          <option value="Police">Police</option>
          <option value="Court">Court</option>
          <option value="Legal Aid">Legal Aid</option>
          <option value="Other">Other</option>
        </select>
      </div>

      <div className="col-12">
        <label className="form-label fs-13">Client Relationship Comment<span className="text-danger">*</span></label>
        <textarea
          className="form-control"
          rows={2}
          value={clientRelationshipComment}
          onChange={e => setClientRelationshipComment(e.target.value)}
          placeholder="Additional details about the relationship..."
        />
      </div>

      <div className="col-12 mt-3">
        <h6 className="fw-bold text-secondary fs-13 border-bottom pb-2">Case Flags</h6>
        <div className="row g-2 mt-2">
          <div className="col-md-4">
            <label className="form-label fs-13">Is this case GBV related?</label>
            <select className="form-select" value={isGBV} onChange={e => setIsGBV(e.target.value)}>
              <option value="">Select</option>
              {renderYesNoOptions(yesNoOptions)}
            </select>
          </div>

          <div className="col-md-4">
            <label className="form-label fs-13">Was incident reported?</label>
            <select
              className="form-select"
              value={isIncidentReported}
              onChange={e => setIsIncidentReported(e.target.value)}
            >
              <option value="">Select</option>
              {renderYesNoOptions(yesNoOptions, true)}
            </select>
          </div>

          <div className="col-md-4">
            <label className="form-label fs-13">Medical examination received?</label>
            <select className="form-select" value={medExam} onChange={e => setMedExam(e.target.value)}>
              <option value="">Select</option>
              {renderYesNoOptions(yesNoOptions)}
            </select>
          </div>

          <div className="col-md-4">
            <label className="form-label fs-13">Second Level</label>
            <input
              className="form-control"
              value={secondLevel}
              onChange={e => setSecondLevel(e.target.value)}
              placeholder="Second level detail..."
            />
          </div>

          <div className="col-md-4">
            <label className="form-label fs-13">Was HIV testing done?<span className="text-danger">*</span></label>
            <select className="form-select" value={isHivTested} onChange={e => setIsHivTested(e.target.value)}>
              <option value="">Select</option>
              {renderYesNoOptions(yesNoOptions, true)}
            </select>
          </div>

          <div className="col-md-4">
            <label className="form-label fs-13">Was PEP given?</label>
            <select className="form-select" value={isPepGiven} onChange={e => setIsPepGiven(e.target.value)}>
              <option value="">Select</option>
              {renderYesNoOptions(yesNoOptions, true)}
            </select>
          </div>

          <div className="col-md-4">
            <label className="form-label fs-13">Was ART given?</label>
            <select className="form-select" value={isArtGiven} onChange={e => setIsArtGiven(e.target.value)}>
              <option value="">Select</option>
              {renderYesNoOptions(yesNoOptions, true)}
            </select>
          </div>

          <div className="col-md-4">
            <label className="form-label fs-13">Was ECP given?</label>
            <select className="form-select" value={isEcpGiven} onChange={e => setIsEcpGiven(e.target.value)}>
              <option value="">Select</option>
              {renderYesNoOptions(yesNoOptions, true)}
            </select>
          </div>

          <div className="col-md-4">
            <label className="form-label fs-13">Was counselling given?</label>
            <select
              className="form-select"
              value={isCounsellingGiven}
              onChange={e => setIsCounsellingGiven(e.target.value)}
            >
              <option value="">Select</option>
              {renderYesNoOptions(yesNoOptions, true)}
            </select>
          </div>

          <div className="col-md-4">
            <label className="form-label fs-13">Was this case referred?</label>
            <select className="form-select" value={isReferred} onChange={e => setIsReferred(e.target.value)}>
              <option value="">Select</option>
              {renderYesNoOptions(yesNoOptions, true)}
            </select>
          </div>
        </div>
      </div>

      {isReferred === "true" && (
        <div className="col-12">
          <label className="form-label fs-13">Referrals</label>
          <select
            className="form-select"
            multiple
            value={referrals}
            onChange={e => setReferrals(Array.from(e.target.selectedOptions, option => option.value))}
          >
            {toArray(lookups.referral_options).map((item: any, idx: number) => (
              <option key={idx} value={item.id}>{extractString(item)}</option>
            ))}
          </select>
          <small className="text-muted fs-11">Hold Ctrl/Cmd to select multiple</small>
        </div>
      )}

      <div className="col-md-4">
        <label className="form-label fs-13">How did you know about 116?</label>
        <select className="form-select" value={howKnewCLK} onChange={e => setHowKnewCLK(e.target.value)}>
          <option value="">Select</option>
          {HOW_KNEW_CLK.map((h, idx) => <option key={idx} value={h}>{h}</option>)}
        </select>
      </div>

      <div className="col-md-4">
        <label className="form-label fs-13">Was this case escalated?</label>
        <select
          className="form-select"
          value={escalated}
          onChange={e => {
            setEscalated(e.target.value);
            if (e.target.value === "Yes") setWasEscalated(true);
            if (e.target.value === "No") setEscalatedTo("");
          }}
        >
          <option value="">Select</option>
          {renderYesNoOptions(yesNoOptions)}
        </select>
      </div>

      {escalated === "Yes" && (
        <div className="col-md-4">
          <label className="form-label fs-13">Escalated To (Supervisor)</label>
          <select className="form-select" value={escalatedTo} onChange={e => setEscalatedTo(e.target.value)}>
            <option value="">Select supervisor</option>
            {supervisors.length > 0
              ? supervisors.map(s => <option key={s.id} value={s.name}>{s.name}</option>)
              : <option disabled>No supervisors found</option>}
          </select>
        </div>
      )}

      {wasEscalated && status === "Closed" && (
        <div className="col-12">
          <div className="alert alert-warning fs-12 py-2 mb-0">
            <i className="ti ti-alert-triangle me-1" />
            This case was previously escalated to <strong>{escalatedTo}</strong> before closure.
          </div>
        </div>
      )}

      <div className="col-12">
        <label className="form-label fs-13">Case Description<span className="text-danger">*</span></label>
        <textarea
          className="form-control"
          rows={2}
          value={caseDescription}
          onChange={e => setCaseDescription(e.target.value)}
          placeholder="Brief description of the case..."
        />
      </div>

      <div className="col-12">
        <label className="form-label fs-13">Case Narrative<span className="text-danger">*</span></label>
        <textarea
          className="form-control"
          rows={3}
          value={caseNarrative}
          onChange={e => setCaseNarrative(e.target.value)}
          placeholder="Detailed narrative..."
        />
      </div>

      <div className="col-12">
        <label className="form-label fs-13 fw-semibold">Services Offered</label>
        <div className="d-flex flex-wrap gap-2">
          {SERVICES.map((s, idx) => (
            <button
              key={idx}
              type="button"
              className={`btn btn-sm ${servicesOffered.includes(s) ? "btn-primary" : "btn-outline-secondary"} fs-12`}
              onClick={() => toggleService(s)}
            >
              {s}
            </button>
          ))}
        </div>
        {servicesOffered.includes("Appropriate Referral") && (
          <div className="mt-2">
            <label className="form-label fs-13">Where was the referral done?</label>
            <input
              className="form-control"
              value={referralWhere}
              onChange={e => setReferralWhere(e.target.value)}
              placeholder="Organisation / Institution name..."
            />
          </div>
        )}
        {servicesOffered.includes("Police Referral") && (
          <div className="mt-2 row g-2">
            <div className="col-md-6">
              <label className="form-label fs-13">OB Number / Data</label>
              <input
                className="form-control"
                value={obData}
                onChange={e => setObData(e.target.value)}
                placeholder="OB reference number..."
              />
            </div>
            <div className="col-md-6">
              <label className="form-label fs-13">Upload Supporting Information</label>
              <input type="file" className="form-control" multiple />
            </div>
          </div>
        )}
      </div>

      <div className="col-12">
        <label className="form-label fs-13 fw-semibold">Needs Assessment</label>
        <div className="d-flex flex-wrap gap-2">
          {NEEDS.map((n, idx) => (
            <button
              key={idx}
              type="button"
              className={`btn btn-sm ${needsAssessment.includes(n) ? "btn-success" : "btn-outline-secondary"} fs-12`}
              onClick={() => toggleNeed(n)}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="col-12">
        <label className="form-label fs-13 fw-semibold">Case Plan<span className="text-danger">*</span></label>
        <textarea
          className="form-control mb-2"
          rows={2}
          value={casePlan}
          onChange={e => setCasePlan(e.target.value)}
          placeholder="Select or describe the case plan..."
        />
        <label className="form-label fs-13 text-muted">Additional case plan details</label>
        <input
          className="form-control"
          value={casePlanExtra}
          onChange={e => setCasePlanExtra(e.target.value)}
          placeholder="Specify additional plan..."
        />
      </div>

      <h6 className="fw-bold text-secondary fs-13 border-bottom pb-2">Case Descision</h6>
      <div className="col-md-4">
        <label className="form-label fs-13">Priority <span className="text-danger">*</span></label>
        <select className="form-select" value={priority} onChange={e => setPriority(e.target.value)}>
          {PRIORITIES.map((p, idx) => <option key={idx} value={p}>{p}</option>)}
        </select>
      </div>

      <div className="col-md-4">
        <label className="form-label fs-13">Status <span className="text-danger">*</span></label>
        <select className="form-select" value={status} onChange={e => setStatus(e.target.value)}>
          {STATUSES.map((s, idx) => <option key={idx} value={s}>{s}</option>)}
        </select>
      </div>
      {status === "Closed" && (
        <>
          <div className="col-md-4">
            <label className="form-label fs-13">Reason for Closure</label>
            <input
              className="form-control"
              value={statusReasonClosure}
              onChange={e => setStatusReasonClosure(e.target.value)}
              placeholder="Reason..."
            />
          </div>
          <div className="col-md-4">
            <label className="form-label fs-13">Date of Closure</label>
            <input
              className="form-control"
              type="date"
              value={dateClosure}
              onChange={e => setDateClosure(e.target.value)}
            />
          </div>
        </>
      )}
    </div>
  </div>
  );
  }, [
    caseNumber, caseSource, sourceAddress, policeRef, incidentDate,
    reportedPlace, hivTestResult, counsellingOrg, justiceSystem,
    assessment, knowAbout, referrals, clientRelationshipComment,
    isClient, isIncidentReported, isHivTested, isPepGiven, isArtGiven,
    isEcpGiven, isCounsellingGiven, isReferred,
    selectedCategory, selectedCategoryData, categoryPath,
    priority, status, statusReasonClosure, dateClosure, isGBV, medExam,
    secondLevel, howKnewCLK, escalated, escalatedTo, wasEscalated,
    caseDescription, caseNarrative, servicesOffered, referralWhere, obData,
    needsAssessment, casePlan, casePlanExtra, activeThread, supervisors,
    toggleService, toggleNeed, handleCategoryChange, handleIsClientToggle,
    PRIORITIES, STATUSES, HOW_KNEW_CLK, SERVICES, lookups
  ]);


  const renderClients = useCallback(() => (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h5 className="fw-bold text-dark mb-0">Client Details</h5>
        <div className="d-flex gap-2">
          {(reporter.name || reporter.firstname) && (
           <button
  type="button"
  className="btn btn-sm btn-outline-success fs-12"
  onClick={() => {
    setPanelType("client");
    setPanelInitialData({
      firstname: reporter.firstname || "",
      lastname: reporter.lastname || "",
      name: joinName(reporter.firstname, reporter.lastname) || reporter.name || "",
      phone: reporter.phone || "",
      altPhone: reporter.altPhone || "",
      dob: reporter.dob || "",
      age: reporter.age || "",
      ageGroup: reporter.ageGroup || "",
      gender: reporter.gender || "",
      nationality: reporter.nationality || "",
      landmark: reporter.landmark || "",
      location: reporter.location || "",
      tribe: reporter.tribe || "",
      language: reporter.language || "",
      relationToChild: reporter.relationToChild || "",
      relationComment: reporter.relationComment || "",
      persontype: "client"
    });
    setPanelEditIndex(undefined);
    setTimeout(showSlidePanel, 50);
  }}
>
  <i className="ti ti-copy me-1" />From Reporter
</button>
          )}
          <button
            type="button"
            className="btn btn-sm btn-outline-primary fs-12"
            onClick={() => openAddPanel("client")}
          >
            <i className="ti ti-plus me-1" />Add Client
          </button>
        </div>
      </div>

      {clients.length === 0 ? (
        <div className="text-center border rounded p-4 text-muted fs-13 bg-light">
          <i className="ti ti-users d-block fs-1 mb-2" />
          No clients added yet. Click "Add Client" to begin.
        </div>
      ) : (
        clients.map((client, i) => (
          <PersonCard
            key={i}
            data={client}
            index={i}
            label="Client"
            onEdit={() => openEditPanel("client", i, client)}
            onRemove={() => setClients(prev => prev.filter((_, idx) => idx !== i))}
          />
        ))
      )}
    </div>
  ), [clients, reporter, openAddPanel, openEditPanel, showSlidePanel]);

  const renderPerpetrators = useCallback(() => (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h5 className="fw-bold text-dark mb-0">Perpetrator Details</h5>
        <button
          type="button"
          className="btn btn-sm btn-outline-primary fs-12"
          onClick={() => openAddPanel("perpetrator")}
        >
          <i className="ti ti-plus me-1" />Add Perpetrator
        </button>
      </div>

      {perpetrators.length === 0 ? (
        <div className="text-center border rounded p-4 text-muted fs-13 bg-light">
          <i className="ti ti-shield-alert d-block fs-1 mb-2" />
          No perpetrators added yet. Click "Add Perpetrator" to begin.
        </div>
      ) : (
        perpetrators.map((perp, i) => (
          <PersonCard
            key={i}
            data={perp}
            index={i}
            label="Perpetrator"
            onEdit={() => openEditPanel("perpetrator", i, perp)}
            onRemove={() => setPerpetrators(prev => prev.filter((_, idx) => idx !== i))}
          />
        ))
      )}
    </div>
  ), [perpetrators, openAddPanel, openEditPanel]);

  const renderFiles = useCallback(() => (
    <div>
      <h5 className="mb-4 fw-bold text-dark">Related Files</h5>
      <div className="border rounded p-4 text-center bg-light">
        <i className="ti ti-cloud-upload fs-1 text-muted d-block mb-2" />
        <p className="text-muted fs-13 mb-2">Drag & drop files here or click to browse</p>
        <input type="file" className="form-control" multiple />
        <p className="text-muted fs-11 mt-2">Supports: PDF, JPG, PNG, DOCX, MP4 (max 20MB each)</p>
      </div>
    </div>
  ), []);

  const renderContent = useCallback(() => {
    switch (activeTab) {
      case "reporter": return renderReporter();
      case "general": return renderGeneral();
      case "clients": return renderClients();
      case "perpetrators": return renderPerpetrators();
      case "files": return renderFiles();
      default: return null;
    }
  }, [activeTab, renderReporter, renderGeneral, renderClients, renderPerpetrators, renderFiles]);

  // ── Section Status ─────────────────────────────────────────────────────
  const sectionDone: Record<string, boolean> = {
    reporter: !!(reporter.firstname && reporter.phone && reporter.gender && reporter.nationality && reporter.age && reporter.county && reporter.subcounty && reporter.ward),
    general: !!((caseNarrative || caseDescription) && status),
    clients: clients.length > 0 && clients.some(c => c.name || c.firstname),
    perpetrators: perpetrators.length > 0 && perpetrators.some(p => p.name || p.firstname),
    files: false,
  };
  const sectionInProgress: Record<string, boolean> = {
    reporter: !!(reporter.firstname || reporter.phone || reporter.gender),
    general: !!(caseNarrative || caseDescription || caseNumber),
    clients: clients.length > 0,
    perpetrators: perpetrators.length > 0,
    files: false,
  };

  const stages = [
    { id: "reporter", title: "Reporter Details", iconClass: "ti ti-user" },
    { id: "general", title: "Case Record", iconClass: "ti ti-file-text", disabled: !sectionDone.reporter },
    { id: "clients", title: "Client Details", iconClass: "ti ti-users", count: clients.length },
    { id: "perpetrators", title: "Perpetrator Details", iconClass: "ti ti-shield-alert", count: perpetrators.length },
    { id: "files", title: "Related Files", iconClass: "ti ti-paperclip" },
  ];

  // ── Main Render ────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        .swal2-container {
          z-index: 999999 !important;
        }
        .modal-backdrop.alert-backdrop {
          z-index: 999990 !important;
        }
        .alert-modal {
          z-index: 999995 !important;
        }
      `}</style>

      {/* Slide panel for Reporter, Client and Perpetrator with elevated zIndex */}
      <PersonSlidePanel
        personType={panelType}
        initialData={panelInitialData}
        onConfirm={handlePanelConfirm}
        editIndex={panelEditIndex != null ? panelEditIndex + 1 : undefined}
        panelId={personPanelId}
        options={personOptions}
      />

      <div
        className="offcanvas offcanvas-end"
        tabIndex={-1}
        id={offcanvasId}
        data-bs-backdrop={staticBackdrop ? "static" : true}
        data-bs-scroll={staticBackdrop ? true : undefined}
        style={{ width: "100%", maxWidth: showChat ? "1400px" : "1000px" }}
      >
        <div className="offcanvas-header border-bottom py-2">
          <div className="d-flex align-items-center gap-2">
            <h5 className="mb-0 fw-semibold text-dark fs-15">Case Management Form</h5>
            {activeThread && (
              <span className="badge bg-light text-dark border fs-12 fw-normal">
                <i className="ti ti-user me-1" />{activeThread.name}
              </span>
            )}
            {caseNumber && <span className="badge bg-primary fs-12">{caseNumber}</span>}
          </div>
        </div>

        <div className="offcanvas-body p-0 d-flex h-100 overflow-hidden">
          {showChat && (
            <div className="bg-white border-end flex-shrink-0 d-flex flex-column h-100" style={{ width: "420px" }}>
              <ChatWindow
                key={activeThread?.id ?? "empty"}
                activeThread={activeThread}
                messages={chatContextMessages}
                onSendMessage={onSendMessage}
                onSendFile={onSendFile}
                onOpenCaseModal={() => { }}
              />
            </div>
          )}

          <div className="p-4 flex-grow-1 bg-white" style={{ overflowY: "auto" }}>
            <form onSubmit={e => e.preventDefault()}>
              {renderContent()}
              <div className="d-flex align-items-center justify-content-end border-top pt-3 mt-4 gap-2">
                {activeTab === "reporter" ? (
                  <button
                    type="button"
                    className="btn btn-primary fs-13"
                    onClick={() => setActiveTab("general")}
                    disabled={!sectionDone.reporter}
                    title={!sectionDone.reporter ? "Complete all required Reporter fields to continue" : undefined}
                  >
                    Next<i className="ti ti-arrow-right ms-1" />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary fs-13"
                    onClick={handleSave}
                    disabled={saving}
                  >
                    <i className="ti ti-device-floppy me-1" />{saving ? "Saving…" : "Save Record"}
                  </button>
                )}
              </div>
            </form>
          </div>

          <div className="bg-light border-start flex-shrink-0 d-flex flex-column" style={{ width: "240px", height: "100%" }}>
            <div className="d-flex flex-column" style={{ flex: 1, overflowY: "auto" }}>
              <div className="p-3 border-bottom d-flex align-items-center justify-content-between">
                <h6 className="fw-bold mb-0 text-secondary fs-12 text-uppercase">Case Intake Sections</h6>
                <span className="badge bg-primary-transparent text-primary fs-11">
                  {Object.values(sectionDone).filter(Boolean).length}/{stages.length}
                </span>
              </div>
              <div className="list-group list-group-flush">
                {stages.map(stage => {
                  const done = sectionDone[stage.id];
                  const inProg = !done && sectionInProgress[stage.id];
                  const isDisabled = !!(stage as any).disabled;
                  return (
                    <button
                      key={stage.id}
                      type="button"
                      className={`list-group-item list-group-item-action border-0 py-3 px-3 d-flex align-items-center justify-content-between text-start ${activeTab === stage.id ? "active fw-semibold" : ""} ${isDisabled ? "disabled" : ""}`}
                      onClick={() => !isDisabled && setActiveTab(stage.id)}
                      disabled={isDisabled}
                      title={isDisabled ? "Complete Reporter Details first" : undefined}
                      style={isDisabled ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
                    >
                      <span className="d-flex align-items-center gap-2 fs-13">
                        {done
                          ? <i className="ti ti-circle-check text-success fs-5" />
                          : inProg
                            ? <i className="ti ti-circle-half-2 text-warning fs-5" />
                            : isDisabled
                              ? <i className="ti ti-lock text-muted fs-5" />
                              : <i className="ti ti-circle text-muted fs-5" />}
                        <i className={`${stage.iconClass} fs-5`} />
                        <span>{stage.title}</span>
                      </span>
                      {stage.count != null && stage.count > 0 && (
                        <span className="badge bg-secondary rounded-pill fs-11">{stage.count}</span>
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="px-3 py-2 border-top">
                <div className="d-flex align-items-center gap-2 fs-11 text-muted mb-1">
                  <i className="ti ti-circle-check text-success" /> Completed
                </div>
                <div className="d-flex align-items-center gap-2 fs-11 text-muted mb-1">
                  <i className="ti ti-circle-half-2 text-warning" /> In progress
                </div>
                <div className="d-flex align-items-center gap-2 fs-11 text-muted">
                  <i className="ti ti-circle text-muted" /> Not started
                </div>
              </div>
            </div>
            <div className="d-flex flex-column border-top" style={{ flex: 1, minHeight: 0 }}>
              <div className="p-3 border-bottom">
                <h6 className="fw-bold mb-0 text-secondary fs-12 text-uppercase">Case Notes</h6>
              </div>
              <div className="p-3 d-flex flex-column flex-grow-1">
                <textarea
                  className="form-control fs-12 flex-grow-1"
                  placeholder="Type quick notes here..."
                  value={caseNotes}
                  onChange={e => setCaseNotes(e.target.value)}
                  style={{ resize: "none", minHeight: 0 }}
                />
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary mt-2 fs-12 w-100"
                  onClick={() => setCaseNotes("")}
                >
                  <i className="ti ti-trash me-1" />Clear Notes
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default CaseModal;
