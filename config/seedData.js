const Equipment = require('../models/Equipment');
const User = require('../models/User');
const { CAMPUS_PICKUP_LOCATIONS } = require('./pickupConfig');

async function seedInitialData() {
  console.log('[SEED] Ensuring default campus user accounts and equipment...');

  // Create Users
  // Create Default Students & Admin if not present
  let rahulUser = await User.findOne({ email: 'rahul.das@campus.edu' });
  if (!rahulUser) {
    rahulUser = await User.create({
      name: 'Rahul Das',
      email: 'rahul.das@campus.edu',
      password: 'password123',
      role: 'student',
      department: 'Mechanical',
      collegeId: 'ME-2024-042',
      trustScore: 85,
      trustTier: 'Silver',
      ratingAvg: 4.8,
      ratingCount: 12,
      totalBorrowed: 5,
      totalLent: 0,
      phone: '+91 98300 12345'
    });
  }

  let debjitUser = await User.findOne({ email: 'debjit@campus.edu' });
  if (!debjitUser) {
    debjitUser = await User.create({
      name: 'Debjit',
      email: 'debjit@campus.edu',
      password: 'password123',
      role: 'student',
      department: 'Mechanical',
      collegeId: 'ME-2024-001',
      trustScore: 80,
      trustTier: 'Silver',
      ratingAvg: 4.9,
      ratingCount: 15,
      totalBorrowed: 7,
      totalLent: 2,
      phone: '+91 98301 23456'
    });
  }

  let adminUser = await User.findOne({ role: 'admin' });
  if (!adminUser) {
    adminUser = await User.create({
      name: 'Dr. Aris Thorne (Lab Admin)',
      email: 'admin@campus.edu',
      password: 'password123',
      role: 'admin',
      department: 'Central Engineering Store',
      collegeId: 'ADMIN-001',
      trustScore: 99,
      trustTier: 'Gold',
      ratingAvg: 5.0,
      ratingCount: 50,
      totalBorrowed: 0,
      totalLent: 50,
      phone: '+91 98000 00001'
    });
  }

  let seniorUser = await User.findOne({ role: 'senior' });
  if (!seniorUser) {
    seniorUser = await User.create({
      name: 'Priya Sharma',
      email: 'priya.senior@campus.edu',
      password: 'password123',
      role: 'senior',
      department: 'Mechanical',
      collegeId: 'ME-2023-018',
      trustScore: 97,
      trustTier: 'Gold',
      ratingAvg: 4.95,
      ratingCount: 32,
      totalBorrowed: 12,
      totalLent: 18,
      phone: '+91 98234 56781'
    });
  }

  let civilSenior = await User.findOne({ email: 'arjun.civil@campus.edu' });
  if (!civilSenior) {
    civilSenior = await User.create({
      name: 'Arjun Mehta',
      email: 'arjun.civil@campus.edu',
      password: 'password123',
      role: 'senior',
      department: 'Civil',
      collegeId: 'CE-2023-044',
      trustScore: 94,
      trustTier: 'Gold',
      ratingAvg: 4.88,
      ratingCount: 19,
      totalBorrowed: 8,
      totalLent: 14,
      phone: '+91 97123 44556'
    });
  }

  const count = await Equipment.countDocuments();
  if (count > 0) {
    console.log('[SEED] Campus equipment inventory already populated.');
    return;
  }

  console.log('[SEED] Seeding realistic campus engineering equipment inventory...');

  const sampleEquipment = [
    // 1. Mechanical
    {
      title: 'Omega Mini Drafter Pro 360°',
      category: 'Mechanical',
      department: 'Mechanical Engineering',
      description: 'Precision engineering drafting tool with stainless steel arms and unbreakable scale. Ideal for Machine Drawing and Engineering Graphics semester labs.',
      specs: [
        'Scale: 300mm x 150mm clear acrylic',
        'Head: 360° protractor with locking screw',
        'Clamp: Universal steel table clamp with rubber padding',
        'Certified by Department Workshop Standards'
      ],
      condition: 'Excellent',
      dailyFee: 0,
      deposit: 250,
      status: 'available',
      pickupLocation: 'Mechanical Workshop - Bay 4',
      serialNumber: 'ME-DRF-104',
      minTrustScore: 60,
      maxBorrowDays: 14,
      owner: seniorUser._id || seniorUser.id,
      ownerName: 'Priya Sharma (Final Year Mech)'
    },
    {
      title: 'Imperial Engineering Drawing Board (A1 Size)',
      category: 'Mechanical',
      department: 'Mechanical Engineering',
      description: 'Kiln-seasoned pine wood board with hard-pressed melamine surface. Features an integrated carrying handle and anti-slip rubber feet.',
      specs: [
        'Dimensions: 650mm x 920mm (Standard A1)',
        'Thickness: 18mm high-density core',
        'Surface: Stain-resistant smooth matte white',
        'Includes canvas protective sleeve'
      ],
      condition: 'Brand New',
      dailyFee: 0,
      deposit: 300,
      status: 'available',
      pickupLocation: 'Central Library - Circulation Desk',
      serialNumber: 'ME-BRD-208',
      minTrustScore: 65,
      maxBorrowDays: 7,
      owner: seniorUser._id || seniorUser.id,
      ownerName: 'Priya Sharma (Final Year Mech)'
    },
    {
      title: 'Mitutoyo Vernier Caliper and Outside Micrometer Combo',
      category: 'Mechanical',
      department: 'Mechanical Engineering',
      description: 'Hardened stainless steel precision measuring instrument kit for metrology and machine tool labs. Calibrated with zero error verification.',
      specs: [
        'Caliper Range: 0–150mm (0.02mm resolution)',
        'Micrometer Range: 0–25mm (0.01mm resolution)',
        'Ratchet stop thimble for constant measuring force',
        'Comes with calibration certificate & foam case'
      ],
      condition: 'Excellent',
      dailyFee: 10,
      deposit: 500,
      status: 'available',
      pickupLocation: 'Mechanical Workshop - Bay 4',
      serialNumber: 'ME-CAL-042',
      minTrustScore: 70,
      maxBorrowDays: 5,
      owner: seniorUser._id || seniorUser.id,
      ownerName: 'Department Metrology Cell'
    },

    // 2. Civil
    {
      title: 'South DT-02 Digital Electronic Theodolite',
      category: 'Civil',
      department: 'Civil Engineering',
      description: 'High-precision angular survey tool with optical plummet and dual illuminated LCD displays. Calibrated for triangulation and road curve setting.',
      specs: [
        'Angular Accuracy: 2 seconds',
        'Telescope Magnification: 30x',
        'Dual-axis tilt compensation',
        'Includes heavy-duty aluminum tripod'
      ],
      condition: 'Excellent',
      dailyFee: 0,
      deposit: 1500,
      status: 'available',
      pickupLocation: 'Department Office - Admin Block Room 102',
      serialNumber: 'CE-THD-009',
      minTrustScore: 80,
      maxBorrowDays: 3,
      owner: civilSenior._id || civilSenior.id,
      ownerName: 'Arjun Mehta (Final Year Civil)'
    },
    {
      title: 'Sokkia Automatic Dumpy Level (B40A) with Levelling Staff',
      category: 'Civil',
      department: 'Civil Engineering',
      description: 'Reliable all-weather auto-level with magnetically dampened compensator. Perfect for leveling contours and highway gradient surveys.',
      specs: [
        'Magnification: 24x with 32mm objective',
        'Accuracy: 2.0mm standard deviation per km double-run',
        'Water Resistance: IPX6 environmental rating',
        'Includes 5m telescopic aluminum staff with E-graduations'
      ],
      condition: 'Good',
      dailyFee: 0,
      deposit: 800,
      status: 'available',
      pickupLocation: 'Department Office - Admin Block Room 102',
      serialNumber: 'CE-LVL-031',
      minTrustScore: 70,
      maxBorrowDays: 5,
      owner: civilSenior._id || civilSenior.id,
      ownerName: 'Arjun Mehta (Final Year Civil)'
    },

    // 3. Electrical
    {
      title: 'Fluke 87V Industrial True RMS Multimeter',
      category: 'Electrical',
      department: 'Electrical Engineering',
      description: 'Top-tier diagnostic tool with high accuracy for power electronics and circuit analysis. Features low-pass filter for accurate voltage frequency on VFDs.',
      specs: [
        'CAT III 1000V, CAT IV 600V safety certified',
        'Measures up to 1000V AC/DC, 10A current',
        'Built-in thermometer for heat analysis',
        'Includes silicone test leads and alligator clips'
      ],
      condition: 'Brand New',
      dailyFee: 15,
      deposit: 600,
      status: 'available',
      pickupLocation: 'Electrical Lab - Room 304',
      serialNumber: 'EE-DMM-015',
      minTrustScore: 65,
      maxBorrowDays: 7,
      owner: seniorUser._id || seniorUser.id,
      ownerName: 'Electrical Department Store'
    },
    {
      title: 'Rigol DS1054Z 50MHz 4-Channel Digital Storage Oscilloscope',
      category: 'Electrical',
      department: 'Electrical Engineering',
      description: 'Essential 4-channel oscilloscope for analog and digital signal processing, sensor waveform debugging, and communication lab assignments.',
      specs: [
        'Bandwidth: 50 MHz (4 Analog Channels)',
        'Real-time sample rate: Up to 1 GSa/s',
        'Memory depth: 24 Mpts',
        'Waveform capture rate up to 30,000 wfms/s'
      ],
      condition: 'Excellent',
      dailyFee: 25,
      deposit: 2000,
      status: 'available',
      pickupLocation: 'Electrical Lab - Room 304',
      serialNumber: 'EE-DSO-004',
      minTrustScore: 85,
      maxBorrowDays: 3,
      owner: seniorUser._id || seniorUser.id,
      ownerName: 'Robotics & Control Research Lab'
    },

    // 4. Survey
    {
      title: 'Garmin eTrex 32x Handheld GPS Navigator',
      category: 'Survey',
      department: 'Survey Engineering',
      description: 'Rugged GPS/GLONASS handheld unit with 3-axis compass and barometric altimeter. Preloaded with TopoActive maps for terrain mapping.',
      specs: [
        'Display: 2.2-inch sunlight-readable color screen',
        'Sensors: GPS, GLONASS, Compass, Barometric Altimeter',
        'Battery: 25 hours continuous tracking on 2x AA',
        'Internal Memory: 8GB with microSD expansion'
      ],
      condition: 'Excellent',
      dailyFee: 0,
      deposit: 750,
      status: 'available',
      pickupLocation: 'Central Library - Circulation Desk',
      serialNumber: 'SUR-GPS-011',
      minTrustScore: 70,
      maxBorrowDays: 5,
      owner: civilSenior._id || civilSenior.id,
      ownerName: 'GIS & Cartography Student Club'
    },
    {
      title: 'Bosch Professional GLM 50-27 CG Laser Distance Meter',
      category: 'Survey',
      department: 'Survey Engineering',
      description: 'Green laser technology for supreme visibility in bright campus sunlight. Bluetooth connectivity for direct floor plan measurement sync.',
      specs: [
        'Measuring Range: 0.05m to 50.00m',
        'Measuring Accuracy: ± 1.5mm',
        'Protection: IP65 dust and water jets',
        'Features digital bubble level and angle sensor'
      ],
      condition: 'Brand New',
      dailyFee: 0,
      deposit: 400,
      status: 'available',
      pickupLocation: 'College Office - Ground Floor Help Desk',
      serialNumber: 'SUR-LSR-088',
      minTrustScore: 60,
      maxBorrowDays: 4,
      owner: civilSenior._id || civilSenior.id,
      ownerName: 'Campus Works Division'
    },

    // 5. Other Engineering Equipment
    {
      title: 'Texas Instruments TI-Nspire CX II CAS Scientific Calculator',
      category: 'Other Engineering Equipment',
      department: 'All Engineering Disciplines',
      description: 'Advanced graphing calculator with Computer Algebra System (CAS). Color backlit display with dynamic graphing, matrix operations, and Python programming.',
      specs: [
        'Built-in Computer Algebra System (CAS)',
        '320 x 240 pixel full color backlit screen',
        'Rechargeable lithium-ion battery',
        'Permitted for engineering analysis coursework'
      ],
      condition: 'Excellent',
      dailyFee: 0,
      deposit: 350,
      status: 'available',
      pickupLocation: 'Computer Lab - Tech Block 2nd Floor',
      serialNumber: 'OEE-CALC-512',
      minTrustScore: 60,
      maxBorrowDays: 14,
      owner: seniorUser._id || seniorUser.id,
      ownerName: 'Academic Resource Center'
    },
    {
      title: 'Arduino Mega 2560 R3 + 45-Sensor Mechatronics Kit',
      category: 'Other Engineering Equipment',
      department: 'Interdisciplinary Engineering',
      description: 'Complete embedded systems development bundle including ultrasonic, accelerometer, temperature, relays, and motor drivers in a segmented tackle box.',
      specs: [
        'Microcontroller: ATmega2560 (54 digital I/O, 16 analog)',
        'Includes 45 modular sensors with breadboards & jumpers',
        '16x2 I2C Character LCD & OLED display modules',
        'Tested and inventoried prior to each checkout'
      ],
      condition: 'Excellent',
      dailyFee: 0,
      deposit: 450,
      status: 'available',
      pickupLocation: 'Computer Lab - Tech Block 2nd Floor',
      serialNumber: 'OEE-ARD-029',
      minTrustScore: 65,
      maxBorrowDays: 10,
      owner: seniorUser._id || seniorUser.id,
      ownerName: 'Campus IoT Innovation Hub'
    }
  ];

  await Equipment.create(sampleEquipment);
  console.log(`[SEED] Initialized ${sampleEquipment.length} equipment items across all 5 official categories.`);
}

module.exports = { seedInitialData };
