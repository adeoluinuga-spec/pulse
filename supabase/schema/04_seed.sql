-- ═══════════════════════════════════════════════════════════════
-- PULSE DATABASE — CHUNK 4 OF 4: SEED DATA
-- Run after 03_functions.sql
-- Matches src/data/mockData.ts exactly
-- ═══════════════════════════════════════════════════════════════

-- Temporarily disable RLS for seeding
set local role postgres;

-- ── ORGANISATION ────────────────────────────────────────────────
insert into organisations (id, name, slug, currency, appraisal_cadence, current_cycle, cycle_start_date, cycle_end_date)
values (
  '00000000-0000-0000-0000-000000000001',
  'Zenith Corp',
  'zenith-corp',
  'NGN',
  'quarterly',
  'Q2 2026',
  '2026-04-01',
  '2026-06-30'
);

-- ── APPRAISAL CYCLE ─────────────────────────────────────────────
insert into appraisal_cycles (id, org_id, name, start_date, end_date, status, weights)
values (
  '00000000-0000-0000-0000-000000000099',
  '00000000-0000-0000-0000-000000000001',
  'Q2 2026',
  '2026-04-01',
  '2026-06-30',
  'active',
  '{"goal_achievement":35,"report_consistency":20,"kpi_performance":25,"manager_assessment":10,"peer_feedback":10}'
);

-- ── EMPLOYEES ───────────────────────────────────────────────────
-- Note: user_id is null until real Supabase auth accounts are created

insert into employees (id, org_id, user_id, name, initials, role, email, phone, home_address, department, team, cadre, people_responsibility, platform_role, avatar_color, join_date, employment_type, band_current, band_next, band_requirements, compensation, performance_score, consistency_index, peer_rating, week_streak, badge, ai_rec)
values

-- e01 · Amara Osei
('00000000-0000-0000-0001-000000000001',
 '00000000-0000-0000-0000-000000000001',
 null,
 'Amara Osei', 'AO', 'Senior Sales Manager', 'amara.osei@zenithcorp.ng',
 '+234 802 345 6789', '14 Admiralty Way, Lekki Phase 1, Lagos',
 'Sales', 'Enterprise Sales', 'senior', 'manager', 'standard', '#3b5bdb',
 '2021-03-15', 'full_time',
 'L4 – Senior Manager', 'L5 – Director',
 '["Lead a team of 8+","Sustain ≥85% score for 2 quarters","Complete Leadership Essentials"]',
 '{"basic":750000,"housing":200000,"transport":100000,"medical":75000,"totalGross":1175000,"bonusStructure":[{"scoreThreshold":90,"bonusAmount":350000},{"scoreThreshold":80,"bonusAmount":200000},{"scoreThreshold":70,"bonusAmount":100000}]}',
 91, 88, 4.6, 7, 'Strong Performer',
 '{"recommendation":"promote","confidence":0.91,"evidence":["Top performer in Sales dept for 2 consecutive quarters","88% consistency index — 15 pts above department average","Peer rating of 4.6/5 across all 360 reviewers","7-week improvement streak with zero regression weeks","Successfully led ₦380M Q2 close with 3 enterprise accounts"]}'
),

-- e02 · Adeolu Johnson
('00000000-0000-0000-0001-000000000002',
 '00000000-0000-0000-0000-000000000001',
 null,
 'Adeolu Johnson', 'AJ', 'Sales Executive', 'adeolu.johnson@zenithcorp.ng',
 '+234 803 456 7890', '22 Allen Avenue, Ikeja, Lagos',
 'Sales', 'Enterprise Sales', 'mid', 'none', 'standard', '#7048ae',
 '2023-01-09', 'full_time',
 'L2 – Mid-level', 'L3 – Senior Executive',
 '["Close ₦200M in a single quarter","Sustain ≥75% score for 2 quarters","Complete Sales Excellence cert"]',
 '{"basic":420000,"housing":120000,"transport":70000,"medical":50000,"totalGross":660000,"bonusStructure":[{"scoreThreshold":80,"bonusAmount":150000},{"scoreThreshold":70,"bonusAmount":80000}]}',
 74, 71, 3.9, 4, 'Good Standing',
 '{"recommendation":"good_standing","confidence":0.78,"evidence":["Consistent mid-70s performance across Q1 and Q2","4-week improvement streak after a slow start","Meeting activity and CRM hygiene rated positively by manager","Needs to improve win rate from 24% toward 30% target","Peer collaboration scores improved 0.4 pts since last cycle"]}'
),

