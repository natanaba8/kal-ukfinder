/**
 * Illustrative UK vacancies used when no job-board API key is configured.
 *
 * These are NOT real listings — the employers are fictional and every record is
 * tagged `source: 'sample'` so the app can label it. They exist so a fresh clone
 * has a populated Jobs tab to develop and demo against. Add ADZUNA_APP_ID /
 * ADZUNA_APP_KEY (or REED_API_KEY) to `server/.env` for live vacancies.
 */

const daysAgo = (days) => new Date(Date.now() - days * 86_400_000).toISOString();

const searchUrl = (title, location) =>
  `https://findajob.dwp.gov.uk/search?q=${encodeURIComponent(title)}&w=${encodeURIComponent(location)}`;

const make = (job) => ({
  ...job,
  url: job.url ?? searchUrl(job.title, job.location),
  salaryText:
    job.salaryText ??
    (job.salaryMin
      ? `£${job.salaryMin.toLocaleString('en-GB')} – £${(job.salaryMax ?? job.salaryMin).toLocaleString('en-GB')}`
      : 'Salary not stated'),
  postedAt: job.postedAt ?? daysAgo(job.age ?? 2),
});

const RAW_JOBS = [
  {
    title: 'Junior Software Engineer',
    company: 'Meridian Digital',
    location: 'Manchester',
    region: 'North West',
    remote: false,
    salaryMin: 30000,
    salaryMax: 38000,
    contractType: 'full_time',
    category: 'IT & Technology',
    age: 1,
    description:
      'Graduate-friendly engineering role working on a React and Node platform. Structured mentoring, no prior commercial experience required, sponsorship not available.',
  },
  {
    title: 'Registered Nurse — Acute Medicine',
    company: 'Northern Care Trust',
    location: 'Leeds',
    region: 'Yorkshire and the Humber',
    remote: false,
    salaryMin: 29970,
    salaryMax: 36483,
    contractType: 'full_time',
    category: 'Healthcare & Nursing',
    age: 2,
    description:
      'Band 5 acute medicine post with a 12-month preceptorship. NMC registration required. Relocation package and Skilled Worker sponsorship available.',
  },
  {
    title: 'Teaching Assistant (SEND)',
    company: 'Brookfield Academy Trust',
    location: 'Birmingham',
    region: 'West Midlands',
    remote: false,
    salaryMin: 22000,
    salaryMax: 25500,
    contractType: 'term_time',
    category: 'Education',
    age: 3,
    description:
      'Support pupils with additional needs across Key Stage 2. Level 3 qualification desirable; full training and a route to a Level 4 apprenticeship offered.',
  },
  {
    title: 'Data Analyst',
    company: 'Civic Insight Partnership',
    location: 'London',
    region: 'London',
    remote: true,
    salaryMin: 42000,
    salaryMax: 52000,
    contractType: 'full_time',
    category: 'Data & Analytics',
    age: 1,
    description:
      'Hybrid role (two days in office) analysing local authority datasets. SQL and Python essential, Power BI desirable. Civil service style competency interview.',
  },
  {
    title: 'Apprentice Electrician (Level 3)',
    company: 'Kestrel Building Services',
    location: 'Bristol',
    region: 'South West',
    remote: false,
    salaryMin: 16000,
    salaryMax: 21000,
    contractType: 'apprenticeship',
    category: 'Trades & Construction',
    age: 4,
    description:
      'Four-year installation and maintenance electrician apprenticeship with day release to a local college. Level 2 maths and English required.',
  },
  {
    title: 'Customer Service Advisor',
    company: 'Loch Union Bank',
    location: 'Glasgow',
    region: 'Scotland',
    remote: true,
    salaryMin: 24500,
    salaryMax: 26500,
    contractType: 'full_time',
    category: 'Customer Service',
    age: 2,
    description:
      'Fully remote contact-centre role after a four-week onsite induction. Shift patterns between 8am and 8pm. No experience required.',
  },
  {
    title: 'Project Manager — Renewables',
    company: 'Cambrian Energy Group',
    location: 'Cardiff',
    region: 'Wales',
    remote: false,
    salaryMin: 48000,
    salaryMax: 60000,
    contractType: 'full_time',
    category: 'Engineering',
    age: 5,
    description:
      'Deliver onshore wind and solar projects across South Wales. APM or PRINCE2 certification preferred. Company car allowance and pension.',
  },
  {
    title: 'HR Business Partner',
    company: 'Thameside Group',
    location: 'Reading',
    region: 'South East',
    remote: true,
    salaryMin: 45000,
    salaryMax: 55000,
    contractType: 'full_time',
    category: 'HR & Recruitment',
    age: 3,
    description:
      'Partner with commercial leaders on workforce planning, employee relations and the new employment rights obligations. CIPD Level 5 or above.',
  },
  {
    title: 'Social Worker — Children & Families',
    company: 'Wearside Council',
    location: 'Sunderland',
    region: 'North East',
    remote: false,
    salaryMin: 34000,
    salaryMax: 41000,
    contractType: 'full_time',
    category: 'Social Care',
    age: 2,
    description:
      'Social Work England registration required. Manageable caseloads, hybrid working and a golden hello for experienced practitioners.',
  },
  {
    title: 'Warehouse Operative (Nights)',
    company: 'Fenland Logistics',
    location: 'Peterborough',
    region: 'East of England',
    remote: false,
    salaryMin: 25000,
    salaryMax: 28000,
    contractType: 'full_time',
    category: 'Logistics & Warehouse',
    age: 1,
    description:
      'Night shift picking and packing with a 20% shift premium. Counterbalance licence useful but training provided. Permanent after 12 weeks.',
  },
  {
    title: 'Marketing Executive',
    company: 'Aldgate & Vale',
    location: 'Nottingham',
    region: 'East Midlands',
    remote: true,
    salaryMin: 28000,
    salaryMax: 34000,
    contractType: 'full_time',
    category: 'Marketing & PR',
    age: 6,
    description:
      'Own paid social and email for a growing DTC brand. Two years experience or a strong portfolio from a placement year. Hybrid, one day a week onsite.',
  },
  {
    title: 'Civil Service Policy Adviser (HEO)',
    company: 'Public Policy Directorate',
    location: 'Belfast',
    region: 'Northern Ireland',
    remote: true,
    salaryMin: 33000,
    salaryMax: 39000,
    contractType: 'full_time',
    category: 'Government & Public Sector',
    age: 4,
    description:
      'Success Profiles application with a 250-word statement per behaviour. Policy or research background welcome; no prior civil service experience needed.',
  },
  {
    title: 'Care Assistant',
    company: 'Willow Court Care',
    location: 'Liverpool',
    region: 'North West',
    remote: false,
    salaryMin: 23500,
    salaryMax: 25000,
    contractType: 'part_time',
    category: 'Social Care',
    age: 1,
    description:
      'Days and weekends available with paid travel between visits. Care Certificate funded in your first 12 weeks. Driving licence preferred.',
  },
  {
    title: 'Cyber Security Analyst',
    company: 'Northgate Assurance',
    location: 'Edinburgh',
    region: 'Scotland',
    remote: true,
    salaryMin: 45000,
    salaryMax: 58000,
    contractType: 'full_time',
    category: 'IT & Technology',
    age: 2,
    description:
      'SOC analyst role covering triage, threat hunting and incident response. SC clearance eligibility required. CompTIA Security+ or equivalent.',
  },
  {
    title: 'Chef de Partie',
    company: 'The Harbour Rooms',
    location: 'Brighton',
    region: 'South East',
    remote: false,
    salaryMin: 28000,
    salaryMax: 32000,
    contractType: 'full_time',
    category: 'Hospitality & Catering',
    age: 7,
    description:
      'Seasonal British menu, four-day week, tips shared through a tronc scheme. Two years section experience in a fresh-food kitchen.',
  },
  {
    title: 'Graduate Quantity Surveyor',
    company: 'Pennine Construction',
    location: 'Sheffield',
    region: 'Yorkshire and the Humber',
    remote: false,
    salaryMin: 27000,
    salaryMax: 32000,
    contractType: 'graduate',
    category: 'Trades & Construction',
    age: 3,
    description:
      'RICS-accredited degree required. Structured APC support towards chartership, site exposure from month one, pool car provided.',
  },
  {
    title: 'Bus Driver (Trainee)',
    company: 'Midland Transit',
    location: 'Coventry',
    region: 'West Midlands',
    remote: false,
    salaryMin: 29000,
    salaryMax: 33000,
    contractType: 'full_time',
    category: 'Transport & Driving',
    age: 5,
    description:
      'Fully funded PCV licence training and CPC. Full car licence held for two years required. Free travel for you and a household member.',
  },
  {
    title: 'Primary School Teacher (ECT welcome)',
    company: 'St Aldwyn Primary',
    location: 'Exeter',
    region: 'South West',
    remote: false,
    salaryMin: 31650,
    salaryMax: 43607,
    contractType: 'full_time',
    category: 'Education',
    age: 4,
    description:
      'QTS required. Two-year early career framework support package, reduced timetable for ECTs and an experienced mentor.',
  },
  {
    title: 'Finance Assistant (AAT study support)',
    company: 'Orwell Retail Group',
    location: 'Ipswich',
    region: 'East of England',
    remote: false,
    salaryMin: 24000,
    salaryMax: 27000,
    contractType: 'full_time',
    category: 'Accountancy & Finance',
    age: 2,
    description:
      'Purchase ledger and bank reconciliations with fully funded AAT Level 3. Ideal first finance role after A-levels or a T-level.',
  },
  {
    title: 'Product Designer',
    company: 'Wren & Foxglove',
    location: 'London',
    region: 'London',
    remote: true,
    salaryMin: 55000,
    salaryMax: 70000,
    contractType: 'full_time',
    category: 'Design & Creative',
    age: 1,
    description:
      'End-to-end product design for a fintech app. Portfolio review plus a paid design exercise. Remote-first with quarterly meetups in London.',
  },
  {
    title: 'Pharmacy Technician',
    company: 'Severn Valley Health',
    location: 'Worcester',
    region: 'West Midlands',
    remote: false,
    salaryMin: 27000,
    salaryMax: 31000,
    contractType: 'full_time',
    category: 'Healthcare & Nursing',
    age: 6,
    description:
      'GPhC registration required. Rotational post across dispensary, aseptics and ward services with funded accredited checking training.',
  },
  {
    title: 'Kickstart your career: Digital Marketing Bootcamp Placement',
    company: 'Skills Bridge CIC',
    location: 'Newcastle upon Tyne',
    region: 'North East',
    remote: true,
    salaryMin: null,
    salaryMax: null,
    salaryText: 'Bursary + guaranteed interview',
    contractType: 'training',
    category: 'Training & Development',
    age: 8,
    description:
      'Sixteen-week Skills Bootcamp with a guaranteed interview on completion. Open to adults aged 19+ who are unemployed or changing career. Free to learners.',
  },
];

export const SAMPLE_JOBS = RAW_JOBS.map(make);
