/** Sample directory data shaped like the production Firestore documents. */
export function sampleDirectory() {
  return {
    services: [
      {
        id: 'svc-joes',
        businessName: "Joe's Plumbing & Heating",
        firstName: 'Joe',
        lastName: 'Russo',
        phone: '(914) 555-0101',
        email: 'joe@example.com',
        categories: ['Plumbers', 'HVAC'],
        recommendations: 12,
        lastRecommended: new Date('2026-08-01T12:00:00Z'),
        recentRecommenders: [{ uid: 'someone-else', timestamp: new Date() }],
        sunnyApproved: true,
      },
      {
        id: 'svc-drain',
        businessName: 'Drain Masters',
        phone: '(914) 555-0102',
        categories: ['Plumbers'],
        recommendations: 3,
      },
      {
        id: 'svc-maria',
        firstName: 'Maria',
        lastName: 'Gonzalez',
        phone: '(914) 555-0103',
        category: 'House Cleaning', // legacy single-category field
        recommendations: 8,
      },
      {
        id: 'svc-test',
        businessName: 'Test Plumbing Co',
        categories: ['Plumbers'],
        recommendations: 99,
        isTestProvider: true,
      },
      {
        id: 'svc-tutor',
        businessName: 'Scarsdale Math Tutoring',
        email: 'tutor@example.com',
        categories: ['Tutors'],
        recommendations: 5,
      },
    ],
    categories: ['HVAC', 'House Cleaning', 'Plumbers', 'Tutors', 'Electricians'],
    categoryGroups: {
      'Home Services': ['Plumbers', 'HVAC', 'Electricians'],
      Household: ['House Cleaning'],
    },
    saved: {
      'user-approved': [
        { serviceId: 'svc-maria', savedAt: new Date('2026-09-01T00:00:00Z') },
        { serviceId: 'svc-joes', savedAt: new Date('2026-07-01T00:00:00Z') },
        { serviceId: 'svc-deleted', savedAt: new Date('2026-06-01T00:00:00Z') },
      ],
      'user-other': [{ serviceId: 'svc-drain', savedAt: new Date('2026-09-02T00:00:00Z') }],
    },
  };
}