-- e03 · Bolu Adeyemi
('00000000-0000-0000-0001-000000000003',
 '00000000-0000-0000-0000-000000000001',
 null,
 'Bolu Adeyemi', 'BA', 'Sales Director', 'bolu.adeyemi@zenithcorp.ng',
 '+234 805 678 9012', '7 Bourdillon Road, Ikoyi, Lagos',
 'Sales', 'Sales Leadership', 'senior', 'senior_manager', 'standard', '#d9480f',
 '2019-06-01', 'full_time',
 'L5 – Director', 'L6 – VP',
 '["Deliver ₦2B in annual revenue","Build and sustain a high-performing team","Complete Executive Leadership Programme"]',
 '{"basic":900000,"housing":300000,"transport":150000,"medical":80000,"totalGross":1430000,"bonusStructure":[{"scoreThreshold":90,"bonusAmount":600000},{"scoreThreshold":80,"bonusAmount":350000},{"scoreThreshold":70,"bonusAmount":150000}]}',
 87, 85, 4.4, 6, 'Strong Performer',
 '{"recommendation":"promote","confidence":0.87,"evidence":["Sales department revenue up 19% YoY under her leadership","Team consistency index of 84 — highest across all depts","Successfully managed 3 enterprise account renewals >₦400M","Peer and direct-report ratings both above 4.4","On track for VP-level criteria in next two quarters"]}'
),

-- e04 · Chidi Okafor
('00000000-0000-0000-0001-000000000004',
 '00000000-0000-0000-0000-000000000001',
 null,
 'Chidi Okafor', 'CO', 'Operations Analyst', 'chidi.okafor@zenithcorp.ng',
 '+234 806 789 0123', '45 Obafemi Awolowo Way, Ikeja, Lagos',
 'Operations', 'Supply Chain', 'entry', 'none', 'standard', '#0c8599',
 '2024-08-12', 'full_time',
 'L1 – Analyst', 'L2 – Senior Analyst',
 '["Sustain ≥70% score for 3 quarters","Complete Supply Chain Fundamentals","Lead 1 process improvement project"]',
 '{"basic":260000,"housing":80000,"transport":40000,"medical":20000,"totalGross":400000,"bonusStructure":[{"scoreThreshold":70,"bonusAmount":60000}]}',
 58, 54, 3.1, 1, 'Needs Improvement',
 '{"recommendation":"pip","confidence":0.74,"evidence":["Performance has declined from 68% at hire to 58% today","Consistency index of 54 — below L1 cohort average of 65","3 late report submissions in the past 6 weeks","Supply chain fundamentals training not yet started","Manager has flagged engagement concerns in 2 consecutive 1:1s"]}'
),

-- e05 · Ngozi Bello
('00000000-0000-0000-0001-000000000005',
 '00000000-0000-0000-0000-000000000001',
 null,
 'Ngozi Bello', 'NB', 'Marketing Team Lead', 'ngozi.bello@zenithcorp.ng',
 '+234 808 901 2345', '3 Eric Moore Road, Surulere, Lagos',
 'Marketing', 'Brand & Content', 'mid', 'team_lead', 'standard', '#a61e4d',
 '2022-05-16', 'full_time',
 'L3 – Team Lead', 'L4 – Senior Manager',
 '["Lead campaign generating ≥₦200M revenue impact","Sustain ≥78% score for 2 quarters","Complete Brand Strategy certification"]',
 '{"basic":450000,"housing":130000,"transport":80000,"medical":55000,"totalGross":715000,"bonusStructure":[{"scoreThreshold":80,"bonusAmount":150000},{"scoreThreshold":70,"bonusAmount":80000}]}',
 72, 70, 4.0, 3, 'Good Standing',
 '{"recommendation":"good_standing","confidence":0.76,"evidence":["Consistent mid-70s performance over 3 quarters","Led Q1 consumer brand activation with 18% engagement uplift","Peer rating improved from 3.6 to 4.0 this cycle","Digital campaign KPI needs 8 more points to hit dept target","Good team management instincts — directs clear to on track"]}'
),

