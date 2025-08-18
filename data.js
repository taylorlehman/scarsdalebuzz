const serviceData = [
    {
        // Example with both business and contact name
        businessName: "Buzzworthy Electric",
        firstName: "Barry",
        lastName: "Benson",
        phone: "914-555-1234",
        email: "barry@buzzworthyelectric.com",
        category: "Electrician",
        lastRecommended: "2025-07-15",
        recommendations: 12
    },
    {
        // Example with business name only
        businessName: "Stinger Security",
        phone: "914-555-1122",
        email: "info@stingersecurity.com",
        category: "Security",
        lastRecommended: "2025-06-20",
        recommendations: 22
    },
    {
        // Example with contact name only
        firstName: "Manny",
        lastName: "Ramirez",
        phone: "914-555-8899",
        email: "manny.ramirez@email.com",
        category: "Handyman",
        lastRecommended: "2025-07-01",
        recommendations: 3
    },
    {
        businessName: "The Honeycomb Hideout",
        firstName: "Melissa",
        lastName: "Chartwell",
        phone: "914-555-5678",
        email: "melissa@honeycombhideout.com",
        category: "Home Organizer",
        lastRecommended: "2025-08-01",
        recommendations: 8
    },
    {
        businessName: "Queen Bee Painters",
        firstName: "Beatrice",
        lastName: "Hatcher",
        phone: "914-555-4321",
        email: "beatrice@queenbeepainters.com",
        category: "Painter",
        lastRecommended: "2025-03-12",
        recommendations: 15
    },
    {
        businessName: "A-Plus Plumbing",
        firstName: "Alex",
        lastName: "Pipe",
        phone: "914-555-5555",
        email: "alex@aplusplumbing.com",
        category: "Plumber",
        lastRecommended: "2025-04-22",
        recommendations: 18
    },
    {
        // Example with an old recommendation date
        businessName: "Ancient Artistry",
        firstName: "Gepetto",
        lastName: "Pinewood",
        phone: "914-555-1000",
        email: "gepetto@ancientartistry.com",
        category: "Carpenter",
        lastRecommended: "2024-01-15",
        recommendations: 25
    },
    {
        businessName: "The Pollen Patch",
        firstName: "Poppy",
        lastName: "Gardner",
        phone: "914-555-2020",
        email: "poppy@pollenpatch.com",
        category: "Landscaper",
        lastRecommended: "2025-07-22",
        recommendations: 19
    },
    {
        businessName: "Hive Top Roofing",
        phone: "914-555-3030",
        email: "contact@hivetoproofing.com",
        category: "Roofer",
        lastRecommended: "2025-06-15",
        recommendations: 11
    },
    {
        firstName: "Mario",
        lastName: "Rossi",
        phone: "914-555-4040",
        email: "mario.rossi@email.com",
        category: "Plumber",
        lastRecommended: "2025-08-02",
        recommendations: 22
    },
    {
        businessName: "The Hue Hive",
        firstName: "Amber",
        lastName: "Stain",
        phone: "914-555-5050",
        email: "amber@huehive.com",
        category: "Painter",
        lastRecommended: "2024-03-10",
        recommendations: 15
    },
    {
        businessName: "Comb Construction",
        firstName: "Bill",
        lastName: "Der",
        phone: "914-555-6060",
        email: "bill@combconstruction.com",
        category: "Contractor",
        lastRecommended: "2025-05-30",
        recommendations: 28
    },
    {
        businessName: "The Digital Swarm",
        phone: "914-555-7070",
        email: "support@digitalswarm.com",
        category: "IT Support",
        lastRecommended: "2025-08-09",
        recommendations: 5
    },
    {
        firstName: "Clara",
        lastName: "Voyant",
        phone: "914-555-8080",
        email: "clara.voyant@email.com",
        category: "Tutor",
        lastRecommended: "2025-08-01",
        recommendations: 12
    },
    {
        businessName: "Nectar Nutrition",
        firstName: "Holly",
        lastName: "Hocks",
        phone: "914-555-9090",
        email: "holly@nectarnutrition.com",
        category: "Nutritionist",
        lastRecommended: "2025-07-18",
        recommendations: 9
    },
    {
        businessName: "Royal Flush Plumbing",
        phone: "914-555-1111",
        email: "info@royalflushplumbing.com",
        category: "Plumber",
        lastRecommended: "2025-02-28",
        recommendations: 18
    },
    {
        businessName: "Wagging Bee Tails",
        firstName: "Doug",
        lastName: "Walker",
        phone: "914-555-2222",
        email: "doug@waggingbeetails.com",
        category: "Dog Walker",
        lastRecommended: "2025-07-31",
        recommendations: 30
    },
    {
        businessName: "Power Up Electrical",
        firstName: "Walter",
        lastName: "White",
        phone: "914-555-6677",
        email: "walter@powerupelectrical.com",
        category: "Electrician",
        lastRecommended: "2025-06-10",
        recommendations: 22
    },
    {
        firstName: "Manny",
        lastName: "Tools",
        phone: "914-555-8899",
        email: "manny.tools@email.com",
        category: "Handyman",
        lastRecommended: "2025-07-01",
        recommendations: 3
    }
];

// Category groups for organizing the overflow menu
const categoryGroups = {
    "Home Services": [
        "Electrician",
        "Plumber", 
        "Handyman",
        "Carpenter",
        "Painter",
        "Roofer",
        "Contractor"
    ],
    "Outdoor & Property": [
        "Landscaper"
    ],
    "Personal & Family": [
        "Dog Walker",
        "Tutor"
    ],
    "Health & Wellness": [
        "Nutritionist"
    ],
    "Technology & Security": [
        "IT Support",
        "Security"
    ],
    "Organization & Lifestyle": [
        "Home Organizer"
    ]
};
