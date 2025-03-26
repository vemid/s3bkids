// init-mongo.js
// Skripta za inicijalizaciju MongoDB baze podataka

// Kreiranje baze za galeriju proizvoda
db = db.getSiblingDB('productgallery');

// Kreiranje kolekcija
db.createCollection('users');
db.createCollection('products');
db.createCollection('seasons');

// Kreiranje indeksa
db.users.createIndex({ "username": 1 }, { unique: true });
db.users.createIndex({ "email": 1 }, { unique: true });
db.products.createIndex({ "sku": 1 }, { unique: true });
db.seasons.createIndex({ "prefix": 1 }, { unique: true });

// Kreiranje admin korisnika
const adminUser = {
  username: 'admin',
  password: '$2b$10$4RvX1EBZ4cHb1mwhA7tQrOFSJZsEJ9i9LK52Qm0R15wLA/stpzH1y', // haširana verzija 'SecureAdminPassword123!'
  email: 'admin@bebakids.com',
  role: 'admin',
  createdAt: new Date(),
  lastLogin: null
};

db.users.insertOne(adminUser);

// Kreiranje primjera mapiranja sezona
const seasonMappings = [
  {
    prefix: "125",
    seasonName: "Proleće Leto 2025",
    displayOrder: 1,
    active: true
  },
{
    prefix: "225",
    seasonName: "Proleće Leto 2025",
    displayOrder: 2,
    active: true
},
  {
    prefix: "524",
    seasonName: "Proleće Leto 2025",
    displayOrder: 3,
    active: true
  }
];

db.seasons.insertMany(seasonMappings);

print('Inicijalizacija MongoDB baze podataka završena.');