-- e06 · Tolu Fashola
('00000000-0000-0000-0001-000000000006',
 '00000000-0000-0000-0000-000000000001',
 null,
 'Tolu Fashola', 'TF', 'Software Engineer', 'tolu.fashola@zenithcorp.ng',
 '+234 809 012 3456', '9 Hughes Avenue, Yaba, Lagos',
 'Engineering', 'Platform Engineering', 'mid', 'none', 'standard', '#2f9e44',
 '2022-11-01', 'full_time',
 'L2 – Engineer II', 'L3 – Senior Engineer',
 '["Own and deliver a major platform feature","Test coverage ≥85%","Lead at least 2 junior engineer mentoring cycles"]',
 '{"basic":490000,"housing":140000,"transport":90000,"medical":50000,"totalGross":770000,"bonusStructure":[{"scoreThreshold":85,"bonusAmount":180000},{"scoreThreshold":75,"bonusAmount":100000}]}',
 83, 81, 4.2, 5, 'Strong Performer',
 '{"recommendation":"good_standing","confidence":0.82,"evidence":["Test coverage improved from 68% to 84% under her ownership","Delivered Auth Service migration 1 week ahead of schedule","Consistent top-20% throughput in Engineering for 12 weeks","Zero critical bugs shipped in the past 8 weeks","Mentoring 1 junior engineer — promotion to L3 within reach"]}'
),

-- e07 · Emeka Eze
('00000000-0000-0000-0001-000000000007',
 '00000000-0000-0000-0000-000000000001',
 null,
 'Emeka Eze', 'EE', 'Support Specialist', 'emeka.eze@zenithcorp.ng',
 '+234 810 123 4567', '27 Ogunlana Drive, Surulere, Lagos',
 'Support', 'Tier 2 Support', 'entry', 'none', 'standard', '#e67700',
 '2024-11-04', 'full_time',
 'L1 – Support Specialist', 'L2 – Senior Specialist',
 '["CSAT ≥4.2 for 2 quarters","Resolve ≥90% of tickets within SLA","Complete ITIL Foundation cert"]',
 '{"basic":210000,"housing":70000,"transport":30000,"medical":20000,"totalGross":330000,"bonusStructure":[{"scoreThreshold":70,"bonusAmount":40000}]}',
 45, 43, 2.9, 0, 'At Risk',
 '{"recommendation":"pip","confidence":0.72,"evidence":["CSAT score of 2.9 — well below the 4.0 department benchmark","Only 61% of tickets resolved within SLA — target is 90%","3 escalations in the past 4 weeks from dissatisfied customers","Consistency index of 43 — lowest in Support team","ITIL certification not started despite being 6 months into role"]}'
),

-- e08 · Kemi Adebayo (HR Admin)
('00000000-0000-0000-0001-000000000008',
 '00000000-0000-0000-0000-000000000001',
 null,
 'Kemi Adebayo', 'KA', 'HR Manager', 'kemi.adebayo@zenithcorp.ng',
 '+234 811 234 5678', '5 Kingsway Road, Ikoyi, Lagos',
 'Human Resources', 'HR Leadership', 'senior', 'manager', 'hr_admin', '#364fc7',
 '2020-09-14', 'full_time',
 'L4 – HR Manager', 'L5 – HR Director',
 '["Drive attrition below 6%","Lead company-wide OKR rollout","Complete CIPM Advanced Diploma"]',
 '{"basic":800000,"housing":250000,"transport":120000,"medical":90000,"totalGross":1260000,"bonusStructure":[{"scoreThreshold":85,"bonusAmount":300000},{"scoreThreshold":75,"bonusAmount":160000}]}',
 78, 76, 4.1, 4, 'Good Standing',
 '{"recommendation":"good_standing","confidence":0.8,"evidence":["Managed Q2 appraisal cycle for 148 staff with 96% completion rate","Attrition at 7.4% — down from 9.1% 12 months ago","Successfully launched Pulse HR platform organisation-wide","CIPM Advanced Diploma at 60% completion — on track","Peer rating of 4.1 reflects strong cross-functional trust"]}'
),

