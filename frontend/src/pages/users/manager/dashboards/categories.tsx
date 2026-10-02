// import "overlayscrollbars/overlayscrollbars.css";

// import { Link } from "react-router";

// import PageHeader from "../../../../components/page-header/pageHeader";

// import { useEffect, useState } from "react";

// import SearchInput from "../../../../components/dataTable/dataTableSearch";

// import Datatable from "../../../../components/dataTable";

// import { getCategories } from "../../../../services/Services";

// import CategoryModal, { type Category, type CategoryModalMode } from "../dashboards/modals/catModal";


// const Categories = () => {

//   const [data, setData] = useState<any[]>([]);

//   const [loading, setLoading] =
//     useState<boolean>(true);

//   const [error, setError] =
//     useState<string | null>(null);

//   const [searchText, setSearchText] =
//     useState<string>("");

//   const [isOffcanvasOpen, setIsOffcanvasOpen] =
//     useState(false);

//   const [modalMode, setModalMode] =
//     useState<CategoryModalMode>("add");

//   /*
//    * The category driving the offcanvas:
//    * - mode="edit": the category being edited
//    * - mode="children": the parent whose children are being managed
//    */
//   const [activeCategory, setActiveCategory] =
//     useState<Category | null>(null);


//   /*
//    * Convert API category into table format.
//    * Keeps the raw API record (`raw`) alongside the display fields so
//    * Edit / View Children actions have the full category to work with.
//    */
//   const mapCategory = (cat: Category) => {

//     return {

//       id: cat.id,

//       Token: cat.category_token,

//       Name: cat.category_name,

//       Level: "Parent",

//       Status: cat.category_status,

//       Parent: cat.category_parent,

//       Created: cat.date_created
//         ? new Date(
//             cat.date_created
//           ).toLocaleDateString(
//             "en-US",
//             {
//               year: "numeric",
//               month: "short",
//               day: "numeric",
//             }
//           )
//         : "",

//       CreatedSort: cat.date_created
//         ? new Date(
//             cat.date_created
//           ).getTime()
//         : 0,

//       LastUpdated: cat.last_updated_on
//         ? new Date(
//             cat.last_updated_on
//           ).toLocaleDateString(
//             "en-US",
//             {
//               year: "numeric",
//               month: "short",
//               day: "numeric",
//             }
//           )
//         : "",

//       LastUpdatedSort:
//         cat.last_updated_on
//           ? new Date(
//               cat.last_updated_on
//             ).getTime()
//           : 0,

//       raw: cat,
//     };
//   };


//   /*
//    * Fetch parent categories
//    */
//   const fetchCategories = async () => {

//     setLoading(true);

//     setError(null);

//     try {

//       const result =
//         await getCategories();

//       console.log(
//         "Parent categories:",
//         result
//       );

//       if (!Array.isArray(result)) {

//         throw new Error(
//           "Invalid categories response"
//         );
//       }

//       const parents =
//         result.map(mapCategory);

//       setData(parents);

//     } catch (err) {

//       console.error(
//         "Failed to fetch categories:",
//         err
//       );

//       setError(
//         "Failed to load categories. Please try again."
//       );

//       setData([]);

//     } finally {

//       setLoading(false);

//     }
//   };


//   /*
//    * Load categories when page opens
//    */
//   useEffect(() => {

//     fetchCategories();

//   }, []);


//   /*
//    * Search
//    */
//   const handleSearch = (
//     value: string
//   ) => {

//     setSearchText(value);

//   };


//   /*
//    * Open the shared offcanvas in a given mode
//    */
//   const openOffcanvasWithMode = (
//     mode: CategoryModalMode,
//     category: Category | null
//   ) => {

//     setModalMode(mode);

//     setActiveCategory(category);

//     setIsOffcanvasOpen(true);

//     const element =
//       document.getElementById(
//         "category-offcanvas"
//       );

//     if (element) {

//       const bootstrap =
//         (window as any).bootstrap;

//       const bsOffcanvas =
//         bootstrap?.Offcanvas
//           ?.getOrCreateInstance(
//             element
//           );

//       bsOffcanvas?.show();

//     }
//   };


//   /*
//    * Open create category offcanvas
//    */
//   const openAddOffcanvas = () => {

//     openOffcanvasWithMode("add", null);

//   };


//   /*
//    * Open edit category offcanvas
//    */
//   const openEditOffcanvas = (
//     category: Category
//   ) => {

//     openOffcanvasWithMode("edit", category);

//   };


//   /*
//    * Open the "view/manage children" offcanvas
//    */
//   const openChildrenOffcanvas = (
//     category: Category
//   ) => {

//     openOffcanvasWithMode("children", category);

//   };


//   /*
//    * Close create/edit/children offcanvas
//    */
//   const closeOffcanvas = () => {

//     setIsOffcanvasOpen(false);

//     const element =
//       document.getElementById(
//         "category-offcanvas"
//       );

//     if (element) {

//       const bootstrap =
//         (window as any).bootstrap;

//       const bsOffcanvas =
//         bootstrap?.Offcanvas
//           ?.getInstance(
//             element
//           );

//       bsOffcanvas?.hide();

//     }
//   };


//   /*
//    * Table columns
//    */
//   const columns = [

//     {
//       title: "Category Name",

//       dataIndex: "Name",

//       render: (
//         text: any
//       ) => (

//         <h6 className="fs-14 fw-medium mb-0">

//           <Link to="#">

//             {text}

//           </Link>

//         </h6>

//       ),

//       sorter: (
//         a: any,
//         b: any
//       ) =>
//         (a.Name || "").localeCompare(
//           b.Name || ""
//         ),
//     },


//     {
//       title: "Level",

//       dataIndex: "Level",

