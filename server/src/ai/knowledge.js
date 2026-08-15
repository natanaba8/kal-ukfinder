/**
 * Offline career guidance.
 *
 * When GEMINI_API_KEY is absent the coach routes questions here by keyword.
 * These are general UK careers pointers, deliberately conservative: anything
 * legal, visa or benefits related sends the reader to the official source.
 */
export const OFFLINE_ANSWERS = [
  {
    id: 'cv',
    triggers: ['cv', 'curriculum vitae', 'resume'],
    answer: `A UK CV is two pages maximum (one if you are early career), with no photo and no date of birth.

Structure it as: name and contact details, a three-to-four line personal statement, work experience newest first, education, then skills.

The thing that decides shortlisting is your bullets. Rewrite every "Responsible for..." as action plus result — "Cut call handling time by 20% by rewriting the triage script" beats "Responsible for customer calls" every time. Aim for at least three bullets carrying a number.

Then tailor it: read the advert, list the exact words it uses for the key skills, and make sure those words appear on your CV where you honestly have the evidence. Screening software matches on the exact terms.`,
    followUps: [
      'How do I explain a gap in my CV?',
      'What should my personal statement say?',
      'How do I tailor my CV to a specific advert?',
    ],
    checkWith: null,
  },
  {
    id: 'cover-letter',
    triggers: ['cover letter', 'covering letter', 'supporting statement'],
    answer: `Keep it to one page and three paragraphs.

1. Why this role, this employer, now — one specific thing about them, not flattery.
2. Your two strongest pieces of evidence against their top requirements, with numbers.
3. What you would do in the first three months, and a plain close.

For public sector roles the "supporting statement" replaces the letter and is scored against the person specification — answer each essential criterion in order, using their headings. That is not optional; assessors mark line by line.`,
    followUps: ['How do I write a supporting statement for a civil service role?', 'Should I name the hiring manager?'],
    checkWith: null,
  },
  {
    id: 'interview',
    triggers: ['interview', 'star method', 'competency'],
    answer: `Most UK interviews are competency based: they will ask for examples and score them.

Answer in STAR order — Situation (one sentence), Task (what you had to do), Action (what YOU did, say "I" not "we"), Result (how it ended, with a number). Ninety seconds per answer.

Prepare six stories that you can flex across questions: a problem you solved, a conflict you handled, a deadline you hit under pressure, something you improved, a mistake you learned from, and something you led.

Have two questions ready for them that show you have thought about the job — how success is measured in the first six months, or what the biggest challenge for this role is right now.`,
    followUps: ['What questions should I ask the interviewer?', 'How do I answer "what is your weakness"?', 'How do I prepare for a civil service Success Profiles interview?'],
    checkWith: null,
  },
  {
    id: 'salary',
    triggers: ['salary', 'negotiate', 'pay rise', 'how much should i earn'],
    answer: `Research first: check the advertised range, comparable adverts for the same title and region, and any published pay scale (NHS Agenda for Change bands and civil service grades are public).

When asked for expectations, give a researched range with the bottom of the range being a number you would genuinely accept, and say it is based on the market for the role and your experience.

For a rise in your current job, book the conversation separately from your appraisal, bring evidence of scope you have taken on since your last review, and ask for a specific figure with a date for the decision.`,
    followUps: ['How do I ask for a pay rise?', 'What is a realistic salary for my role?'],
    checkWith: null,
  },
  {
    id: 'redundancy',
    triggers: ['redundan', 'made redundant', 'laid off', 'dismissal', 'sacked', 'fired'],
    answer: `Practically: get the process and dates in writing, check your notice period and any consultation timeline in your contract, and ask whether alternative roles are being offered.

Statutory redundancy pay depends on your age, length of service and weekly pay, and there are eligibility rules — do not rely on a rough estimate.

Start the job search the same week: update your CV, tell your network specifically what you are looking for, and set up alerts. Most roles are filled faster than notice periods run.`,
    followUps: ['How do I explain redundancy in an interview?', 'What support can I claim while job hunting?'],
    checkWith: 'ACAS (acas.org.uk) for your rights, and GOV.UK for redundancy pay',
  },
  {
    id: 'benefits',
    triggers: ['universal credit', 'jobcentre', 'benefit', 'claim while', 'jobseeker'],
    answer: `Universal Credit is the main working-age payment and it can continue while you work, tapering as you earn. Your claimant commitment sets out what you agree to do to look for work — keep a record of applications, because that is what is reviewed.

Ask your work coach specifically about the Flexible Support Fund: it can cover interview travel, clothing, childcare and training costs, and it is not widely advertised.

Entitlement depends heavily on your circumstances, so check the official calculator rather than a rule of thumb.`,
    followUps: ['What is the Flexible Support Fund?', 'Can I claim while doing a training course?'],
    checkWith: 'GOV.UK — Universal Credit, or Citizens Advice for a benefits check',
  },
  {
    id: 'visa',
    triggers: ['visa', 'sponsor', 'right to work', 'immigration', 'skilled worker'],
    answer: `For most work routes you need a licensed sponsor, and the employer must hold that licence before they can offer you a Certificate of Sponsorship — it is worth filtering your search to employers on the published register of licensed sponsors.

When applying, be straightforward about your status early. "I hold [status] and have the right to work in the UK" removes doubt; if you need sponsorship, say so, because a withdrawn offer late in the process costs you weeks.

Salary and skill thresholds change, so never rely on a figure you read in a forum.`,
    followUps: ['How do I find employers who sponsor visas?', 'What do I say about my visa status in an application?'],
    checkWith: 'GOV.UK — the register of licensed sponsors and the current Skilled Worker rules',
  },
  {
    id: 'apprenticeship',
    triggers: ['apprentice', 'levy', 't-level', 'traineeship'],
    answer: `Apprenticeships run from Level 2 (GCSE equivalent) to Level 7 (master's equivalent), and you are a paid employee throughout with roughly 20% of your time in off-the-job training.

Search the official "Find an apprenticeship" service rather than job boards — vacancies there are all genuine apprenticeship standards. Degree apprenticeships in particular are heavily oversubscribed, so apply early in the cycle.

Applications are usually assessed on attitude and potential rather than experience, so lead with what you have done outside work: projects, part-time roles, volunteering, anything showing you finish things.`,
    followUps: ['Am I eligible for an apprenticeship at my age?', 'How do degree apprenticeships work?'],
    checkWith: 'GOV.UK — Find an apprenticeship',
  },
  {
    id: 'career-change',
    triggers: ['career change', 'switch career', 'retrain', 'change industry', 'bootcamp'],
    answer: `Change one variable at a time. Moving sector and role and seniority at once is the hardest possible jump; moving your existing role into a new sector, or changing role inside your current sector, is far more likely to land.

Build a bridge: name the transferable skills explicitly in your personal statement, then add one piece of concrete evidence in the new area — a funded Skills Bootcamp, a certification, a volunteer project, or work you can show.

Expect the first move to be lateral or a small step back on pay. The step back is usually recovered within two years.`,
    followUps: ['What free training is available for career changers?', 'How do I show transferable skills on a CV?'],
    checkWith: 'GOV.UK — Skills Bootcamps and the National Careers Service',
  },
  {
    id: 'student',
    triggers: ['student', 'graduate scheme', 'university', 'placement', 'internship', 'a-level'],
    answer: `Graduate schemes open early — many close in the autumn for the following September, and some close as soon as they are full. Get your applications in during the first few weeks of the cycle.

Most large schemes run: online application, situational judgement and numerical tests, a recorded video interview, then an assessment centre. Practise the tests; they are learnable and they eliminate more candidates than anything else.

If you miss the scheme window, direct entry roles at smaller employers often pay similarly and give you responsibility faster. Do not treat them as a fallback.`,
    followUps: ['How do I prepare for an assessment centre?', 'What if I have no work experience?'],
    checkWith: null,
  },
  {
    id: 'nhs',
    triggers: ['nhs', 'agenda for change', 'band 5', 'healthcare job'],
    answer: `NHS recruitment is standardised: applications go through NHS Jobs / TRAC, and shortlisting is scored against the person specification, split into essential and desirable criteria.

Answer the supporting information box criterion by criterion, in the same order as the specification, with an example for each. Assessors tick them off literally.

Interviews are values based — expect questions on compassion, working under pressure, raising concerns and patient dignity, alongside clinical or technical questions for the band.`,
    followUps: ['How do NHS bands and pay work?', 'What is a values-based interview?'],
    checkWith: 'NHS Employers and the job advert for the current pay band',
  },
  {
    id: 'civil-service',
    triggers: ['civil service', 'success profiles', 'heo', 'seo', 'government job'],
    answer: `Civil service recruitment uses Success Profiles: Behaviours, Strengths, Experience, Ability and Technical.

The application usually asks for a 250-word statement per behaviour. Write each one as a single STAR example, use the behaviour's own language from the published framework, and stay inside the word count — anything over is cut off.

At interview you get the same behaviours again, plus unprepared strengths questions. Bring different examples to interview than the ones you wrote in the application.`,
    followUps: ['How do I write a 250-word behaviour statement?', 'What are the civil service grades?'],
    checkWith: 'GOV.UK — Success Profiles framework',
  },
  {
    id: 'default',
    triggers: [],
    answer: `I can help with CVs, cover letters and supporting statements, interview preparation, salary and negotiation, redundancy, apprenticeships, graduate schemes, career changes, NHS and civil service applications, and how UK policy changes affect your work.

Ask me something specific — for example "how do I explain a two-year gap on my CV?" or "what should I ask at the end of an interview?" — and I will give you the practical version.

Note: this reply came from the built-in guidance because no Gemini API key is configured on the server. Add GEMINI_API_KEY to server/.env for full conversational answers tailored to your profile.`,
    followUps: [
      'How do I make my CV stand out for a UK employer?',
      'What are the most common competency interview questions?',
      'How do I change career without taking a pay cut?',
    ],
    checkWith: null,
  },
];