-- e09 · Femi Ogundimu (CEO / Executive)
('00000000-0000-0000-0001-000000000009',
 '00000000-0000-0000-0000-000000000001',
 null,
 'Femi Ogundimu', 'FO', 'Chief Executive Officer', 'femi.ogundimu@zenithcorp.ng',
 '+234 812 345 6789', '18 Glover Road, Ikoyi, Lagos',
 'Executive', 'C-Suite', 'executive', 'director', 'executive_view', '#1864ab',
 '2018-01-02', 'full_time',
 'L7 – CEO', 'L7 – CEO',
 '[]',
 '{"basic":1800000,"housing":600000,"transport":250000,"medical":150000,"totalGross":2880000,"bonusStructure":[{"scoreThreshold":90,"bonusAmount":2000000},{"scoreThreshold":80,"bonusAmount":1000000}]}',
 88, 86, 4.5, 8, 'Strong Performer',
 '{"recommendation":"promote","confidence":0.88,"evidence":["Revenue growth 19% YoY across all business units","Employee satisfaction index improved to 78% — up 11 pts","Org-wide OKR adoption at 70% after 6-month rollout","3 strategic partnerships signed in Q1 2026","Board satisfaction score of 4.5/5 in Q1 review"]}'
),

-- e10 · Priya Sharma
('00000000-0000-0000-0001-000000000010',
 '00000000-0000-0000-0000-000000000001',
 null,
 'Priya Sharma', 'PS', 'Data Analyst', 'priya.sharma@zenithcorp.ng',
 '+234 813 456 7890', '11 Idejo Street, Victoria Island, Lagos',
 'Analytics', 'Business Intelligence', 'mid', 'none', 'standard', '#5c7cfa',
 '2023-07-03', 'full_time',
 'L2 – Analyst II', 'L3 – Senior Analyst',
 '["Own and deliver a company-wide analytics dashboard","SQL Advanced cert","Data quality score ≥97%"]',
 '{"basic":470000,"housing":135000,"transport":80000,"medical":50000,"totalGross":735000,"bonusStructure":[{"scoreThreshold":75,"bonusAmount":130000},{"scoreThreshold":65,"bonusAmount":70000}]}',
 66, 62, 3.6, 2, 'Good Standing',
 '{"recommendation":"good_standing","confidence":0.71,"evidence":["Performance stabilised at 66% after dip to 59% in February","SQL Advanced certification at 70% — on track for completion","Dashboard delivery is behind but root cause identified","Manager has provided additional resource support","Peer collaboration scores improving — 3.2 to 3.6 this cycle"]}'
),

-- e11 · Derek Okafor
('00000000-0000-0000-0001-000000000011',
 '00000000-0000-0000-0000-000000000001',
 null,
 'Derek Okafor', 'DO', 'Head of Customer Success', 'derek.okafor@zenithcorp.ng',
 '+234 814 567 8901', '6 Adeola Odeku Street, Victoria Island, Lagos',
 'Customer Success', 'CS Leadership', 'senior', 'manager', 'standard', '#0ca678',
 '2021-07-19', 'full_time',
 'L4 – CS Manager', 'L5 – CS Director',
 '["Churn rate below 3%","CSAT ≥4.5 sustained for 3 quarters","Build and present CS playbook to board"]',
 '{"basic":830000,"housing":260000,"transport":130000,"medical":90000,"totalGross":1310000,"bonusStructure":[{"scoreThreshold":88,"bonusAmount":350000},{"scoreThreshold":78,"bonusAmount":200000}]}',
 85, 83, 4.3, 5, 'Strong Performer',
 '{"recommendation":"promote","confidence":0.84,"evidence":["CSAT sustained at 4.7/5 for 3 consecutive quarters","Successfully de-escalated 5 churn-risk accounts in Q2","Churn rate reduced from 4.8% to 3.4% under his management","QBR completion rate of 92% — highest in CS history","CS Director criteria 80% satisfied — strong promotion case"]}'
),

-- e12 · Aisha Musa
('00000000-0000-0000-0001-000000000012',
 '00000000-0000-0000-0000-000000000001',
 null,
 'Aisha Musa', 'AM', 'Finance Officer', 'aisha.musa@zenithcorp.ng',
 '+234 815 678 9012', '33 Toyin Street, Ikeja, Lagos',
 'Finance', 'Financial Reporting', 'entry', 'none', 'standard', '#f76707',
 '2024-03-04', 'full_time',
 'L1 – Finance Officer', 'L2 – Senior Officer',
 '["Zero missed reporting deadlines for 2 consecutive quarters","Complete ICAN Foundation","Data accuracy rate ≥99%"]',
 '{"basic":240000,"housing":75000,"transport":36000,"medical":20000,"totalGross":371000,"bonusStructure":[{"scoreThreshold":70,"bonusAmount":50000}]}',
 39, 35, 2.7, 0, 'At Risk',
 '{"recommendation":"exit_risk","confidence":0.68,"evidence":["Performance score has declined from 62% at hire to 39% — 23 pts drop","4 consecutive missed monthly close deadlines","Reporting accuracy at 81% — 18 pts below required standard","Consistency index of 35 — lowest across all 148 staff","HR has escalated to formal review; exit risk if no improvement by Q3"]}'
);

