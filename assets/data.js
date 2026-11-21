/* ------------------------------------------------------------------
   Static content + DEMO data.
   Real members and jobs live in the Supabase database, NOT in this file.
   The single example below is only shown when assets/config.js is empty (demo mode).
------------------------------------------------------------------- */

const CA_STATUSES = ["Chartered Accountant", "Advanced Level", "Professional Level", "Certificate Level"];
const LEVEL_STATUSES = ["Advanced Level", "Professional Level", "Certificate Level"]; // these show "(n subjects)"

const SKILL_VOCAB = [
  "IFRS", "IAS", "Audit", "Internal Audit", "IT Audit", "Tax", "VAT", "Transfer Pricing", "Due Diligence",
  "Forensic", "Risk", "Compliance", "Payroll", "Costing", "Treasury", "Financial Modeling", "Financial Reporting",
  "Excel", "Power BI", "SAP", "ERP", "Python", "SQL", "Data Analytics", "ESG", "Banking", "Manufacturing",
  "Garments", "Telecom", "NGO"
];

const EXAMPLE_MEMBERS = [
  {
    id: "demo-1", name: "Example Member", email: "example.member@example.com",
    company: "Nurul Faruk Hasan & Co", location: "Mohakhali", department: "Audit and Assurance",
    designation: "Senior Associate", phone: "01700000000", caStatus: "Professional Level", subjects: 4,
    bloodGroup: "B+", articleshipStart: "2022-03-01", articleshipEnd: "2025-03-01",
    skills: "IFRS, Audit, Excel", about: "Demo profile. Real members appear after Supabase is connected.",
    linkedin: "", photoPath: "", cvPath: "", approved: true
  }
];

const EXAMPLE_JOBS = [
  {
    id: "demo-job-1", title: "Senior Associate — Financial Reporting", company: "Example Manufacturing Ltd.",
    location: "Dhaka", jobType: "Full-time", expMin: 2, expMax: 5, caStatus: "", skills: "IFRS, Excel, Financial Reporting",
    description: "Demo job. Prepare monthly and annual financial statements under IFRS and support the external audit.",
    applyContact: "hr@example.com", deadline: "2027-12-31", postedBy: "example.member@example.com",
    postedByName: "Example Member", createdAt: "2026-11-01T00:00:00Z"
  }
];

const EVENTS = [
  { date: "2026-12-12", title: "Annual Alumni Meet & Dinner", place: "Dhaka — Venue TBA", tag: "Networking" },
  { date: "2027-01-09", title: "Exam Strategy Workshop: Advanced Level", place: "Online (Zoom)", tag: "Workshop" },
  { date: "2027-01-23", title: "Community Blood Donation Drive", place: "Dhaka — Partner Hospital", tag: "Social" }
];

const RESOURCES = [
  { title: "Job Board", text: "Openings posted by senior members and alumni.", link: "#/jobs" },
  { title: "Update your profile", text: "Add your photo, CV, skills and subject progress.", link: "#/profile" },
  { title: "Exam Notes & Past Papers", text: "Shared by seniors (add your own link in data.js).", link: "#" }
];