/** Question banks used by the offline interview prep path. */
export const INTERVIEW_BANK = [
  {
    id: 'technical',
    match: ['engineer', 'developer', 'software', 'data', 'analyst', 'it ', 'cyber', 'devops'],
    format:
      'Usually a screening call, a technical exercise or take-home, then a panel mixing technical depth with competency questions.',
    questions: [
      { question: 'Walk me through a project you are proud of, and what you personally built.', type: 'technical', whyAsked: 'Separates your contribution from the team’s.', strongAnswerContains: ['Your specific role', 'A design decision and why', 'The measurable outcome'] },
      { question: 'Tell me about a bug or incident you diagnosed under pressure.', type: 'competency', whyAsked: 'Tests debugging method and composure.', strongAnswerContains: ['How you narrowed it down', 'What you ruled out', 'What you changed afterwards'] },
      { question: 'How do you decide when something is good enough to ship?', type: 'judgement', whyAsked: 'Checks pragmatism versus perfectionism.', strongAnswerContains: ['Risk assessment', 'Who you consult', 'A real example'] },
      { question: 'Describe a time you disagreed with a technical decision.', type: 'competency', whyAsked: 'Tests how you handle conflict without being difficult.', strongAnswerContains: ['Evidence you brought', 'How you escalated', 'That you committed once decided'] },
      { question: 'What have you learned recently, and how did you learn it?', type: 'motivational', whyAsked: 'Tech roles need people who self-update.', strongAnswerContains: ['Something specific and recent', 'How you applied it'] },
      { question: 'How would you explain your work to a non-technical stakeholder?', type: 'communication', whyAsked: 'Most roles sit next to people who are not engineers.', strongAnswerContains: ['A plain-English analogy', 'A real instance'] },
      { question: 'Tell me about a time you improved something without being asked.', type: 'competency', whyAsked: 'Tests initiative and ownership.', strongAnswerContains: ['Why you spotted it', 'The result with a number'] },
      { question: 'Why this company and this role?', type: 'motivational', whyAsked: 'Filters out mass applications.', strongAnswerContains: ['Something specific about them', 'How the role fits your next step'] },
    ],
    questionsToAskThem: [
      'What does the first three months look like, and how will you know it has gone well?',
      'How does work get from idea to production here?',
      'What is the biggest technical constraint the team is living with right now?',
    ],
  },
  {
    id: 'care',
    match: ['nurse', 'care', 'health', 'support worker', 'teaching', 'teacher', 'social work'],
    format:
      'Values-based interview, often with a panel including a service user or senior practitioner, plus scenario questions and sometimes a written task.',
    questions: [
      { question: 'Tell me about a time you put someone’s dignity first under time pressure.', type: 'values', whyAsked: 'Core to values-based recruitment.', strongAnswerContains: ['The tension you faced', 'What you chose and why', 'The outcome for the person'] },
      { question: 'Describe a situation where you raised a concern about practice.', type: 'values', whyAsked: 'Safeguarding and speaking-up culture.', strongAnswerContains: ['What you observed', 'Who you escalated to', 'That you followed policy'] },
      { question: 'How do you manage a heavy caseload or busy shift?', type: 'competency', whyAsked: 'Tests prioritisation and safety.', strongAnswerContains: ['How you triage', 'When you ask for help', 'A real shift example'] },
      { question: 'Tell me about a difficult conversation with a family member or carer.', type: 'communication', whyAsked: 'Emotional labour is most of the job.', strongAnswerContains: ['How you listened', 'What you did not promise', 'How it resolved'] },
      { question: 'How do you look after your own wellbeing in this work?', type: 'values', whyAsked: 'Retention risk is real and they will ask.', strongAnswerContains: ['Something concrete, not "I just cope"'] },
      { question: 'Give an example of working effectively in a multidisciplinary team.', type: 'competency', whyAsked: 'Nothing here happens solo.', strongAnswerContains: ['Your role', 'How you handled a difference of view'] },
      { question: 'What would you do if you made a mistake that affected someone in your care?', type: 'scenario', whyAsked: 'Tests candour and duty of candour understanding.', strongAnswerContains: ['Immediate safety action', 'Reporting it', 'Learning from it'] },
      { question: 'Why this service and this role?', type: 'motivational', whyAsked: 'Values fit.', strongAnswerContains: ['Something specific about the service'] },
    ],
    questionsToAskThem: [
      'What does supervision and support look like in the first six months?',
      'How is the team staffed on a typical shift?',
      'What development routes have people here taken from this role?',
    ],
  },
  {
    id: 'general',
    match: [],
    format:
      'Typically a competency-based panel of two or three people, 45 to 60 minutes, with time for your questions at the end.',
    questions: [
      { question: 'Tell me about yourself.', type: 'opener', whyAsked: 'Sets the frame for the whole interview.', strongAnswerContains: ['Two minutes maximum', 'Present, then relevant past, then why this role'] },
      { question: 'Why do you want this role, and why now?', type: 'motivational', whyAsked: 'Filters out scattergun applicants.', strongAnswerContains: ['Something specific about the employer', 'An honest reason for moving'] },
      { question: 'Describe a time you solved a difficult problem.', type: 'competency', whyAsked: 'Standard scored competency.', strongAnswerContains: ['STAR structure', 'What you personally did', 'A measurable result'] },
      { question: 'Tell me about a time you worked with someone difficult.', type: 'competency', whyAsked: 'Tests self-awareness, not blame.', strongAnswerContains: ['No badmouthing', 'What you changed in your own approach'] },
      { question: 'Give an example of managing competing deadlines.', type: 'competency', whyAsked: 'Prioritisation under pressure.', strongAnswerContains: ['How you decided what slipped', 'Who you told'] },
      { question: 'What is your biggest weakness?', type: 'self-awareness', whyAsked: 'They want honesty plus a fix in progress.', strongAnswerContains: ['A real weakness', 'The concrete step you are taking'] },
      { question: 'Where do you see yourself in three years?', type: 'motivational', whyAsked: 'Retention check.', strongAnswerContains: ['A direction, not a job title', 'How this role fits it'] },
      { question: 'Do you have any questions for us?', type: 'closing', whyAsked: 'Last scored moment — never say no.', strongAnswerContains: ['Two prepared questions', 'One based on something said in the interview'] },
    ],
    questionsToAskThem: [
      'What does success in this role look like after six months?',
      'What is the biggest challenge facing the team this year?',
      'How would you describe the way decisions get made here?',
    ],
  },
];