-- ── WIRE LINE MANAGERS (after all employees inserted) ───────────
update employees set line_manager_id = '00000000-0000-0000-0001-000000000003' where id = '00000000-0000-0000-0001-000000000001'; -- Amara → Bolu
update employees set line_manager_id = '00000000-0000-0000-0001-000000000001' where id = '00000000-0000-0000-0001-000000000002'; -- Adeolu → Amara
-- Bolu, Chidi, Ngozi, Tolu, Kemi, Priya, Derek, Aisha → Femi
update employees set line_manager_id = '00000000-0000-0000-0001-000000000009'
  where id in (
    '00000000-0000-0000-0001-000000000003',
    '00000000-0000-0000-0001-000000000004',
    '00000000-0000-0000-0001-000000000005',
    '00000000-0000-0000-0001-000000000006',
    '00000000-0000-0000-0001-000000000008',
    '00000000-0000-0000-0001-000000000010',
    '00000000-0000-0000-0001-000000000012'
  );
update employees set line_manager_id = '00000000-0000-0000-0001-000000000011' where id = '00000000-0000-0000-0001-000000000007'; -- Emeka → Derek
update employees set line_manager_id = '00000000-0000-0000-0001-000000000009' where id = '00000000-0000-0000-0001-000000000011'; -- Derek → Femi

-- ── GOALS — AMARA OSEI ──────────────────────────────────────────
insert into goals (org_id, owner_id, title, goal_type, weight, percent_complete, status, due_date, cycle) values
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000001','Q2 Revenue Target ₦480M','org',35,88,'on_track','2026-06-30','Q2 2026'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000001','Enterprise Account Retention 95%','dept',25,92,'on_track','2026-06-30','Q2 2026'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000001','New Logo Acquisitions ×6','team',20,67,'at_risk','2026-09-30','Q2 2026'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000001','Sales Playbook Refresh','individual',10,100,'completed','2026-04-30','Q2 2026'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000001','Win Rate Improvement to 38%','individual',10,74,'on_track','2026-08-31','Q2 2026');

-- ── GOALS — ADEOLU JOHNSON ──────────────────────────────────────
insert into goals (org_id, owner_id, title, goal_type, weight, percent_complete, status, due_date, cycle) values
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000002','Q2 Personal Revenue Target ₦120M','dept',40,62,'at_risk','2026-06-30','Q2 2026'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000002','CRM Data Hygiene ≥95%','team',20,88,'on_track','2026-06-30','Q2 2026'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000002','Win Rate to 30%','individual',20,80,'on_track','2026-08-31','Q2 2026'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000002','Complete Sales Excellence Certification','individual',20,55,'on_track','2026-07-31','Q2 2026');

-- ── GOALS — CHIDI OKAFOR ────────────────────────────────────────
insert into goals (org_id, owner_id, title, goal_type, weight, percent_complete, status, due_date, cycle) values
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000004','Reduce Warehouse Turnaround Time by 15%','dept',30,30,'behind','2026-07-31','Q2 2026'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000004','Inventory Accuracy Rate ≥98%','team',30,62,'at_risk','2026-06-30','Q2 2026'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000004','Complete Supply Chain Fundamentals Course','individual',25,20,'behind','2026-07-15','Q2 2026'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000004','Process Mapping for 3 Core Workflows','individual',15,50,'at_risk','2026-06-30','Q2 2026');

-- ── GOALS — EMEKA EZE ───────────────────────────────────────────
insert into goals (org_id, owner_id, title, goal_type, weight, percent_complete, status, due_date, cycle) values
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000007','Ticket SLA Resolution Rate ≥90%','team',40,68,'behind','2026-06-30','Q2 2026'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000007','CSAT Score ≥4.0','dept',30,45,'behind','2026-07-31','Q2 2026'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000007','Complete ITIL Foundation Certification','individual',20,0,'behind','2026-07-31','Q2 2026'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000007','Zero Critical Escalations in Q3','individual',10,30,'at_risk','2026-09-30','Q2 2026');