//       render: (
//         text: string
//       ) => (

//         <span className="badge bg-primary">

//           {text}

//         </span>

//       ),

//       sorter: (
//         a: any,
//         b: any
//       ) =>
//         (a.Level || "").localeCompare(
//           b.Level || ""
//         ),
//     },


//     {
//       title: "Status",

//       dataIndex: "Status",

//       render: (
//         text: any
//       ) => (

//         <span
//           className={`badge badge-pill badge-status ${
//             text === "Active"
//               ? "bg-success"
//               : "bg-danger"
//           }`}
//         >

//           {text}

//         </span>

//       ),

//       sorter: (
//         a: any,
//         b: any
//       ) =>
//         (a.Status || "").localeCompare(
//           b.Status || ""
//         ),
//     },


//     {
//       title: "Created",

//       dataIndex: "Created",

//       sorter: (
//         a: any,
//         b: any
//       ) =>
//         a.CreatedSort -
//         b.CreatedSort,
//     },


//     {
//       title: "Last Updated",

//       dataIndex: "LastUpdated",

//       sorter: (
//         a: any,
//         b: any
//       ) =>
//         a.LastUpdatedSort -
//         b.LastUpdatedSort,
//     },


//     {
//       title: "Action",

//       dataIndex: "Action",

//       render: (
//         _: any,
//         record: any
//       ) => (

//         <div className="dropdown table-action">

//           <Link
//             to="#"
//             className="action-icon btn btn-xs shadow btn-icon btn-outline-light"
//             data-bs-toggle="dropdown"
//             aria-expanded="false"
//           >

//             <i className="ti ti-dots-vertical" />

//           </Link>


//           <div className="dropdown-menu dropdown-menu-right">

//             {/* VIEW / MANAGE CHILDREN */}

//             <button
//               type="button"
//               className="dropdown-item"
//               data-bs-toggle="offcanvas"
//               data-bs-target="#category-offcanvas"
//               onClick={() =>
//                 openChildrenOffcanvas(
//                   record.raw
//                 )
//               }
//             >

//               <i className="ti ti-list me-2" />

//               View Children

//             </button>


//             {/* EDIT */}

//             <button
//               type="button"
//               className="dropdown-item"
//               data-bs-toggle="offcanvas"
//               data-bs-target="#category-offcanvas"
//               onClick={() =>
//                 openEditOffcanvas(
//                   record.raw
//                 )
//               }
//             >

//               <i className="ti ti-edit text-blue me-2" />

//               Edit

//             </button>


//             {/* DELETE */}

//             <Link
//               className="dropdown-item"
//               to="#"
//               data-bs-toggle="modal"
//               data-bs-target="#delete_contact"
//             >

//               <i className="ti ti-trash me-2" />

//               Delete

//             </Link>

//           </div>

//         </div>

//       ),
//     },

//   ];


//   return (

//     <>

//       <div className="page-wrapper">

//         <div className="content pb-0">


//           {/* PAGE HEADER */}

//           <PageHeader
//             title="Categories"
//             badgeCount={data.length}
//             showModuleTile={false}
//             showExport={true}
//           />


//           {/* CARD */}

//           <div className="card border-0 rounded-0">


//             {/* CARD HEADER */}

//             <div className="card-header d-flex align-items-center justify-content-between gap-2 flex-wrap">


//               {/* SEARCH */}

//               <div className="input-icon input-icon-start position-relative">

//                 <span className="input-icon-addon text-dark">

//                   <i className="ti ti-search" />

//                 </span>


//                 <SearchInput
//                   value={searchText}
//                   onChange={handleSearch}
//                 />

//               </div>


//               {/* BUTTONS */}

//               <div className="d-flex gap-2">


//                 {/* REFRESH */}

//                 <button
//                   className="btn btn-outline-secondary btn-sm"
//                   disabled={loading}
//                   onClick={fetchCategories}
//                 >

//                   <i
//                     className={`ti ti-refresh me-1 ${
//                       loading
//                         ? "fa-spin"
//                         : ""
//                     }`}
//                   />

//                   Refresh

//                 </button>


//                 {/* CREATE */}

//                 <button
//                   className="btn btn-primary btn-sm"
//                   data-bs-toggle="offcanvas"
//                   data-bs-target="#category-offcanvas"
//                   onClick={openAddOffcanvas}
//                 >

//                   <i className="ti ti-plus me-1" />

//                   Create Category

//                 </button>

//               </div>

//             </div>


//             {/* CARD BODY */}

//             <div className="card-body">

//               <div className="custom-table">


//                 {/* LOADING */}

//                 {loading && (

//                   <div className="text-center py-5">

//                     Loading categories...

//                   </div>

//                 )}


//                 {/* ERROR */}

//                 {!loading && error && (

//                   <div className="text-center py-5 text-danger">

//                     {error}

//                     {" "}

//                     <Link
//                       to="#"
//                       onClick={(e) => {

//                         e.preventDefault();

//                         fetchCategories();

//                       }}
//                     >

//                       Retry

//                     </Link>

//                   </div>

//                 )}


//                 {/* TABLE */}

//                 {!loading &&
//                   !error && (

//                     <Datatable
//                       columns={columns}
//                       dataSource={data}
//                       Selection={true}
//                       searchText={searchText}
//                     />

//                   )}

//               </div>

//             </div>

//           </div>

//         </div>

//       </div>


//       {/* CATEGORY MODAL — reused for add / edit / manage-children */}

//       <CategoryModal
//         isOpen={isOffcanvasOpen}
//         onClose={closeOffcanvas}
//         mode={modalMode}
//         category={activeCategory}
//         onSaved={fetchCategories}
//       />

//     </>

//   );
// };


// export default Categories;