-- ── GOALS — KEMI ADEBAYO ────────────────────────────────────────
insert into goals (org_id, owner_id, title, goal_type, weight, percent_complete, status, due_date, cycle) values
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000008','Q2 Appraisal Cycle Completion 98%','org',30,96,'on_track','2026-05-31','Q2 2026'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000008','Reduce Voluntary Attrition to Below 6%','dept',25,62,'on_track','2026-12-31','Q2 2026'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000008','OKR Framework Rollout Org-wide','org',20,70,'on_track','2026-07-31','Q2 2026'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000008','Complete CIPM Advanced Diploma','individual',15,60,'on_track','2026-10-31','Q2 2026'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000008','Launch Employee Wellbeing Programme','dept',10,45,'at_risk','2026-08-31','Q2 2026');

-- ── GOALS — FEMI OGUNDIMU ───────────────────────────────────────
insert into goals (org_id, owner_id, title, goal_type, weight, percent_complete, status, due_date, cycle) values
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000009','Annual Org Revenue ₦8B','org',35,78,'on_track','2026-12-31','Q2 2026'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000009','Employee Satisfaction ≥80%','org',25,78,'on_track','2026-12-31','Q2 2026'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000009','Strategic Partnership Expansion ×5','org',20,60,'on_track','2026-12-31','Q2 2026'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000009','OKR Framework 100% Adoption','org',10,70,'on_track','2026-07-31','Q2 2026'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000009','Board ESG Report Submission','org',10,50,'on_track','2026-09-30','Q2 2026');

-- ── GOALS — DEREK OKAFOR ────────────────────────────────────────
insert into goals (org_id, owner_id, title, goal_type, weight, percent_complete, status, due_date, cycle) values
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000011','Customer Churn Rate Below 3%','org',35,71,'on_track','2026-12-31','Q2 2026'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000011','CSAT ≥4.5 Sustained','dept',25,94,'on_track','2026-12-31','Q2 2026'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000011','QBR Completion Rate 95%','team',20,97,'on_track','2026-06-30','Q2 2026'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000011','CS Playbook Documentation','individual',10,50,'at_risk','2026-07-15','Q2 2026'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000011','Upsell Revenue ₦90M','individual',10,62,'on_track','2026-09-30','Q2 2026');

-- ── GOALS — AISHA MUSA ──────────────────────────────────────────
insert into goals (org_id, owner_id, title, goal_type, weight, percent_complete, status, due_date, cycle) values
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000012','Zero Missed Deadlines This Quarter','dept',40,25,'behind','2026-06-30','Q2 2026'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000012','Reporting Accuracy ≥99%','individual',30,20,'behind','2026-06-30','Q2 2026'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000012','Complete ICAN Foundation Module 1','individual',20,30,'behind','2026-07-31','Q2 2026'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000012','ERP System Proficiency ≥85%','individual',10,35,'behind','2026-07-31','Q2 2026');

-- ── KPIS — AMARA OSEI ───────────────────────────────────────────
insert into kpis (org_id, employee_id, name, target_value, current_value, unit, weight, trend, cycle) values
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000001','Revenue Closed (Q2)',480000000,422400000,'NGN',40,'up','Q2 2026'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000001','Win Rate',38,34,'%',30,'up','Q2 2026'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000001','Pipeline Coverage',3,4.2,'x',20,'up','Q2 2026'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000001','Customer NPS',70,74,'pts',10,'flat','Q2 2026');

-- ── KPIS — CHIDI OKAFOR ─────────────────────────────────────────
insert into kpis (org_id, employee_id, name, target_value, current_value, unit, weight, trend, cycle) values
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000004','Warehouse Turnaround (hrs)',24,31,'hrs',40,'down','Q2 2026'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000004','Inventory Accuracy',98,94,'%',35,'flat','Q2 2026'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000004','Process Docs Completed',3,1,'docs',25,'flat','Q2 2026');

-- ── KPIS — EMEKA EZE ────────────────────────────────────────────
insert into kpis (org_id, employee_id, name, target_value, current_value, unit, weight, trend, cycle) values
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000007','SLA Resolution Rate',90,61,'%',40,'down','Q2 2026'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000007','CSAT Score',4.0,2.9,'/5',40,'down','Q2 2026'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000007','Avg Ticket Handle Time',25,42,'min',20,'flat','Q2 2026');

-- ── KPIS — AISHA MUSA ───────────────────────────────────────────
insert into kpis (org_id, employee_id, name, target_value, current_value, unit, weight, trend, cycle) values
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000012','Reporting Accuracy',99,81,'%',45,'down','Q2 2026'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000012','Deadline Adherence',100,25,'%',35,'down','Q2 2026'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000012','ERP Proficiency Score',85,35,'%',20,'down','Q2 2026');

-- ── KPIS — DEREK OKAFOR ─────────────────────────────────────────
insert into kpis (org_id, employee_id, name, target_value, current_value, unit, weight, trend, cycle) values
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000011','Churn Rate',3,3.4,'%',40,'down','Q2 2026'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000011','CSAT Score',4.5,4.7,'/5',30,'flat','Q2 2026'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000011','QBR Completion Rate',95,97,'%',20,'up','Q2 2026'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000011','Upsell Revenue',90000000,55800000,'NGN',10,'flat','Q2 2026');

-- ── REPORTS — AMARA OSEI (most recent weekly) ───────────────────
insert into reports (org_id, employee_id, report_type, accomplishments, blockers, mood, status, submitted_at) values
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000001','weekly',
 'Strong sprint — closed 3 enterprise deals totalling ₦142M. Pipeline is healthy at ₦1.6B. Two new logo prospects advanced to POC stage. Win rate tracking at 34%, trending toward 38% target.',
 'None this week.',
 'energised','submitted','2026-05-19 17:00:00+01'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000001','weekly',
 'Conducted 8 discovery calls, 3 advanced to proposal stage. Launched the refreshed sales playbook — early rep feedback is positive.',
 'None.',
 'good','reviewed','2026-05-12 17:00:00+01');

-- ── REPORTS — CHIDI OKAFOR ──────────────────────────────────────
insert into reports (org_id, employee_id, report_type, accomplishments, blockers, mood, status, submitted_at) values
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000004','weekly',
 'Inventory audit for warehouse B completed — accuracy at 94%. Turnaround time improving slowly.',
 'Training still not started due to workload.',
 'drained','submitted','2026-05-19 17:00:00+01');

-- ── REPORTS — EMEKA EZE ─────────────────────────────────────────
insert into reports (org_id, employee_id, report_type, accomplishments, blockers, mood, status, submitted_at) values
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000007','weekly',
 'Handled 34 tickets this week — SLA rate at 61%. Backlog reduced by 8 with peer support.',
 'Two escalations from dissatisfied customers. ITIL study deferred again due to ticket backlog.',
 'drained','submitted','2026-05-19 17:00:00+01');

-- ── REPORTS — AISHA MUSA ────────────────────────────────────────
insert into reports (org_id, employee_id, report_type, accomplishments, blockers, mood, status, submitted_at) values
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000012','weekly',
 'May close report submitted. Attended ERP refresher session.',
 'May close report delayed 3 days. Errors found in cost centre allocations.',
 'drained','submitted','2026-05-22 17:00:00+01');

-- ── APPRAISAL RECORDS ───────────────────────────────────────────
insert into appraisals (org_id, employee_id, cycle_id, goal_achievement_score, report_consistency_score, kpi_performance_score, manager_assessment_score, peer_feedback_score, total_score, ai_recommendation, ai_confidence, ai_evidence, status) values
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000001','00000000-0000-0000-0000-000000000099',91,88,90,93,92,91,'promote',91,array['Top performer in Sales dept','7-week improvement streak','Peer rating 4.6/5'],'in_progress'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000004','00000000-0000-0000-0000-000000000099',48,54,58,65,62,55,'pip',74,array['Performance declined from 68% to 58%','3 late reports in 6 weeks','Training not started'],'in_progress'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000007','00000000-0000-0000-0000-000000000099',38,43,42,55,50,42,'pip',72,array['CSAT 2.9 vs 4.0 benchmark','61% SLA vs 90% target','ITIL not started'],'in_progress'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000012','00000000-0000-0000-0000-000000000099',28,35,32,48,45,34,'exit_risk',68,array['23 pt score decline','4 consecutive missed deadlines','Accuracy at 81%'],'in_progress'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000008','00000000-0000-0000-0000-000000000099',79,76,78,80,82,78,'good_standing',80,array['96% appraisal completion','Attrition down 1.7 pts','CIPM 60% complete'],'in_progress'),
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0001-000000000011','00000000-0000-0000-0000-000000000099',85,83,87,88,86,86,'promote',84,array['CSAT 4.7/5 for 3 quarters','Churn reduced to 3.4%','QBR rate 92%'],'in_progress');

-- ── WELLBEING SURVEYS — AMARA OSEI ──────────────────────────────
insert into wellbeing_surveys (employee_id, overall_mood, workload, support_level, week_of, submitted_at) values
('00000000-0000-0000-0001-000000000001','energised','manageable','yes','2026-05-19','2026-05-21 09:00:00+01'),
('00000000-0000-0000-0001-000000000001','good','manageable','yes','2026-05-12','2026-05-14 09:00:00+01');

-- ── WELLBEING SURVEYS — CHIDI (at risk) ─────────────────────────
insert into wellbeing_surveys (employee_id, overall_mood, workload, support_level, free_text, escalation_level, week_of, submitted_at) values
('00000000-0000-0000-0001-000000000004','drained','overwhelming','not_really','Training backlog is weighing on me and I feel behind.',1,'2026-05-19','2026-05-21 09:00:00+01');

-- ── NOTIFICATIONS — AMARA OSEI ──────────────────────────────────
insert into notifications (employee_id, title, body, type, is_read, created_at) values
('00000000-0000-0000-0001-000000000001','Performance Score Updated','Your Q2 performance score has been updated to 91%.','appraisal',false,'2026-05-21 10:00:00+01'),
('00000000-0000-0000-0001-000000000001','Promotion Review Scheduled','Your L5 promotion review is scheduled for Q3 2026.','appraisal',false,'2026-05-18 10:00:00+01'),
('00000000-0000-0000-0001-000000000001','Report Pending','Your weekly report for 26 May is due by Friday.','report_due',false,'2026-05-26 08:00:00+01');

-- ── NOTIFICATIONS — CHIDI ───────────────────────────────────────
insert into notifications (employee_id, title, body, type, is_read, created_at) values
('00000000-0000-0000-0001-000000000004','Performance Improvement Plan','You have been placed on a formal PIP. Please review the plan shared by HR.','appraisal',false,'2026-05-22 10:00:00+01'),
('00000000-0000-0000-0001-000000000004','Training Not Started','Supply Chain Fundamentals is overdue. Please enrol immediately.','system',false,'2026-05-20 10:00:00+01');

-- ── NOTIFICATIONS — EMEKA ───────────────────────────────────────
insert into notifications (employee_id, title, body, type, is_read, created_at) values
('00000000-0000-0000-0001-000000000007','PIP Active — Week 5','You are in week 5 of your Performance Improvement Plan. Targets must be met by 30 June.','appraisal',false,'2026-05-22 10:00:00+01'),
('00000000-0000-0000-0001-000000000007','ITIL Enrolment Overdue','You agreed to enrol by 1 May. Please complete enrolment immediately.','system',false,'2026-05-15 10:00:00+01');

-- ── NOTIFICATIONS — KEMI ────────────────────────────────────────
insert into notifications (employee_id, title, body, type, is_read, created_at) values
('00000000-0000-0000-0001-000000000008','Appraisal Cycle: 6 Pending','6 performance agreements still unsigned. Follow up required.','appraisal',false,'2026-05-26 08:00:00+01'),
('00000000-0000-0000-0001-000000000008','Wellbeing Vendor Proposals Received','3 vendor proposals are ready for your review.','system',false,'2026-05-24 10:00:00+01'),
('00000000-0000-0000-0001-000000000008','OKR Adoption at 70%','Organisation-wide OKR adoption has reached 70%.','system',true,'2026-05-20 10:00:00+01');

-- ── NOTIFICATIONS — AISHA ───────────────────────────────────────
insert into notifications (employee_id, title, body, type, is_read, created_at) values
('00000000-0000-0000-0001-000000000012','Exit Risk Review Today','Your formal performance review is scheduled for 29 May at 11:00.','appraisal',false,'2026-05-29 08:00:00+01'),
('00000000-0000-0000-0001-000000000012','Deadline Missed — May Close','May close report was submitted 3 days late.','system',true,'2026-05-22 10:00:00+01'),
('00000000-0000-0000-0001-000000000012','ICAN Enrolment Required','ICAN Foundation enrolment must be completed before your review on 29 May.','system',false,'2026-05-20 10:00:00+01');
